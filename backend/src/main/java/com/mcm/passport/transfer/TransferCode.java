package com.mcm.passport.transfer;

import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.LocalDateTime;

@Entity
@Table(name = "transfer_code")
@EntityListeners(AuditingEntityListener.class)
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class TransferCode {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "passport_id", nullable = false)
    private Long passportId;

    @Column(nullable = false, unique = true, length = 6)
    private String code;

    @Column(name = "issued_by_account_id", nullable = false)
    private Long issuedByAccountId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private TransferStatus status;

    @Column(name = "redeemed_by_account_id")
    private Long redeemedByAccountId;

    @Column(name = "redeemed_at")
    private LocalDateTime redeemedAt;

    @Column(name = "expires_at", nullable = false)
    private LocalDateTime expiresAt;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    public TransferCode(Long passportId, String code, Long issuedByAccountId, LocalDateTime expiresAt) {
        this.passportId = passportId;
        this.code = code;
        this.issuedByAccountId = issuedByAccountId;
        this.status = TransferStatus.ISSUED;
        this.expiresAt = expiresAt;
    }

    public boolean isRedeemable(LocalDateTime now) {
        return this.status == TransferStatus.ISSUED && now.isBefore(this.expiresAt);
    }

    public void redeem(Long redeemedByAccountId, LocalDateTime redeemedAt) {
        this.status = TransferStatus.REDEEMED;
        this.redeemedByAccountId = redeemedByAccountId;
        this.redeemedAt = redeemedAt;
    }

    public void expire() {
        this.status = TransferStatus.EXPIRED;
    }
}
