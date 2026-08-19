CREATE TABLE reservation (
    id BIGSERIAL PRIMARY KEY,
    passport_id BIGINT NOT NULL REFERENCES passport(id),
    store_id BIGINT NOT NULL REFERENCES store(id),
    slot_date_time TIMESTAMP NOT NULL,
    request_items TEXT[] NOT NULL,
    status VARCHAR(20) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_reservation_store_slot_requested
    ON reservation (store_id, slot_date_time)
    WHERE status = 'REQUESTED';
