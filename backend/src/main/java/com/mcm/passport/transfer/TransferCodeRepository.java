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

    // redeem()에서만 사용: 여권 행을 먼저 잠근 뒤(issueCode()와 같은 순서) 이 코드로 여권 id만
    // 가볍게 조회한다. 스칼라 프로젝션이라 TransferCode 엔티티를 영속성 컨텍스트에 올리지 않으므로,
    // 뒤이은 findByCodeForUpdate 호출이 1차 캐시에 걸려 오래된 값을 돌려주는 일이 없다.
    @Query("select t.passportId from TransferCode t where t.code = :code")
    Optional<Long> findPassportIdByCode(String code);

    // redeem()에서만 사용: 여권 행 잠금을 잡은 뒤(issueCode()와 같은 순서) 이 트랜잭션에서 처음으로
    // TransferCode 엔티티를 잠금과 함께 로드한다. 동시에 같은 코드를 두 번 redeem하는 경합 상태를
    // 막기 위함이다. preview()는 조회 전용이라 잠그지 않는다.
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select t from TransferCode t where t.code = :code")
    Optional<TransferCode> findByCodeForUpdate(String code);
}
