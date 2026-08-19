package com.mcm.passport.care;

import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.LocalDateTime;

@Entity
@Table(name = "care_record")
@EntityListeners(AuditingEntityListener.class)
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class CareRecord {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "passport_id", nullable = false)
    private Long passportId;

    @Column(name = "care_type", nullable = false)
    private String careType;

    @Column(name = "material_type")
    private String materialType;

    @Column(length = 1000)
    private String notes;

    @Column(name = "image_url")
    private String imageUrl;

    @Column(name = "completed_at", nullable = false)
    private LocalDateTime completedAt;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    public CareRecord(Long passportId, String careType, String materialType, String notes,
                       String imageUrl, LocalDateTime completedAt) {
        this.passportId = passportId;
        this.careType = careType;
        this.materialType = materialType;
        this.notes = notes;
        this.imageUrl = imageUrl;
        this.completedAt = completedAt;
    }

    // TimelineEvent와 같은 이유 — AuditingEntityListener가 이 엔티티 자신의 @PrePersist보다
    // 먼저 실행되도록 JPA 스펙에서 보장하므로, createdAt은 이미 Clock 기반으로 채워져 있다.
    @PrePersist
    void prePersist() {
        if (this.completedAt == null) {
            this.completedAt = this.createdAt;
        }
    }
}
