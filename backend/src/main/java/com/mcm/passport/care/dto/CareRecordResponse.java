package com.mcm.passport.care.dto;

import com.mcm.passport.care.CareRecord;

import java.time.LocalDateTime;

public record CareRecordResponse(
    Long id, String careType, String materialType, String notes, String imageUrl, LocalDateTime completedAt
) {
    public static CareRecordResponse from(CareRecord record) {
        return new CareRecordResponse(record.getId(), record.getCareType(), record.getMaterialType(),
            record.getNotes(), record.getImageUrl(), record.getCompletedAt());
    }
}
