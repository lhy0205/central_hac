# 배포 가이드

**서버 두 대로 나눠 배포한다.** ① 백엔드(+PostgreSQL) — 예: 가비아 서버, ② AI 서버 2개
(하자 탐지, AR 인식, 저장소 `MCM_ai`) — 별도의 "외부 AI 서버". 통신 구조와 API 키 설정은
[`NETWORKING.md`](./NETWORKING.md)를 먼저 읽어볼 것 — 여기서는 각 서버에서 실제로 실행하는
절차만 다룬다.

## 구성

| 서비스 | 배포 위치 | 포트 | 역할 | 저장소 |
|---|---|---|---|---|
| `backend` | 가비아 서버 | 8080 | Spring Boot REST API | MCM_backend |
| `db` | 가비아 서버 (내부) | 5432 | PostgreSQL 16 | - |
| `defect-detection` | 외부 AI 서버 | 8000 | 하자 탐지 AI (YOLO11l-seg). `backend`가 인터넷 너머로 호출 | MCM_ai/defect-detection |
| `ar-identification` | 외부 AI 서버 | 8001 | AR 제품 인식 AI (YOLOv8n + DINOv2). **모바일 앱이 직접 호출** | MCM_ai/ar-identification |

---

## A. 외부 AI 서버 배포 (defect-detection, ar-identification)

먼저 이쪽을 띄워야 백엔드가 붙일 주소가 생긴다. 두 서비스는 서로 독립적이라 각자 따로
빌드/실행한다(공용 docker-compose 없음, 각 폴더에 자체 Dockerfile).

**1. 모델 가중치를 배치한다.** 가중치는 **저장소에 없다** — 합계 약 410MB인데 GitHub 무료 LFS는
저장·대역폭이 각 1GB뿐이라 clone할 때마다 한도가 깎이기 때문이다. 팀에 공유된 두 zip(구글 드라이브)의
압축을 풀어 아래 **네 파일을 같은 경로에** 복사한다. AR 쪽은 번들의 파일명이 배치 경로와 다르므로
**이름을 바꿔서** 넣어야 한다. 빠뜨리면 서버가 기동 중 모델 로드 단계에서 죽는다.

| 번들 안 파일 | 배치할 위치 (파일명 포함) |
|---|---|
| `mcm_ar_best_models.zip` → `mcm_model_bundle/detection_bag_detect13.pt` | `MCM_ai/ar-identification/detection/weights/bag_detect.pt` |
| `mcm_ar_best_models.zip` → `mcm_model_bundle/identification_dinov2_arcface.pt` | `MCM_ai/ar-identification/identification/checkpoints/best.pt` |
| `mcm_ar_best_models.zip` → `mcm_model_bundle/gallery_embeddings.npz` | `MCM_ai/ar-identification/data/gallery/gallery_embeddings.npz` |
| `ai.zip` → `defect-detection/best.pt` | `MCM_ai/defect-detection/best.pt` |

크기로 확인한다:

```bash
ls -lh MCM_ai/ar-identification/identification/checkpoints/best.pt   # 약 332MB
ls -lh MCM_ai/defect-detection/best.pt                               # 약 54MB
```

