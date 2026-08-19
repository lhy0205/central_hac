CREATE TABLE transfer_code (
    id BIGSERIAL PRIMARY KEY,
    passport_id BIGINT NOT NULL REFERENCES passport(id),
    code VARCHAR(6) NOT NULL UNIQUE,
    issued_by_account_id BIGINT NOT NULL REFERENCES account(id),
    status VARCHAR(20) NOT NULL,
    redeemed_by_account_id BIGINT REFERENCES account(id),
    redeemed_at TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT now()
);
