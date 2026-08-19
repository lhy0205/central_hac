package com.mcm.passport.timeline;

import com.mcm.passport.common.security.CurrentAccount;
import com.mcm.passport.timeline.dto.CreateTimelineEventRequest;
import com.mcm.passport.timeline.dto.TimelineEventResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequiredArgsConstructor
public class TimelineController {

    private final TimelineService timelineService;

    @PostMapping(value = "/api/passports/{passportId}/timeline/events", consumes = "multipart/form-data")
    public ResponseEntity<TimelineEventResponse> createEvent(
            Authentication authentication, @PathVariable Long passportId,
            @RequestPart("request") @Valid CreateTimelineEventRequest request,
            @RequestPart(value = "image", required = false) MultipartFile image) {
        TimelineEventResponse response = timelineService.createEvent(
            passportId, CurrentAccount.id(authentication), request, image);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @GetMapping("/api/timeline/events/{id}")
    public ResponseEntity<TimelineEventResponse> getEventDetail(Authentication authentication, @PathVariable Long id) {
        return ResponseEntity.ok(timelineService.getEventDetail(id, CurrentAccount.id(authentication)));
    }

    @PatchMapping("/api/timeline/events/{id}")
    public ResponseEntity<TimelineEventResponse> updateEvent(
            Authentication authentication, @PathVariable Long id,
            @RequestBody com.mcm.passport.timeline.dto.UpdateTimelineEventRequest request) {
        return ResponseEntity.ok(timelineService.updateEvent(id, CurrentAccount.id(authentication), request));
    }

    @DeleteMapping("/api/timeline/events/{id}")
    public ResponseEntity<Void> deleteEvent(Authentication authentication, @PathVariable Long id) {
        timelineService.deleteEvent(id, CurrentAccount.id(authentication));
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/api/passports/{passportId}/timeline")
    public ResponseEntity<java.util.List<com.mcm.passport.timeline.dto.TimelineItem>> getTimeline(
            Authentication authentication, @PathVariable Long passportId) {
        return ResponseEntity.ok(timelineService.getTimeline(passportId, CurrentAccount.id(authentication)));
    }
}
