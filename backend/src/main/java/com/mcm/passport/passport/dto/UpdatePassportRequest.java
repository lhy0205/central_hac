package com.mcm.passport.passport.dto;

import com.mcm.passport.passport.UsageFrequency;

public record UpdatePassportRequest(String nickname, UsageFrequency usageFrequency) {
}
