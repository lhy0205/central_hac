package com.mcm.passport.care.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.PastOrPresent;

import java.time.LocalDateTime;

public record CreateCareRecordRequest(
    @NotBlank String careType, String materialType, String notes,
    @PastOrPresent LocalDateTime completedAt
) {
}
