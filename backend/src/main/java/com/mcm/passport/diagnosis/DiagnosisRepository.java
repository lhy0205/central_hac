package com.mcm.passport.diagnosis;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

public interface DiagnosisRepository extends JpaRepository<Diagnosis, Long> {

    Optional<Diagnosis> findFirstByPassportIdOrderByDiagnosedAtDescIdDesc(Long passportId);
    Page<Diagnosis> findAllByPassportIdOrderByDiagnosedAtDescIdDesc(Long passportId, Pageable pageable);
    List<Diagnosis> findAllByPassportId(Long passportId);
    List<Diagnosis> findAllByPassportIdInOrderByDiagnosedAtDescIdDesc(List<Long> passportIds);

    default Map<Long, Diagnosis> findLatestByPassportIdIn(List<Long> passportIds) {
        if (passportIds.isEmpty()) {
            return Map.of();
        }
        return findAllByPassportIdInOrderByDiagnosedAtDescIdDesc(passportIds).stream()
            .collect(Collectors.toMap(Diagnosis::getPassportId, d -> d, (first, second) -> first, LinkedHashMap::new));
    }
}
