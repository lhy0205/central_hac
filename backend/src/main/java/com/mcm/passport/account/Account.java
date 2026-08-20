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
