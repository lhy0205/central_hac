package com.mcm.passport.notification;

import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.LocalDateTime;
import java.util.Map;

@Entity
@Table(name = "notification")
@EntityListeners(AuditingEntityListener.class)
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Notification {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "passport_id", nullable = false)
    private Long passportId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private NotificationType type;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "reason_factors", columnDefinition = "jsonb", nullable = false)
    private Map<String, Object> reasonFactors;

    @Column(nullable = false, length = 500)
    private String message;

    @Column(name = "overall_score")
    private Integer overallScore;

    @Column(nullable = false)
    private boolean read;

    @Column(nullable = false)
    private boolean dismissed;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    public Notification(Long passportId, NotificationType type, Map<String, Object> reasonFactors, String message,
                         Integer overallScore) {
        this.passportId = passportId;
        this.type = type;
        this.reasonFactors = reasonFactors;
        this.message = message;
        this.overallScore = overallScore;
        this.read = false;
        this.dismissed = false;
    }

    public void markRead() {
        this.read = true;
    }

    public void markDismissed() {
        this.dismissed = true;
    }
}
