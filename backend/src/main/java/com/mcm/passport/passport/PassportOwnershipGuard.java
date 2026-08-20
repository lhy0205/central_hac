package com.mcm.passport.passport;

import com.mcm.passport.account.AccountService;
import com.mcm.passport.common.exception.ApiException;
import com.mcm.passport.common.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.Optional;
import java.util.function.BiFunction;

@Component
@RequiredArgsConstructor
public class PassportOwnershipGuard {

    private final PassportRepository passportRepository;
    private final AccountService accountService;

    public Passport getOwnedActivePassport(Long passportId, Long requesterAccountId) {
        return getOwnedActivePassport(passportId, requesterAccountId, passportRepository::findByIdAndStatus);
    }

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
