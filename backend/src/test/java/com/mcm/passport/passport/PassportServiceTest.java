package com.mcm.passport.passport;

import com.mcm.passport.account.AccountService;
import com.mcm.passport.common.exception.ApiException;
import com.mcm.passport.common.exception.ErrorCode;
import com.mcm.passport.common.storage.ImageStorageService;
import com.mcm.passport.passport.dto.PassportResponse;
import com.mcm.passport.passport.dto.RegisterPassportRequest;
import com.mcm.passport.passport.dto.UpdatePassportRequest;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class PassportServiceTest {

    @Mock
    private PassportRepository passportRepository;
    @Mock
    private ImageStorageService imageStorageService;
    @Mock
    private com.mcm.passport.diagnosis.DiagnosisRepository diagnosisRepository;
    @Mock
    private AccountService accountService;
    @Mock
    private PassportOwnershipGuard passportOwnershipGuard;
    @Mock private com.mcm.passport.reservation.ReservationRepository reservationRepository;

    private final Clock fixedClock = Clock.fixed(
        LocalDate.of(2026, 8, 12).atStartOfDay(ZoneId.systemDefault()).toInstant(), ZoneId.systemDefault());

    private PassportService passportService;

    @Test
    void registerRejectsInvalidSerialFormat() {
        passportService = newService();
        RegisterPassportRequest request = new RegisterPassportRequest(
            "INVALID", "Nomad Backpack", "애칭", LocalDate.of(2024, 3, 1), "MCM 강남점",
            UsageFrequency.OCCASIONAL);

        assertThatThrownBy(() -> passportService.register(1L, request, null, List.of()))
            .isInstanceOf(ApiException.class)
            .extracting(e -> ((ApiException) e).getErrorCode())
            .isEqualTo(ErrorCode.INVALID_SERIAL_FORMAT);
    }

    @Test
    void registerRejectsActiveDuplicate() {
        passportService = newService();
        when(passportRepository.existsBySerialNumberAndPurchaseYearAndStatus("A1234", 2024, PassportStatus.ACTIVE))
            .thenReturn(true);
        RegisterPassportRequest request = new RegisterPassportRequest(
            "A1234", "Nomad Backpack", "애칭", LocalDate.of(2024, 3, 1), "MCM 강남점",
            UsageFrequency.OCCASIONAL);

        assertThatThrownBy(() -> passportService.register(1L, request, null, List.of()))
            .isInstanceOf(ApiException.class)
            .extracting(e -> ((ApiException) e).getErrorCode())
            .isEqualTo(ErrorCode.SERIAL_ALREADY_REGISTERED);
    }

    @Test
    void registerSucceedsWithReceiptAndBaselineImages() {
        passportService = newService();
        when(passportRepository.existsBySerialNumberAndPurchaseYearAndStatus("A1234", 2024, PassportStatus.ACTIVE))
            .thenReturn(false);
        MultipartFile receipt = new MockMultipartFile("receipt", "r.jpg", "image/jpeg", "r".getBytes());
        MultipartFile baseline1 = new MockMultipartFile("baseline", "b1.jpg", "image/jpeg", "b1".getBytes());
        when(imageStorageService.upload(receipt)).thenReturn("https://cdn/receipt.jpg");
        when(imageStorageService.upload(baseline1)).thenReturn("https://cdn/baseline1.jpg");
        when(passportRepository.save(any(Passport.class))).thenAnswer(inv -> inv.getArgument(0));
        RegisterPassportRequest request = new RegisterPassportRequest(
            "A1234", "Nomad Backpack", "애칭", LocalDate.of(2024, 3, 1), "MCM 강남점",
            UsageFrequency.OCCASIONAL);

        PassportResponse response = passportService.register(1L, request, receipt, List.of(baseline1));

        assertThat(response.hasReceiptTag()).isTrue();
        assertThat(response.baselineImageUrls()).containsExactly("https://cdn/baseline1.jpg");
        assertThat(response.purchaseYear()).isEqualTo(2024);
    }

    @Test
    void registerAllowsMissingReceipt() {
        passportService = newService();
        when(passportRepository.existsBySerialNumberAndPurchaseYearAndStatus("1234", 1998, PassportStatus.ACTIVE))
            .thenReturn(false);
        when(passportRepository.save(any(Passport.class))).thenAnswer(inv -> inv.getArgument(0));
        RegisterPassportRequest request = new RegisterPassportRequest(
            "1234", "Vintage Backpack", "빈티지", LocalDate.of(1998, 5, 1), null,
            UsageFrequency.RARE);

        PassportResponse response = passportService.register(1L, request, null, List.of());

        assertThat(response.hasReceiptTag()).isFalse();
    }

    @Test
    void registerTranslatesDbConstraintRaceIntoSerialAlreadyRegistered() {
        passportService = newService();
        when(passportRepository.existsBySerialNumberAndPurchaseYearAndStatus("A1234", 2024, PassportStatus.ACTIVE))
            .thenReturn(false);
        when(passportRepository.save(any(Passport.class)))
            .thenThrow(new DataIntegrityViolationException("duplicate key value violates unique constraint"));
        RegisterPassportRequest request = new RegisterPassportRequest(
            "A1234", "Nomad Backpack", "애칭", LocalDate.of(2024, 3, 1), "MCM 강남점",
            UsageFrequency.OCCASIONAL);

        assertThatThrownBy(() -> passportService.register(1L, request, null, List.of()))
            .isInstanceOf(ApiException.class)
            .extracting(e -> ((ApiException) e).getErrorCode())
            .isEqualTo(ErrorCode.SERIAL_ALREADY_REGISTERED);
    }

    @Test
    void registerCleansUpUploadedImagesWhenDbConstraintRaceIsLost() {
        // save()가 유니크 제약 경합으로 실패하면 업로드된 이미지가 고아로 남으니 정리돼야 함
        passportService = newService();
        when(passportRepository.existsBySerialNumberAndPurchaseYearAndStatus("A1234", 2024, PassportStatus.ACTIVE))
            .thenReturn(false);
        MultipartFile receipt = new MockMultipartFile("receipt", "r.jpg", "image/jpeg", "r".getBytes());
        MultipartFile baseline1 = new MockMultipartFile("baseline", "b1.jpg", "image/jpeg", "b1".getBytes());
        when(imageStorageService.upload(receipt)).thenReturn("https://cdn/receipt.jpg");
        when(imageStorageService.upload(baseline1)).thenReturn("https://cdn/baseline1.jpg");
        when(passportRepository.save(any(Passport.class)))
            .thenThrow(new DataIntegrityViolationException("duplicate key value violates unique constraint"));
        RegisterPassportRequest raceRequest = new RegisterPassportRequest(
            "A1234", "Nomad Backpack", "애칭", LocalDate.of(2024, 3, 1), "MCM 강남점",
            UsageFrequency.OCCASIONAL);

        assertThatThrownBy(() -> passportService.register(1L, raceRequest, receipt, List.of(baseline1)))
            .isInstanceOf(ApiException.class)
            .extracting(e -> ((ApiException) e).getErrorCode())
            .isEqualTo(ErrorCode.SERIAL_ALREADY_REGISTERED);

        verify(imageStorageService).delete("https://cdn/receipt.jpg");
        verify(imageStorageService).delete("https://cdn/baseline1.jpg");
    }

    @Test
    void registerNormalizesSerialToUppercaseForDuplicateCheckAndStorage() {
        // 시리얼 정규식이 대소문자를 둘 다 허용하니, 정규화 없으면 "a1234"와 "A1234"가 중복 체크/DB
        // 인덱스에서 다른 값으로 취급돼 같은 가방이 두 번 등록될 수 있음
        passportService = newService();
        when(passportRepository.existsBySerialNumberAndPurchaseYearAndStatus("A1234", 2024, PassportStatus.ACTIVE))
            .thenReturn(false);
        org.mockito.ArgumentCaptor<Passport> captor = org.mockito.ArgumentCaptor.forClass(Passport.class);
        when(passportRepository.save(captor.capture())).thenAnswer(inv -> inv.getArgument(0));
        RegisterPassportRequest request = new RegisterPassportRequest(
            "a1234", "Nomad Backpack", "애칭", LocalDate.of(2024, 3, 1), "MCM 강남점",
            UsageFrequency.OCCASIONAL);

        PassportResponse response = passportService.register(1L, request, null, List.of());

        verify(passportRepository).existsBySerialNumberAndPurchaseYearAndStatus("A1234", 2024, PassportStatus.ACTIVE);
        assertThat(captor.getValue().getSerialNumber()).isEqualTo("A1234");
        assertThat(response.serialNumber()).isEqualTo("A1234");
    }

    @Test
    void registerCleansUpUploadedImagesWhenAccountWithdrawnDuringUpload() {
        // 업로드 이후 재확인에서 예외가 나도 업로드된 이미지는 정리되어야 함
        passportService = newService();
        when(passportRepository.existsBySerialNumberAndPurchaseYearAndStatus("A1234", 2024, PassportStatus.ACTIVE))
            .thenReturn(false);
        MultipartFile receipt = new MockMultipartFile("receipt", "r.jpg", "image/jpeg", "r".getBytes());
        when(imageStorageService.upload(receipt)).thenReturn("https://cdn/receipt.jpg");
        when(accountService.getActiveAccountOrThrow(1L))
            .thenReturn(null)
            .thenThrow(new ApiException(ErrorCode.ACCOUNT_NOT_FOUND));
        RegisterPassportRequest request = new RegisterPassportRequest(
            "A1234", "Nomad Backpack", "애칭", LocalDate.of(2024, 3, 1), "MCM 강남점",
            UsageFrequency.OCCASIONAL);

        assertThatThrownBy(() -> passportService.register(1L, request, receipt, List.of()))
            .isInstanceOf(ApiException.class)
            .extracting(e -> ((ApiException) e).getErrorCode())
            .isEqualTo(ErrorCode.ACCOUNT_NOT_FOUND);

        verify(imageStorageService).delete("https://cdn/receipt.jpg");
        verify(passportRepository, never()).save(any()); // save()까지 도달하지 않았음을 함께 확인
    }

    @Test
    void listIncludesLatestDiagnosisGradeAndDate() {
        passportService = newService();
        Passport passport = new Passport("A1234", 2024, 1L, "Nomad Backpack", "애칭",
            LocalDate.of(2024, 1, 1), "MCM 강남점", null, false, List.of(), UsageFrequency.OCCASIONAL);
        org.springframework.data.domain.Pageable pageable = org.springframework.data.domain.PageRequest.of(0, 20);
        when(passportRepository.findAllByOwnerAccountIdAndStatus(
                eq(1L), eq(PassportStatus.ACTIVE), any(org.springframework.data.domain.Pageable.class)))
            .thenReturn(new org.springframework.data.domain.PageImpl<>(List.of(passport)));
        com.mcm.passport.diagnosis.Diagnosis diagnosis = new com.mcm.passport.diagnosis.Diagnosis(
            passport.getId(), com.mcm.passport.diagnosis.DiagnosisType.SELF, List.of("https://cdn/1.jpg"),
            java.util.Map.of("마모", 45), com.mcm.passport.diagnosis.OverallGrade.C, "근거");
        // findLatestByPassportIdIn은 default 메서드라 목이 실제 구현을 안 타서 직접 스텁.
        // passport가 미저장 엔티티라 getId()가 null이라 null 키 허용하는 HashMap 사용
        java.util.Map<Long, com.mcm.passport.diagnosis.Diagnosis> latestDiagnosisByPassportId = new java.util.HashMap<>();
        latestDiagnosisByPassportId.put(passport.getId(), diagnosis);
        when(diagnosisRepository.findLatestByPassportIdIn(any()))
            .thenReturn(latestDiagnosisByPassportId);

        var page = passportService.list(1L, pageable);

        assertThat(page.getContent()).hasSize(1);
        assertThat(page.getContent().get(0).overallGrade()).isEqualTo("C");
        // 2024-01-01(구매일)부터 fixedClock(2026-08-12)까지 경과일 — 실제 시스템 시계가 아니라
        // 주입된 Clock을 쓰는지 검증한다.
        assertThat(page.getContent().get(0).ownershipDays())
            .isEqualTo(java.time.temporal.ChronoUnit.DAYS.between(LocalDate.of(2024, 1, 1), LocalDate.of(2026, 8, 12)));
    }

    @Test
    void listAppendsIdAsStableSortTiebreaker() {
        passportService = newService();
        org.springframework.data.domain.Pageable requested = org.springframework.data.domain.PageRequest.of(0, 20);
        when(passportRepository.findAllByOwnerAccountIdAndStatus(
                eq(1L), eq(PassportStatus.ACTIVE), any(org.springframework.data.domain.Pageable.class)))
            .thenReturn(new org.springframework.data.domain.PageImpl<>(List.of()));

        passportService.list(1L, requested);

        org.mockito.ArgumentCaptor<org.springframework.data.domain.Pageable> captor =
            org.mockito.ArgumentCaptor.forClass(org.springframework.data.domain.Pageable.class);
        verify(passportRepository).findAllByOwnerAccountIdAndStatus(eq(1L), eq(PassportStatus.ACTIVE), captor.capture());
        assertThat(captor.getValue().getSort().getOrderFor("id")).isNotNull();
        assertThat(captor.getValue().getSort().getOrderFor("id").getDirection())
            .isEqualTo(org.springframework.data.domain.Sort.Direction.ASC);
    }

    @Test
    void listRejectsWithdrawnAccount() {
        passportService = newService();
        when(accountService.getActiveAccountOrThrow(1L)).thenThrow(new ApiException(ErrorCode.ACCOUNT_NOT_FOUND));

        assertThatThrownBy(() -> passportService.list(1L, org.springframework.data.domain.PageRequest.of(0, 20)))
            .isInstanceOf(ApiException.class)
            .extracting(e -> ((ApiException) e).getErrorCode())
            .isEqualTo(ErrorCode.ACCOUNT_NOT_FOUND);
        verifyNoInteractions(passportRepository);
    }

    @Test
    void registerRejectsWithdrawnAccount() {
        passportService = newService();
        when(accountService.getActiveAccountOrThrow(1L)).thenThrow(new ApiException(ErrorCode.ACCOUNT_NOT_FOUND));
        RegisterPassportRequest request = new RegisterPassportRequest(
            "A1234", "Nomad Backpack", "애칭", LocalDate.of(2024, 3, 1), "MCM 강남점",
            UsageFrequency.OCCASIONAL);

        assertThatThrownBy(() -> passportService.register(1L, request, null, List.of()))
            .isInstanceOf(ApiException.class)
            .extracting(e -> ((ApiException) e).getErrorCode())
            .isEqualTo(ErrorCode.ACCOUNT_NOT_FOUND);
        verifyNoInteractions(passportRepository);
    }

    @Test
    void getDetailRejectsWithdrawnAccount() {
        passportService = newService();
        when(passportOwnershipGuard.getOwnedActivePassport(1L, 1L))
            .thenThrow(new ApiException(ErrorCode.ACCOUNT_NOT_FOUND));

        assertThatThrownBy(() -> passportService.getDetail(1L, 1L))
            .isInstanceOf(ApiException.class)
            .extracting(e -> ((ApiException) e).getErrorCode())
            .isEqualTo(ErrorCode.ACCOUNT_NOT_FOUND);
        verifyNoInteractions(passportRepository);
    }

    @Test
    void getDetailRejectsNonOwner() {
        passportService = newService();
        when(passportOwnershipGuard.getOwnedActivePassport(10L, 999L))
            .thenThrow(new ApiException(ErrorCode.FORBIDDEN));

        assertThatThrownBy(() -> passportService.getDetail(10L, 999L))
            .isInstanceOf(ApiException.class)
            .extracting(e -> ((ApiException) e).getErrorCode())
            .isEqualTo(ErrorCode.FORBIDDEN);
    }

    @Test
    void getDetailThrowsNotFoundWhenMissing() {
        passportService = newService();
        when(passportOwnershipGuard.getOwnedActivePassport(99L, 1L))
            .thenThrow(new ApiException(ErrorCode.PASSPORT_NOT_FOUND));

        assertThatThrownBy(() -> passportService.getDetail(99L, 1L))
            .isInstanceOf(ApiException.class)
            .extracting(e -> ((ApiException) e).getErrorCode())
            .isEqualTo(ErrorCode.PASSPORT_NOT_FOUND);
    }

    @Test
    void updateChangesNicknameAndUsageFrequency() {
        passportService = newService();
        Passport passport = new Passport("A1234", 2024, 1L, "Nomad Backpack", "이전애칭",
            LocalDate.of(2024, 1, 1), "MCM 강남점", null, false, List.of(), UsageFrequency.RARE);
        when(passportOwnershipGuard.getOwnedActivePassport(1L, 1L)).thenReturn(passport);

        PassportResponse response = passportService.update(1L, 1L,
            new UpdatePassportRequest("새애칭", UsageFrequency.DAILY));

        assertThat(response.nickname()).isEqualTo("새애칭");
        assertThat(response.usageFrequency()).isEqualTo(UsageFrequency.DAILY);
    }

    @Test
    void deleteSoftDeletesPassport() {
        passportService = newService();
        Passport passport = new Passport("A1234", 2024, 1L, "Nomad Backpack", "애칭",
            LocalDate.of(2024, 1, 1), "MCM 강남점", null, false, List.of(), UsageFrequency.RARE);
        when(passportOwnershipGuard.getOwnedActivePassportForUpdate(1L, 1L)).thenReturn(passport);

        passportService.delete(1L, 1L);

        assertThat(passport.getStatus()).isEqualTo(PassportStatus.DELETED);
    }

    @Test
    void deleteCancelsPendingReservationsForThatPassport() {
        passportService = newService();
        Passport passport = new Passport("A1234", 2024, 1L, "Nomad Backpack", "애칭",
            LocalDate.of(2024, 1, 1), "MCM 강남점", null, false, List.of(), UsageFrequency.RARE);
        when(passportOwnershipGuard.getOwnedActivePassportForUpdate(1L, 1L)).thenReturn(passport);

        passportService.delete(1L, 1L);

        verify(reservationRepository).cancelAllRequestedForPassport(1L);
    }

    @Test
    void deleteUsesLockedOwnershipReadToAvoidStaleTransferRace() {
        // 잠금 없는 getOwnedActivePassport()를 쓰면 redeem()이 소유권을 옮기고 커밋해도 이 트랜잭션은
        // 낡은 인스턴스를 그대로 softDelete할 수 있다 — delete()는 ForUpdate 변형을 써야 함
        passportService = newService();
        Passport passport = new Passport("A1234", 2024, 1L, "Nomad Backpack", "애칭",
            LocalDate.of(2024, 1, 1), "MCM 강남점", null, false, List.of(), UsageFrequency.RARE);
        when(passportOwnershipGuard.getOwnedActivePassportForUpdate(1L, 1L)).thenReturn(passport);

        passportService.delete(1L, 1L);

        verify(passportOwnershipGuard).getOwnedActivePassportForUpdate(1L, 1L);
        verify(passportOwnershipGuard, never()).getOwnedActivePassport(1L, 1L);
    }

    private PassportService newService() {
        return new PassportService(passportRepository, imageStorageService, diagnosisRepository,
            accountService, passportOwnershipGuard, reservationRepository, fixedClock);
    }
}
