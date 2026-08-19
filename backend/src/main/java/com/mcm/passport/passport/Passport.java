package com.mcm.passport.passport;

import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.List;

@Entity
@Table(name = "passport")
@EntityListeners(AuditingEntityListener.class)
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Passport {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "serial_number", nullable = false)
    private String serialNumber;

    @Column(name = "purchase_year", nullable = false)
    private int purchaseYear;

    @Column(name = "owner_account_id", nullable = false)
    private Long ownerAccountId;

    @Column(name = "model_name", nullable = false)
    private String modelName;

    private String nickname;

    @Column(name = "purchase_date", nullable = false)
    private LocalDate purchaseDate;

    @Column(name = "purchase_place")
    private String purchasePlace;

    @Column(name = "receipt_image_url")
    private String receiptImageUrl;

    @Column(name = "has_receipt_tag", nullable = false)
    private boolean hasReceiptTag;

    @JdbcTypeCode(SqlTypes.ARRAY)
    @Column(name = "baseline_image_urls", columnDefinition = "text[]", nullable = false)
    private List<String> baselineImageUrls;

    @Enumerated(EnumType.STRING)
    @Column(name = "usage_frequency", nullable = false)
    private UsageFrequency usageFrequency;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private PassportStatus status;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    public Passport(String serialNumber, int purchaseYear, Long ownerAccountId, String modelName,
                     String nickname, LocalDate purchaseDate, String purchasePlace,
                     String receiptImageUrl, boolean hasReceiptTag,
                     List<String> baselineImageUrls, UsageFrequency usageFrequency) {
        this.serialNumber = serialNumber;
        this.purchaseYear = purchaseYear;
        this.ownerAccountId = ownerAccountId;
        this.modelName = modelName;
        this.nickname = nickname;
        this.purchaseDate = purchaseDate;
        this.purchasePlace = purchasePlace;
        this.receiptImageUrl = receiptImageUrl;
        this.hasReceiptTag = hasReceiptTag;
        this.baselineImageUrls = baselineImageUrls;
        this.usageFrequency = usageFrequency;
        this.status = PassportStatus.ACTIVE;
    }

    public void updateProfile(String nickname, UsageFrequency usageFrequency) {
        if (nickname != null) this.nickname = nickname;
        if (usageFrequency != null) this.usageFrequency = usageFrequency;
    }

    public void transferOwnershipTo(Long newOwnerAccountId) {
        this.ownerAccountId = newOwnerAccountId;
    }

    public void softDelete() {
        this.status = PassportStatus.DELETED;
    }

    public boolean isOwnedBy(Long accountId) {
        return this.ownerAccountId.equals(accountId);
    }

    // TransferService/NotificationService/PassportSummaryResponse가 각자 따로
    // ChronoUnit.DAYS.between(purchaseDate, ...)을 구현하지 않도록 한 곳으로 모은다 —
    // "소유 경과일" 정의가 바뀌면(예: 반올림 규칙) 여러 군데를 손으로 맞춰야 하는 걸 막는다.
    public long ownershipDays(LocalDate asOf) {
        return ChronoUnit.DAYS.between(this.purchaseDate, asOf);
    }
}
