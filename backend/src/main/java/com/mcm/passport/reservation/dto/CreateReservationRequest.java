package com.mcm.passport.reservation.dto;

import com.mcm.passport.reservation.CareRequestItemType;
import jakarta.validation.constraints.Future;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.LocalDateTime;
import java.util.List;

public record CreateReservationRequest(
    @NotNull Long storeId,
    @NotNull @Future LocalDateTime slotDateTime,

    @NotNull @Size(min = 1) List<@NotNull CareRequestItemType> requestItems
) {
}
