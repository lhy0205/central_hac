package com.mcm.passport.timeline;

import com.mcm.passport.care.CareRecordRepository;
import com.mcm.passport.common.exception.ApiException;
import com.mcm.passport.common.exception.ErrorCode;
import com.mcm.passport.common.storage.ImageStorageService;
import com.mcm.passport.diagnosis.DiagnosisRepository;
import com.mcm.passport.notification.NotificationRepository;
import com.mcm.passport.passport.Passport;
import com.mcm.passport.passport.PassportOwnershipGuard;
import com.mcm.passport.reservation.Reservation;
import com.mcm.passport.reservation.ReservationRepository;
import com.mcm.passport.store.StoreRepository;
import com.mcm.passport.timeline.dto.CreateTimelineEventRequest;
import com.mcm.passport.timeline.dto.TimelineEventResponse;
import com.mcm.passport.timeline.dto.TimelineItem;
import com.mcm.passport.timeline.dto.UpdateTimelineEventRequest;
import com.mcm.passport.transfer.TransferCodeRepository;
import com.mcm.passport.transfer.TransferStatus;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional
public class TimelineService {

    private final TimelineEventRepository timelineEventRepository;
    private final DiagnosisRepository diagnosisRepository;
    private final CareRecordRepository careRecordRepository;
    private final NotificationRepository notificationRepository;
    private final ReservationRepository reservationRepository;
    private final StoreRepository storeRepository;
    private final TransferCodeRepository transferCodeRepository;
    private final ImageStorageService imageStorageService;
    private final PassportOwnershipGuard passportOwnershipGuard;

    // CareRecordService.create()와 같은 이유로 업로드를 클래스 레벨 @Transactional 밖으로 뺀다.
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    public TimelineEventResponse createEvent(Long passportId, Long requesterAccountId,
                                              CreateTimelineEventRequest request, MultipartFile image) {
        getOwnedPassport(passportId, requesterAccountId);
        String imageUrl = image != null && !image.isEmpty() ? imageStorageService.upload(image) : null;
        try {
            // 업로드가 오래 걸리는 사이 탈퇴/소유권 변경이 있었을 수 있어 저장 직전에 다시 확인한다.
            // 이 재확인도 try 안에 있어야 여기서 나는 예외까지 아래 catch의 고아 이미지 정리를 거친다.
            // 잠금을 걸지 않는 이유는 DiagnosisService.submit()의 같은 지점 주석 참고.
            Passport passport = getOwnedPassport(passportId, requesterAccountId);
            TimelineEvent event = new TimelineEvent(
                passport.getId(), request.eventType(), request.note(), imageUrl, request.eventDate());
            return TimelineEventResponse.from(timelineEventRepository.save(event));
        } catch (RuntimeException e) {
            if (imageUrl != null) {
                try {
                    imageStorageService.delete(imageUrl);
                } catch (Exception cleanupException) {
                    log.warn("타임라인 이벤트 저장 실패 후 고아 이미지 정리 중 오류(url={})", imageUrl, cleanupException);
                }
            }
            throw e;
        }
    }

