package com.mcm.passport.transfer.dto;

import jakarta.validation.constraints.NotBlank;

public record RedeemTransferRequest(@NotBlank String code) {
}
