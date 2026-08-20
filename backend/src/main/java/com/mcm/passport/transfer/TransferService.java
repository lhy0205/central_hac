package com.mcm.passport.transfer;

import com.mcm.passport.account.AccountService;
import com.mcm.passport.common.exception.ApiException;
import com.mcm.passport.common.exception.ErrorCode;
import com.mcm.passport.diagnosis.DiagnosisRepository;
import com.mcm.passport.passport.Passport;
import com.mcm.passport.passport.PassportOwnershipGuard;
import com.mcm.passport.passport.PassportRepository;
import com.mcm.passport.passport.PassportStatus;
import com.mcm.passport.reservation.ReservationRepository;
import com.mcm.passport.transfer.dto.TransferCodeResponse;
import com.mcm.passport.transfer.dto.TransferPreviewResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.Optional;

@RequiredArgsConstructor
@Service
@Transactional
public class TransferService {

    private static final String CODE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    private static final int CODE_LENGTH = 6;
    private static final int EXPIRY_DAYS = 7;
    private static final SecureRandom RANDOM = new SecureRandom();

    private final TransferCodeRepository transferCodeRepository;
    private final PassportRepository passportRepository;
    private final DiagnosisRepository diagnosisRepository;
    private final AccountService accountService;
    private final PassportOwnershipGuard passportOwnershipGuard;
    private final ReservationRepository reservationRepository;
    private final Clock clock;

    public TransferCodeResponse issueCode(Long passportId, Long requesterAccountId) {

        Passport passport = passportOwnershipGuard.getOwnedActivePassportForUpdate(passportId, requesterAccountId);
        transferCodeRepository.findAllByPassportIdAndStatus(passportId, TransferStatus.ISSUED)
            .forEach(TransferCode::expire);

        LocalDateTime expiresAt = LocalDateTime.now(clock).plusDays(EXPIRY_DAYS);
        TransferCode transferCode;
        try {
            transferCode = transferCodeRepository.save(
                new TransferCode(passportId, generateCode(), requesterAccountId, expiresAt));
        } catch (DataIntegrityViolationException e) {

            throw new ApiException(ErrorCode.TRANSFER_CODE_ISSUE_FAILED);
        }
        return new TransferCodeResponse(transferCode.getCode(), transferCode.getExpiresAt());
    }

    private String generateCode() {
        StringBuilder sb = new StringBuilder(CODE_LENGTH);
        for (int i = 0; i < CODE_LENGTH; i++) {
            sb.append(CODE_CHARS.charAt(RANDOM.nextInt(CODE_CHARS.length())));
        }
        return sb.toString();
    }

    public TransferPreviewResponse preview(String code, Long requesterAccountId) {
        validateCodeFormat(code);
        accountService.getActiveAccountOrThrow(requesterAccountId);
        TransferCode transferCode = getRedeemableCode(code);

        if (transferCode.getIssuedByAccountId().equals(requesterAccountId)) {
            throw new ApiException(ErrorCode.CANNOT_TRANSFER_TO_SELF);
        }
        Passport passport = passportRepository.findByIdAndStatus(transferCode.getPassportId(), PassportStatus.ACTIVE)
            .orElseThrow(() -> new ApiException(ErrorCode.PASSPORT_NOT_FOUND));
        long ownershipDays = passport.ownershipDays(java.time.LocalDate.now(clock));
        String overallGrade = diagnosisRepository.findFirstByPassportIdOrderByDiagnosedAtDescIdDesc(passport.getId())
            .map(d -> d.getOverallGrade().name())
            .orElse(null);
        return new TransferPreviewResponse(passport.getModelName(), ownershipDays, overallGrade);
    }

    public com.mcm.passport.passport.dto.PassportResponse redeem(String code, Long requesterAccountId) {
        validateCodeFormat(code);

        accountService.assertAccountActive(requesterAccountId);
        Long passportId = transferCodeRepository.findPassportIdByCode(code)
            .orElseThrow(() -> new ApiException(ErrorCode.TRANSFER_CODE_EXPIRED_OR_USED));

        Optional<Passport> passportForUpdate =
            passportRepository.findByIdAndStatusForUpdate(passportId, PassportStatus.ACTIVE);

        TransferCode transferCode = transferCodeRepository.findByCodeForUpdate(code)
            .orElseThrow(() -> new ApiException(ErrorCode.TRANSFER_CODE_EXPIRED_OR_USED));
        if (!transferCode.isRedeemable(LocalDateTime.now(clock))) {
            throw new ApiException(ErrorCode.TRANSFER_CODE_EXPIRED_OR_USED);
        }

        if (transferCode.getIssuedByAccountId().equals(requesterAccountId)) {
            throw new ApiException(ErrorCode.CANNOT_TRANSFER_TO_SELF);
        }
        Passport passport = passportForUpdate.orElseThrow(() -> new ApiException(ErrorCode.PASSPORT_NOT_FOUND));

        accountService.getActiveAccountOrThrowForUpdate(requesterAccountId);
        passport.transferOwnershipTo(requesterAccountId);
        transferCode.redeem(requesterAccountId, LocalDateTime.now(clock));

        reservationRepository.cancelAllRequestedForPassport(passport.getId());
        return com.mcm.passport.passport.dto.PassportResponse.from(passport);
    }

    private void validateCodeFormat(String code) {
        if (code == null || code.length() != CODE_LENGTH
                || !code.chars().allMatch(c -> CODE_CHARS.indexOf(c) >= 0)) {
            throw new ApiException(ErrorCode.INVALID_TRANSFER_CODE_FORMAT);
        }
    }

    private TransferCode getRedeemableCode(String code) {
        TransferCode transferCode = transferCodeRepository.findByCode(code)
            .orElseThrow(() -> new ApiException(ErrorCode.TRANSFER_CODE_EXPIRED_OR_USED));
        if (!transferCode.isRedeemable(LocalDateTime.now(clock))) {
            throw new ApiException(ErrorCode.TRANSFER_CODE_EXPIRED_OR_USED);
        }
        return transferCode;
    }
}
