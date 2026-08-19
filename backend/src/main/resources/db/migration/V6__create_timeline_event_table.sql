CREATE TABLE timeline_event (
    id BIGSERIAL PRIMARY KEY,
    passport_id BIGINT NOT NULL REFERENCES passport(id),
    event_type VARCHAR(30) NOT NULL DEFAULT 'MOMENT',
    note VARCHAR(1000),
    image_url VARCHAR(500),
    event_date TIMESTAMP NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT now()
);
