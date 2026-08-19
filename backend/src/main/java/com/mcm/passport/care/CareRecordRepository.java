package com.mcm.passport.care;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface CareRecordRepository extends JpaRepository<CareRecord, Long> {
    Page<CareRecord> findAllByPassportIdOrderByCompletedAtDesc(Long passportId, Pageable pageable);
    List<CareRecord> findAllByPassportId(Long passportId);
}
