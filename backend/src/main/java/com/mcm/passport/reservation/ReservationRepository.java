package com.mcm.passport.reservation;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

public interface ReservationRepository extends JpaRepository<Reservation, Long> {
    Page<Reservation> findAllByPassportIdOrderBySlotDateTimeDesc(Long passportId, Pageable pageable);

    List<Reservation> findAllByPassportId(Long passportId);

    List<Reservation> findAllByStoreIdAndSlotDateTimeBetweenAndStatus(
        Long storeId, LocalDateTime start, LocalDateTime end, ReservationStatus status);

    // 여권 삭제/탈퇴 시 슬롯을 반납하는 벌크 취소. 빠뜨리면 그 매장·시각을 아무도 다시 잡지 못한다.
    // @Modifying 벌크 쿼리는 트랜잭션 없이 호출되면 실패하므로 여기에 @Transactional을 붙여
    // 호출 맥락과 무관하게 안전하게 만든다.
    @Transactional
    @Modifying
    @Query("update Reservation r set r.status = com.mcm.passport.reservation.ReservationStatus.CANCELLED " +
           "where r.passportId = :passportId and r.status = com.mcm.passport.reservation.ReservationStatus.REQUESTED")
    void cancelAllRequestedForPassport(Long passportId);

    // AccountService.withdraw()에서만 사용: 여권마다 cancelAllRequestedForPassport를 한 번씩 부르면
    // 소유 여권이 N개인 계정의 탈퇴가 N번의 왕복이 되므로, id 목록 전체를 한 번에 취소한다
    // .
    @Transactional
    @Modifying
    @Query("update Reservation r set r.status = com.mcm.passport.reservation.ReservationStatus.CANCELLED " +
           "where r.passportId in :passportIds and r.status = com.mcm.passport.reservation.ReservationStatus.REQUESTED")
    void cancelAllRequestedForPassportIn(List<Long> passportIds);
}
