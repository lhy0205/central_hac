package com.mcm.passport.timeline.dto;

import com.mcm.passport.timeline.TimelineEvent;
import com.mcm.passport.timeline.TimelineEventType;

import java.time.LocalDateTime;

public record TimelineEventResponse(
    Long id, TimelineEventType eventType, String note, String imageUrl, LocalDateTime eventDate
) {
    public static TimelineEventResponse from(TimelineEvent event) {
        return new TimelineEventResponse(
            event.getId(), event.getEventType(), event.getNote(), event.getImageUrl(), event.getEventDate());
    }
}
