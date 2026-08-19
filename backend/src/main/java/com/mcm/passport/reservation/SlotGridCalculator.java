package com.mcm.passport.reservation;

import com.mcm.passport.store.Store;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.List;

// 매장 영업시간·슬롯길이로 그날의 슬롯 시작시각 그리드를 만든다. 예약 생성 검증과 가용 슬롯
// 조회가 공유하는 순수 로직이다. 자정을 넘어가는 영업시간은 지원하지 않는다.
class SlotGridCalculator {

    private SlotGridCalculator() {
    }

    static List<LocalDateTime> gridFor(Store store, LocalDate date) {
        List<LocalDateTime> slots = new ArrayList<>();
        int slotLength = store.getSlotLengthMinutes();
        // slotLength가 0 이하면 커서가 전진하지 않거나 거꾸로 가서 무한 루프다. 매장 쓰기 API가
        // 없어(Store.java 참고) 지금은 안 생기지만 CHECK 제약도 없으니 방어적으로 막고,
        // 그런 매장은 예약 가능 슬롯이 없는 걸로 취급한다.
        if (slotLength <= 0) {
            return slots;
        }
        // LocalTime.plusMinutes/isAfter는 24:00을 넘으면 감싸(wrap)돈다 — 분 단위 정수 연산으로
        // 비교하면 그 문제 없이 자정 넘는 슬롯을 그대로 걸러낼 수 있다.
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
