package com.mcm.passport.account;

public interface PasswordResetMailer {
    void sendResetLink(String email, String token);
}
