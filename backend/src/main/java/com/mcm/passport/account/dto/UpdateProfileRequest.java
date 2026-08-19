package com.mcm.passport.account.dto;

import jakarta.validation.constraints.NotBlank;

public record UpdateProfileRequest(@NotBlank String nickname) {
}
