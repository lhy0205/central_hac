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
        // 대소문자만 다른 이메일이 중복 가입되거나 로그인에 실패하지 않도록 소문자로 정규화한 뒤
        // 이 값만 쓴다.
        String email = normalizeEmail(request.email());
        if (accountRepository.existsByEmailAndStatus(email, AccountStatus.ACTIVE)) {
            throw new ApiException(ErrorCode.EMAIL_ALREADY_EXISTS);
        }
        Account account = new Account(email, passwordEncoder.encode(request.password()), request.nickname());
        try {
            return AccountResponse.from(accountRepository.save(account));
        } catch (org.springframework.dao.DataIntegrityViolationException e) {
            // 사전 존재여부 체크와 실제 저장 사이의 경합 상태를 대비한 DB 레벨 안전망
            // (PassportService.register의 동일 패턴 참고)
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

    // Locale.ROOT를 명시한다 — 로케일 기본값을 쓰면(터키어 등) 대소문자 변환 결과가 서버 로케일에
    // 따라 달라질 수 있다(SerialValidator 정규화와 같은 이유).
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
            // 원문이 아니라 해시만 저장한다. 테이블이 유출돼도 유효기간 안의 재설정 요청을
            // 가로챌 수 없게 하기 위함이다.
            passwordResetTokenRepository.save(
                new PasswordResetToken(account.getId(), hashToken(rawToken), LocalDateTime.now(clock).plusMinutes(30)));
            passwordResetMailer.sendResetLink(normalizedEmail, rawToken);
        });
        // 존재하지 않는 이메일이거나 탈퇴한 계정이어도 에러를 던지지 않는다 (계정 존재/상태 노출 방지)
    }

    public void confirmPasswordReset(ConfirmPasswordResetRequest request) {
        // 같은 토큰으로 온 동시 요청이 둘 다 isUsable() 체크를 통과해버려서 토큰이 두 번 쓰이는
        // 경합 상태를 막기 위해 행 잠금을 잡은 채로 조회한다(자세한 이유는
        // PasswordResetTokenRepository.findByTokenForUpdate 참고). DB에는 해시만 있으므로 조회도
        // 해시로 한다.
        PasswordResetToken resetToken = passwordResetTokenRepository.findByTokenForUpdate(hashToken(request.token()))
            .filter(t -> t.isUsable(LocalDateTime.now(clock)))
            .orElseThrow(() -> new ApiException(ErrorCode.RESET_TOKEN_INVALID));
        Account account = getActiveAccountOrThrow(resetToken.getAccountId());
        account.changePassword(passwordEncoder.encode(request.newPassword()));
        resetToken.markUsed(LocalDateTime.now(clock));
    }

    // 매번 새로 뽑는 128비트 난수라 bcrypt 같은 느린 해시가 필요 없다. 같은 패키지의 테스트가
    // 픽스처 해시를 만들 때도 이 메서드를 그대로 쓴다.
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
        // 계정 행을 잠근 채로 읽어야 한다. 잠금 없이 진행하면 스냅샷 이후 승계된 여권이 캐스케이드
        // 취소에서 빠져 탈퇴 계정 소유로 남는다. redeem()도 같은 행을 잠그므로 둘은 직렬화된다.
        Account account = getActiveAccountOrThrowForUpdate(accountId);
        account.withdraw(LocalDateTime.now(clock));
        // 잠금 없이 읽고 삭제하면 그 사이 승계된 여권까지 지워진다(새 소유자의 여권이 조용히
        // 사라짐). 잠금을 얻는 시점에도 여전히 이 계정 소유인 경우에만 삭제한다.
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

    // withdraw()/TransferService.redeem()에서만 사용 — 자세한 이유는
    // AccountRepository.findByIdForUpdate 참고.
    public Account getActiveAccountOrThrowForUpdate(Long accountId) {
        return accountRepository.findByIdForUpdate(accountId)
            .filter(Account::isActive)
            .orElseThrow(() -> new ApiException(ErrorCode.ACCOUNT_NOT_FOUND));
    }

    // TransferService.redeem()의 이른 초기 확인 전용 — 엔티티를 로드하지 않는 exists 쿼리를 써야
    // 하는 이유는 AccountRepository.existsByIdAndStatus 참고.
    public void assertAccountActive(Long accountId) {
        if (!accountRepository.existsByIdAndStatus(accountId, AccountStatus.ACTIVE)) {
            throw new ApiException(ErrorCode.ACCOUNT_NOT_FOUND);
        }
    }
}
