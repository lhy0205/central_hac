package com.mcm.passport.passport.dto;

import com.mcm.passport.passport.UsageFrequency;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PastOrPresent;

import java.time.LocalDate;

public record RegisterPassportRequest(
    @NotBlank String serialNumber,
    @NotBlank String modelName,
    String nickname,
    @NotNull @PastOrPresent LocalDate purchaseDate,
    String purchasePlace,
    @NotNull UsageFrequency usageFrequency
) {
}
