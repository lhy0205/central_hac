package com.mcm.passport.timeline;

import com.mcm.passport.care.CareRecordRepository;
import com.mcm.passport.common.exception.ApiException;
import com.mcm.passport.common.exception.ErrorCode;
import com.mcm.passport.common.storage.ImageStorageService;
import com.mcm.passport.diagnosis.DiagnosisRepository;
import com.mcm.passport.notification.NotificationRepository;
import com.mcm.passport.passport.Passport;
import com.mcm.passport.passport.PassportOwnershipGuard;
import com.mcm.passport.passport.UsageFrequency;
import com.mcm.passport.timeline.dto.CreateTimelineEventRequest;
import com.mcm.passport.timeline.dto.TimelineEventResponse;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class TimelineServiceTest {

    @Mock private TimelineEventRepository timelineEventRepository;
    @Mock private DiagnosisRepository diagnosisRepository;
    @Mock private CareRecordRepository careRecordRepository;
    @Mock private NotificationRepository notificationRepository;
    @Mock private ImageStorageService imageStorageService;
    @Mock private PassportOwnershipGuard passportOwnershipGuard;
    @Mock private com.mcm.passport.reservation.ReservationRepository reservationRepository;
    @Mock private com.mcm.passport.store.StoreRepository storeRepository;
    @Mock private com.mcm.passport.transfer.TransferCodeRepository transferCodeRepository;

    private TimelineService timelineService;

    @Test
    void createEventRejectsNonOwner() {
        timelineService = newService();
        when(passportOwnershipGuard.getOwnedActivePassport(1L, 999L))
            .thenThrow(new ApiException(ErrorCode.FORBIDDEN));

        assertThatThrownBy(() -> timelineService.createEvent(1L, 999L,
                new CreateTimelineEventRequest(TimelineEventType.MOMENT, "첫 여행", null), null))
            .isInstanceOf(ApiException.class)
            .extracting(e -> ((ApiException) e).getErrorCode())
            .isEqualTo(ErrorCode.FORBIDDEN);
    }

    @Test
    void createEventReturnsNotFoundWhenPassportSoftDeleted() {
        timelineService = newService();
        when(passportOwnershipGuard.getOwnedActivePassport(1L, 1L))
            .thenThrow(new ApiException(ErrorCode.PASSPORT_NOT_FOUND));

        assertThatThrownBy(() -> timelineService.createEvent(1L, 1L,
                new CreateTimelineEventRequest(TimelineEventType.MOMENT, "첫 여행", null), null))
            .isInstanceOf(ApiException.class)
            .extracting(e -> ((ApiException) e).getErrorCode())
            .isEqualTo(ErrorCode.PASSPORT_NOT_FOUND);
    }

    @Test
    void createEventSavesNoteAndImage() {
        timelineService = newService();
        Passport passport = new Passport("A1234", 2024, 1L, "Nomad Backpack", "애칭",
            LocalDate.of(2024, 1, 1), "MCM 강남점", null, false, List.of(), UsageFrequency.DAILY);
        when(passportOwnershipGuard.getOwnedActivePassport(1L, 1L)).thenReturn(passport);
        when(timelineEventRepository.save(any(TimelineEvent.class))).thenAnswer(inv -> inv.getArgument(0));

        TimelineEventResponse response = timelineService.createEvent(1L, 1L,
            new CreateTimelineEventRequest(TimelineEventType.MOMENT, "첫 여행", null), null);

        assertThat(response.note()).isEqualTo("첫 여행");
    }

    @Test
    void createEventCleansUpUploadedImageWhenOwnershipRecheckFails() {
        // 저장 직전 재확인이 try 블록 밖에 있으면, 재확인이 던지는
        // 예외는 고아 이미지 정리를 거치지 않고 그대로 새어나갔다.
        timelineService = newService();
        Passport passport = new Passport("A1234", 2024, 1L, "Nomad Backpack", "애칭",
            LocalDate.of(2024, 1, 1), "MCM 강남점", null, false, List.of(), UsageFrequency.DAILY);
        when(passportOwnershipGuard.getOwnedActivePassport(1L, 1L))
            .thenReturn(passport)
            .thenThrow(new ApiException(ErrorCode.ACCOUNT_NOT_FOUND));
        org.springframework.web.multipart.MultipartFile image = new org.springframework.mock.web.MockMultipartFile(
            "image", "a.jpg", "image/jpeg", "a".getBytes());
        when(imageStorageService.upload(image)).thenReturn("https://cdn/a.jpg");

        assertThatThrownBy(() -> timelineService.createEvent(1L, 1L,
                new CreateTimelineEventRequest(TimelineEventType.MOMENT, "첫 여행", null), image))
            .isInstanceOf(ApiException.class)
            .extracting(e -> ((ApiException) e).getErrorCode())
            .isEqualTo(ErrorCode.ACCOUNT_NOT_FOUND);

        verify(imageStorageService).delete("https://cdn/a.jpg");
        verify(timelineEventRepository, never()).save(any());
    }

    @Test
    void getTimelineReturnsItemsSortedByDate() {
        timelineService = newService();
        Passport passport = new Passport("A1234", 2024, 1L, "Nomad Backpack", "애칭",
            LocalDate.of(2024, 1, 1), "MCM 강남점", null, false, List.of(), UsageFrequency.DAILY);
        when(passportOwnershipGuard.getOwnedActivePassport(1L, 1L)).thenReturn(passport);
        when(diagnosisRepository.findAllByPassportId(1L)).thenReturn(List.of());
        when(careRecordRepository.findAllByPassportId(1L)).thenReturn(List.of());
        when(notificationRepository.findAllByPassportIdAndReadTrue(1L)).thenReturn(List.of());
        when(timelineEventRepository.findAllByPassportId(1L)).thenReturn(List.of());

        var items = timelineService.getTimeline(1L, 1L);

        assertThat(items).hasSize(1); // 등록(REGISTRATION) 이벤트 1개만 존재
        assertThat(items.get(0).type()).isEqualTo("REGISTRATION");
    }

    @Test
    void getTimelineIncludesReservations() {
        timelineService = newService();
        Passport passport = new Passport("A1234", 2024, 1L, "Nomad Backpack", "애칭",
            LocalDate.of(2024, 1, 1), "MCM 강남점", null, false, List.of(), UsageFrequency.DAILY);
        // getTimeline()이 REGISTRATION 항목의 occurredAt으로 passport.getCreatedAt()을 쓰는데,
        // 이 필드는 @CreatedDate라 JPA 감사(auditing)로만 채워진다 — 이 단위 테스트처럼 생성자로
        // 직접 만든 엔티티는 영속화되지 않으므로 null로 남는다. 항목이 하나뿐이면 정렬 시
        // 비교자가 호출되지 않아 드러나지 않지만, 이 테스트처럼 두 번째 항목(RESERVATION)이 생기면
        // items.sort()가 null과 실제 값을 비교하려다 NPE가 난다. 리플렉션으로 직접 채워
        // 정렬 비교가 정상 동작하게 한다.
        org.springframework.test.util.ReflectionTestUtils.setField(
            passport, "createdAt", java.time.LocalDateTime.of(2024, 1, 1, 0, 0));
        when(passportOwnershipGuard.getOwnedActivePassport(1L, 1L)).thenReturn(passport);
        when(diagnosisRepository.findAllByPassportId(1L)).thenReturn(List.of());
        when(careRecordRepository.findAllByPassportId(1L)).thenReturn(List.of());
        when(notificationRepository.findAllByPassportIdAndReadTrue(1L)).thenReturn(List.of());
        when(timelineEventRepository.findAllByPassportId(1L)).thenReturn(List.of());
        com.mcm.passport.reservation.Reservation reservation = new com.mcm.passport.reservation.Reservation(
            1L, 1L, java.time.LocalDateTime.of(2026, 9, 1, 14, 0),
            List.of(com.mcm.passport.reservation.CareRequestItemType.LEATHER_CLEANING.name()));
        when(reservationRepository.findAllByPassportId(1L)).thenReturn(List.of(reservation));
        // TimelineService가 매장을 건별 findById가 아니라 StoreRepository.namesByIds()로 배치
        // 조회한다(N+1 수정, 2026-08-14). storeRepository는 목이라 default 메서드 본문이 실제로
        // 실행되지 않으므로, findAllById가 아니라 namesByIds 자체를 스텁해야 한다.
        when(storeRepository.namesByIds(List.of(1L))).thenReturn(Map.of(1L, "MCM 강남점"));

        var items = timelineService.getTimeline(1L, 1L);

        assertThat(items).hasSize(2); // REGISTRATION + RESERVATION
        var reservationItem = items.stream().filter(i -> i.type().equals("RESERVATION")).findFirst().orElseThrow();
        assertThat(reservationItem.occurredAt()).isEqualTo(java.time.LocalDateTime.of(2026, 9, 1, 14, 0));
        assertThat(reservationItem.detail().get("storeName")).isEqualTo("MCM 강남점");
        assertThat(reservationItem.detail().get("status")).isEqualTo("REQUESTED");
    }

    @Test
    void getTimelineIncludesCompletedTransfers() {
        // 승계(소유권 이전)는 여권 일생의 가장 중요한 이벤트 중 하나인데도
        // 타임라인에 빠져 있었다 — 예약과 같은 방식으로 6번째 소스로 추가한다.
        timelineService = newService();
        Passport passport = new Passport("A1234", 2024, 1L, "Nomad Backpack", "애칭",
            LocalDate.of(2024, 1, 1), "MCM 강남점", null, false, List.of(), UsageFrequency.DAILY);
        org.springframework.test.util.ReflectionTestUtils.setField(
            passport, "createdAt", java.time.LocalDateTime.of(2024, 1, 1, 0, 0));
        when(passportOwnershipGuard.getOwnedActivePassport(1L, 1L)).thenReturn(passport);
        when(diagnosisRepository.findAllByPassportId(1L)).thenReturn(List.of());
        when(careRecordRepository.findAllByPassportId(1L)).thenReturn(List.of());
        when(notificationRepository.findAllByPassportIdAndReadTrue(1L)).thenReturn(List.of());
        when(timelineEventRepository.findAllByPassportId(1L)).thenReturn(List.of());
        when(reservationRepository.findAllByPassportId(1L)).thenReturn(List.of());
        com.mcm.passport.transfer.TransferCode transferCode = new com.mcm.passport.transfer.TransferCode(
            1L, "AB12CD", 1L, java.time.LocalDateTime.of(2024, 6, 1, 0, 0).plusDays(7));
        transferCode.redeem(2L, java.time.LocalDateTime.of(2024, 6, 5, 10, 0));
        when(transferCodeRepository.findAllByPassportIdAndStatus(1L, com.mcm.passport.transfer.TransferStatus.REDEEMED))
            .thenReturn(List.of(transferCode));

        var items = timelineService.getTimeline(1L, 1L);

        assertThat(items).hasSize(2); // REGISTRATION + TRANSFER
        var transferItem = items.stream().filter(i -> i.type().equals("TRANSFER")).findFirst().orElseThrow();
        assertThat(transferItem.occurredAt()).isEqualTo(java.time.LocalDateTime.of(2024, 6, 5, 10, 0));
        assertThat(transferItem.detail().get("fromAccountId")).isEqualTo(1L);
        assertThat(transferItem.detail().get("toAccountId")).isEqualTo(2L);
    }

    @Test
    void createEventRejectsWithdrawnAccount() {
        timelineService = newService();
        when(passportOwnershipGuard.getOwnedActivePassport(1L, 1L))
            .thenThrow(new ApiException(ErrorCode.ACCOUNT_NOT_FOUND));

        assertThatThrownBy(() -> timelineService.createEvent(1L, 1L,
                new CreateTimelineEventRequest(TimelineEventType.MOMENT, "첫 여행", null), null))
            .isInstanceOf(ApiException.class)
            .extracting(e -> ((ApiException) e).getErrorCode())
            .isEqualTo(ErrorCode.ACCOUNT_NOT_FOUND);
        verifyNoInteractions(timelineEventRepository);
    }

    @Test
    void updateEventChangesNote() {
        timelineService = newService();
        TimelineEvent event = new TimelineEvent(1L, TimelineEventType.MOMENT, "원래 메모", null, null);
        when(timelineEventRepository.findById(10L)).thenReturn(java.util.Optional.of(event));
        Passport passport = new Passport("A1234", 2024, 1L, "Nomad Backpack", "애칭",
            LocalDate.of(2024, 1, 1), "MCM 강남점", null, false, List.of(), UsageFrequency.DAILY);
        when(passportOwnershipGuard.getOwnedActivePassport(1L, 1L)).thenReturn(passport);

        TimelineEventResponse response = timelineService.updateEvent(
            10L, 1L, new com.mcm.passport.timeline.dto.UpdateTimelineEventRequest("수정된 메모"));

        assertThat(response.note()).isEqualTo("수정된 메모");
    }

    @Test
    void updateEventThrowsNotFoundWhenEventMissing() {
        timelineService = newService();
        when(timelineEventRepository.findById(10L)).thenReturn(java.util.Optional.empty());

        assertThatThrownBy(() -> timelineService.updateEvent(
                10L, 1L, new com.mcm.passport.timeline.dto.UpdateTimelineEventRequest("수정된 메모")))
            .isInstanceOf(ApiException.class)
            .extracting(e -> ((ApiException) e).getErrorCode())
            .isEqualTo(ErrorCode.TIMELINE_EVENT_NOT_FOUND);
    }

    @Test
    void updateEventRejectsNonOwner() {
        timelineService = newService();
        TimelineEvent event = new TimelineEvent(1L, TimelineEventType.MOMENT, "원래 메모", null, null);
        when(timelineEventRepository.findById(10L)).thenReturn(java.util.Optional.of(event));
        when(passportOwnershipGuard.getOwnedActivePassport(1L, 999L))
            .thenThrow(new ApiException(ErrorCode.FORBIDDEN));

        assertThatThrownBy(() -> timelineService.updateEvent(
                10L, 999L, new com.mcm.passport.timeline.dto.UpdateTimelineEventRequest("수정된 메모")))
            .isInstanceOf(ApiException.class)
            .extracting(e -> ((ApiException) e).getErrorCode())
            .isEqualTo(ErrorCode.FORBIDDEN);
    }

    @Test
    void deleteEventRemovesEvent() {
        timelineService = newService();
        TimelineEvent event = new TimelineEvent(1L, TimelineEventType.MOMENT, "원래 메모", null, null);
        when(timelineEventRepository.findById(10L)).thenReturn(java.util.Optional.of(event));
        Passport passport = new Passport("A1234", 2024, 1L, "Nomad Backpack", "애칭",
            LocalDate.of(2024, 1, 1), "MCM 강남점", null, false, List.of(), UsageFrequency.DAILY);
        when(passportOwnershipGuard.getOwnedActivePassport(1L, 1L)).thenReturn(passport);

        timelineService.deleteEvent(10L, 1L);

        verify(timelineEventRepository).delete(event);
    }

    @Test
    void deleteEventCleansUpAssociatedImage() {
        // createEvent()는 저장 실패 시 업로드된 이미지를 정리하는데,
        // 삭제 쪽은 이벤트 행만 지우고 이미지는 그대로 둬서 Cloudinary에 영구 고아가 쌓였다.
        timelineService = newService();
        TimelineEvent event = new TimelineEvent(1L, TimelineEventType.MOMENT, "원래 메모", "https://cdn/a.jpg", null);
        when(timelineEventRepository.findById(10L)).thenReturn(java.util.Optional.of(event));
        Passport passport = new Passport("A1234", 2024, 1L, "Nomad Backpack", "애칭",
            LocalDate.of(2024, 1, 1), "MCM 강남점", null, false, List.of(), UsageFrequency.DAILY);
        when(passportOwnershipGuard.getOwnedActivePassport(1L, 1L)).thenReturn(passport);

        timelineService.deleteEvent(10L, 1L);

        verify(timelineEventRepository).delete(event);
        verify(imageStorageService).delete("https://cdn/a.jpg");
    }

    @Test
    void deleteEventSkipsImageCleanupWhenEventHasNoImage() {
        timelineService = newService();
        TimelineEvent event = new TimelineEvent(1L, TimelineEventType.MOMENT, "원래 메모", null, null);
        when(timelineEventRepository.findById(10L)).thenReturn(java.util.Optional.of(event));
        Passport passport = new Passport("A1234", 2024, 1L, "Nomad Backpack", "애칭",
            LocalDate.of(2024, 1, 1), "MCM 강남점", null, false, List.of(), UsageFrequency.DAILY);
        when(passportOwnershipGuard.getOwnedActivePassport(1L, 1L)).thenReturn(passport);

        timelineService.deleteEvent(10L, 1L);

        verifyNoInteractions(imageStorageService);
    }

    @Test
    void deleteEventThrowsNotFoundWhenEventMissing() {
        timelineService = newService();
        when(timelineEventRepository.findById(10L)).thenReturn(java.util.Optional.empty());

        assertThatThrownBy(() -> timelineService.deleteEvent(10L, 1L))
            .isInstanceOf(ApiException.class)
            .extracting(e -> ((ApiException) e).getErrorCode())
            .isEqualTo(ErrorCode.TIMELINE_EVENT_NOT_FOUND);
    }

    @Test
    void deleteEventRejectsNonOwner() {
        timelineService = newService();
        TimelineEvent event = new TimelineEvent(1L, TimelineEventType.MOMENT, "원래 메모", null, null);
        when(timelineEventRepository.findById(10L)).thenReturn(java.util.Optional.of(event));
        when(passportOwnershipGuard.getOwnedActivePassport(1L, 999L))
            .thenThrow(new ApiException(ErrorCode.FORBIDDEN));

        assertThatThrownBy(() -> timelineService.deleteEvent(10L, 999L))
            .isInstanceOf(ApiException.class)
            .extracting(e -> ((ApiException) e).getErrorCode())
            .isEqualTo(ErrorCode.FORBIDDEN);
        verify(timelineEventRepository, never()).delete(any(TimelineEvent.class));
    }

    private TimelineService newService() {
        return new TimelineService(timelineEventRepository, diagnosisRepository,
            careRecordRepository, notificationRepository, reservationRepository, storeRepository,
            transferCodeRepository, imageStorageService, passportOwnershipGuard);
    }
}
