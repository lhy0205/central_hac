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
    // diagnosedAt는 같은 밀리초에 두 진단이 몰리면(예: 동시 제출) 동률이 날 수 있어, id를 2차
    // 정렬 기준으로 덧붙여 "최신 진단"이 호출마다 항상 같은 행으로 결정되도록 한다.
    Optional<Diagnosis> findFirstByPassportIdOrderByDiagnosedAtDescIdDesc(Long passportId);
    Page<Diagnosis> findAllByPassportIdOrderByDiagnosedAtDescIdDesc(Long passportId, Pageable pageable);
    List<Diagnosis> findAllByPassportId(Long passportId);
    List<Diagnosis> findAllByPassportIdInOrderByDiagnosedAtDescIdDesc(List<Long> passportIds);

    // PassportService.list()와 NotificationService.generateReminders()가 똑같이 필요로 하던
    // "여권 목록 -> 각 여권의 최신 진단" 배치 조회+매핑 로직을 한 곳으로 모은다(중복 시 한쪽만
    // 고쳐지고 다른 쪽은 방치되는 사고를 막기 위함).
    default Map<Long, Diagnosis> findLatestByPassportIdIn(List<Long> passportIds) {
        if (passportIds.isEmpty()) {
            return Map.of();
        }
        return findAllByPassportIdInOrderByDiagnosedAtDescIdDesc(passportIds).stream()
            .collect(Collectors.toMap(Diagnosis::getPassportId, d -> d, (first, second) -> first, LinkedHashMap::new));
    }
}
