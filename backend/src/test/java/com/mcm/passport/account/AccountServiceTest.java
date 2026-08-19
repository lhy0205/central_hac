package com.mcm.passport.account;

import com.mcm.passport.account.dto.AccountResponse;
import com.mcm.passport.account.dto.ConfirmPasswordResetRequest;
import com.mcm.passport.account.dto.LoginRequest;
import com.mcm.passport.account.dto.LoginResponse;
import com.mcm.passport.account.dto.SignupRequest;
import com.mcm.passport.account.dto.UpdateProfileRequest;
import com.mcm.passport.common.exception.ApiException;
import com.mcm.passport.common.exception.ErrorCode;
import com.mcm.passport.common.security.JwtProperties;
import com.mcm.passport.common.security.JwtTokenProvider;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.time.Clock;
import java.time.ZoneId;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class AccountServiceTest {

    @Mock
    private AccountRepository accountRepository;

    @Mock
    private PasswordResetTokenRepository passwordResetTokenRepository;

    @Mock
    private PasswordResetMailer passwordResetMailer;

    @Mock
    private com.mcm.passport.passport.PassportRepository passportRepository;

    @Mock
    private com.mcm.passport.reservation.ReservationRepository reservationRepository;

    private final PasswordEncoder passwordEncoder = new BCryptPasswordEncoder();

    private final JwtTokenProvider jwtTokenProvider = new JwtTokenProvider(
        new JwtProperties("test-secret-key-must-be-at-least-32-bytes-long", 60_000));

    private final Clock fixedClock = Clock.fixed(
        java.time.LocalDate.of(2026, 8, 12).atStartOfDay(ZoneId.systemDefault()).toInstant(), ZoneId.systemDefault());

    private AccountService accountService;

    @Test
    void signupCreatesAccountWithHashedPassword() {
        accountService = newService();
        when(accountRepository.existsByEmailAndStatus("user@example.com", AccountStatus.ACTIVE)).thenReturn(false);
        when(accountRepository.save(any(Account.class))).thenAnswer(inv -> inv.getArgument(0));

        AccountResponse response = accountService.signup(
            new SignupRequest("user@example.com", "password123", "닉네임"));

        assertThat(response.email()).isEqualTo("user@example.com");
        assertThat(response.nickname()).isEqualTo("닉네임");
        verify(accountRepository).save(any(Account.class));
    }

    @Test
    void signupTranslatesDbConstraintRaceIntoEmailAlreadyExists() {
        accountService = newService();
        when(accountRepository.existsByEmailAndStatus("race@example.com", AccountStatus.ACTIVE)).thenReturn(false);
        when(accountRepository.save(any(Account.class)))
            .thenThrow(new org.springframework.dao.DataIntegrityViolationException(
                "duplicate key value violates unique constraint"));

        assertThatThrownBy(() -> accountService.signup(
                new SignupRequest("race@example.com", "password123", "닉네임")))
            .isInstanceOf(ApiException.class)
            .extracting(e -> ((ApiException) e).getErrorCode())
            .isEqualTo(ErrorCode.EMAIL_ALREADY_EXISTS);
    }

    @Test
    void signupRejectsDuplicateEmail() {
        accountService = newService();
        when(accountRepository.existsByEmailAndStatus("dup@example.com", AccountStatus.ACTIVE)).thenReturn(true);

        assertThatThrownBy(() -> accountService.signup(
                new SignupRequest("dup@example.com", "password123", "닉네임")))
            .isInstanceOf(ApiException.class)
            .extracting(e -> ((ApiException) e).getErrorCode())
            .isEqualTo(ErrorCode.EMAIL_ALREADY_EXISTS);
    }

    @Test
    void signupNormalizesEmailToLowercaseForDuplicateCheckAndStorage() {
        // 정규화 없이 그대로 쓰면 대소문자만 다른 이메일이 중복 체크와
        // DB 유니크 인덱스 양쪽에서 서로 다른 값으로 취급된다 — PassportService.register()의 시리얼
        // 정규화와 같은 이유.
        accountService = newService();
        when(accountRepository.existsByEmailAndStatus("user@example.com", AccountStatus.ACTIVE)).thenReturn(false);
        when(accountRepository.save(any(Account.class))).thenAnswer(inv -> inv.getArgument(0));

        AccountResponse response = accountService.signup(
            new SignupRequest("User@Example.com", "password123", "닉네임"));

        verify(accountRepository).existsByEmailAndStatus("user@example.com", AccountStatus.ACTIVE);
        assertThat(response.email()).isEqualTo("user@example.com");
    }

    @Test
    void loginSucceedsRegardlessOfEmailCase() {
        accountService = newService();
        Account account = new Account("user@example.com",
            passwordEncoder.encode("password123"), "닉네임");
        when(accountRepository.findByEmailAndStatus("user@example.com", AccountStatus.ACTIVE))
            .thenReturn(java.util.Optional.of(account));

        LoginResponse response = accountService.login(new LoginRequest("User@Example.com", "password123"));

        assertThat(response.accessToken()).isNotBlank();
    }

    @Test
    void loginSucceedsWithCorrectCredentials() {
        accountService = newService();
        Account account = new Account("user@example.com",
            passwordEncoder.encode("password123"), "닉네임");
        when(accountRepository.findByEmailAndStatus("user@example.com", AccountStatus.ACTIVE))
            .thenReturn(java.util.Optional.of(account));

        LoginResponse response = accountService.login(new LoginRequest("user@example.com", "password123"));

        assertThat(response.accessToken()).isNotBlank();
        assertThat(response.account().email()).isEqualTo("user@example.com");
    }

    @Test
    void loginFailsWithWrongPassword() {
        accountService = newService();
        Account account = new Account("user@example.com",
            passwordEncoder.encode("password123"), "닉네임");
        when(accountRepository.findByEmailAndStatus("user@example.com", AccountStatus.ACTIVE))
            .thenReturn(java.util.Optional.of(account));

        assertThatThrownBy(() -> accountService.login(new LoginRequest("user@example.com", "wrong-password")))
            .isInstanceOf(ApiException.class)
            .extracting(e -> ((ApiException) e).getErrorCode())
            .isEqualTo(ErrorCode.INVALID_CREDENTIALS);
    }

    @Test
    void getMeReturnsAccount() {
        accountService = newService();
        Account account = new Account("user@example.com", "hash", "닉네임");
        when(accountRepository.findById(1L)).thenReturn(java.util.Optional.of(account));

        AccountResponse response = accountService.getMe(1L);

        assertThat(response.nickname()).isEqualTo("닉네임");
    }

    @Test
    void getMeRejectsWithdrawnAccount() {
        accountService = newService();
        Account account = new Account("user@example.com", "hash", "닉네임");
        account.withdraw(java.time.LocalDateTime.now(fixedClock));
        when(accountRepository.findById(1L)).thenReturn(java.util.Optional.of(account));

        assertThatThrownBy(() -> accountService.getMe(1L))
            .isInstanceOf(ApiException.class)
            .extracting(e -> ((ApiException) e).getErrorCode())
            .isEqualTo(ErrorCode.ACCOUNT_NOT_FOUND);
    }

    @Test
    void updateProfileChangesNickname() {
        accountService = newService();
        Account account = new Account("user@example.com", "hash", "이전닉네임");
        when(accountRepository.findById(1L)).thenReturn(java.util.Optional.of(account));

        AccountResponse response = accountService.updateProfile(1L, new UpdateProfileRequest("새닉네임"));

        assertThat(response.nickname()).isEqualTo("새닉네임");
    }

    @Test
    void requestPasswordResetCreatesToken() {
        AccountService service = newService();
        Account account = new Account("user@example.com", "hash", "닉네임");
        when(accountRepository.findByEmailAndStatus("user@example.com", AccountStatus.ACTIVE))
            .thenReturn(java.util.Optional.of(account));

        service.requestPasswordReset("user@example.com");

        verify(passwordResetTokenRepository).save(any(PasswordResetToken.class));
        verify(passwordResetMailer).sendResetLink(eq("user@example.com"), any(String.class));
    }

    @Test
    void requestPasswordResetStoresHashNotThePlaintextTokenMailedToTheUser() {
        // DB에는 원문 토큰이 아니라 해시만 저장돼야 한다 — 테이블이
        // 노출돼도 유효기간 안의 재설정 요청을 그대로 가로챌 수 없도록.
        AccountService service = newService();
        Account account = new Account("user@example.com", "hash", "닉네임");
        when(accountRepository.findByEmailAndStatus("user@example.com", AccountStatus.ACTIVE))
            .thenReturn(java.util.Optional.of(account));
        org.mockito.ArgumentCaptor<String> mailedTokenCaptor = org.mockito.ArgumentCaptor.forClass(String.class);
        org.mockito.ArgumentCaptor<PasswordResetToken> savedTokenCaptor =
            org.mockito.ArgumentCaptor.forClass(PasswordResetToken.class);
        when(passwordResetTokenRepository.save(savedTokenCaptor.capture())).thenAnswer(inv -> inv.getArgument(0));

        service.requestPasswordReset("user@example.com");

        verify(passwordResetMailer).sendResetLink(eq("user@example.com"), mailedTokenCaptor.capture());
        String rawTokenMailedToUser = mailedTokenCaptor.getValue();
        String storedToken = savedTokenCaptor.getValue().getToken();
        assertThat(storedToken).isNotEqualTo(rawTokenMailedToUser);
        assertThat(storedToken).isEqualTo(AccountService.hashToken(rawTokenMailedToUser));
    }

    @Test
    void requestPasswordResetDoesNothingForWithdrawnAccount() {
        AccountService service = newService();
        // 탈퇴 계정은 findByEmailAndStatus(..., ACTIVE) 쿼리 자체에 걸리지 않는다(실제 DB에서도
        // 이제 ACTIVE로만 스코프된 유니크 인덱스와 짝을 이루는 조회 방식) — 스텁하지 않으면
        // Mockito가 기본으로 빈 Optional을 돌려준다.
        service.requestPasswordReset("withdrawn@example.com");

        verify(passwordResetTokenRepository, never()).save(any(PasswordResetToken.class));
        verify(passwordResetMailer, never()).sendResetLink(anyString(), anyString());
    }

    @Test
    void confirmPasswordResetRejectsExpiredToken() {
        AccountService service = newService();
        PasswordResetToken expired = new PasswordResetToken(1L, AccountService.hashToken("expired-token"),
            java.time.LocalDateTime.now(fixedClock).minusMinutes(1));
        when(passwordResetTokenRepository.findByTokenForUpdate(AccountService.hashToken("expired-token")))
            .thenReturn(java.util.Optional.of(expired));

        assertThatThrownBy(() -> service.confirmPasswordReset(
                new ConfirmPasswordResetRequest("expired-token", "newpassword123")))
            .isInstanceOf(ApiException.class)
            .extracting(e -> ((ApiException) e).getErrorCode())
            .isEqualTo(ErrorCode.RESET_TOKEN_INVALID);
    }

    @Test
    void confirmPasswordResetChangesPasswordAndMarksTokenUsed() {
        AccountService service = newService();
        Account account = new Account("user@example.com", "old-hash", "닉네임");
        String originalHash = account.getPasswordHash();
        PasswordResetToken validToken = new PasswordResetToken(1L, AccountService.hashToken("valid-token"),
            java.time.LocalDateTime.now(fixedClock).plusMinutes(30));
        when(passwordResetTokenRepository.findByTokenForUpdate(AccountService.hashToken("valid-token")))
            .thenReturn(java.util.Optional.of(validToken));
        when(accountRepository.findById(1L)).thenReturn(java.util.Optional.of(account));

        service.confirmPasswordReset(new ConfirmPasswordResetRequest("valid-token", "newpassword123"));

        assertThat(account.getPasswordHash()).isNotEqualTo(originalHash);
        assertThat(passwordEncoder.matches("newpassword123", account.getPasswordHash())).isTrue();
        assertThat(validToken.isUsable(java.time.LocalDateTime.now(fixedClock))).isFalse();
    }

    @Test
    void confirmPasswordResetRejectsWithdrawnAccount() {
        AccountService service = newService();
        Account account = new Account("user@example.com", "old-hash", "닉네임");
        account.withdraw(java.time.LocalDateTime.now(fixedClock));
        PasswordResetToken validToken = new PasswordResetToken(1L, AccountService.hashToken("valid-token"),
            java.time.LocalDateTime.now(fixedClock).plusMinutes(30));
        when(passwordResetTokenRepository.findByTokenForUpdate(AccountService.hashToken("valid-token")))
            .thenReturn(java.util.Optional.of(validToken));
        when(accountRepository.findById(1L)).thenReturn(java.util.Optional.of(account));

        assertThatThrownBy(() -> service.confirmPasswordReset(
                new ConfirmPasswordResetRequest("valid-token", "newpassword123")))
            .isInstanceOf(ApiException.class)
            .extracting(e -> ((ApiException) e).getErrorCode())
            .isEqualTo(ErrorCode.ACCOUNT_NOT_FOUND);
    }

    @Test
    void requestPasswordResetDoesNothingForUnknownEmail() {
        AccountService service = newService();
        when(accountRepository.findByEmailAndStatus("unknown@example.com", AccountStatus.ACTIVE))
            .thenReturn(java.util.Optional.empty());

        service.requestPasswordReset("unknown@example.com");

        verify(passwordResetTokenRepository, never()).save(any(PasswordResetToken.class));
        verify(passwordResetMailer, never()).sendResetLink(anyString(), anyString());
    }

    @Test
    void confirmPasswordResetRejectsUsedToken() {
        AccountService service = newService();
        PasswordResetToken used = new PasswordResetToken(1L, AccountService.hashToken("used-token"),
            java.time.LocalDateTime.now(fixedClock).plusMinutes(30));
        used.markUsed(java.time.LocalDateTime.now(fixedClock));
        when(passwordResetTokenRepository.findByTokenForUpdate(AccountService.hashToken("used-token")))
            .thenReturn(java.util.Optional.of(used));

        assertThatThrownBy(() -> service.confirmPasswordReset(
                new ConfirmPasswordResetRequest("used-token", "newpassword123")))
            .isInstanceOf(ApiException.class)
            .extracting(e -> ((ApiException) e).getErrorCode())
            .isEqualTo(ErrorCode.RESET_TOKEN_INVALID);
    }

    @Test
    void withdrawSetsAccountStatusToWithdrawn() {
        AccountService service = newService();
        Account account = new Account("user@example.com", "hash", "닉네임");
        when(accountRepository.findByIdForUpdate(1L)).thenReturn(java.util.Optional.of(account));

        service.withdraw(1L);

        assertThat(account.getStatus()).isEqualTo(AccountStatus.WITHDRAWN);
        assertThat(account.getWithdrawnAt()).isNotNull();
    }

    @Test
    void withdrawCascadesToOwnedPassports() {
        AccountService service = newService();
        Account account = new Account("user@example.com", "hash", "닉네임");
        when(accountRepository.findByIdForUpdate(1L)).thenReturn(java.util.Optional.of(account));
        com.mcm.passport.passport.Passport passport = new com.mcm.passport.passport.Passport(
            "A1234", 2024, 1L, "Nomad Backpack", "애칭",
            java.time.LocalDate.of(2024, 1, 1), "MCM 강남점", null, false,
            java.util.List.of(), com.mcm.passport.passport.UsageFrequency.DAILY);
        when(passportRepository.findIdsByOwnerAccountId(1L))
            .thenReturn(java.util.Arrays.asList((Long) null));
        when(passportRepository.findAllByIdInAndStatusForUpdate(any(), eq(com.mcm.passport.passport.PassportStatus.ACTIVE)))
            .thenReturn(java.util.List.of(passport));

        service.withdraw(1L);

        assertThat(passport.getStatus()).isEqualTo(com.mcm.passport.passport.PassportStatus.DELETED);
    }

    @Test
    void withdrawDoesNotDeleteAPassportAlreadyTransferredAwayByTheTimeItLocksIt() {
        AccountService service = newService();
        Account account = new Account("user@example.com", "hash", "닉네임");
        when(accountRepository.findByIdForUpdate(1L)).thenReturn(java.util.Optional.of(account));
        when(passportRepository.findIdsByOwnerAccountId(1L))
            .thenReturn(java.util.Arrays.asList((Long) null));
        // 잠금을 잡는 시점에는 이미 다른 계정(999L)으로 소유권이 넘어간 상태를 시뮬레이션한다
        // (redeem()이 먼저 커밋한 경우).
        com.mcm.passport.passport.Passport transferredAway = new com.mcm.passport.passport.Passport(
            "A1234", 2024, 999L, "Nomad Backpack", "애칭",
            java.time.LocalDate.of(2024, 1, 1), "MCM 강남점", null, false,
            java.util.List.of(), com.mcm.passport.passport.UsageFrequency.DAILY);
        when(passportRepository.findAllByIdInAndStatusForUpdate(any(), eq(com.mcm.passport.passport.PassportStatus.ACTIVE)))
            .thenReturn(java.util.List.of(transferredAway));

        service.withdraw(1L);

        assertThat(transferredAway.getStatus()).isEqualTo(com.mcm.passport.passport.PassportStatus.ACTIVE);
        verify(reservationRepository, never()).cancelAllRequestedForPassportIn(any());
    }

    @Test
    void withdrawCascadesToReservationsOfEachDeletedPassport() {
        AccountService service = newService();
        Account account = new Account("user@example.com", "hash", "닉네임");
        when(accountRepository.findByIdForUpdate(1L)).thenReturn(java.util.Optional.of(account));
        // 실제 DB에서 로드된 엔티티는 id가 채워져 있지만, 생성자로 직접 만든 엔티티는 그렇지 않다
        // (Passport에는 테스트용 id 세터가 없다) — cancelAllRequestedForPassportIn에 넘어가는 id가
        // Passport::getId에서 나오므로, 목으로 id를 명시적으로 지정한다.
        com.mcm.passport.passport.Passport passport = org.mockito.Mockito.mock(com.mcm.passport.passport.Passport.class);
        when(passport.getId()).thenReturn(42L);
        when(passport.isOwnedBy(1L)).thenReturn(true);
        when(passportRepository.findIdsByOwnerAccountId(1L)).thenReturn(java.util.List.of(42L));
        when(passportRepository.findAllByIdInAndStatusForUpdate(eq(java.util.List.of(42L)), eq(com.mcm.passport.passport.PassportStatus.ACTIVE)))
            .thenReturn(java.util.List.of(passport));

        service.withdraw(1L);

        verify(passport).softDelete();
        verify(reservationRepository).cancelAllRequestedForPassportIn(java.util.List.of(42L));
    }

    @Test
    void withdrawBatchesPassportLockingInsteadOfPerPassportRoundTrips() {
        // 소유 여권마다 잠금 조회+예약취소를 따로 부르면 N개 여권을
        // 가진 계정의 탈퇴가 2N번의 DB 왕복이 된다 — id 목록을 한 번에 잠그고 취소도 한 번에 해야 한다.
        AccountService service = newService();
        Account account = new Account("user@example.com", "hash", "닉네임");
        when(accountRepository.findByIdForUpdate(1L)).thenReturn(java.util.Optional.of(account));
        com.mcm.passport.passport.Passport passportA = org.mockito.Mockito.mock(com.mcm.passport.passport.Passport.class);
        when(passportA.getId()).thenReturn(10L);
        when(passportA.isOwnedBy(1L)).thenReturn(true);
        com.mcm.passport.passport.Passport passportB = org.mockito.Mockito.mock(com.mcm.passport.passport.Passport.class);
        when(passportB.getId()).thenReturn(20L);
        when(passportB.isOwnedBy(1L)).thenReturn(true);
        when(passportRepository.findIdsByOwnerAccountId(1L)).thenReturn(java.util.List.of(10L, 20L));
        when(passportRepository.findAllByIdInAndStatusForUpdate(
                eq(java.util.List.of(10L, 20L)), eq(com.mcm.passport.passport.PassportStatus.ACTIVE)))
            .thenReturn(java.util.List.of(passportA, passportB));

        service.withdraw(1L);

        verify(passportRepository, never()).findByIdAndStatusForUpdate(any(), any());
        verify(reservationRepository, never()).cancelAllRequestedForPassport(any());
        verify(reservationRepository).cancelAllRequestedForPassportIn(java.util.List.of(10L, 20L));
    }

    @Test
    void withdrawRejectsAlreadyWithdrawnAccount() {
        AccountService service = newService();
        Account account = new Account("user@example.com", "hash", "닉네임");
        account.withdraw(java.time.LocalDateTime.now(fixedClock));
        when(accountRepository.findByIdForUpdate(1L)).thenReturn(java.util.Optional.of(account));

        assertThatThrownBy(() -> service.withdraw(1L))
            .isInstanceOf(ApiException.class)
            .extracting(e -> ((ApiException) e).getErrorCode())
            .isEqualTo(ErrorCode.ACCOUNT_NOT_FOUND);
        verifyNoInteractions(passportRepository);
    }

    @Test
    void withdrawLocksTheAccountRowRatherThanReadingItUnlocked() {
        // 잠금 없는 조회를 쓰면, redeem()이 소유 여권 스냅샷 이후에
        // 이 계정으로 새 여권을 승계·커밋해도 withdraw()가 그 사실을 모른 채 진행해버릴 수 있다.
        AccountService service = newService();
        Account account = new Account("user@example.com", "hash", "닉네임");
        when(accountRepository.findByIdForUpdate(1L)).thenReturn(java.util.Optional.of(account));

        service.withdraw(1L);

        verify(accountRepository).findByIdForUpdate(1L);
        verify(accountRepository, never()).findById(1L);
    }

    @Test
    void changePasswordUpdatesHashWhenCurrentPasswordMatches() {
        AccountService service = newService();
        Account account = new Account("user@example.com", passwordEncoder.encode("oldpassword123"), "닉네임");
        when(accountRepository.findById(1L)).thenReturn(java.util.Optional.of(account));

        service.changePassword(1L, new com.mcm.passport.account.dto.ChangePasswordRequest("oldpassword123", "newpassword123"));

        assertThat(passwordEncoder.matches("newpassword123", account.getPasswordHash())).isTrue();
    }

    @Test
    void changePasswordRejectsWrongCurrentPassword() {
        AccountService service = newService();
        Account account = new Account("user@example.com", passwordEncoder.encode("oldpassword123"), "닉네임");
        when(accountRepository.findById(1L)).thenReturn(java.util.Optional.of(account));

        assertThatThrownBy(() -> service.changePassword(1L,
                new com.mcm.passport.account.dto.ChangePasswordRequest("wrongpassword", "newpassword123")))
            .isInstanceOf(ApiException.class)
            .extracting(e -> ((ApiException) e).getErrorCode())
            .isEqualTo(ErrorCode.INVALID_CURRENT_PASSWORD);
        assertThat(passwordEncoder.matches("oldpassword123", account.getPasswordHash())).isTrue();
    }

    @Test
    void getNotificationPreferencesReturnsDefaults() {
        AccountService service = newService();
        Account account = new Account("user@example.com", "hash", "닉네임");
        when(accountRepository.findById(1L)).thenReturn(java.util.Optional.of(account));

        var response = service.getNotificationPreferences(1L);

        assertThat(response.careAlertsEnabled()).isTrue();
        assertThat(response.journeyAlertsEnabled()).isTrue();
        assertThat(response.marketingAlertsEnabled()).isFalse();
    }

    @Test
    void updateNotificationPreferencesChangesFlags() {
        AccountService service = newService();
        Account account = new Account("user@example.com", "hash", "닉네임");
        when(accountRepository.findById(1L)).thenReturn(java.util.Optional.of(account));

        var response = service.updateNotificationPreferences(1L,
            new com.mcm.passport.account.dto.UpdateNotificationPreferencesRequest(false, false, true));

        assertThat(response.careAlertsEnabled()).isFalse();
        assertThat(response.journeyAlertsEnabled()).isFalse();
        assertThat(response.marketingAlertsEnabled()).isTrue();
    }

    private AccountService newService() {
        return new AccountService(accountRepository, passwordResetTokenRepository,
            passwordEncoder, jwtTokenProvider(), passwordResetMailer, passportRepository,
            reservationRepository, fixedClock);
    }

    private JwtTokenProvider jwtTokenProvider() {
        return new JwtTokenProvider(
            new JwtProperties("test-secret-key-must-be-at-least-32-bytes-long", 60_000));
    }
}
