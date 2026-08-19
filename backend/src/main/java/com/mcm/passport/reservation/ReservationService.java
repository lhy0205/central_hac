package com.mcm.passport.reservation;

import com.mcm.passport.common.exception.ApiException;
import com.mcm.passport.common.exception.ErrorCode;
import com.mcm.passport.reservation.dto.CreateReservationRequest;
import com.mcm.passport.reservation.dto.ReservationResponse;
import com.mcm.passport.store.Store;
import com.mcm.passport.store.StoreRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
@Transactional
public class ReservationService {

    private final ReservationRepository reservationRepository;
    private final StoreRepository storeRepository;
    private final com.mcm.passport.passport.PassportOwnershipGuard passportOwnershipGuard;
    private final Clock clock;

    public ReservationResponse create(Long passportId, Long requesterAccountId, CreateReservationRequest request) {
        // 잠금 없는 조회를 쓰면 이 INSERT가 AccountService.withdraw()/PassportService.delete()의
        // cancelAllRequestedForPassport() 벌크 취소보다 늦게 커밋될 수 있다 — 그러면 이 예약은
        // REQUESTED로 영원히 남아 그 매장·시각 슬롯을 아무도 못 잡는다.
        passportOwnershipGuard.getOwnedActivePassportForUpdate(passportId, requesterAccountId);
        Store store = storeRepository.findById(request.storeId())
            .orElseThrow(() -> new ApiException(ErrorCode.STORE_NOT_FOUND));
        if (!SlotGridCalculator.isValidSlot(store, request.slotDateTime())) {
            throw new ApiException(ErrorCode.INVALID_SLOT_TIME);
        }
        Reservation reservation = new Reservation(passportId, store.getId(), request.slotDateTime(),
            request.requestItems().stream().map(Enum::name).toList());
        try {
            return ReservationResponse.from(reservationRepository.save(reservation), store.getName());
        } catch (DataIntegrityViolationException e) {
            throw new ApiException(ErrorCode.SLOT_ALREADY_BOOKED);
        }
    }

    public Page<ReservationResponse> list(Long passportId, Long requesterAccountId, Pageable pageable) {
        passportOwnershipGuard.getOwnedActivePassport(passportId, requesterAccountId);
        // slotDateTime만으로는 동시각 예약 사이 타이브레이커가 없어 페이지 순서가 불안정할 수
        // 있다 — PassportService.list()처럼 id를 덧붙인다. 리포지토리 메서드 이름의
        // OrderBy(slotDateTime desc)가 먼저 적용되고 이 Pageable의 정렬이 뒤이어붙는다.
        Pageable stablePageable = PageRequest.of(
            pageable.getPageNumber(), pageable.getPageSize(),
            pageable.getSort().and(Sort.by(Sort.Direction.ASC, "id")));
        Page<Reservation> page = reservationRepository.findAllByPassportIdOrderBySlotDateTimeDesc(passportId, stablePageable);
        // 페이지 안의 매장을 한 번에 배치 조회 — 페이지당 최대 N건인데 건마다 findById를 부르면
        // N+1이 된다.
        Map<Long, String> storeNames = storeNamesFor(page.getContent());
        return page.map(r -> ReservationResponse.from(r, storeNames.getOrDefault(r.getStoreId(), "")));
    }

    public ReservationResponse getDetail(Long reservationId, Long requesterAccountId) {
        Reservation reservation = getOwnedReservation(reservationId, requesterAccountId);
        String storeName = storeNamesFor(List.of(reservation)).getOrDefault(reservation.getStoreId(), "");
        return ReservationResponse.from(reservation, storeName);
    }

    public void cancel(Long reservationId, Long requesterAccountId) {
        getOwnedReservation(reservationId, requesterAccountId).cancel();
    }

    public List<LocalDateTime> getAvailableSlots(Long storeId, LocalDate date) {
        Store store = storeRepository.findById(storeId)
            .orElseThrow(() -> new ApiException(ErrorCode.STORE_NOT_FOUND));
        LocalDateTime dayStart = date.atStartOfDay();
        LocalDateTime dayEnd = dayStart.plusDays(1);
        List<LocalDateTime> booked = reservationRepository
            .findAllByStoreIdAndSlotDateTimeBetweenAndStatus(storeId, dayStart, dayEnd, ReservationStatus.REQUESTED)
            .stream().map(Reservation::getSlotDateTime).toList();
        LocalDateTime now = LocalDateTime.now(clock);
        return SlotGridCalculator.gridFor(store, date).stream()
            .filter(slot -> !booked.contains(slot))
            .filter(slot -> slot.isAfter(now))
            .toList();
    }

    private Reservation getOwnedReservation(Long reservationId, Long requesterAccountId) {
        Reservation reservation = reservationRepository.findById(reservationId)
            .orElseThrow(() -> new ApiException(ErrorCode.RESERVATION_NOT_FOUND));
        passportOwnershipGuard.getOwnedActivePassport(reservation.getPassportId(), requesterAccountId);
        return reservation;
    }

    private Map<Long, String> storeNamesFor(List<Reservation> reservations) {
        List<Long> storeIds = reservations.stream().map(Reservation::getStoreId).distinct().toList();
        return storeRepository.namesByIds(storeIds);
    }
}
