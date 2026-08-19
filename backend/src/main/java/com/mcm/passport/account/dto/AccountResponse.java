package com.mcm.passport.account.dto;

import com.mcm.passport.account.Account;

import java.time.LocalDateTime;

public record AccountResponse(
    Long id,
    String email,
    String nickname,
    LocalDateTime createdAt
) {
    public static AccountResponse from(Account account) {
        return new AccountResponse(
            account.getId(),
            account.getEmail(),
            account.getNickname(),
            account.getCreatedAt()
        );
    }
}
