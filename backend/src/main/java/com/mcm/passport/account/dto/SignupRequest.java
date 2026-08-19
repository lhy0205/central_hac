package com.mcm.passport.account.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record SignupRequest(
    @Email @NotBlank String email,
    // BCryptPasswordEncoder는 72바이트를 넘는 입력을 자르거나 거부한다 — 100자까지 받아주면
    // 그 초과분은 사실상 검증에 반영되지 않거나(레거시 truncation) 인코딩 자체가 실패한다
    //. 실제 처리 가능한 한도에 맞춘다.
    @NotBlank @Size(min = 8, max = 72) String password,
    @NotBlank String nickname
) {
}
