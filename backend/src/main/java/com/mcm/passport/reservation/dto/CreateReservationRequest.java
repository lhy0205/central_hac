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
    // 리스트 자체의 @NotNull/@Size만으로는 원소가 null인 건 못 막는다 — 그러면
    // ReservationService.create()의 requestItems().stream().map(Enum::name)에서 NPE(500)가 난다.
    // 원소별 @NotNull로 400에서 걸러낸다.
    @NotNull @Size(min = 1) List<@NotNull CareRequestItemType> requestItems
) {
}
