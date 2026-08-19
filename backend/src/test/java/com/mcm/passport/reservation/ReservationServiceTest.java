package com.mcm.passport.reservation;

import com.mcm.passport.common.exception.ApiException;
import com.mcm.passport.common.exception.ErrorCode;
import com.mcm.passport.passport.Passport;
import com.mcm.passport.passport.PassportOwnershipGuard;
import com.mcm.passport.reservation.dto.CreateReservationRequest;
import com.mcm.passport.store.Store;
import com.mcm.passport.store.StoreRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.Mockito;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class ReservationServiceTest {

    private static final Clock FIXED_CLOCK = Clock.fixed(
        Instant.parse("2026-08-14T00:00:00Z"), ZoneId.of("Asia/Seoul"));

    @Mock private ReservationRepository reservationRepository;
    @Mock private StoreRepository storeRepository;
    @Mock private PassportOwnershipGuard passportOwnershipGuard;

    private ReservationService reservationService;

    @Test
    void listAppendsIdAsStableSortTiebreaker() {
        // slotDateTime만으로는 동시각 예약 사이에 타이브레이커가 없다 —
        // PassportService.list()와 같은 방식으로 id를 붙였는지 검증한다.
        reservationService = newService();
        when(passportOwnershipGuard.getOwnedActivePassport(1L, 1L)).thenReturn(mock(Passport.class));
        org.springframework.data.domain.Pageable requested = org.springframework.data.domain.PageRequest.of(0, 20);
        when(reservationRepository.findAllByPassportIdOrderBySlotDateTimeDesc(
                eq(1L), any(org.springframework.data.domain.Pageable.class)))
            .thenReturn(new org.springframework.data.domain.PageImpl<>(List.of()));

        reservationService.list(1L, 1L, requested);

        org.mockito.ArgumentCaptor<org.springframework.data.domain.Pageable> captor =
            org.mockito.ArgumentCaptor.forClass(org.springframework.data.domain.Pageable.class);
        verify(reservationRepository).findAllByPassportIdOrderBySlotDateTimeDesc(eq(1L), captor.capture());
        assertThat(captor.getValue().getSort().getOrderFor("id")).isNotNull();
        assertThat(captor.getValue().getSort().getOrderFor("id").getDirection())
            .isEqualTo(org.springframework.data.domain.Sort.Direction.ASC);
    }

    @Test
    void createRejectsNonOwner() {
        reservationService = newService();
        when(passportOwnershipGuard.getOwnedActivePassportForUpdate(1L, 999L))
            .thenThrow(new ApiException(ErrorCode.FORBIDDEN));

        assertThatThrownBy(() -> reservationService.create(1L, 999L, new CreateReservationRequest(
                1L, LocalDateTime.of(2026, 9, 1, 14, 0), List.of(CareRequestItemType.OTHER))))
            .isInstanceOf(ApiException.class)
            .extracting(e -> ((ApiException) e).getErrorCode())
            .isEqualTo(ErrorCode.FORBIDDEN);
    }

    @Test
    void createThrowsStoreNotFoundWhenStoreMissing() {
        reservationService = newService();
        when(passportOwnershipGuard.getOwnedActivePassportForUpdate(1L, 1L)).thenReturn(mock(Passport.class));
        when(storeRepository.findById(999L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> reservationService.create(1L, 1L, new CreateReservationRequest(
                999L, LocalDateTime.of(2026, 9, 1, 14, 0), List.of(CareRequestItemType.OTHER))))
            .isInstanceOf(ApiException.class)
            .extracting(e -> ((ApiException) e).getErrorCode())
            .isEqualTo(ErrorCode.STORE_NOT_FOUND);
    }

    @Test
    void createThrowsInvalidSlotTimeWhenOffGrid() {
        reservationService = newService();
        when(passportOwnershipGuard.getOwnedActivePassportForUpdate(1L, 1L)).thenReturn(mock(Passport.class));
        Store offGridStore = storeWithHours();
        when(storeRepository.findById(1L)).thenReturn(Optional.of(offGridStore));

        assertThatThrownBy(() -> reservationService.create(1L, 1L, new CreateReservationRequest(
                1L, LocalDateTime.of(2026, 9, 1, 14, 30), List.of(CareRequestItemType.OTHER))))
            .isInstanceOf(ApiException.class)
            .extracting(e -> ((ApiException) e).getErrorCode())
            .isEqualTo(ErrorCode.INVALID_SLOT_TIME);
        verifyNoInteractions(reservationRepository);
    }

    @Test
    void createSavesReservationWithStoreNameInResponse() {
        reservationService = newService();
        when(passportOwnershipGuard.getOwnedActivePassportForUpdate(1L, 1L)).thenReturn(mock(Passport.class));
        Store store = storeWithHours();
        when(store.getId()).thenReturn(1L);
        when(store.getName()).thenReturn("MCM 강남점");
        when(storeRepository.findById(1L)).thenReturn(Optional.of(store));
        when(reservationRepository.save(any(Reservation.class))).thenAnswer(inv -> inv.getArgument(0));

        var response = reservationService.create(1L, 1L, new CreateReservationRequest(
            1L, LocalDateTime.of(2026, 9, 1, 11, 0), List.of(CareRequestItemType.LEATHER_CLEANING)));

        assertThat(response.storeName()).isEqualTo("MCM 강남점");
        assertThat(response.requestItems()).containsExactly(CareRequestItemType.LEATHER_CLEANING);
        assertThat(response.status()).isEqualTo(ReservationStatus.REQUESTED);
    }

    @Test
    void createTranslatesUniqueViolationToSlotAlreadyBooked() {
        reservationService = newService();
        when(passportOwnershipGuard.getOwnedActivePassportForUpdate(1L, 1L)).thenReturn(mock(Passport.class));
        Store store = storeWithHours();
        when(storeRepository.findById(1L)).thenReturn(Optional.of(store));
        when(reservationRepository.save(any(Reservation.class)))
            .thenThrow(new org.springframework.dao.DataIntegrityViolationException("dup"));

        assertThatThrownBy(() -> reservationService.create(1L, 1L, new CreateReservationRequest(
                1L, LocalDateTime.of(2026, 9, 1, 11, 0), List.of(CareRequestItemType.OTHER))))
            .isInstanceOf(ApiException.class)
            .extracting(e -> ((ApiException) e).getErrorCode())
            .isEqualTo(ErrorCode.SLOT_ALREADY_BOOKED);
    }

    @Test
    void cancelIsIdempotentOnAlreadyCancelledReservation() {
        reservationService = newService();
        Reservation reservation = new Reservation(1L, 1L, LocalDateTime.of(2026, 9, 1, 14, 0),
            List.of(CareRequestItemType.OTHER.name()));
        reservation.cancel();
        when(reservationRepository.findById(5L)).thenReturn(Optional.of(reservation));
        when(passportOwnershipGuard.getOwnedActivePassport(1L, 1L)).thenReturn(mock(Passport.class));

        reservationService.cancel(5L, 1L);

        assertThat(reservation.getStatus()).isEqualTo(ReservationStatus.CANCELLED);
    }

    @Test
    void cancelThrowsNotFoundWhenReservationMissing() {
        reservationService = newService();
        when(reservationRepository.findById(999L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> reservationService.cancel(999L, 1L))
            .isInstanceOf(ApiException.class)
            .extracting(e -> ((ApiException) e).getErrorCode())
            .isEqualTo(ErrorCode.RESERVATION_NOT_FOUND);
    }

    @Test
    void getAvailableSlotsExcludesBookedAndPastSlots() {
        reservationService = newService();
        Store store = storeWithHours();
        when(storeRepository.findById(1L)).thenReturn(Optional.of(store));
        Reservation booked = new Reservation(1L, 1L, LocalDateTime.of(2026, 9, 1, 11, 0),
            List.of(CareRequestItemType.OTHER.name()));
        when(reservationRepository.findAllByStoreIdAndSlotDateTimeBetweenAndStatus(
                eq(1L), any(), any(), eq(ReservationStatus.REQUESTED)))
            .thenReturn(List.of(booked));

        var slots = reservationService.getAvailableSlots(1L, java.time.LocalDate.of(2026, 9, 1));

        // storeWithHours()는 10:00~13:00, 60분 슬롯 → 그리드는 10/11/12시. 11시는 이미 예약됨.
        assertThat(slots).containsExactly(
            LocalDateTime.of(2026, 9, 1, 10, 0),
            LocalDateTime.of(2026, 9, 1, 12, 0));
    }

    private Store storeWithHours() {
        Store store = Mockito.mock(Store.class);
        when(store.getBusinessHoursStart()).thenReturn(LocalTime.of(10, 0));
        when(store.getBusinessHoursEnd()).thenReturn(LocalTime.of(13, 0));
        when(store.getSlotLengthMinutes()).thenReturn(60);
        return store;
    }

    private ReservationService newService() {
        return new ReservationService(reservationRepository, storeRepository, passportOwnershipGuard, FIXED_CLOCK);
    }
}
