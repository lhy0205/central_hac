package com.mcm.passport.account;

import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.LocalDateTime;

@Entity
@Table(name = "account")
@EntityListeners(AuditingEntityListener.class)
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Account {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true)
    private String email;

    @Column(name = "password_hash", nullable = false)
    private String passwordHash;

    private String nickname;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private AccountStatus status;

    @Column(name = "withdrawn_at")
    private LocalDateTime withdrawnAt;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "care_alerts_enabled", nullable = false)
    private boolean careAlertsEnabled = true;

    @Column(name = "journey_alerts_enabled", nullable = false)
    private boolean journeyAlertsEnabled = true;

    @Column(name = "marketing_alerts_enabled", nullable = false)
    private boolean marketingAlertsEnabled = false;

    public Account(String email, String passwordHash, String nickname) {
        this.email = email;
        this.passwordHash = passwordHash;
        this.nickname = nickname;
        this.status = AccountStatus.ACTIVE;
    }

    public void changeNickname(String nickname) {
        this.nickname = nickname;
    }

    public void withdraw(LocalDateTime withdrawnAt) {
        this.status = AccountStatus.WITHDRAWN;
        this.withdrawnAt = withdrawnAt;
    }

    public void changePassword(String newPasswordHash) {
        this.passwordHash = newPasswordHash;
    }

    // journeyAlertsEnabled/marketingAlertsEnabled는 저장만 될 뿐 아직 어떤 알림 생성 로직도
    // 참조하지 않는다 — "여권 기록 알림"에 대응하는 별도 알림 타입이 없고(NotificationType은
    // SELF_CARE/STORE_SERVICE/REPURCHASE/MILESTONE뿐), "마케팅 알림"에 대응하는 타입은 아예
    // 존재하지 않는다. careAlertsEnabled만 NotificationService의 생성 로직을 실제로 게이팅한다.
    public void updateNotificationPreferences(
            boolean careAlertsEnabled, boolean journeyAlertsEnabled, boolean marketingAlertsEnabled) {
        this.careAlertsEnabled = careAlertsEnabled;
        this.journeyAlertsEnabled = journeyAlertsEnabled;
        this.marketingAlertsEnabled = marketingAlertsEnabled;
    }

    public boolean isActive() {
        return this.status == AccountStatus.ACTIVE;
    }
}
