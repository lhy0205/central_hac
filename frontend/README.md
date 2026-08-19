# MCM Care Mobile

SJF(성주재단·MCM) 해커톤 Challenge 03("360° 고객경험") 출품작, **프론트엔드(모바일 앱)** 저장소입니다.
백엔드 저장소: https://github.com/junyoung0321/MCM_Passport

Expo SDK 54, React Native, TypeScript, Expo Router로 구현한 Android/iOS 앱입니다.
AR 제품 인식 기능(카메라 → 서버 인식 → 히스토리 영상)이 통합되어 있습니다.

## 실행 — ⚠️ Expo Go로는 실행할 수 없습니다

AR 기능이 `react-native-vision-camera` 등 네이티브 모듈을 쓰기 때문에, 더 이상 Expo Go
앱으로는 열리지 않습니다. 커스텀 dev client가 필요합니다.

```powershell
npm install
npx eas build --profile development --platform android   # 최초 1회, dev client APK 빌드
npx expo start --dev-client
```

로컬에 Android SDK가 설치돼 있다면 `npx expo run:android`로 dev client를 직접 빌드할 수도
있습니다. (iOS는 이번 통합에서 실기기/시뮬레이터 검증을 못 했습니다 — Xcode가 없는 Windows
개발 환경이었습니다. `ar-feature.zip` 원본 README 참고.)

## 구조

- `app/`: Expo Router 화면 파일 (`app/ar/`: AR 인트로/스캔/결과 3화면)
- `src/components/`: 공통 헤더, 버튼, 입력창, 사진 선택기
- `src/ar/`: AR 제품 인식 기능 전체 (화면, 인식 서버 API 호출, 스토리 데이터)
- `src/context/AuthContext.tsx`: 로그인 상태와 SecureStore 토큰 관리
- `src/api/client.ts`: 실제 백엔드 API 호출 계층
- `src/hooks/useAndroidBack.ts`: Android 하드웨어 뒤로가기 처리
- `assets/`: 앱 아이콘, 스플래시, 제품 이미지
- `assets/ar/`: 결과 화면 placeholder 영상
- `eas.json`: 개발·APK 미리보기·AAB/iOS 출시 빌드 설정

## AR 기능 관련 중요 사항

- **인식은 전부 서버(`server/ar-identification`)가 담당** — 앱은 사진을 찍어
  `EXPO_PUBLIC_AR_API_BASE_URL`의 `/identify`로 보내고 후보 SKU 목록을 받습니다.
  온디바이스 TFLite 사전 분류는 결과를 아무도 쓰지 않아 제거했습니다(`react-native-fast-tflite`,
  `react-native-worklets-core`, `vision-camera-resize-plugin` 의존성과 모델 에셋 7MB 함께 정리).
- **New Architecture 비활성화**(`app.json`의 `newArchEnabled: false`) — vision-camera v4
  기준으로 검증된 설정이라 앱 전체에 영향을 줍니다. 프레임 프로세서를 더는 쓰지 않으므로
  v5 + New Architecture 전환의 걸림돌은 줄었지만, 전환 시 실기기 재검증이 필요합니다.
- **식별 top-1 정확도 61.9%** — 결과 화면은 상위 3개 후보를 함께 보여주고 유사도 0.5
  미만이면 경고 배너를 띄웁니다(`ARResultScreen`). top-1만 신뢰하면 안 됩니다.
- **바운딩 박스 오버레이 없음** — 서버는 bbox를 주지만 화면 가이드 프레임은 안내용 UI일 뿐,
  실제 위치에 맞춰 그리지 않습니다.
- **결과 화면 영상은 전부 동일한 placeholder** — 인식된 제품별로 다른 영상을 매핑하는
  작업이 아직 안 되어 있음.
- **카메라 네이티브 모듈이 실기기에서 동작하는지는 아직 미검증입니다** — Expo Go로는
  애초에 열리지 않고, 이 환경에 Android SDK/Xcode가 없어 로컬 네이티브 빌드가 불가능했습니다.
  TFLite 의존성 3개를 제거하면서 네이티브 모듈 구성이 바뀌었으므로,
  `eas build --profile development`로 dev client를 **새로 빌드**해 실기기 검증이 필요합니다
  (기존 dev client APK는 재사용 불가).

## 백엔드 연결

`.env.example`을 `.env`로 복사하고 실제 주소를 입력합니다.

```text
EXPO_PUBLIC_API_BASE_URL=https://실제-백엔드-주소
EXPO_PUBLIC_AR_API_BASE_URL=https://ar-인식-서버-주소
```

현재 API 주소가 없으면 로그인 등 일부 흐름은 Mock 모드로 작동합니다. 요청 경로는 `src/api/client.ts`에 모아 두었습니다.

`EXPO_PUBLIC_AR_API_BASE_URL`은 위 Spring 백엔드와 별개로, AR 제품 인식(탐지+식별) 전용 Python
서버 주소입니다. `server/ar-identification/`에서 직접 띄우거나(`README.md` 참고) 배포된 주소를
넣으면 됩니다. 요청 경로는 `src/ar/api.ts`에 있습니다.

## 검사

```powershell
npm run typecheck
npx expo export --platform android --output-dir dist-test
```

두 검사는 현재 성공한 상태입니다(AR 기능의 TFLite 모델·영상 에셋 포함해서 번들링까지 확인됨).
다만 이건 JS 번들이 만들어지는지까지만 확인하는 것 — 카메라·TFLite 네이티브 모듈 자체가
실기기에서 도는지는 dev client 빌드로 별도 확인이 필요합니다("AR 기능 관련 중요 사항" 참고).

## 빌드

```powershell
npm install -g eas-cli
eas login
eas init
eas build --platform android --profile preview
eas build --platform android --profile production
eas build --platform ios --profile production
```

`preview`는 설치용 APK, Android `production`은 Play Store용 AAB입니다. iOS 빌드와 실제 서명은 Apple Developer 계정, Android 스토어 제출은 Google Play Console 계정이 필요합니다.
