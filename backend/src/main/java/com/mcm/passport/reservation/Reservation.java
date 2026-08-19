package com.mcm.passport.reservation;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EntityListeners;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.LocalDateTime;
import java.util.List;

@Entity
@Table(name = "reservation")
@EntityListeners(AuditingEntityListener.class)
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Reservation {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "passport_id", nullable = false)
    private Long passportId;

    @Column(name = "store_id", nullable = false)
    private Long storeId;

    @Column(name = "slot_date_time", nullable = false)
    private LocalDateTime slotDateTime;

    // Diagnosis.imageUrls와 동일 패턴: CareRequestItemType 이름을 text[]로 저장한다. 엔티티
    // 자체는 원시 문자열만 다루고, enum 변환은 DTO 계층(ReservationResponse.from,
    // ReservationService.create)에서 한다 — 이 코드베이스의 기존 컨벤션과 동일.
    @JdbcTypeCode(SqlTypes.ARRAY)
    @Column(name = "request_items", columnDefinition = "text[]", nullable = false)
    private List<String> requestItems;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private ReservationStatus status;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    public Reservation(Long passportId, Long storeId, LocalDateTime slotDateTime, List<String> requestItems) {
        this.passportId = passportId;
        this.storeId = storeId;
        this.slotDateTime = slotDateTime;
        this.requestItems = requestItems;
        this.status = ReservationStatus.REQUESTED;
    }

    // 이미 CANCELLED여도 다시 호출하면 그대로 CANCELLED — 취소 API가 멱등하게 동작하도록
    // 서비스 계층에서 상태를 미리 확인하지 않고 그냥 호출한다(스펙 문서 2절 참고).
    public void cancel() {
        this.status = ReservationStatus.CANCELLED;
    }

    public boolean isRequested() {
        return this.status == ReservationStatus.REQUESTED;
    }
}
