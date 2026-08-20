# Care Passport

제품 하나하나에 디지털 여권을 만들어 구매 전부터 리세일까지의 이력을 기록하고, AI가 관리와
재구매의 적절한 시점을 제안하는 서비스입니다. SJF(성주재단·MCM) 해커톤 Challenge 03
(360° 고객경험) 출품작.

## 360° 흐름

```
구매 전             구매 중          구매 확정          소유 기간 루프           리세일
Concierge     →    AR 제품     →    시리얼 스캔   →   진단 → 근거 알림   →    여권 승계
컬렉션 이야기       히스토리 조회     여권 발급          케어·예약 → 기록 갱신    (새 소유자에게)
관심 등록                           (예비 여권 승계)                                 │
    ↑                                                                                │
    └──────────────────  새 소유자가 다시 Concierge로 들어오며 한 바퀴  ───────────────┘
```

관심만 등록한 제품은 홈에 "예비 여권"으로 남고, 실제로 구매해 시리얼을 스캔하면 그 자리가
정식 여권이 됩니다. 구매 전과 구매 후가 이 지점에서 이어집니다.

## 구성

| 폴더 | 내용 | 실행 방법 |
|---|---|---|
| [`frontend/`](./frontend) | Expo · React Native 앱 | [frontend/README.md](./frontend/README.md) |
| [`backend/`](./backend) | Spring Boot API · PostgreSQL | [backend/README.md](./backend/README.md) · [DEPLOY.md](./backend/DEPLOY.md) |
| [`AI/defect-detection`](./AI/defect-detection) | 마모·하자 탐지 (진단) | [README](./AI/defect-detection/README.md) |
| [`AI/ar-identification`](./AI/ar-identification) | AR 제품 인식 | [README](./AI/ar-identification/README.md) |
| [`AI/ocr-reader`](./AI/ocr-reader) | 일련번호 OCR | [README](./AI/ocr-reader/README.md) |

## 구조

앱은 Spring Boot API 하나만 JWT로 인증해 호출합니다. 마모 진단은 백엔드가 하자 탐지 서버에
위임하고, AR 인식과 일련번호 OCR은 앱이 직접 부릅니다.

```
앱 ──┬── Spring Boot API ──┬── PostgreSQL   진단 점수는 JSONB로 저장
     │                     ├── Cloudinary   진단·영수증 사진
     │                     └── defect-detection
     ├── ar-identification
     └── ocr-reader
```

진단 엔진은 `WearDiagnosisEngine` 인터페이스 뒤에 있습니다. 규칙 기반 구현과 ML 구현을
환경변수 `WEAR_DIAGNOSIS_ENGINE`으로 갈아 끼우며 API 계약은 그대로입니다. 모델이 준비되지
않은 환경에서도 전체 흐름을 시연할 수 있도록 한 구조입니다.

## 앱 설치

안드로이드만 배포합니다. "출처를 알 수 없는 앱" 설치를 허용해야 할 수 있습니다.

- **APK 내려받기**: https://github.com/lhy0205/central_hac/releases/download/v1.0.0/CarePassport.apk
- QR·설치 페이지: https://expo.dev/accounts/leeeee12/projects/mcm-care-mobile/builds/5b7b175b-ba3e-4209-9fc6-fb5d51dfe367

iOS는 코드 수준에서 지원합니다(카메라·사진첩 권한, 평문 HTTP 예외 설정 포함). 다만 실기기
배포에는 Apple Developer Program 계정이 필요해 이번 제출에는 포함하지 않았습니다.

서버 주소는 빌드 시점에 앱 안에 박히지만 설정 화면(`app/dev/server`)에서 재정의할 수 있습니다.
시연 도중 AI 서버 주소가 바뀌어도 재빌드 없이 대응하기 위한 장치입니다.

## 모델 가중치

합계 약 354MB라 저장소에 넣지 않았습니다. GitHub 무료 LFS는 저장·대역폭이 각 1GB뿐이라
clone할 때마다 대역폭이 깎여 금방 한도가 찹니다. 아래 세 파일은 별도로 공유하며, 받는 방법과
배치 경로는 각 AI 폴더의 README에 있습니다.

```
AI/defect-detection/best.pt
AI/ar-identification/detection/weights/bag_detect.pt
AI/ar-identification/identification/checkpoints/best.pt
```

가중치가 없어도 백엔드는 규칙 기반 엔진으로 기동하며 등록·여권·알림·케어·승계 흐름은 그대로
동작합니다. 마모 진단만 규칙 기반 점수로 대체됩니다.

## 비밀 값

`.env`는 저장소에 없습니다. JWT 시크릿, Cloudinary 주소, AI 서버 주소는 배포 환경에서
주입합니다. 필요한 키 목록은 [backend/DEPLOY.md](./backend/DEPLOY.md)와
[frontend/README.md](./frontend/README.md)에 있습니다.
