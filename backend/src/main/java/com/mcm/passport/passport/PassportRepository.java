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

    // 엔티티가 아니라 id만 가져온다. 엔티티로 읽으면 뒤이은 ForUpdate 조회가 Hibernate 1차 캐시에
    // 걸려 잠금 이전 인스턴스를 그대로 돌려주기 때문이다. id 정렬은 동시 탈퇴 요청이 항상 같은
    // 순서로 여권을 잠그게 해 교착상태를 막는다.
    @Query("select p.id from Passport p where p.ownerAccountId = :ownerAccountId order by p.id asc")
    List<Long> findIdsByOwnerAccountId(Long ownerAccountId);

    // "여권당 발급(ISSUED) 코드는 최대 1개" 불변식을 지키기 위해 코드 발급 시 여권 행을 잠근다.
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select p from Passport p where p.id = :id and p.status = :status")
    Optional<Passport> findByIdAndStatusForUpdate(Long id, PassportStatus status);

    // 탈퇴 시 소유 여권을 한 번에 잠근다. id 정렬은 위와 같은 교착상태 방지 목적.
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select p from Passport p where p.id in :ids and p.status = :status order by p.id asc")
    List<Passport> findAllByIdInAndStatusForUpdate(List<Long> ids, PassportStatus status);
}
