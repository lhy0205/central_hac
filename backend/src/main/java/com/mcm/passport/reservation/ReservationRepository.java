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

    @Transactional
    @Modifying
    @Query("update Reservation r set r.status = com.mcm.passport.reservation.ReservationStatus.CANCELLED " +
           "where r.passportId = :passportId and r.status = com.mcm.passport.reservation.ReservationStatus.REQUESTED")
    void cancelAllRequestedForPassport(Long passportId);

    @Transactional
    @Modifying
    @Query("update Reservation r set r.status = com.mcm.passport.reservation.ReservationStatus.CANCELLED " +
           "where r.passportId in :passportIds and r.status = com.mcm.passport.reservation.ReservationStatus.REQUESTED")
    void cancelAllRequestedForPassportIn(List<Long> passportIds);
}
