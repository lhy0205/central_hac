# AR 상품 인식 서버 (Detection + Identification)

`mcm_ar_handoff.zip`으로 전달받은 모델을 모바일 앱이 HTTP로 호출할 수 있게 감싼 것. 원본 전달
문서는 `HANDOFF.md` 참고 (구성 요소, 성능, 알려진 한계 모두 여기 그대로 적용됨).

## 이 폴더의 역할

`src/ar` 화면(카메라로 가방을 스캔하는 AR 기능)이 사진을 찍으면, 앱은 `EXPO_PUBLIC_AR_API_BASE_URL`로
설정된 주소의 `/identify`를 호출한다 (`src/ar/api.ts` 참고). 그 요청을 받는 게 여기 `api_server.py`다.
이 폴더는 React Native 빌드에 포함되지 않는 별도 Python 프로세스로 실행한다 — Expo/Metro 번들러는
건드리지 않는다.

```
detection/weights/bag_detect.pt        탐지 모델 (YOLOv8n, 17클래스, ~6MB)   ← 저장소에 없음
identification/checkpoints/best.pt     식별 모델 (DINOv2 ViT-B/14 + ArcFace, ~347MB)  ← 저장소에 없음
data/gallery/gallery_embeddings.npz    730개 SKU 임베딩                      ← 저장소에 없음
data/gallery/gallery_names.json        productId -> 제품명 매핑
demo/pipeline.py                       두 모델을 엮은 BagPipeline (원본 전달분, 그대로 유지)
identification/dataset.py, train_metric.py   전처리/아키텍처 정의 (원본 전달분)
api_server.py                          FastAPI 서버 — 이 저장소에서 새로 추가한 래퍼
```

## 모델 가중치 받기 (필수)

가중치 3개는 **저장소에 없다**(`.gitignore` 처리). 합계 약 354MB인데 GitHub 무료 LFS는 저장·대역폭이
각 1GB뿐이라, 팀원이 clone할 때마다 대역폭이 깎여 금방 한도가 차기 때문이다.

팀에 공유된 `mcm_ar_best_models.zip`(구글 드라이브)의 `mcm_model_bundle/` 안에 들어 있다.
번들의 파일명이 저장소 경로와 다르므로 **아래 대응표대로 이름을 바꿔서** 복사한다:

| 번들 안 파일 | 저장소에 놓을 경로 |
|---|---|
| `detection_bag_detect13.pt` | `detection/weights/bag_detect.pt` |
| `identification_dinov2_arcface.pt` | `identification/checkpoints/best.pt` |
| `gallery_embeddings.npz` | `data/gallery/gallery_embeddings.npz` |

`gallery_names.json`도 번들에 있지만 이 파일만은 저장소에 커밋돼 있어 덮어쓸 필요 없다.

파일 크기로 확인한다 — 없으면 서버가 기동 중 `torch.load`에서 죽는다.

```bash
ls -lh identification/checkpoints/best.pt   # 약 332MB
```

`api_server.py`만 이번에 새로 작성됨 — 원본 핸드오프에는 CLI 데모(`demo/pipeline.py`)만 있었고
API 서버가 없었음.

## 실행

```bash
cd server/ar-identification
pip install -r requirements_api.txt
python3 api_server.py
# 기본 포트 8001, http://localhost:8001/docs 에서 Swagger UI 확인 가능
```

GPU 권장(식별 모델이 무거움), CPU에서도 동작함(자동 감지).

> HANDOFF.md 한계 3번 참고: 식별 모델은 최초 실행 시 `torch.hub.load("facebookresearch/dinov2", ...)`로
> 인터넷에서 아키텍처 코드를 받아온다. 방화벽 환경이면 `~/.cache/torch/hub/facebookresearch_dinov2_main`
> 캐시를 미리 받아둬야 한다.

## 모바일 앱과 연결하기

`.env`에 이 서버 주소를 설정한다 (기존 `EXPO_PUBLIC_API_BASE_URL`은 별도의 Spring 백엔드 주소이므로
건드리지 않음):

```
EXPO_PUBLIC_AR_API_BASE_URL=http://192.168.x.x:8001
```

## API

### POST /identify (multipart/form-data, 필드명 `file`, 쿼리 `topk`)

```json
{
  "image": "photo.jpg",
  "detections": [
    {
      "class": "Handbag",
      "confidence": 0.92,
      "bbox": [120.0, 80.0, 640.0, 700.0],
      "candidates": [
        { "productId": "...", "name": "...", "similarity": 0.61 },
        { "productId": "...", "name": "...", "similarity": 0.44 }
      ]
    }
  ]
}
```

- `detections`가 비어 있으면 이미지에서 제품 자체가 탐지되지 않은 것.
- **`candidates`의 top-1만 보고 판단하면 안 됨** (식별 top-1 정확도 61.9%). 상위 3개를 같이 보여주고,
  `similarity` 0.5 미만이면 "인식 실패"로 처리하는 게 원 전달 문서의 권장 UX. `src/ar/screens/ARResultScreen.tsx`가
  이 규칙을 그대로 반영함.

## 알려진 한계

`HANDOFF.md` 그대로 — 특히: 갤러리(730 SKU)에 없는 제품(단종/시즌아웃)에도 그럴듯한 오답을 자신 있게
반환함(closed-set 검색의 근본 한계), Sweater류 탐지 정확도 낮음, Hat류는 클래스 자체가 없음.
