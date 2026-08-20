package com.mcm.passport.passport.dto;

import com.mcm.passport.passport.Passport;
import com.mcm.passport.passport.PassportStatus;
import com.mcm.passport.passport.UsageFrequency;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

public record PassportResponse(
    Long id,
    String serialNumber,
    int purchaseYear,
    String modelName,
    String nickname,
    LocalDate purchaseDate,
    String purchasePlace,
    boolean hasReceiptTag,
    List<String> baselineImageUrls,
    UsageFrequency usageFrequency,
    PassportStatus status,
    LocalDateTime createdAt
) {
    public static PassportResponse from(Passport passport) {
        return new PassportResponse(
            passport.getId(), passport.getSerialNumber(), passport.getPurchaseYear(),
            passport.getModelName(), passport.getNickname(), passport.getPurchaseDate(),
            passport.getPurchasePlace(), passport.isHasReceiptTag(), passport.getBaselineImageUrls(),
            passport.getUsageFrequency(), passport.getStatus(), passport.getCreatedAt()
        );
    }
}
