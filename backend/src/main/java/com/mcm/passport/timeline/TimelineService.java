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

    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    public TimelineEventResponse createEvent(Long passportId, Long requesterAccountId,
                                              CreateTimelineEventRequest request, MultipartFile image) {
        getOwnedPassport(passportId, requesterAccountId);
        String imageUrl = image != null && !image.isEmpty() ? imageStorageService.upload(image) : null;
        try {

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

        List<Reservation> reservations =
            reservationRepository.findAllByPassportId(passportId);

        Map<Long, String> storeNames = storeRepository.namesByIds(
            reservations.stream().map(Reservation::getStoreId).distinct().toList());
        reservations.forEach(r -> {
            String storeName = storeNames.getOrDefault(r.getStoreId(), "");
            items.add(new TimelineItem(
                "RESERVATION", r.getId(), r.getCreatedAt(),
                Map.of(
                    "storeName", storeName,
                    "requestItems", r.getRequestItems(),
                    "status", r.getStatus().name())));
        });

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
