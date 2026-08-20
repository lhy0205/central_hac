package com.mcm.passport.passport.dto;

import com.mcm.passport.passport.Passport;

import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;

public record PassportSummaryResponse(
    Long id,
    String modelName,
    String nickname,
    long ownershipDays,
    String overallGrade,
    LocalDateTime lastDiagnosedAt
) {
    public static PassportSummaryResponse withDiagnosis(
            Passport passport, com.mcm.passport.diagnosis.Diagnosis latestDiagnosis, Clock clock) {
        long ownershipDays = passport.ownershipDays(LocalDate.now(clock));
        return new PassportSummaryResponse(
            passport.getId(), passport.getModelName(), passport.getNickname(), ownershipDays,
            latestDiagnosis != null ? latestDiagnosis.getOverallGrade().name() : null,
            latestDiagnosis != null ? latestDiagnosis.getDiagnosedAt() : null);
    }
}
