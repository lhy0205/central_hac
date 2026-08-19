package com.mcm.passport.common.security;

import org.springframework.security.core.Authentication;

public final class CurrentAccount {

    private CurrentAccount() {
    }

    public static Long id(Authentication authentication) {
        return Long.valueOf(authentication.getName());
    }
}