    // 6종 소스를 전부 읽어 메모리에서 합쳐 정렬한다. 페이지네이션이 없는 건 알려진 한계다 —
    // 타입별 LIMIT로는 전역 정렬 순서를 보장할 수 없어 API 계약 변경이 필요하다.
    public List<TimelineItem> getTimeline(
            Long passportId, Long requesterAccountId) {
        Passport passport = getOwnedPassport(passportId, requesterAccountId);

        List<TimelineItem> items = new ArrayList<>();

        items.add(new TimelineItem(
            "REGISTRATION", passport.getId(), passport.getCreatedAt(),
            Map.of("modelName", passport.getModelName())));

        diagnosisRepository.findAllByPassportId(passportId).forEach(d ->
            items.add(new TimelineItem("DIAGNOSIS", d.getId(), d.getDiagnosedAt(),
                Map.of("overallGrade", d.getOverallGrade().name(), "diagnosisType", d.getDiagnosisType().name()))));

        careRecordRepository.findAllByPassportId(passportId).forEach(c ->
            items.add(new TimelineItem("CARE", c.getId(), c.getCompletedAt(),
                Map.of("careType", c.getCareType()))));

        notificationRepository.findAllByPassportIdAndReadTrue(passportId).forEach(n ->
            items.add(new TimelineItem("NOTIFICATION", n.getId(), n.getCreatedAt(),
                Map.of("type", n.getType().name(), "message", n.getMessage()))));

        timelineEventRepository.findAllByPassportId(passportId).forEach(e ->
            items.add(new TimelineItem("USER_EVENT", e.getId(), e.getEventDate(),
                Map.of(
                    "eventType", e.getEventType().name(),
                    "note", e.getNote() != null ? e.getNote() : ""))));

        // CANCELLED로 바뀐 예약도 사라지지 않고 상태값 그대로 노출한다 — 다른 소스가 이력을
        // 숨기지 않는 것과 같은 원칙(스펙 문서 6절 참고).
        List<Reservation> reservations =
            reservationRepository.findAllByPassportId(passportId);
        // 예약 건마다 findById를 부르면 N+1이 된다 — 이 페이지에 나온
        // storeId들을 한 번에 배치 조회한다. ReservationService와 동일한 로직이라
        // StoreRepository.namesByIds()로 공유한다.
        Map<Long, String> storeNames = storeRepository.namesByIds(
            reservations.stream().map(Reservation::getStoreId).distinct().toList());
        reservations.forEach(r -> {
            String storeName = storeNames.getOrDefault(r.getStoreId(), "");
            items.add(new TimelineItem(
                "RESERVATION", r.getId(), r.getSlotDateTime(),
                Map.of(
                    "storeName", storeName,
                    "requestItems", r.getRequestItems(),
                    "status", r.getStatus().name())));
        });

        // 승계(소유권 이전)는 여권 일생에서 가장 중요한 이벤트 중 하나인데도 지금까지 타임라인에
        // 빠져 있었다 — 예약처럼 새 소스로 추가한다. 여권 하나가 여러
        // 번 승계될 수 있으므로 완료(REDEEMED)된 코드를 전부 가져온다.
        transferCodeRepository.findAllByPassportIdAndStatus(passportId, TransferStatus.REDEEMED).forEach(t ->
            items.add(new TimelineItem("TRANSFER", t.getId(), t.getRedeemedAt(),
                Map.of(
                    "fromAccountId", t.getIssuedByAccountId(),
                    "toAccountId", t.getRedeemedByAccountId()))));

        items.sort(Comparator.comparing(TimelineItem::occurredAt));
        return items;
    }

    public TimelineEventResponse getEventDetail(Long eventId, Long requesterAccountId) {
        TimelineEvent event = timelineEventRepository.findById(eventId)
            .orElseThrow(() -> new ApiException(ErrorCode.TIMELINE_EVENT_NOT_FOUND));
        getOwnedPassport(event.getPassportId(), requesterAccountId);
        return TimelineEventResponse.from(event);
    }

    public TimelineEventResponse updateEvent(Long eventId, Long requesterAccountId,
                                              UpdateTimelineEventRequest request) {
        TimelineEvent event = timelineEventRepository.findById(eventId)
            .orElseThrow(() -> new ApiException(ErrorCode.TIMELINE_EVENT_NOT_FOUND));
        getOwnedPassport(event.getPassportId(), requesterAccountId);
        event.updateNote(request.note());
        return TimelineEventResponse.from(event);
    }

    public void deleteEvent(Long eventId, Long requesterAccountId) {
        TimelineEvent event = timelineEventRepository.findById(eventId)
            .orElseThrow(() -> new ApiException(ErrorCode.TIMELINE_EVENT_NOT_FOUND));
        getOwnedPassport(event.getPassportId(), requesterAccountId);
        timelineEventRepository.delete(event);
        // createEvent()는 저장 실패 시 업로드된 이미지를 정리하는데, 삭제 쪽은 이벤트 행만 지우고
        // 이미지는 그대로 둬서 Cloudinary에 영구 고아가 쌓였다. 삭제
        // 자체는 이미지 정리 실패로 막히면 안 되므로 베스트에포트로 처리한다.
        if (event.getImageUrl() != null) {
            try {
                imageStorageService.delete(event.getImageUrl());
            } catch (Exception cleanupException) {
                log.warn("타임라인 이벤트 삭제 후 이미지 정리 중 오류(url={})", event.getImageUrl(), cleanupException);
            }
        }
    }

    private Passport getOwnedPassport(Long passportId, Long requesterAccountId) {
        return passportOwnershipGuard.getOwnedActivePassport(passportId, requesterAccountId);
    }
}
