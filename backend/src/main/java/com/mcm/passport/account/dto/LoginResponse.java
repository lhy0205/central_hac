package com.mcm.passport.account.dto;

public record LoginResponse(String accessToken, AccountResponse account) {
}
