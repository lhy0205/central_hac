# 프론트엔드 완료 및 확인 목록

## 구현 완료

- Expo Router 기반 화면 파일 분리
- 공통 컴포넌트와 테마 분리
- 환경변수 기반 실제 API 클라이언트 — **실제 백엔드 경로/필드에 맞춰 재수정 완료**
  (`/api/auth/*`, `/api/passports/*`, `/api/passports/{id}/diagnoses`,
  `/api/passports/{id}/timeline/events` 등. 상세는 `src/api/client.ts` 주석 참고)
- Access Token SecureStore 저장 및 로그아웃 삭제
- 카메라/사진 권한 요청, 거절 안내, 설정 이동
- Android 하드웨어 뒤로가기 처리 훅
- 앱 아이콘, 스플래시, Android Adaptive Icon 설정
- EAS 개발·APK·AAB·iOS 빌드 프로필
- TypeScript 검사 성공
- Android Metro 번들 생성 성공(AR 결과 화면 영상 에셋 포함)
- **AR 제품 인식 기능 통합** — 화면 3개(`app/ar/intro.tsx`, `scan.tsx`, `result.tsx`)를
  홈 화면에서 진입 가능하도록 연결. 인식은 `server/ar-identification`이 담당. 단, 네이티브
  모듈(vision-camera) 실기기 동작 검증은 미완료 — dev client 빌드 필요
  (README "AR 기능 관련 중요 사항" 참고)

## 백엔드 팀에게 받았음 (해결됨)

- ~~운영/개발 API 주소~~ → 경로 자체는 백엔드 컨트롤러 소스에서 직접 확인해 확정.
  실제 배포 URL(`EXPO_PUBLIC_API_BASE_URL` 값)만 아직 필요
- ~~로그인·회원가입 응답 필드~~ → `LoginResponse(accessToken, account)`,
  `AccountResponse(id, email, nickname, createdAt)`로 확인. **Refresh Token 없음** —
  액세스 토큰만 발급되고 만료는 24시간(`jwt.expiration-ms=86400000`) 고정. 재발급
  로직 자체가 백엔드에 없으므로 프론트에서 별도 처리 불필요(만료 시 재로그인 유도)
- ~~제품·진단·여권 API 명세~~ → `PassportResponse`/`DiagnosisResponse`/
  `TimelineEventResponse` DTO 확인, `client.ts`에 타입으로 반영
- ~~이미지 업로드 필드명과 허용 용량~~ → 필드명은 `client.ts` 참고. 용량은 서버 설정
  기준 파일당 10MB, 요청당 50MB(`application.yml`)
- ~~Refresh Token 재발급 규칙~~ → 위 항목 참고, 해당 없음(설계에 없음)

## 아직 남은 것

- AR 기능 네이티브 모듈 실기기 검증 (dev client 빌드로 확인 필요)
- 제품 등록/내 가방 목록/상세 화면이 아직 하드코딩된 목업 상태 — API 연동 배선 필요
  (client.ts는 준비됐지만 화면에서 호출하지 않음)

## 계정 소유자가 해야 하는 것

- `eas login` 후 `eas init` 실행
- 생성된 EAS Project ID를 `app.json`에 반영
- Apple Developer 계정 연결 및 인증서 생성 승인
- Google Play Console 앱 생성과 서비스 계정 연결
- 스토어 개인정보·스크린샷·심사 정보 등록

## 실제 기기 테스트표

아래 항목은 실제 기기가 연결되어야 최종 확인할 수 있습니다.

- Android 소형/대형 화면에서 잘림과 키보드 확인
- iPhone SE 및 최신 iPhone에서 Safe Area 확인
- 카메라 허용/거절/다시 허용
- 사진 1장·4장·대용량 업로드
- Android 물리 뒤로가기
- 앱 종료 후 로그인 유지
- 느린 네트워크, 오프라인, 401 오류
- 공유 시트와 딥링크
