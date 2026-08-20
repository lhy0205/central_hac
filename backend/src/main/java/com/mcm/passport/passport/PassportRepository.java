package com.mcm.passport.passport;

import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.Optional;

public interface PassportRepository extends JpaRepository<Passport, Long> {
    boolean existsBySerialNumberAndPurchaseYearAndStatus(
        String serialNumber, int purchaseYear, PassportStatus status);

    Page<Passport> findAllByOwnerAccountIdAndStatus(
        Long ownerAccountId, PassportStatus status, Pageable pageable);

    Optional<Passport> findByIdAndStatus(Long id, PassportStatus status);

    List<Passport> findAllByStatus(PassportStatus status);

    @Query("select p.id from Passport p where p.status = :status")
    List<Long> findIdsByStatus(PassportStatus status);

    @Query("select p.id from Passport p where p.ownerAccountId = :ownerAccountId order by p.id asc")
    List<Long> findIdsByOwnerAccountId(Long ownerAccountId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select p from Passport p where p.id = :id and p.status = :status")
    Optional<Passport> findByIdAndStatusForUpdate(Long id, PassportStatus status);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select p from Passport p where p.id in :ids and p.status = :status order by p.id asc")
    List<Passport> findAllByIdInAndStatusForUpdate(List<Long> ids, PassportStatus status);
}
