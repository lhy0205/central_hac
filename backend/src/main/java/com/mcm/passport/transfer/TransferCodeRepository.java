package com.mcm.passport.transfer;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.Optional;

public interface TransferCodeRepository extends JpaRepository<TransferCode, Long> {
    Optional<TransferCode> findByCode(String code);
    List<TransferCode> findAllByPassportIdAndStatus(Long passportId, TransferStatus status);

    @Query("select t.passportId from TransferCode t where t.code = :code")
    Optional<Long> findPassportIdByCode(String code);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select t from TransferCode t where t.code = :code")
    Optional<TransferCode> findByCodeForUpdate(String code);
}
