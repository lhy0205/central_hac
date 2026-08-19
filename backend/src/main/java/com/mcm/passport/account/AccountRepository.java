package com.mcm.passport.account;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;

import java.util.Optional;

public interface AccountRepository extends JpaRepository<Account, Long> {
    // 탈퇴 계정도 이메일을 그대로 들고 있어(유니크 제약이 ACTIVE로만 스코프됨, V8 참고) email만으로는
    // 유일하지 않다. 스코프 없는 findByEmail/existsByEmail은 의도적으로 두지 않는다.
    Optional<Account> findByEmailAndStatus(String email, AccountStatus status);

    boolean existsByEmailAndStatus(String email, AccountStatus status);

    // 엔티티를 로드하지 않는 불린 조회여야 한다. findById로 Account를 먼저 로드하면 같은 트랜잭션의
    // findByIdForUpdate가 1차 캐시에 걸려 잠금 이전 인스턴스를 돌려준다.
    boolean existsByIdAndStatus(Long id, AccountStatus status);

    // 탈퇴와 승계가 서로의 커밋을 놓치지 않도록 계정 행을 잠근다. 잠금이 없으면 탈퇴 직후 완료된
    // 승계가 탈퇴 계정에 ACTIVE 여권을 남긴다.
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select a from Account a where a.id = :id")
    Optional<Account> findByIdForUpdate(Long id);
}
