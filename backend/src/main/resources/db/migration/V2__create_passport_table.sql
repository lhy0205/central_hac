CREATE TABLE passport (
    id BIGSERIAL PRIMARY KEY,
    serial_number VARCHAR(20) NOT NULL,
    purchase_year INT NOT NULL,
    owner_account_id BIGINT NOT NULL REFERENCES account(id),
    model_name VARCHAR(100) NOT NULL,
    nickname VARCHAR(100),
    purchase_date DATE NOT NULL,
    purchase_place VARCHAR(200),
    receipt_image_url VARCHAR(500),
    has_receipt_tag BOOLEAN NOT NULL DEFAULT false,
    baseline_image_urls TEXT[] NOT NULL DEFAULT '{}',
    usage_frequency VARCHAR(30) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_passport_serial_year_active
    ON passport (serial_number, purchase_year)
    WHERE status = 'ACTIVE';
