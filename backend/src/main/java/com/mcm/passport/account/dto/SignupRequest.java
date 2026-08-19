package com.mcm.passport.account.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record SignupRequest(
    @Email @NotBlank String email,
    // BCryptPasswordEncoder가 72바이트 넘는 입력은 자르거나 거부해서 실제 처리 한도에 맞춘다
    @NotBlank @Size(min = 8, max = 72) String password,
    @NotBlank String nickname
) {
}
