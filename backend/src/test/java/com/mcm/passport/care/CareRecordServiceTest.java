package com.mcm.passport.care;

import com.mcm.passport.care.dto.CareRecordResponse;
import com.mcm.passport.care.dto.CreateCareRecordRequest;
import com.mcm.passport.common.exception.ApiException;
import com.mcm.passport.common.exception.ErrorCode;
import com.mcm.passport.common.storage.ImageStorageService;
import com.mcm.passport.passport.Passport;
import com.mcm.passport.passport.PassportOwnershipGuard;
import com.mcm.passport.passport.UsageFrequency;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDate;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class CareRecordServiceTest {

    @Mock private CareRecordRepository careRecordRepository;
    @Mock private ImageStorageService imageStorageService;
    @Mock private PassportOwnershipGuard passportOwnershipGuard;

    private CareRecordService careRecordService;

    @Test
    void listAppendsIdAsStableSortTiebreaker() {
        // completedAt은 사용자가 직접 입력하는 값이라 동시각 충돌
        // 가능성이 낮지 않다 — PassportService.list()와 같은 방식으로 id를 붙였는지 검증한다.
        careRecordService = new CareRecordService(careRecordRepository, imageStorageService, passportOwnershipGuard);
        when(passportOwnershipGuard.getOwnedActivePassport(1L, 1L)).thenReturn(mock(Passport.class));
        org.springframework.data.domain.Pageable requested = org.springframework.data.domain.PageRequest.of(0, 20);
        when(careRecordRepository.findAllByPassportIdOrderByCompletedAtDesc(
                org.mockito.ArgumentMatchers.eq(1L), any(org.springframework.data.domain.Pageable.class)))
            .thenReturn(new org.springframework.data.domain.PageImpl<>(List.of()));

        careRecordService.list(1L, 1L, requested);

        org.mockito.ArgumentCaptor<org.springframework.data.domain.Pageable> captor =
            org.mockito.ArgumentCaptor.forClass(org.springframework.data.domain.Pageable.class);
        verify(careRecordRepository).findAllByPassportIdOrderByCompletedAtDesc(
            org.mockito.ArgumentMatchers.eq(1L), captor.capture());
        assertThat(captor.getValue().getSort().getOrderFor("id")).isNotNull();
        assertThat(captor.getValue().getSort().getOrderFor("id").getDirection())
            .isEqualTo(org.springframework.data.domain.Sort.Direction.ASC);
    }

    @Test
    void createRejectsNonOwner() {
        careRecordService = new CareRecordService(careRecordRepository, imageStorageService, passportOwnershipGuard);
        when(passportOwnershipGuard.getOwnedActivePassport(1L, 999L))
            .thenThrow(new ApiException(ErrorCode.FORBIDDEN));

        assertThatThrownBy(() -> careRecordService.create(1L, 999L,
                new CreateCareRecordRequest("가죽 크림 도포", "가죽", "메모", null), null))
            .isInstanceOf(ApiException.class)
            .extracting(e -> ((ApiException) e).getErrorCode())
            .isEqualTo(ErrorCode.FORBIDDEN);
    }

    @Test
    void createReturnsNotFoundWhenPassportSoftDeleted() {
        careRecordService = new CareRecordService(careRecordRepository, imageStorageService, passportOwnershipGuard);
        when(passportOwnershipGuard.getOwnedActivePassport(1L, 1L))
            .thenThrow(new ApiException(ErrorCode.PASSPORT_NOT_FOUND));

        assertThatThrownBy(() -> careRecordService.create(1L, 1L,
                new CreateCareRecordRequest("가죽 크림 도포", "가죽", "메모", null), null))
            .isInstanceOf(ApiException.class)
            .extracting(e -> ((ApiException) e).getErrorCode())
            .isEqualTo(ErrorCode.PASSPORT_NOT_FOUND);
    }

    @Test
    void createRejectsWithdrawnAccount() {
        careRecordService = new CareRecordService(careRecordRepository, imageStorageService, passportOwnershipGuard);
        when(passportOwnershipGuard.getOwnedActivePassport(1L, 1L))
            .thenThrow(new ApiException(ErrorCode.ACCOUNT_NOT_FOUND));

        assertThatThrownBy(() -> careRecordService.create(1L, 1L,
                new CreateCareRecordRequest("가죽 크림 도포", "가죽", "메모", null), null))
            .isInstanceOf(ApiException.class)
            .extracting(e -> ((ApiException) e).getErrorCode())
            .isEqualTo(ErrorCode.ACCOUNT_NOT_FOUND);
        verifyNoInteractions(careRecordRepository);
    }

    @Test
    void createSavesCareRecordWithUploadedImage() {
        careRecordService = new CareRecordService(careRecordRepository, imageStorageService, passportOwnershipGuard);
        Passport passport = new Passport("A1234", 2024, 1L, "Nomad Backpack", "애칭",
            LocalDate.of(2024, 1, 1), "MCM 강남점", null, false, List.of(), UsageFrequency.DAILY);
        when(passportOwnershipGuard.getOwnedActivePassport(1L, 1L)).thenReturn(passport);
        when(careRecordRepository.save(any(CareRecord.class))).thenAnswer(inv -> inv.getArgument(0));

        CareRecordResponse response = careRecordService.create(1L, 1L,
            new CreateCareRecordRequest("가죽 크림 도포", "가죽", "메모", null), null);

        assertThat(response.careType()).isEqualTo("가죽 크림 도포");
    }

    @Test
    void createCleansUpUploadedImageWhenOwnershipRecheckFails() {
        // 저장 직전 재확인이 try 블록 밖에 있으면, 재확인이 던지는
        // 예외는 고아 이미지 정리를 거치지 않고 그대로 새어나갔다.
        careRecordService = new CareRecordService(careRecordRepository, imageStorageService, passportOwnershipGuard);
        Passport passport = new Passport("A1234", 2024, 1L, "Nomad Backpack", "애칭",
            LocalDate.of(2024, 1, 1), "MCM 강남점", null, false, List.of(), UsageFrequency.DAILY);
        when(passportOwnershipGuard.getOwnedActivePassport(1L, 1L))
            .thenReturn(passport)
            .thenThrow(new ApiException(ErrorCode.ACCOUNT_NOT_FOUND));
        org.springframework.web.multipart.MultipartFile image = new org.springframework.mock.web.MockMultipartFile(
            "image", "a.jpg", "image/jpeg", "a".getBytes());
        when(imageStorageService.upload(image)).thenReturn("https://cdn/a.jpg");

        assertThatThrownBy(() -> careRecordService.create(1L, 1L,
                new CreateCareRecordRequest("가죽 크림 도포", "가죽", "메모", null), image))
            .isInstanceOf(ApiException.class)
            .extracting(e -> ((ApiException) e).getErrorCode())
            .isEqualTo(ErrorCode.ACCOUNT_NOT_FOUND);

        verify(imageStorageService).delete("https://cdn/a.jpg");
        verify(careRecordRepository, never()).save(any());
    }
}
