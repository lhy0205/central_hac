package com.mcm.passport.notification.dto;

import com.mcm.passport.notification.Notification;
import com.mcm.passport.notification.NotificationType;

import java.time.LocalDateTime;
import java.util.Map;

public record NotificationResponse(
    Long id, NotificationType type, Map<String, Object> reasonFactors,
    String message, Integer overallScore, boolean read, boolean dismissed, LocalDateTime createdAt
) {
    public static NotificationResponse from(Notification notification) {
        return new NotificationResponse(
            notification.getId(), notification.getType(), notification.getReasonFactors(),
            notification.getMessage(), notification.getOverallScore(), notification.isRead(),
            notification.isDismissed(), notification.getCreatedAt());
    }
}
