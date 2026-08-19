# MCM Nomad Passport — Backend

SJF(성주재단·MCM) 해커톤 Challenge 03("360° 고객경험") 출품작, **백엔드** 저장소입니다.

- 모바일 앱 저장소: https://github.com/junyoung0321/mcm-nomad-passport-app
- AI 저장소: https://github.com/junyoung0321/mcm-nomad-passport-ai
- 담당: 정준영(백엔드) · 심지윤(프론트엔드) · 이현욱(AI/데이터) · 김예란(기획)

## 스택
Spring Boot, PostgreSQL, JWT 인증, Cloudinary(이미지 저장), Flyway(마이그레이션)

## API 명세서
- [`MCM_Nomad_Passport_API명세서_프론트엔드용.md`](./MCM_Nomad_Passport_API명세서_프론트엔드용.md) — 전체 REST API 스펙
- [`MCM_Nomad_Passport_API명세서_AI파트용.md`](./MCM_Nomad_Passport_API명세서_AI파트용.md) — 마모 진단 AI 연동 계약

## 실행

```bash
./gradlew bootRun
```

`DB_URL`, `DB_USERNAME`, `DB_PASSWORD`, `JWT_SECRET`, `CLOUDINARY_URL` 환경변수 필요 (`DB_*`/`CLOUDINARY_URL`은 `application.yml`에 로컬 개발용 기본값이 있음). `JWT_SECRET`은 예외 — 저장소에 공개된 기본값을 그대로 쓰면 누구나 토큰을 위조할 수 있어, 설정하지 않으면 앱이 시작 시점에 즉시 실패한다. 32바이트 이상의 임의 문자열로 직접 지정할 것.

## 주요 도메인
Account(계정) · Passport(제품 여권) · Diagnosis(마모 진단) · CareRecord(케어 기록) · Timeline(통합 타임라인) · Notification(알림) · Transfer(여권 승계)
