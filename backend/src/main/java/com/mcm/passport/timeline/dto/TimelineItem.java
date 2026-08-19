package com.mcm.passport.timeline.dto;

import java.time.LocalDateTime;
import java.util.Map;

public record TimelineItem(String type, Long id, LocalDateTime occurredAt, Map<String, Object> detail) {
}
