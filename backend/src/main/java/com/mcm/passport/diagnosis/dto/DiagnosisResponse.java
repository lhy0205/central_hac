package com.mcm.passport.diagnosis.dto;

import com.mcm.passport.diagnosis.Diagnosis;
import com.mcm.passport.diagnosis.DiagnosisType;
import com.mcm.passport.diagnosis.OverallGrade;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

public record DiagnosisResponse(
    Long id,
    DiagnosisType diagnosisType,
    List<String> imageUrls,
    Map<String, Integer> itemScores,
    OverallGrade overallGrade,
    String evidenceText,
    LocalDateTime diagnosedAt,
    Map<String, Integer> previousItemScores
) {
    public static DiagnosisResponse from(Diagnosis diagnosis, Diagnosis previous) {
        return new DiagnosisResponse(
            diagnosis.getId(), diagnosis.getDiagnosisType(), diagnosis.getImageUrls(),
            diagnosis.getItemScores(), diagnosis.getOverallGrade(), diagnosis.getEvidenceText(),
            diagnosis.getDiagnosedAt(), previous != null ? previous.getItemScores() : null
        );
    }
}
