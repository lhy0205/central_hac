package com.mcm.passport.passport;

import com.mcm.passport.account.AccountService;
import com.mcm.passport.common.exception.ApiException;
import com.mcm.passport.common.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.Optional;
import java.util.function.BiFunction;

// "탈퇴 계정 거부 + 여권 활성 확인 + 소유권 확인" 3단 체크. 여러 서비스가 각자 복붙해 갖고 있으면
// 게이팅 규칙이 바뀔 때 한 군데를 빠뜨리기 쉬워 한 곳으로 모았다.
@Component
@RequiredArgsConstructor
public class PassportOwnershipGuard {

    private final PassportRepository passportRepository;
    private final AccountService accountService;

    public Passport getOwnedActivePassport(Long passportId, Long requesterAccountId) {
        return getOwnedActivePassport(passportId, requesterAccountId, passportRepository::findByIdAndStatus);
    }

    // 소유권이 트랜잭션 도중 바뀔 수 있는 쓰기 경로(승계 발급/양도, 여권 삭제, 예약 생성)에서 쓴다.
    // 읽기 전용 경로까지 불필요하게 잠그지 않도록 별도 메서드로 뒀다.
    // 업로드를 동반하는 서비스들은 NOT_SUPPORTED라 이 메서드를 쓸 수 없다(각 재확인 지점 주석 참고).
    public Passport getOwnedActivePassportForUpdate(Long passportId, Long requesterAccountId) {
        return getOwnedActivePassport(passportId, requesterAccountId, passportRepository::findByIdAndStatusForUpdate);
    }

    private Passport getOwnedActivePassport(Long passportId, Long requesterAccountId,
                                             BiFunction<Long, PassportStatus, Optional<Passport>> finder) {
        accountService.getActiveAccountOrThrow(requesterAccountId);
        Passport passport = finder.apply(passportId, PassportStatus.ACTIVE)
            .orElseThrow(() -> new ApiException(ErrorCode.PASSPORT_NOT_FOUND));
        if (!passport.isOwnedBy(requesterAccountId)) {
            throw new ApiException(ErrorCode.FORBIDDEN);
        }
        return passport;
    }
}
