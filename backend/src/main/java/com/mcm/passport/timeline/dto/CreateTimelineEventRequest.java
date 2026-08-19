package com.mcm.passport.timeline.dto;

import com.mcm.passport.timeline.TimelineEventType;
import jakarta.validation.constraints.PastOrPresent;

import java.time.LocalDateTime;

public record CreateTimelineEventRequest(
    TimelineEventType eventType, String note, @PastOrPresent LocalDateTime eventDate
) {
}
