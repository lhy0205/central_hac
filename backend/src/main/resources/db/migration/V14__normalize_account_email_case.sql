-- V13(시리얼)과 같은 문제를 이메일에도 적용한다. 앱 레벨 정규화(AccountService)를 우회하는 경로가
-- 생기면 대소문자만 다른 이메일이 유니크 인덱스에서 서로 다른 값이 되어 같은 사용자가 중복 가입될
-- 수 있다. 기존 행을 소문자로 맞추고 인덱스를 대소문자 구분 없이 건다.
--
-- V13과 같은 이유로 옛 인덱스를 먼저 지운 뒤에 UPDATE한다.
DROP INDEX uq_account_email_active;

UPDATE account SET email = LOWER(email);

CREATE UNIQUE INDEX uq_account_email_active
    ON account (LOWER(email))
    WHERE status = 'ACTIVE';
