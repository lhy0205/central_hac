package com.mcm.passport.account;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;

import java.util.Optional;

public interface PasswordResetTokenRepository extends JpaRepository<PasswordResetToken, Long> {
    Optional<PasswordResetToken> findByToken(String token);

    // confirmPasswordReset()에서만 사용: 같은 토큰으로 온 동시 요청이 둘 다 isUsable() 체크를
    // 통과해버려서 토큰의 1회용 불변식이 깨지는 경합 상태를 막기 위해 행 잠금을 잡은 채로 조회한다.
    // 이 트랜잭션에서 이 토큰 엔티티를 처음 로드하는 지점이어야 한다(다른 조회로 먼저 캐시되면
    // 1차 캐시 때문에 잠금 이후에도 오래된 값을 보게 된다 — TransferService.redeem()에서 겪은 문제).
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select t from PasswordResetToken t where t.token = :token")
    Optional<PasswordResetToken> findByTokenForUpdate(String token);
}
