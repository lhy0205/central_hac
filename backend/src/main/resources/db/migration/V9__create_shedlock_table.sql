-- ShedLock 표준 스키마: 다중 인스턴스 배포에서 @Scheduled 작업이 겹쳐 실행되는 것을 막는다
-- (예: 09시 정각 리마인더 배치가 두 인스턴스에서 동시에 돌아 알림이 중복 생성되는 문제).
CREATE TABLE shedlock (
    name VARCHAR(64) NOT NULL,
    lock_until TIMESTAMP(3) NOT NULL,
    locked_at TIMESTAMP(3) NOT NULL,
    locked_by VARCHAR(255) NOT NULL,
    PRIMARY KEY (name)
);
