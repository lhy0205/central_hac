package com.mcm.passport.diagnosis;

import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

@Entity
@Table(name = "diagnosis")
@EntityListeners(AuditingEntityListener.class)
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Diagnosis {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "passport_id", nullable = false)
    private Long passportId;

    @Enumerated(EnumType.STRING)
    @Column(name = "diagnosis_type", nullable = false)
    private DiagnosisType diagnosisType;

    @JdbcTypeCode(SqlTypes.ARRAY)
    @Column(name = "image_urls", columnDefinition = "text[]", nullable = false)
    private List<String> imageUrls;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "item_scores", columnDefinition = "jsonb", nullable = false)
    private Map<String, Integer> itemScores;

    @Enumerated(EnumType.STRING)
    @Column(name = "overall_grade", nullable = false)
    private OverallGrade overallGrade;

    @Column(name = "evidence_text", nullable = false, length = 1000)
    private String evidenceText;

    @Column(name = "diagnosed_at", nullable = false)
    private LocalDateTime diagnosedAt;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    public Diagnosis(Long passportId, DiagnosisType diagnosisType, List<String> imageUrls,
                      Map<String, Integer> itemScores, OverallGrade overallGrade, String evidenceText) {
        this.passportId = passportId;
        this.diagnosisType = diagnosisType;
        this.imageUrls = imageUrls;
        this.itemScores = itemScores;
        this.overallGrade = overallGrade;
        this.evidenceText = evidenceText;
    }

    @PrePersist
    void prePersist() {
        this.diagnosedAt = this.createdAt;
    }
}
