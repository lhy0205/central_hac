package com.mcm.passport.reservation;

import com.mcm.passport.store.Store;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

class SlotGridCalculatorTest {

    @Test
    void gridForEvenlyDividedHoursCoversFullRange() {
        Store store = storeWithHours(LocalTime.of(10, 0), LocalTime.of(13, 0), 60);

        var grid = SlotGridCalculator.gridFor(store, LocalDate.of(2026, 9, 1));

        assertThat(grid).containsExactly(
            LocalDateTime.of(2026, 9, 1, 10, 0),
            LocalDateTime.of(2026, 9, 1, 11, 0),
            LocalDateTime.of(2026, 9, 1, 12, 0));
    }

    @Test
    void gridDropsTrailingPartialSlot() {
        // 10:00~18:30, 60분 슬롯 — 마지막 시작가능 슬롯은 17:00(끝나면 18:00, 아직 영업시간 안).
        // 18:00 시작은 끝나는 시각이 19:00으로 영업종료(18:30)를 넘기므로 제외돼야 한다.
        Store store = storeWithHours(LocalTime.of(17, 0), LocalTime.of(18, 30), 60);

        var grid = SlotGridCalculator.gridFor(store, LocalDate.of(2026, 9, 1));

        assertThat(grid).containsExactly(LocalDateTime.of(2026, 9, 1, 17, 0));
    }

    @Test
    void isValidSlotAcceptsGridMember() {
        Store store = storeWithHours(LocalTime.of(10, 0), LocalTime.of(13, 0), 60);

        assertThat(SlotGridCalculator.isValidSlot(store, LocalDateTime.of(2026, 9, 1, 11, 0))).isTrue();
    }

    @Test
    void isValidSlotRejectsOffGridTime() {
        Store store = storeWithHours(LocalTime.of(10, 0), LocalTime.of(13, 0), 60);

        assertThat(SlotGridCalculator.isValidSlot(store, LocalDateTime.of(2026, 9, 1, 10, 30))).isFalse();
    }

    @Test
    void gridForReturnsEmptyRatherThanHangingWhenSlotLengthIsZero() {
        // slotLength <= 0이면 커서가 전진하지 않아 무한 루프가 된다.
        Store store = storeWithHours(LocalTime.of(10, 0), LocalTime.of(13, 0), 0);

        var grid = SlotGridCalculator.gridFor(store, LocalDate.of(2026, 9, 1));

        assertThat(grid).isEmpty();
    }

    @Test
    void gridForReturnsEmptyRatherThanHangingWhenSlotLengthIsNegative() {
        Store store = storeWithHours(LocalTime.of(10, 0), LocalTime.of(13, 0), -30);

        var grid = SlotGridCalculator.gridFor(store, LocalDate.of(2026, 9, 1));

        assertThat(grid).isEmpty();
    }

    @Test
    void gridForExcludesSlotThatWouldCrossMidnight() {
        // LocalTime.plusMinutes/isAfter는 24:00을 넘으면 wrap돼서 23:00+90분이 00:30이 되고
        // isAfter(23:30)이 false가 나올 수 있음 — 분 단위 정수 비교로 자정 넘는 슬롯은 제외해야 함
        Store store = storeWithHours(LocalTime.of(23, 0), LocalTime.of(23, 30), 90);

        var grid = SlotGridCalculator.gridFor(store, LocalDate.of(2026, 9, 1));

        assertThat(grid).isEmpty();
    }

    private Store storeWithHours(LocalTime start, LocalTime end, int slotLengthMinutes) {
        Store store = Mockito.mock(Store.class);
        when(store.getBusinessHoursStart()).thenReturn(start);
        when(store.getBusinessHoursEnd()).thenReturn(end);
        when(store.getSlotLengthMinutes()).thenReturn(slotLengthMinutes);
        return store;
    }
}
