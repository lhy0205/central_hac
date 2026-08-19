package com.mcm.passport.diagnosis;

import com.mcm.passport.account.Account;
import com.mcm.passport.account.AccountRepository;
import com.mcm.passport.common.security.JwtTokenProvider;
import com.mcm.passport.common.storage.ImageStorageService;
import com.mcm.passport.passport.Passport;
import com.mcm.passport.passport.PassportRepository;
import com.mcm.passport.passport.UsageFrequency;
import com.mcm.passport.support.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;

import java.time.LocalDate;
import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

// AbstractIntegrationTest의 기본 @SpringBootTest는 MockMvc 빈을 안 만들어줘서 @AutoConfigureMockMvc가 필요.
// 시큐리티 필터 체인도 실제로 태워야 하니 addFilters=false는 쓰지 않는다.
// ImageStorageService는 실제 Cloudinary 호출을 막으려고 목으로 대체.
@AutoConfigureMockMvc
class DiagnosisControllerIntegrationTest extends AbstractIntegrationTest {

    @Autowired
    private MockMvc mockMvc;
    @Autowired
    private AccountRepository accountRepository;
    @Autowired
    private PassportRepository passportRepository;
    @Autowired
    private PasswordEncoder passwordEncoder;
    @Autowired
    private JwtTokenProvider jwtTokenProvider;

    @MockBean
    private ImageStorageService imageStorageService;

    // diagnosisType은 JSON @RequestPart가 아니라 실제 클라이언트(curl -F, 모바일 폼 인코더)처럼
    // 평범한 폼 필드(.param())로 보낸다 -- @RequestPart로 받으면 text/plain 폼 필드가 415로 거부되니
    // @RequestParam으로 ConversionService를 태워야 함.
    @Test
    void submitWithOrdinaryFormFieldDiagnosisTypeReturns201() throws Exception {
        Account owner = accountRepository.save(
            new Account("diagnosis-owner@example.com", passwordEncoder.encode("password123"), "닉네임"));
        String token = jwtTokenProvider.generateToken(owner.getId());
        Passport passport = passportRepository.save(new Passport(
            "A1234", 2024, owner.getId(), "Nomad Backpack", "애칭",
            LocalDate.of(2024, 1, 1), "MCM 강남점", null, false, List.of(), UsageFrequency.DAILY));

        when(imageStorageService.upload(any())).thenReturn("https://cdn.example.com/a.jpg");

        MockMultipartFile imagePart = new MockMultipartFile(
            "images", "a.jpg", "image/jpeg", "a".getBytes());

        mockMvc.perform(multipart("/api/passports/" + passport.getId() + "/diagnoses")
                .file(imagePart)
                .param("diagnosisType", "SELF")
                .header("Authorization", "Bearer " + token))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.diagnosisType").value("SELF"))
            .andExpect(jsonPath("$.overallGrade").exists())
            .andExpect(jsonPath("$.imageUrls").doesNotExist());
    }

    @Test
    void submitWithoutAuthenticationReturns401() throws Exception {
        Account owner = accountRepository.save(
            new Account("diagnosis-owner-2@example.com", passwordEncoder.encode("password123"), "닉네임"));
        Passport passport = passportRepository.save(new Passport(
            "B5678", 2024, owner.getId(), "Nomad Backpack", "애칭",
            LocalDate.of(2024, 1, 1), "MCM 강남점", null, false, List.of(), UsageFrequency.DAILY));

        MockMultipartFile imagePart = new MockMultipartFile(
            "images", "a.jpg", "image/jpeg", "a".getBytes());

        mockMvc.perform(multipart("/api/passports/" + passport.getId() + "/diagnoses")
                .file(imagePart)
                .param("diagnosisType", "SELF"))
            .andExpect(status().isUnauthorized());
    }
}
