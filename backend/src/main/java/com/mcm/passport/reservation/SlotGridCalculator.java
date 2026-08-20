package com.mcm.passport.reservation;

import com.mcm.passport.store.Store;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.List;

class SlotGridCalculator {

    private SlotGridCalculator() {
    }

    static List<LocalDateTime> gridFor(Store store, LocalDate date) {
        List<LocalDateTime> slots = new ArrayList<>();
        int slotLength = store.getSlotLengthMinutes();

        if (slotLength <= 0) {
            return slots;
        }

        int startMinutes = store.getBusinessHoursStart().toSecondOfDay() / 60;
        int endMinutes = store.getBusinessHoursEnd().toSecondOfDay() / 60;
        for (int cursor = startMinutes; cursor + slotLength <= endMinutes; cursor += slotLength) {
            slots.add(LocalDateTime.of(date, LocalTime.ofSecondOfDay(cursor * 60L)));
        }
        return slots;
    }

    static boolean isValidSlot(Store store, LocalDateTime slotDateTime) {
        return gridFor(store, slotDateTime.toLocalDate()).contains(slotDateTime);
    }
}
