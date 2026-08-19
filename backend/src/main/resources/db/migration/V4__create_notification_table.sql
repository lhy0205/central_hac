CREATE TABLE notification (
    id BIGSERIAL PRIMARY KEY,
    passport_id BIGINT NOT NULL REFERENCES passport(id),
    type VARCHAR(30) NOT NULL,
    reason_factors JSONB NOT NULL,
    message VARCHAR(500) NOT NULL,
    overall_score INTEGER,
    read BOOLEAN NOT NULL DEFAULT false,
    dismissed BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP NOT NULL DEFAULT now()
);
