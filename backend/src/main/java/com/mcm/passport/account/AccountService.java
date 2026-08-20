package com.mcm.passport.account;

import com.mcm.passport.account.dto.*;
import com.mcm.passport.common.exception.ApiException;
import com.mcm.passport.common.exception.ErrorCode;
import com.mcm.passport.common.security.JwtTokenProvider;
import com.mcm.passport.reservation.ReservationRepository;
import com.mcm.passport.reservation.ReservationStatus;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Transactional
public class AccountService {

    private final AccountRepository accountRepository;
    private final PasswordResetTokenRepository passwordResetTokenRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtTokenProvider jwtTokenProvider;
    private final PasswordResetMailer passwordResetMailer;
    private final com.mcm.passport.passport.PassportRepository passportRepository;
    private final ReservationRepository reservationRepository;
    private final Clock clock;

    public AccountResponse signup(SignupRequest request) {

        String email = normalizeEmail(request.email());
        if (accountRepository.existsByEmailAndStatus(email, AccountStatus.ACTIVE)) {
            throw new ApiException(ErrorCode.EMAIL_ALREADY_EXISTS);
        }
        Account account = new Account(email, passwordEncoder.encode(request.password()), request.nickname());
        try {
            return AccountResponse.from(accountRepository.save(account));
        } catch (org.springframework.dao.DataIntegrityViolationException e) {

            throw new ApiException(ErrorCode.EMAIL_ALREADY_EXISTS);
        }
    }

    public LoginResponse login(LoginRequest request) {
        Account account = accountRepository.findByEmailAndStatus(normalizeEmail(request.email()), AccountStatus.ACTIVE)
            .orElseThrow(() -> new ApiException(ErrorCode.INVALID_CREDENTIALS));
        if (!passwordEncoder.matches(request.password(), account.getPasswordHash())) {
            throw new ApiException(ErrorCode.INVALID_CREDENTIALS);
        }
        return new LoginResponse(jwtTokenProvider.generateToken(account.getId()), AccountResponse.from(account));
    }

    private String normalizeEmail(String email) {
        return email == null ? null : email.toLowerCase(java.util.Locale.ROOT);
    }

    public AccountResponse getMe(Long accountId) {
        return AccountResponse.from(getActiveAccountOrThrow(accountId));
    }

    public AccountResponse updateProfile(Long accountId, UpdateProfileRequest request) {
        Account account = getActiveAccountOrThrow(accountId);
        account.changeNickname(request.nickname());
        return AccountResponse.from(account);
    }

    public void requestPasswordReset(String email) {
        String normalizedEmail = normalizeEmail(email);
        accountRepository.findByEmailAndStatus(normalizedEmail, AccountStatus.ACTIVE).ifPresent(account -> {
            String rawToken = UUID.randomUUID().toString();

            passwordResetTokenRepository.save(
                new PasswordResetToken(account.getId(), hashToken(rawToken), LocalDateTime.now(clock).plusMinutes(30)));
            passwordResetMailer.sendResetLink(normalizedEmail, rawToken);
        });

    }

    public void confirmPasswordReset(ConfirmPasswordResetRequest request) {

        PasswordResetToken resetToken = passwordResetTokenRepository.findByTokenForUpdate(hashToken(request.token()))
            .filter(t -> t.isUsable(LocalDateTime.now(clock)))
            .orElseThrow(() -> new ApiException(ErrorCode.RESET_TOKEN_INVALID));
        Account account = getActiveAccountOrThrow(resetToken.getAccountId());
        account.changePassword(passwordEncoder.encode(request.newPassword()));
        resetToken.markUsed(LocalDateTime.now(clock));
    }

    static String hashToken(String rawToken) {
        try {
            byte[] digest = java.security.MessageDigest.getInstance("SHA-256")
                .digest(rawToken.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            return java.util.HexFormat.of().formatHex(digest);
        } catch (java.security.NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 알고리즘을 사용할 수 없습니다", e);
        }
    }

    public void changePassword(Long accountId, ChangePasswordRequest request) {
        Account account = getActiveAccountOrThrow(accountId);
        if (!passwordEncoder.matches(request.currentPassword(), account.getPasswordHash())) {
            throw new ApiException(ErrorCode.INVALID_CURRENT_PASSWORD);
        }
        account.changePassword(passwordEncoder.encode(request.newPassword()));
    }

    public NotificationPreferencesResponse getNotificationPreferences(Long accountId) {
        return NotificationPreferencesResponse.from(getActiveAccountOrThrow(accountId));
    }

    public NotificationPreferencesResponse updateNotificationPreferences(
            Long accountId, UpdateNotificationPreferencesRequest request) {
        Account account = getActiveAccountOrThrow(accountId);
        account.updateNotificationPreferences(
            request.careAlertsEnabled(), request.journeyAlertsEnabled(), request.marketingAlertsEnabled());
        return NotificationPreferencesResponse.from(account);
    }

    public void withdraw(Long accountId) {

        Account account = getActiveAccountOrThrowForUpdate(accountId);
        account.withdraw(LocalDateTime.now(clock));

        List<Long> ownedPassportIds = passportRepository.findIdsByOwnerAccountId(accountId);
        if (!ownedPassportIds.isEmpty()) {
            List<Long> stillOwnedPassportIds = passportRepository
                .findAllByIdInAndStatusForUpdate(ownedPassportIds, com.mcm.passport.passport.PassportStatus.ACTIVE)
                .stream()
                .filter(p -> p.isOwnedBy(accountId))
                .peek(com.mcm.passport.passport.Passport::softDelete)
                .map(com.mcm.passport.passport.Passport::getId)
                .toList();
            if (!stillOwnedPassportIds.isEmpty()) {
                reservationRepository.cancelAllRequestedForPassportIn(stillOwnedPassportIds);
            }
        }
    }

    public Account getActiveAccountOrThrow(Long accountId) {
        return accountRepository.findById(accountId)
            .filter(Account::isActive)
            .orElseThrow(() -> new ApiException(ErrorCode.ACCOUNT_NOT_FOUND));
    }

    public Account getActiveAccountOrThrowForUpdate(Long accountId) {
        return accountRepository.findByIdForUpdate(accountId)
            .filter(Account::isActive)
            .orElseThrow(() -> new ApiException(ErrorCode.ACCOUNT_NOT_FOUND));
    }

    public void assertAccountActive(Long accountId) {
        if (!accountRepository.existsByIdAndStatus(accountId, AccountStatus.ACTIVE)) {
            throw new ApiException(ErrorCode.ACCOUNT_NOT_FOUND);
        }
    }
}
