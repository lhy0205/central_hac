CREATE TABLE diagnosis (
    id BIGSERIAL PRIMARY KEY,
    passport_id BIGINT NOT NULL REFERENCES passport(id),
    diagnosis_type VARCHAR(20) NOT NULL,
    image_urls TEXT[] NOT NULL,
    item_scores JSONB NOT NULL,
    overall_grade VARCHAR(20) NOT NULL,
    evidence_text VARCHAR(1000) NOT NULL,
    diagnosed_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT now()
);
