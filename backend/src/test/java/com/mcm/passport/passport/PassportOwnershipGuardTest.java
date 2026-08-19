package com.mcm.passport.passport;

import com.mcm.passport.account.AccountService;
import com.mcm.passport.common.exception.ApiException;
import com.mcm.passport.common.exception.ErrorCode;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class PassportOwnershipGuardTest {

    @Mock private PassportRepository passportRepository;
    @Mock private AccountService accountService;

    private PassportOwnershipGuard guard;

    @Test
    void returnsPassportWhenActiveAccountOwnsActivePassport() {
        guard = new PassportOwnershipGuard(passportRepository, accountService);
        Passport passport = new Passport("A1234", 2024, 1L, "Nomad Backpack", "애칭",
            LocalDate.of(2024, 1, 1), "MCM 강남점", null, false, List.of(), UsageFrequency.DAILY);
        when(passportRepository.findByIdAndStatus(10L, PassportStatus.ACTIVE)).thenReturn(Optional.of(passport));

        Passport result = guard.getOwnedActivePassport(10L, 1L);

        assertThat(result).isSameAs(passport);
        verify(accountService).getActiveAccountOrThrow(1L);
    }

    @Test
    void rejectsWithdrawnAccountBeforeTouchingPassportRepository() {
        guard = new PassportOwnershipGuard(passportRepository, accountService);
        when(accountService.getActiveAccountOrThrow(1L)).thenThrow(new ApiException(ErrorCode.ACCOUNT_NOT_FOUND));

        assertThatThrownBy(() -> guard.getOwnedActivePassport(10L, 1L))
            .isInstanceOf(ApiException.class)
            .extracting(e -> ((ApiException) e).getErrorCode())
            .isEqualTo(ErrorCode.ACCOUNT_NOT_FOUND);
        verifyNoInteractions(passportRepository);
    }

    @Test
    void rejectsMissingOrSoftDeletedPassport() {
        guard = new PassportOwnershipGuard(passportRepository, accountService);
        when(passportRepository.findByIdAndStatus(10L, PassportStatus.ACTIVE)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> guard.getOwnedActivePassport(10L, 1L))
            .isInstanceOf(ApiException.class)
            .extracting(e -> ((ApiException) e).getErrorCode())
            .isEqualTo(ErrorCode.PASSPORT_NOT_FOUND);
    }

    @Test
    void rejectsNonOwner() {
        guard = new PassportOwnershipGuard(passportRepository, accountService);
        Passport passport = new Passport("A1234", 2024, 1L, "Nomad Backpack", "애칭",
            LocalDate.of(2024, 1, 1), "MCM 강남점", null, false, List.of(), UsageFrequency.DAILY);
        when(passportRepository.findByIdAndStatus(10L, PassportStatus.ACTIVE)).thenReturn(Optional.of(passport));

        assertThatThrownBy(() -> guard.getOwnedActivePassport(10L, 999L))
            .isInstanceOf(ApiException.class)
            .extracting(e -> ((ApiException) e).getErrorCode())
            .isEqualTo(ErrorCode.FORBIDDEN);
    }
}
