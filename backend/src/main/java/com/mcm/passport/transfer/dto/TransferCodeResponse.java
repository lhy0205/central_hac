package com.mcm.passport.transfer.dto;

import java.time.LocalDateTime;

public record TransferCodeResponse(String code, LocalDateTime expiresAt) {
}
