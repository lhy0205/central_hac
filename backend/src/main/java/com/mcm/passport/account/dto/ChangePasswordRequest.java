package com.mcm.passport.account.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record ChangePasswordRequest(
    @NotBlank String currentPassword,
    // SignupRequest.password와 같은 이유로 72바이트(BCryptPasswordEncoder 한도)에 맞춘다
    @NotBlank @Size(min = 8, max = 72) String newPassword
) {
}
