package com.mcm.passport.account.dto;

import jakarta.validation.constraints.NotNull;

public record UpdateNotificationPreferencesRequest(
    @NotNull Boolean careAlertsEnabled,
    @NotNull Boolean journeyAlertsEnabled,
    @NotNull Boolean marketingAlertsEnabled
) {
}
