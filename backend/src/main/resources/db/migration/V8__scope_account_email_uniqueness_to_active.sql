-- 탈퇴한 계정과 같은 이메일로 재가입이 영구히 막히는 것을 방지한다. Passport의
-- uq_passport_serial_year_active(V2)와 같은 패턴으로, 유니크 제약을 ACTIVE 상태로만 스코프한다.
ALTER TABLE account DROP CONSTRAINT account_email_key;

CREATE UNIQUE INDEX uq_account_email_active
    ON account (email)
    WHERE status = 'ACTIVE';