**2. API 키를 정한다.** 백엔드가 인터넷 너머에서 이 서버를 호출하므로, 인증 없이 열어두면
URL을 아는 누구나 무료로 추론을 돌릴 수 있다(`defect-detection`만 해당 — `ar-identification`은
앱이 직접 호출하는 구조라 별도 인증이 없다, [`NETWORKING.md`](./NETWORKING.md#3-외부-ai-서버-호출-주소--api-키) 참고).

```bash
openssl rand -hex 32   # 이 값을 아래 API_KEY와 백엔드의 DEFECT_API_KEY에 동일하게 넣는다
```

**3. 빌드/실행한다.**

```bash
cd MCM_ai/defect-detection
docker build -t mcm-defect-detection .
docker run -d --name defect-detection -p 8000:8000 \
  -e API_KEY=<위에서 만든 값> \
  mcm-defect-detection

cd ../ar-identification
docker build -t mcm-ar-identification .
docker run -d --name ar-identification -p 8001:8001 mcm-ar-identification
```

AR 인식 이미지는 torch와 DINOv2를 받아 캐시하므로 **첫 빌드에 10~20분** 걸린다. 이후 빌드는 캐시된다.

**4. 확인한다.**

```bash
curl http://localhost:8000/health   # {"status":"ok","model_loaded":true,...}
curl http://localhost:8001/health   # {"status":"ok","pipeline_loaded":true,...}
```

## B. 가비아 서버 배포 (backend + db)

**1. 시크릿을 설정한다.**

```bash
cd MCM_backend
cp .env.example .env
```

`.env`에 아래는 반드시 채운다 (비어 있으면 compose가 기동을 거부한다):

- `JWT_SECRET` — 32바이트 이상 임의 문자열 (`openssl rand -hex 32`)
- `CLOUDINARY_URL` — Cloudinary 대시보드의 "API environment variable" 값
- `DEFECT_API_URL` — 위 A절에서 띄운 외부 AI 서버의 공인 주소 (예: `http://<AI서버IP>:8000`)
- `DEFECT_API_KEY` — A절 2번에서 정한 값과 동일하게

**2. 실행한다.**

```bash
docker compose up -d --build
```

**3. 확인한다.**

```bash
curl http://localhost:8080/api/health     # {"status":"UP"}
```

로그는 `docker compose logs -f backend`. `defect-detection` 연결 실패(502, `DEFECT_DETECTION_UNAVAILABLE`)가
나오면 방화벽/주소/`DEFECT_API_KEY` 불일치를 의심할 것.

## 서버 요구사항

**가비아 서버(backend+db)**
- 메모리: 최소 1~2GB로 충분(Spring Boot + Postgres, AI 모델을 올리지 않음).
- 방화벽: 8080(앱→백엔드) 인바운드 허용. 5432는 열지 않는다.

**외부 AI 서버(defect-detection+ar-identification)**
- 메모리: AR 인식 서버가 DINOv2를 올리는 데만 실측 1.3GB를 쓴다. 두 서비스 합쳐 **최소 4GB**를 권장한다. 부족하면 컨테이너가 OOM으로 조용히 재시작을 반복한다.
- 디스크: 모델 가중치 + 이미지 합쳐 최소 5GB.
- GPU 불필요 — 모두 CPU 추론으로 동작한다. 대신 AR 인식 1회에 수 초가 걸린다.
- 방화벽: 8000(백엔드→하자탐지, **API 키 필수**), 8001(앱→AR 인식) 인바운드 허용.

## 모바일 앱 연결

앱은 `EXPO_PUBLIC_*` 값을 **빌드 시점에 코드로 박아 넣는다.** 서버 주소가 바뀌면 `.env`만 고쳐선 안 되고
반드시 다시 빌드해야 한다. 두 값이 **서로 다른 서버**를 가리킨다는 점에 주의 — 하나는 가비아
서버(백엔드), 하나는 외부 AI 서버(AR 인식)다.

`MCM_frontend/.env`:

```
EXPO_PUBLIC_API_BASE_URL=http://<가비아서버 주소>:8080
EXPO_PUBLIC_AR_API_BASE_URL=http://<외부 AI 서버 주소>:8001
```

```bash
cd MCM_frontend
npx eas-cli build --profile development --platform android
```

빌드가 끝나면 나오는 설치 링크를 팀원에게 공유하면 된다.

> HTTPS가 아닌 평문 HTTP로 붙는 구성이다. `app.json`에 `usesCleartextTraffic: true`가 있어 안드로이드에서는
> 동작하지만, iOS나 공개 배포로 넘어갈 때는 도메인 + TLS(리버스 프록시)를 앞에 두어야 한다.

## 진단 엔진 전환

기본값은 `rule-based`로, **사진을 보지 않고** 이전 점수에서 기계적으로 증가시키는 자리표시자 로직이다.
실제 AI로 진단하려면 `.env`에서 바꾸고 재시작한다:

```
WEAR_DIAGNOSIS_ENGINE=ml
```

```bash
docker compose up -d backend
```

다만 하자 탐지 모델은 1차 프로토타입이다 (mask mAP50 약 0.23, `밑창분리`는 학습 데이터가 없어 사실상
탐지되지 않고 `지퍼파손`은 오탐이 잦다). 자세한 한계는 `MCM_ai/defect-detection/HANDOFF.md` 참고.

## 알려진 제약

- AR 인식은 갤러리(730 SKU)에 없는 제품에도 그럴듯한 오답을 자신 있게 반환한다(closed-set 검색의 한계).
  앱은 유사도 0.5 미만이면 "비슷한 후보"로 표시해 이를 완화한다.
- DB 볼륨(`pgdata`)은 `docker compose down -v`로 지워진다. 데모 데이터를 유지하려면 `-v`를 붙이지 말 것.
