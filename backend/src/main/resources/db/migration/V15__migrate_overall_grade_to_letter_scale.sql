-- OverallGrade를 GOOD/NEEDS_CARE/URGENT(3단계)에서 S/A/B/C/D(5단계)로 교체하면서, 이미 쌓인
-- 진단 기록의 등급을 새 체계로 옮긴다. overall_grade는 제약 없는 VARCHAR(20)이라 스키마 변경은
-- 필요 없고 값만 바꾸면 된다.
--
-- 매핑은 프론트엔드가 그동안 화면 표시용으로 쓰던 임시 변환(theme.ts의 BACKEND_TO_LETTER)과
-- 동일하다 — 사용자 입장에서 과거 기록에 보이던 글자가 그대로 유지된다.
--
-- 3단계에서 GOOD 하나였던 0~39점 구간이 새 체계에서는 S/A/B로 나뉘지만, 기존 행은 점수와
-- 무관하게 일괄 A로 옮긴다. 옛 등급만으로는 그 안에서 S/A/B를 구분할 근거가 없기 때문이다
-- (item_scores로 재계산하는 방법도 있으나, 과거 진단을 지금 기준으로 소급 재판정하는 셈이라
--  하지 않는다).
UPDATE diagnosis SET overall_grade = 'A' WHERE overall_grade = 'GOOD';
UPDATE diagnosis SET overall_grade = 'C' WHERE overall_grade = 'NEEDS_CARE';
UPDATE diagnosis SET overall_grade = 'D' WHERE overall_grade = 'URGENT';
