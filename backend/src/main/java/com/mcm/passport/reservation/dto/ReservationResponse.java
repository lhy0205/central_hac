package com.mcm.passport.reservation.dto;

import com.mcm.passport.reservation.CareRequestItemType;
import com.mcm.passport.reservation.Reservation;
import com.mcm.passport.reservation.ReservationStatus;

import java.time.LocalDateTime;
import java.util.List;

public record ReservationResponse(
    Long id, Long passportId, Long storeId, String storeName, LocalDateTime slotDateTime,
    List<CareRequestItemType> requestItems, ReservationStatus status, LocalDateTime createdAt
) {
    public static ReservationResponse from(Reservation reservation, String storeName) {
        return new ReservationResponse(
            reservation.getId(), reservation.getPassportId(), reservation.getStoreId(), storeName,
            reservation.getSlotDateTime(),
            reservation.getRequestItems().stream().map(CareRequestItemType::valueOf).toList(),
            reservation.getStatus(), reservation.getCreatedAt());
    }
}
