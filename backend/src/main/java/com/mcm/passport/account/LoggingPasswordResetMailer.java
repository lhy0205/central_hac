package com.mcm.passport.account;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

@Slf4j
@Component
public class LoggingPasswordResetMailer implements PasswordResetMailer {
    @Override
    public void sendResetLink(String email, String token) {
        log.info("[비밀번호 재설정] {}에게 토큰 {} 발급 (실제 메일 발송은 아직 미구현)", email, token);
    }
}
