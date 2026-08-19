# MCM AR 제품 인식 — 백엔드 전달 문서

카메라 프레임에서 MCM 제품을 탐지하고, 어떤 제품인지 식별하는 2단계 파이프라인.

## 구성 요소

```
detection/weights/bag_detect.pt        탐지 모델 (YOLOv8n, 17클래스, ~6MB)
identification/checkpoints/best.pt     식별 모델 (DINOv2 ViT-B/14 + ArcFace head, ~347MB)
data/gallery/gallery_embeddings.npz    730개 SKU 임베딩 (product_ids, embeddings)
data/gallery/gallery_names.json        productId -> 제품명(한글) 매핑
demo/pipeline.py                       두 모델을 엮은 추론 코드/예제
identification/dataset.py              전처리(정규화/리사이즈) 정의 — 식별 추론 시 반드시 동일하게 사용
identification/train_metric.py         식별 모델 아키텍처 정의(EmbeddingModel, setup_backbone)
```

## 실행 방법

```bash
pip install -r requirements.txt
python demo/pipeline.py path/to/image.jpg --topk 3
```

`BagPipeline` 클래스(`demo/pipeline.py`)를 그대로 API 서버에 임베드하면 됨:

```python
from demo.pipeline import BagPipeline
pipeline = BagPipeline()  # 최초 1회 로드 (수 초 소요, GPU 권장)
image, results = pipeline.run("photo.jpg", topk=3)
# results[i]["box"]["class"]  -> 탐지된 클래스명 (Handbag, Wallet 등)
# results[i]["candidates"]    -> [{"productId", "name", "similarity"}, ...] 유사도 내림차순
```

## 탐지 클래스 (17개, index 7 Clothing은 폐기·미사용)

```
0 Handbag  1 Backpack  2 Suitcase  3 Belt  4 Sunglasses  5 Scarf  6 Footwear
7 (미사용)  8 Wallet  9 Shirt  10 Jacket  11 Coat  12 Trousers  13 Skirt  14 Shorts  15 Sweater
16 Hat
```

## 성능 (검증셋 기준)

> 아래 탐지 수치는 **이전 16클래스 모델** 기준. 현재 배치된 17클래스 모델(2026-08-15)은 재측정 전이다.
> 식별 모델은 교체되지 않았으므로 식별 수치는 그대로 유효함.

| 구분 | 지표 | 값 |
|---|---|---|
| 탐지 (mAP50) | 전체 평균 | 0.590 |
| 탐지 (mAP50) | Handbag / Wallet | 0.89 / 0.88 |
| 탐지 (mAP50) | 가장 약한 클래스 (Skirt, Sweater) | 0.11~0.33 (데이터 적음) |
| 식별 | top-1 정확도 | 61.9% |
| 식별 | top-5 정확도 | 84.2% |

## 알려진 한계 (중요, 백엔드/프론트에서 감안 필요)

1. **식별은 top-1만 보면 안 됨** — top-1 정확도가 62%라 `candidates`의 상위 3개를 같이 보여주거나, `similarity` 임계값(예: 0.5) 미만이면 "인식 실패"로 처리하는 UX가 필요함. 갤러리(730 SKU)에 없는 제품(단종/시즌아웃)은 그럴듯하지만 틀린 답을 자신 있게 반환함 — closed-set 검색의 근본적 한계.
2. **Sweater/Skirt 탐지는 데이터가 적어** 정확도가 낮음. Hat은 17클래스 모델(2026-08-15)에서 새로 추가된 클래스라 아직 검증 수치가 없다 — 위 성능표는 이전 16클래스 모델 기준이므로 Hat 신뢰도는 실사용 전 별도 확인이 필요함.
3. **식별 모델은 인터넷에서 DINOv2 아키텍처 코드를 최초 1회 받아옴** (`torch.hub.load("facebookresearch/dinov2", ...)`, GitHub 접근 필요). 방화벽 환경이면 사전에 `~/.cache/torch/hub/facebookresearch_dinov2_main` 캐시를 미리 받아서 이미지에 포함시켜야 함.
4. 입력 이미지는 내부적으로 224x224로 리사이즈/정규화됨(`identification/dataset.py`의 `eval_transform`) — 별도 전처리 불필요, `PIL.Image` 그대로 넣으면 됨.
5. GPU 권장이지만 CPU에서도 동작함(자동 감지, `torch.cuda.is_available()`).

## 갱신 이력

- **2026-08-16 (`mcm_ar_best_models.zip`)** — 탐지 모델을 17클래스판으로 교체(`Hat` 추가, 학습일 2026-08-15).
  식별 모델·갤러리 임베딩·SKU 매핑은 sha256 기준 이전 번들과 동일해 교체하지 않음.
- 730개 SKU (가방/지갑/의류/슈즈/패션소품/라이프스타일/트래블) 전 카테고리 커버
- 탐지 모델은 MCM 자체 제품사진 + 실사용(중고거래) 사진으로 파인튜닝, 의류는 세부 클래스(Shirt/Jacket/Coat 등)로 분리해 정확도 개선
