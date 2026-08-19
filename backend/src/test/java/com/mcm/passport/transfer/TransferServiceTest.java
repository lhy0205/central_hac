package com.mcm.passport.transfer;

import com.mcm.passport.account.AccountService;
import com.mcm.passport.common.exception.ApiException;
import com.mcm.passport.common.exception.ErrorCode;
import com.mcm.passport.passport.Passport;
import com.mcm.passport.passport.PassportOwnershipGuard;
import com.mcm.passport.passport.PassportRepository;
import com.mcm.passport.passport.PassportStatus;
import com.mcm.passport.passport.UsageFrequency;
import com.mcm.passport.reservation.ReservationRepository;
import com.mcm.passport.transfer.dto.TransferCodeResponse;
import com.mcm.passport.transfer.dto.TransferPreviewResponse;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class TransferServiceTest {

    @Mock private TransferCodeRepository transferCodeRepository;
    @Mock private PassportRepository passportRepository;
    @Mock private com.mcm.passport.diagnosis.DiagnosisRepository diagnosisRepository;
    @Mock private AccountService accountService;
    @Mock private PassportOwnershipGuard passportOwnershipGuard;
    @Mock private ReservationRepository reservationRepository;

    private final Clock fixedClock = Clock.fixed(
        LocalDate.of(2026, 8, 11).atStartOfDay(ZoneId.systemDefault()).toInstant(), ZoneId.systemDefault());

    private TransferService transferService;

    @Test
    void issueCodeRejectsNonOwner() {
        transferService = newService();
        when(passportOwnershipGuard.getOwnedActivePassportForUpdate(1L, 999L))
            .thenThrow(new ApiException(ErrorCode.FORBIDDEN));

        assertThatThrownBy(() -> transferService.issueCode(1L, 999L))
            .isInstanceOf(ApiException.class)
            .extracting(e -> ((ApiException) e).getErrorCode())
            .isEqualTo(ErrorCode.FORBIDDEN);
    }

    @Test
    void issueCodeReturnsNotFoundWhenPassportSoftDeleted() {
        transferService = newService();
        when(passportOwnershipGuard.getOwnedActivePassportForUpdate(1L, 1L))
            .thenThrow(new ApiException(ErrorCode.PASSPORT_NOT_FOUND));

        assertThatThrownBy(() -> transferService.issueCode(1L, 1L))
            .isInstanceOf(ApiException.class)
            .extracting(e -> ((ApiException) e).getErrorCode())
            .isEqualTo(ErrorCode.PASSPORT_NOT_FOUND);
    }

    @Test
    void issueCodeInvalidatesPriorOutstandingCodesAndCreatesNew() {
        transferService = newService();
        Passport passport = new Passport("A1234", 2024, 1L, "Nomad Backpack", "애칭",
            LocalDate.of(2024, 1, 1), "MCM 강남점", null, false, List.of(), UsageFrequency.DAILY);
        when(passportOwnershipGuard.getOwnedActivePassportForUpdate(1L, 1L)).thenReturn(passport);
        TransferCode stale = new TransferCode(1L, "OLD123", 1L,
            LocalDate.now(fixedClock).atStartOfDay().plusDays(3));
        when(transferCodeRepository.findAllByPassportIdAndStatus(1L, TransferStatus.ISSUED))
            .thenReturn(List.of(stale));
        when(transferCodeRepository.save(any(TransferCode.class))).thenAnswer(inv -> inv.getArgument(0));

        TransferCodeResponse response = transferService.issueCode(1L, 1L);

        assertThat(stale.getStatus()).isEqualTo(TransferStatus.EXPIRED);
        assertThat(response.code()).hasSize(6);
    }

    @Test
    void issueCodeDelegatesLockedOwnershipCheckToGuard() {
        transferService = newService();
        Passport passport = new Passport("A1234", 2024, 1L, "Nomad Backpack", "애칭",
            LocalDate.of(2024, 1, 1), "MCM 강남점", null, false, List.of(), UsageFrequency.DAILY);
        when(passportOwnershipGuard.getOwnedActivePassportForUpdate(1L, 1L)).thenReturn(passport);
        when(transferCodeRepository.findAllByPassportIdAndStatus(1L, TransferStatus.ISSUED)).thenReturn(List.of());
        when(transferCodeRepository.save(any(TransferCode.class))).thenAnswer(inv -> inv.getArgument(0));

        transferService.issueCode(1L, 1L);

        verify(passportOwnershipGuard).getOwnedActivePassportForUpdate(1L, 1L);
        verifyNoInteractions(passportRepository);
        verifyNoInteractions(accountService);
    }

    @Test
    void previewRejectsExpiredOrUsedCode() {
        transferService = newService();
        TransferCode expired = new TransferCode(1L, "AB12CD", 1L,
            LocalDate.now(fixedClock).atStartOfDay().minusDays(1));
        when(transferCodeRepository.findByCode("AB12CD")).thenReturn(Optional.of(expired));

        assertThatThrownBy(() -> transferService.preview("AB12CD", 1L))
            .isInstanceOf(ApiException.class)
            .extracting(e -> ((ApiException) e).getErrorCode())
            .isEqualTo(ErrorCode.TRANSFER_CODE_EXPIRED_OR_USED);
    }

    @Test
    void previewRejectsWithdrawnAccount() {
        transferService = newService();
        when(accountService.getActiveAccountOrThrow(1L)).thenThrow(new ApiException(ErrorCode.ACCOUNT_NOT_FOUND));

        assertThatThrownBy(() -> transferService.preview("AB12CD", 1L))
            .isInstanceOf(ApiException.class)
            .extracting(e -> ((ApiException) e).getErrorCode())
            .isEqualTo(ErrorCode.ACCOUNT_NOT_FOUND);
        verifyNoInteractions(transferCodeRepository);
    }

    @Test
    void previewReturnsModelNameOwnershipDaysAndGrade() {
        transferService = newService();
        Passport passport = new Passport("A1234", 2024, 1L, "Nomad Backpack", "애칭",
            LocalDate.of(2024, 1, 1), "MCM 강남점", null, false, List.of(), UsageFrequency.DAILY);
        TransferCode code = new TransferCode(1L, "AB12CD", 1L,
            LocalDate.now(fixedClock).atStartOfDay().plusDays(3));
        when(transferCodeRepository.findByCode("AB12CD")).thenReturn(Optional.of(code));
        when(passportRepository.findByIdAndStatus(1L, PassportStatus.ACTIVE)).thenReturn(Optional.of(passport));
        when(diagnosisRepository.findFirstByPassportIdOrderByDiagnosedAtDescIdDesc(any()))
            .thenReturn(Optional.empty());

        // 요청자(2L)는 코드 발급자(1L)와 다른 사람이어야 한다 — 같으면 self-transfer 체크에 걸린다.
        TransferPreviewResponse response = transferService.preview("AB12CD", 2L);

        assertThat(response.modelName()).isEqualTo("Nomad Backpack");
        assertThat(response.overallGrade()).isNull();
    }

    @Test
    void previewRejectsSelfTransfer() {
        // redeem()은 CANNOT_TRANSFER_TO_SELF를 던지는데 preview()가
        // 이 체크 없이 성공을 돌려주면, 발급자 본인이 자기 코드를 미리보기했을 때 redeem
        // 가능하다고 오해하게 만드는 계약 불일치가 생겼다.
        transferService = newService();
        TransferCode code = new TransferCode(1L, "AB12CD", 1L,
            LocalDate.now(fixedClock).atStartOfDay().plusDays(3));
        when(transferCodeRepository.findByCode("AB12CD")).thenReturn(Optional.of(code));

        assertThatThrownBy(() -> transferService.preview("AB12CD", 1L))
            .isInstanceOf(ApiException.class)
            .extracting(e -> ((ApiException) e).getErrorCode())
            .isEqualTo(ErrorCode.CANNOT_TRANSFER_TO_SELF);
        verifyNoInteractions(passportRepository);
    }

    @Test
    void previewRejectsMalformedCodeFormat() {
        transferService = newService();

        assertThatThrownBy(() -> transferService.preview("bad!", 1L))
            .isInstanceOf(ApiException.class)
            .extracting(e -> ((ApiException) e).getErrorCode())
            .isEqualTo(ErrorCode.INVALID_TRANSFER_CODE_FORMAT);
        verifyNoInteractions(accountService);
        verifyNoInteractions(transferCodeRepository);
    }

    @Test
    void redeemRejectsMalformedCodeFormat() {
        transferService = newService();

        assertThatThrownBy(() -> transferService.redeem("bad!", 1L))
            .isInstanceOf(ApiException.class)
            .extracting(e -> ((ApiException) e).getErrorCode())
            .isEqualTo(ErrorCode.INVALID_TRANSFER_CODE_FORMAT);
        verifyNoInteractions(accountService);
        verifyNoInteractions(transferCodeRepository);
    }

    @Test
    void redeemRejectsSelfTransfer() {
        transferService = newService();
        Passport passport = new Passport("A1234", 2024, 1L, "Nomad Backpack", "애칭",
            LocalDate.of(2024, 1, 1), "MCM 강남점", null, false, List.of(), UsageFrequency.DAILY);
        TransferCode code = new TransferCode(1L, "AB12CD", 1L,
            LocalDate.now(fixedClock).atStartOfDay().plusDays(3));
        when(transferCodeRepository.findPassportIdByCode("AB12CD")).thenReturn(Optional.of(1L));
        when(passportRepository.findByIdAndStatusForUpdate(1L, PassportStatus.ACTIVE)).thenReturn(Optional.of(passport));
        when(transferCodeRepository.findByCodeForUpdate("AB12CD")).thenReturn(Optional.of(code));

        assertThatThrownBy(() -> transferService.redeem("AB12CD", 1L))
            .isInstanceOf(ApiException.class)
            .extracting(e -> ((ApiException) e).getErrorCode())
            .isEqualTo(ErrorCode.CANNOT_TRANSFER_TO_SELF);
    }

    @Test
    void redeemTransfersOwnershipAndMarksCodeRedeemed() {
        transferService = newService();
        Passport passport = new Passport("A1234", 2024, 1L, "Nomad Backpack", "애칭",
            LocalDate.of(2024, 1, 1), "MCM 강남점", null, false, List.of(), UsageFrequency.DAILY);
        TransferCode code = new TransferCode(1L, "AB12CD", 1L,
            LocalDate.now(fixedClock).atStartOfDay().plusDays(3));
        when(transferCodeRepository.findPassportIdByCode("AB12CD")).thenReturn(Optional.of(1L));
        when(passportRepository.findByIdAndStatusForUpdate(1L, PassportStatus.ACTIVE)).thenReturn(Optional.of(passport));
        when(transferCodeRepository.findByCodeForUpdate("AB12CD")).thenReturn(Optional.of(code));

        var response = transferService.redeem("AB12CD", 2L);

        assertThat(response.id()).isNull(); // 저장 목이 아니므로 id는 미할당, 소유권 이전만 검증
        assertThat(passport.isOwnedBy(2L)).isTrue();
        assertThat(code.getStatus()).isEqualTo(TransferStatus.REDEEMED);
        assertThat(code.getRedeemedByAccountId()).isEqualTo(2L);
        verify(reservationRepository).cancelAllRequestedForPassport(passport.getId());
    }

    @Test
    void redeemRejectsWhenRequesterAccountWithdrawnJustBeforeTransfer() {
        // AccountService.withdraw()가 소유 여권 스냅샷을 뜬 직후 이
        // redeem()이 커밋되면 그 여권이 캐스케이드 취소를 빠져나가는 반대 방향 경합이 있었다 —
        // redeem()이 소유권 이전 직전에 요청자 계정을 잠근 채로 재확인해서, withdraw()가 먼저
        // 그 계정 행을 잠그고 커밋했다면 여기서 거부되어야 한다. 여권/코드 상태는 그대로여야 한다.
        transferService = newService();
        Passport passport = new Passport("A1234", 2024, 1L, "Nomad Backpack", "애칭",
            LocalDate.of(2024, 1, 1), "MCM 강남점", null, false, List.of(), UsageFrequency.DAILY);
        TransferCode code = new TransferCode(1L, "AB12CD", 1L,
            LocalDate.now(fixedClock).atStartOfDay().plusDays(3));
        when(transferCodeRepository.findPassportIdByCode("AB12CD")).thenReturn(Optional.of(1L));
        when(passportRepository.findByIdAndStatusForUpdate(1L, PassportStatus.ACTIVE)).thenReturn(Optional.of(passport));
        when(transferCodeRepository.findByCodeForUpdate("AB12CD")).thenReturn(Optional.of(code));
        when(accountService.getActiveAccountOrThrowForUpdate(2L))
            .thenThrow(new ApiException(ErrorCode.ACCOUNT_NOT_FOUND));

        assertThatThrownBy(() -> transferService.redeem("AB12CD", 2L))
            .isInstanceOf(ApiException.class)
            .extracting(e -> ((ApiException) e).getErrorCode())
            .isEqualTo(ErrorCode.ACCOUNT_NOT_FOUND);

        assertThat(passport.isOwnedBy(1L)).isTrue(); // 소유권이 넘어가지 않았어야 한다
        assertThat(code.getStatus()).isEqualTo(TransferStatus.ISSUED); // 코드도 소비되지 않았어야 한다
    }

    @Test
    void redeemReportsSelfTransferBeforePassportNotFoundWhenBothConditionsHold() {
        // 코드 발급자 본인이 자기 코드를 redeem 시도하면서, 그 사이 여권이 독립적으로
        // soft-delete된 드문 경우에도 CANNOT_TRANSFER_TO_SELF가 PASSPORT_NOT_FOUND보다
        // 우선해야 한다 — 코드 데이터만으로 판단 가능한 조건이 여권 조회 성공 여부에
        // 좌우되면 안 된다.
        transferService = newService();
        TransferCode code = new TransferCode(1L, "AB12CD", 1L,
            LocalDate.now(fixedClock).atStartOfDay().plusDays(3));
        when(transferCodeRepository.findPassportIdByCode("AB12CD")).thenReturn(Optional.of(1L));
        when(passportRepository.findByIdAndStatusForUpdate(1L, PassportStatus.ACTIVE)).thenReturn(Optional.empty());
        when(transferCodeRepository.findByCodeForUpdate("AB12CD")).thenReturn(Optional.of(code));

        assertThatThrownBy(() -> transferService.redeem("AB12CD", 1L))
            .isInstanceOf(ApiException.class)
            .extracting(e -> ((ApiException) e).getErrorCode())
            .isEqualTo(ErrorCode.CANNOT_TRANSFER_TO_SELF);
    }

    @Test
    void issueCodeRejectsWithdrawnAccount() {
        transferService = newService();
        when(passportOwnershipGuard.getOwnedActivePassportForUpdate(1L, 1L))
            .thenThrow(new ApiException(ErrorCode.ACCOUNT_NOT_FOUND));

        assertThatThrownBy(() -> transferService.issueCode(1L, 1L))
            .isInstanceOf(ApiException.class)
            .extracting(e -> ((ApiException) e).getErrorCode())
            .isEqualTo(ErrorCode.ACCOUNT_NOT_FOUND);
        verifyNoInteractions(transferCodeRepository);
    }

    @Test
    void redeemRejectsWithdrawnAccount() {
        transferService = newService();
        doThrow(new ApiException(ErrorCode.ACCOUNT_NOT_FOUND))
            .when(accountService).assertAccountActive(2L);

        assertThatThrownBy(() -> transferService.redeem("AB12CD", 2L))
            .isInstanceOf(ApiException.class)
            .extracting(e -> ((ApiException) e).getErrorCode())
            .isEqualTo(ErrorCode.ACCOUNT_NOT_FOUND);
        verifyNoInteractions(transferCodeRepository);
    }

    @Test
    void redeemLocksThePassportRowBeforeTheCodeRowSameOrderAsIssueCode() {
        transferService = newService();
        Passport passport = new Passport("A1234", 2024, 1L, "Nomad Backpack", "애칭",
            LocalDate.of(2024, 1, 1), "MCM 강남점", null, false, List.of(), UsageFrequency.DAILY);
        TransferCode code = new TransferCode(1L, "AB12CD", 1L,
            LocalDate.now(fixedClock).atStartOfDay().plusDays(3));
        when(transferCodeRepository.findPassportIdByCode("AB12CD")).thenReturn(Optional.of(1L));
        when(passportRepository.findByIdAndStatusForUpdate(1L, PassportStatus.ACTIVE)).thenReturn(Optional.of(passport));
        when(transferCodeRepository.findByCodeForUpdate("AB12CD")).thenReturn(Optional.of(code));

        transferService.redeem("AB12CD", 2L);

        verify(passportRepository).findByIdAndStatusForUpdate(1L, PassportStatus.ACTIVE);
        verify(passportRepository, never()).findByIdAndStatus(any(), any());
        verify(transferCodeRepository).findByCodeForUpdate("AB12CD");
        verify(transferCodeRepository, never()).findByCode(any());
        var inOrder = inOrder(passportRepository, transferCodeRepository);
        inOrder.verify(passportRepository).findByIdAndStatusForUpdate(1L, PassportStatus.ACTIVE);
        inOrder.verify(transferCodeRepository).findByCodeForUpdate("AB12CD");
    }

    @Test
    void redeemReturnsNotFoundWhenPassportSoftDeleted() {
        transferService = newService();
        TransferCode code = new TransferCode(1L, "AB12CD", 1L,
            LocalDate.now(fixedClock).atStartOfDay().plusDays(3));
        when(transferCodeRepository.findPassportIdByCode("AB12CD")).thenReturn(Optional.of(1L));
        when(passportRepository.findByIdAndStatusForUpdate(1L, PassportStatus.ACTIVE)).thenReturn(Optional.empty());
        when(transferCodeRepository.findByCodeForUpdate("AB12CD")).thenReturn(Optional.of(code));

        assertThatThrownBy(() -> transferService.redeem("AB12CD", 2L))
            .isInstanceOf(ApiException.class)
            .extracting(e -> ((ApiException) e).getErrorCode())
            .isEqualTo(ErrorCode.PASSPORT_NOT_FOUND);
    }

    @Test
    void redeemReportsExpiredCodeRatherThanPassportNotFoundWhenBothAreStale() {
        // 코드가 이미 만료/사용된 상태에서, 해당 코드가 가리키던 여권마저 그 사이 탈퇴 등으로
        // soft-delete됐다면, "여권 없음"이 아니라 "코드 만료/사용됨"이 진짜 원인이므로 그쪽을
        // 우선 보고해야 한다.
        transferService = newService();
        TransferCode expired = new TransferCode(1L, "AB12CD", 1L,
            LocalDate.now(fixedClock).atStartOfDay().minusDays(1));
        when(transferCodeRepository.findPassportIdByCode("AB12CD")).thenReturn(Optional.of(1L));
        when(passportRepository.findByIdAndStatusForUpdate(1L, PassportStatus.ACTIVE)).thenReturn(Optional.empty());
        when(transferCodeRepository.findByCodeForUpdate("AB12CD")).thenReturn(Optional.of(expired));

        assertThatThrownBy(() -> transferService.redeem("AB12CD", 2L))
            .isInstanceOf(ApiException.class)
            .extracting(e -> ((ApiException) e).getErrorCode())
            .isEqualTo(ErrorCode.TRANSFER_CODE_EXPIRED_OR_USED);
    }

    @Test
    void redeemRejectsUnknownCode() {
        transferService = newService();
        when(transferCodeRepository.findPassportIdByCode("NOPE01")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> transferService.redeem("NOPE01", 2L))
            .isInstanceOf(ApiException.class)
            .extracting(e -> ((ApiException) e).getErrorCode())
            .isEqualTo(ErrorCode.TRANSFER_CODE_EXPIRED_OR_USED);
        verifyNoInteractions(passportRepository);
    }

    private TransferService newService() {
        return new TransferService(transferCodeRepository, passportRepository, diagnosisRepository,
            accountService, passportOwnershipGuard, reservationRepository, fixedClock);
    }
}
