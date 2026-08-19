package com.mcm.passport.store.dto;

import com.mcm.passport.store.Store;

import java.time.LocalTime;

public record StoreResponse(
    Long id, String name, String address,
    LocalTime businessHoursStart, LocalTime businessHoursEnd, int slotLengthMinutes
) {
    public static StoreResponse from(Store store) {
        return new StoreResponse(store.getId(), store.getName(), store.getAddress(),
            store.getBusinessHoursStart(), store.getBusinessHoursEnd(), store.getSlotLengthMinutes());
    }
}
