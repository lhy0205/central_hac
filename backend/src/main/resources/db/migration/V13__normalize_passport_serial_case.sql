-- 앱 레벨 정규화(PassportService.register()가 시리얼을 대문자로 통일)는 기존 행이나 그 정규화를
-- 우회하는 쓰기 경로(관리자 스크립트 등)까지는 보호하지 못한다. 대소문자만 다른 시리얼이 유니크
-- 인덱스에서 서로 다른 값으로 취급돼 같은 실물 가방이 두 번 등록될 수 있었다. 기존 행을 대문자로
-- 맞추고, 인덱스 자체를 대소문자 구분 없이 걸어 앱 밖의 경로에서도 중복을 막는다.
--
-- 순서가 중요하다: 옛 인덱스를 먼저 지운 뒤에 UPDATE해야 한다. UPDATE를 먼저 하면 대소문자만 다른
-- 중복 행이 있을 때 정규화 도중 살아있는 옛 인덱스를 위반해 마이그레이션이 실패하고, Flyway가
-- 실패 상태로 남아 배포를 막는다. 이 순서라면 실패 지점이 아래 CREATE UNIQUE INDEX로 옮겨가
-- "중복 키" 에러로 원인이 분명해진다.
DROP INDEX uq_passport_serial_year_active;

UPDATE passport SET serial_number = UPPER(serial_number);

CREATE UNIQUE INDEX uq_passport_serial_year_active
    ON passport (UPPER(serial_number), purchase_year)
    WHERE status = 'ACTIVE';
