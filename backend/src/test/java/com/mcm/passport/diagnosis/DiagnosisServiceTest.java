package com.mcm.passport.diagnosis;

import com.mcm.passport.common.exception.ApiException;
import com.mcm.passport.common.exception.ErrorCode;
import com.mcm.passport.common.storage.ImageStorageService;
import com.mcm.passport.diagnosis.dto.DiagnosisResponse;
import com.mcm.passport.notification.NotificationService;
import com.mcm.passport.passport.Passport;
import com.mcm.passport.passport.PassportOwnershipGuard;
import com.mcm.passport.passport.UsageFrequency;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class DiagnosisServiceTest {

    @Mock private DiagnosisRepository diagnosisRepository;
    @Mock private ImageStorageService imageStorageService;
    @Mock private WearDiagnosisEngine wearDiagnosisEngine;
    @Mock
    private NotificationService notificationService;
    @Mock
    private PassportOwnershipGuard passportOwnershipGuard;

    private DiagnosisService diagnosisService;

    @Test
    void submitRejectsWhenNotOwner() {
        diagnosisService = new DiagnosisService(
            diagnosisRepository, imageStorageService, wearDiagnosisEngine, notificationService, passportOwnershipGuard);
        when(passportOwnershipGuard.getOwnedActivePassport(10L, 999L))
            .thenThrow(new ApiException(ErrorCode.FORBIDDEN));

        assertThatThrownBy(() -> diagnosisService.submit(10L, 999L, DiagnosisType.SELF, List.of()))
            .isInstanceOf(ApiException.class)
            .extracting(e -> ((ApiException) e).getErrorCode())
            .isEqualTo(ErrorCode.FORBIDDEN);
    }

    @Test
    void submitUploadsImagesAndDelegatesToEngine() {
        diagnosisService = new DiagnosisService(
            diagnosisRepository, imageStorageService, wearDiagnosisEngine, notificationService, passportOwnershipGuard);
        Passport passport = new Passport("A1234", 2024, 1L, "Nomad Backpack", "애칭",
            LocalDate.of(2024, 1, 1), "MCM 강남점", null, false, List.of(), UsageFrequency.DAILY);
        when(passportOwnershipGuard.getOwnedActivePassport(1L, 1L)).thenReturn(passport);
        when(diagnosisRepository.findFirstByPassportIdOrderByDiagnosedAtDescIdDesc(1L)).thenReturn(Optional.empty());
        MultipartFile image = new MockMultipartFile("image", "a.jpg", "image/jpeg", "a".getBytes());
        when(imageStorageService.upload(image)).thenReturn("https://cdn/a.jpg");
        when(wearDiagnosisEngine.diagnose(List.of("https://cdn/a.jpg"), null))
            .thenReturn(new DiagnosisResult(Map.of("마모", 25), OverallGrade.A, "근거"));
        when(diagnosisRepository.save(any(Diagnosis.class))).thenAnswer(inv -> inv.getArgument(0));

        DiagnosisResponse response = diagnosisService.submit(1L, 1L, DiagnosisType.SELF, List.of(image));

        assertThat(response.overallGrade()).isEqualTo(OverallGrade.A);
        assertThat(response.previousItemScores()).isNull();
    }

    @Test
    void submitTriggersNotificationEvaluation() {
        diagnosisService = new DiagnosisService(
            diagnosisRepository, imageStorageService, wearDiagnosisEngine, notificationService, passportOwnershipGuard);
        Passport passport = new Passport("A1234", 2024, 1L, "Nomad Backpack", "애칭",
            LocalDate.of(2024, 1, 1), "MCM 강남점", null, false, List.of(), UsageFrequency.DAILY);
        when(passportOwnershipGuard.getOwnedActivePassport(1L, 1L)).thenReturn(passport);
        when(diagnosisRepository.findFirstByPassportIdOrderByDiagnosedAtDescIdDesc(1L)).thenReturn(Optional.empty());
        MultipartFile image = new MockMultipartFile("image", "a.jpg", "image/jpeg", "a".getBytes());
        when(imageStorageService.upload(image)).thenReturn("https://cdn/a.jpg");
        when(wearDiagnosisEngine.diagnose(List.of("https://cdn/a.jpg"), null))
            .thenReturn(new DiagnosisResult(Map.of("마모", 25), OverallGrade.A, "근거"));
        when(diagnosisRepository.save(any(Diagnosis.class))).thenAnswer(inv -> inv.getArgument(0));

        diagnosisService.submit(1L, 1L, DiagnosisType.SELF, List.of(image));

        verify(notificationService).evaluateAfterDiagnosis(eq(passport), any(Diagnosis.class));
    }

    @Test
    void submitCleansUpUploadedImagesWhenSaveFails() {
        // 업로드는 성공했는데 그 직후 save()가 실패하면, 이미 업로드된 이미지가 어떤 진단에도
        // 연결되지 못하는 고아가 된다 — 베스트에포트로 정리되고 원래 예외는 그대로 전파되는지 검증한다.
        diagnosisService = new DiagnosisService(
            diagnosisRepository, imageStorageService, wearDiagnosisEngine, notificationService, passportOwnershipGuard);
        Passport passport = new Passport("A1234", 2024, 1L, "Nomad Backpack", "애칭",
            LocalDate.of(2024, 1, 1), "MCM 강남점", null, false, List.of(), UsageFrequency.DAILY);
        when(passportOwnershipGuard.getOwnedActivePassport(1L, 1L)).thenReturn(passport);
        when(diagnosisRepository.findFirstByPassportIdOrderByDiagnosedAtDescIdDesc(1L)).thenReturn(Optional.empty());
        MultipartFile image = new MockMultipartFile("image", "a.jpg", "image/jpeg", "a".getBytes());
        when(imageStorageService.upload(image)).thenReturn("https://cdn/a.jpg");
        when(wearDiagnosisEngine.diagnose(List.of("https://cdn/a.jpg"), null))
            .thenReturn(new DiagnosisResult(Map.of("마모", 25), OverallGrade.A, "근거"));
        when(diagnosisRepository.save(any(Diagnosis.class))).thenThrow(new RuntimeException("db boom"));

        assertThatThrownBy(() -> diagnosisService.submit(1L, 1L, DiagnosisType.SELF, List.of(image)))
            .isInstanceOf(RuntimeException.class)
            .hasMessage("db boom");

        verify(imageStorageService).delete("https://cdn/a.jpg");
    }

    @Test
    void submitCleansUpUploadedImagesWhenOwnershipRecheckFails() {
        // 저장 직전 재확인이 try 블록 밖에 있으면, 재확인이 던지는
        // 예외는 고아 이미지 정리를 거치지 않고 그대로 새어나갔다.
        diagnosisService = new DiagnosisService(
            diagnosisRepository, imageStorageService, wearDiagnosisEngine, notificationService, passportOwnershipGuard);
        Passport passport = new Passport("A1234", 2024, 1L, "Nomad Backpack", "애칭",
            LocalDate.of(2024, 1, 1), "MCM 강남점", null, false, List.of(), UsageFrequency.DAILY);
        when(passportOwnershipGuard.getOwnedActivePassport(1L, 1L))
            .thenReturn(passport)
            .thenThrow(new ApiException(ErrorCode.ACCOUNT_NOT_FOUND));
        when(diagnosisRepository.findFirstByPassportIdOrderByDiagnosedAtDescIdDesc(1L)).thenReturn(Optional.empty());
        MultipartFile image = new MockMultipartFile("image", "a.jpg", "image/jpeg", "a".getBytes());
        when(imageStorageService.upload(image)).thenReturn("https://cdn/a.jpg");
        when(wearDiagnosisEngine.diagnose(List.of("https://cdn/a.jpg"), null))
            .thenReturn(new DiagnosisResult(Map.of("마모", 25), OverallGrade.A, "근거"));

        assertThatThrownBy(() -> diagnosisService.submit(1L, 1L, DiagnosisType.SELF, List.of(image)))
            .isInstanceOf(ApiException.class)
            .extracting(e -> ((ApiException) e).getErrorCode())
            .isEqualTo(ErrorCode.ACCOUNT_NOT_FOUND);

        verify(imageStorageService).delete("https://cdn/a.jpg");
        verify(diagnosisRepository, never()).save(any());
    }

    @Test
    void submitSucceedsEvenWhenNotificationEvaluationThrows() {
        diagnosisService = new DiagnosisService(
            diagnosisRepository, imageStorageService, wearDiagnosisEngine, notificationService, passportOwnershipGuard);
        Passport passport = new Passport("A1234", 2024, 1L, "Nomad Backpack", "애칭",
            LocalDate.of(2024, 1, 1), "MCM 강남점", null, false, List.of(), UsageFrequency.DAILY);
        when(passportOwnershipGuard.getOwnedActivePassport(1L, 1L)).thenReturn(passport);
        when(diagnosisRepository.findFirstByPassportIdOrderByDiagnosedAtDescIdDesc(1L)).thenReturn(Optional.empty());
        MultipartFile image = new MockMultipartFile("image", "a.jpg", "image/jpeg", "a".getBytes());
        when(imageStorageService.upload(image)).thenReturn("https://cdn/a.jpg");
        when(wearDiagnosisEngine.diagnose(List.of("https://cdn/a.jpg"), null))
            .thenReturn(new DiagnosisResult(Map.of("마모", 25), OverallGrade.A, "근거"));
        when(diagnosisRepository.save(any(Diagnosis.class))).thenAnswer(inv -> inv.getArgument(0));
        doThrow(new RuntimeException("notification boom"))
            .when(notificationService).evaluateAfterDiagnosis(eq(passport), any(Diagnosis.class));

        DiagnosisResponse response = diagnosisService.submit(1L, 1L, DiagnosisType.SELF, List.of(image));

        assertThat(response.overallGrade()).isEqualTo(OverallGrade.A);
    }

    @Test
    void getDetailRejectsNonOwner() {
        diagnosisService = new DiagnosisService(
            diagnosisRepository, imageStorageService, wearDiagnosisEngine, notificationService, passportOwnershipGuard);
        Diagnosis diagnosis = new Diagnosis(1L, DiagnosisType.SELF, List.of("https://cdn/a.jpg"),
            Map.of("마모", 30), OverallGrade.A, "근거");
        when(diagnosisRepository.findById(5L)).thenReturn(Optional.of(diagnosis));
        when(passportOwnershipGuard.getOwnedActivePassport(1L, 999L))
            .thenThrow(new ApiException(ErrorCode.FORBIDDEN));

        assertThatThrownBy(() -> diagnosisService.getDetail(5L, 999L))
            .isInstanceOf(ApiException.class)
            .extracting(e -> ((ApiException) e).getErrorCode())
            .isEqualTo(ErrorCode.FORBIDDEN);
    }

    @Test
    void submitRejectsWithdrawnAccount() {
        diagnosisService = new DiagnosisService(
            diagnosisRepository, imageStorageService, wearDiagnosisEngine, notificationService, passportOwnershipGuard);
        when(passportOwnershipGuard.getOwnedActivePassport(1L, 1L))
            .thenThrow(new ApiException(ErrorCode.ACCOUNT_NOT_FOUND));

        assertThatThrownBy(() -> diagnosisService.submit(1L, 1L, DiagnosisType.SELF, List.of()))
            .isInstanceOf(ApiException.class)
            .extracting(e -> ((ApiException) e).getErrorCode())
            .isEqualTo(ErrorCode.ACCOUNT_NOT_FOUND);
        verifyNoInteractions(diagnosisRepository);
    }

    @Test
    void getDetailReturnsNotFoundWhenPassportSoftDeleted() {
        diagnosisService = new DiagnosisService(
            diagnosisRepository, imageStorageService, wearDiagnosisEngine, notificationService, passportOwnershipGuard);
        Diagnosis diagnosis = new Diagnosis(1L, DiagnosisType.SELF, List.of("https://cdn/a.jpg"),
            Map.of("마모", 30), OverallGrade.A, "근거");
        when(diagnosisRepository.findById(5L)).thenReturn(Optional.of(diagnosis));
        when(passportOwnershipGuard.getOwnedActivePassport(1L, 1L))
            .thenThrow(new ApiException(ErrorCode.PASSPORT_NOT_FOUND));

        assertThatThrownBy(() -> diagnosisService.getDetail(5L, 1L))
            .isInstanceOf(ApiException.class)
            .extracting(e -> ((ApiException) e).getErrorCode())
            .isEqualTo(ErrorCode.PASSPORT_NOT_FOUND);
    }
}
