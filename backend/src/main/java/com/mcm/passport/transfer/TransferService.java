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
        // 동시 발급 요청이 둘 다 "만료 처리 후 새 코드 생성"을 통과하는 경합을 막기 위해
        // 여권 행을 잠근 채로 조회한다(자세한 이유는 PassportRepository.findByIdAndStatusForUpdate 참고).
        Passport passport = passportOwnershipGuard.getOwnedActivePassportForUpdate(passportId, requesterAccountId);
        transferCodeRepository.findAllByPassportIdAndStatus(passportId, TransferStatus.ISSUED)
            .forEach(TransferCode::expire);

        LocalDateTime expiresAt = LocalDateTime.now(clock).plusDays(EXPIRY_DAYS);
        TransferCode transferCode;
        try {
            transferCode = transferCodeRepository.save(
                new TransferCode(passportId, generateCode(), requesterAccountId, expiresAt));
        } catch (DataIntegrityViolationException e) {
            // generateCode()는 충돌을 사전 체크하지 않는다(확률이 낮아 감수). 다만 UNIQUE 위반이
            // 500으로 새지 않도록 4xx로 번역한다.
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
        // redeem()과 동일하게 본인 코드는 막는다 — 안 그러면 미리보기가 성공했으니
        // redeem도 될 거라고 오해하게 된다.
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
        // 아래에서 같은 계정을 잠근 채 재확인하므로, 여기서는 엔티티를 로드하지 않는 exists 조회를
        // 써야 한다. 엔티티를 먼저 로드하면 뒤이은 잠금 조회가 1차 캐시에 걸려 옛 값을 돌려준다.
        accountService.assertAccountActive(requesterAccountId);
        Long passportId = transferCodeRepository.findPassportIdByCode(code)
            .orElseThrow(() -> new ApiException(ErrorCode.TRANSFER_CODE_EXPIRED_OR_USED));
        // issueCode()와 같은 순서(여권 → 코드)로 잠가야 교착상태가 생기지 않는다.
        // 결과가 비어 있어도 여기서 바로 던지지 않는다 — 코드가 이미 만료/사용된 경우가 실제
        // 원인일 수 있어 코드 상태를 먼저 확인한다.
        Optional<Passport> passportForUpdate =
            passportRepository.findByIdAndStatusForUpdate(passportId, PassportStatus.ACTIVE);
        // TransferCode 엔티티를 여기서 처음 로드한다(잠금 포함) — findPassportIdByCode는 스칼라만
        // 가져와 영속성 컨텍스트에 올라가지 않으므로 1차 캐시에 안 걸리고 최신 값을 잠긴 채로 읽는다.
        TransferCode transferCode = transferCodeRepository.findByCodeForUpdate(code)
            .orElseThrow(() -> new ApiException(ErrorCode.TRANSFER_CODE_EXPIRED_OR_USED));
        if (!transferCode.isRedeemable(LocalDateTime.now(clock))) {
            throw new ApiException(ErrorCode.TRANSFER_CODE_EXPIRED_OR_USED);
        }
        // CANNOT_TRANSFER_TO_SELF는 코드의 발급자 정보만으로 판단되므로 여권 존재 여부보다 먼저
        // 확인한다 — 순서가 바뀌면, 자기 자신에게 양도를 시도했는데 여권이 독립적으로 soft-delete된
        // 드문 경우에 PASSPORT_NOT_FOUND로 잘못 나온다.
        if (transferCode.getIssuedByAccountId().equals(requesterAccountId)) {
            throw new ApiException(ErrorCode.CANNOT_TRANSFER_TO_SELF);
        }
        Passport passport = passportForUpdate.orElseThrow(() -> new ApiException(ErrorCode.PASSPORT_NOT_FOUND));
        // 옮기기 직전에 요청자 계정을 잠근 채로 다시 확인한다 — 맨 위 초기 확인은 잠금이 없어서,
        // 그 사이 AccountService.withdraw()가 이 계정을 먼저 잠그고 탈퇴시켜도 이 트랜잭션은 그걸
        // 모른 채 여권을 탈퇴 계정으로 넘겨버릴 수 있다.
        accountService.getActiveAccountOrThrowForUpdate(requesterAccountId);
        passport.transferOwnershipTo(requesterAccountId);
        transferCode.redeem(requesterAccountId, LocalDateTime.now(clock));
        // 이전 소유자가 잡아둔 예약은 새 소유자가 만든 게 아니고, 매장도 여권 소유자가 바뀐 걸 모른다
        // — withdraw()/delete()와 같은 이유로 승계 시점에 정리한다.
        reservationRepository.cancelAllRequestedForPassport(passport.getId());
        return com.mcm.passport.passport.dto.PassportResponse.from(passport);
    }

    // 발급 형식(CODE_CHARS 중 CODE_LENGTH자)과 다르면 DB 조회 전에 걸러내서
    // TRANSFER_CODE_EXPIRED_OR_USED로 뭉뚱그리지 않고 INVALID_TRANSFER_CODE_FORMAT로 던진다.
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
