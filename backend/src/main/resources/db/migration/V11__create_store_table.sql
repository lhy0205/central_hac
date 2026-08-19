CREATE TABLE store (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    address VARCHAR(200) NOT NULL,
    business_hours_start TIME NOT NULL,
    business_hours_end TIME NOT NULL,
    slot_length_minutes INT NOT NULL
);

INSERT INTO store (name, address, business_hours_start, business_hours_end, slot_length_minutes) VALUES
    ('MCM 강남점', '서울 강남구 압구정로 165', '10:00', '19:00', 60),
    ('MCM 명동점', '서울 중구 명동길 43', '10:30', '20:00', 60),
    ('MCM 부산센텀점', '부산 해운대구 센텀중앙로 55', '10:00', '18:30', 60);
