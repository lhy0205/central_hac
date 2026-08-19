-- ⚠️ 이 스크립트만 단독으로 실행하지 말 것.
--
-- V15__migrate_overall_grade_to_letter_scale.sql(등급을 S/A/B/C/D로 교체)을 완전히 되돌리는
-- 수동 스크립트다. db/migration 폴더 밖에 있어서 Flyway가 자동 실행하지 않는다 — 정말 필요할
-- 때 사람이 판단해서 직접 돌린다.
--
-- 반드시 애플리케이션 코드를 먼저 git revert한 뒤에 실행할 것:
--   - OverallGrade.java (enum을 GOOD/NEEDS_CARE/URGENT로)
--   - RuleBasedWearDiagnosisEngine.java / MlWearDiagnosisEngine.java (toGrade 임계값)
--   - NotificationService.java (알림 분기)
--   - MCM_Care_Mobile/src/theme.ts (프론트 등급 표기)
--
-- 한쪽만 되돌리면 반드시 깨진다:
--   코드만 revert → DB에 남은 S/A/B/C/D를 옛 enum이 모르는 값으로 읽어 500
--   이 스크립트만 실행 → 새 코드가 GOOD/NEEDS_CARE/URGENT를 모르는 값으로 읽어 500
--
-- 실행:
--   psql -U <user> -d mcm_passport -f scripts/rollback-overall-grade-v15.sql
--
-- 참고: docs/design/vlm-grade-integration.md "롤백 경로"
--
-- S/A/B는 3단계 시절 전부 GOOD 하나였으므로 그 구간으로 합친다. 정보가 줄어드는 것처럼
-- 보이지만, 원래 3단계에 없던 구분을 되돌리는 것뿐이라 새로 생기는 손실은 아니다.
UPDATE diagnosis SET overall_grade = 'GOOD' WHERE overall_grade IN ('S', 'A', 'B');
UPDATE diagnosis SET overall_grade = 'NEEDS_CARE' WHERE overall_grade = 'C';
UPDATE diagnosis SET overall_grade = 'URGENT' WHERE overall_grade = 'D';
