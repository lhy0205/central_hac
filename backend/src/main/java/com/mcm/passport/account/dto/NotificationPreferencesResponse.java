package com.mcm.passport.account.dto;

import com.mcm.passport.account.Account;

public record NotificationPreferencesResponse(
    boolean careAlertsEnabled,
    boolean journeyAlertsEnabled,
    boolean marketingAlertsEnabled
) {
    public static NotificationPreferencesResponse from(Account account) {
        return new NotificationPreferencesResponse(
            account.isCareAlertsEnabled(), account.isJourneyAlertsEnabled(), account.isMarketingAlertsEnabled());
    }
}
