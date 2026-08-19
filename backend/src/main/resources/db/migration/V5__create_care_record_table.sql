CREATE TABLE care_record (
    id BIGSERIAL PRIMARY KEY,
    passport_id BIGINT NOT NULL REFERENCES passport(id),
    care_type VARCHAR(100) NOT NULL,
    material_type VARCHAR(100),
    notes VARCHAR(1000),
    image_url VARCHAR(500),
    completed_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT now()
);
