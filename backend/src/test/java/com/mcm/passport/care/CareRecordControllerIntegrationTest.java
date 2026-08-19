package com.mcm.passport.care;

import com.mcm.passport.account.Account;
import com.mcm.passport.account.AccountRepository;
import com.mcm.passport.common.security.JwtTokenProvider;
import com.mcm.passport.passport.Passport;
import com.mcm.passport.passport.PassportRepository;
import com.mcm.passport.passport.UsageFrequency;
import com.mcm.passport.support.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;

import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.List;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// Regression test for the missing @Valid on CareRecordController's @RequestPart("request") param
// (final whole-branch review item 5): CreateCareRecordRequest.careType's @NotBlank was previously
// dead code and a blank value reached the DB NOT NULL constraint as an unhandled
// DataIntegrityViolationException. Follows PassportControllerIntegrationTest's
// @AutoConfigureMockMvc + AbstractIntegrationTest pattern so the real SecurityFilterChain and
// @Valid are both exercised end-to-end.
@AutoConfigureMockMvc
class CareRecordControllerIntegrationTest extends AbstractIntegrationTest {

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

    @Test
    void createWithBlankCareTypeReturns400() throws Exception {
        Account owner = accountRepository.save(
            new Account("care-owner@example.com", passwordEncoder.encode("password123"), "닉네임"));
        String token = jwtTokenProvider.generateToken(owner.getId());
        Passport passport = passportRepository.save(new Passport("A1234", 2024, owner.getId(), "Nomad Backpack",
            "애칭", LocalDate.of(2024, 1, 1), "MCM 강남점", null, false, List.of(), UsageFrequency.DAILY));

        String requestJson = """
            {
              "careType": "",
              "materialType": "가죽",
              "notes": "메모"
            }
            """;
        MockMultipartFile requestPart = new MockMultipartFile(
            "request", "", "application/json", requestJson.getBytes(StandardCharsets.UTF_8));

        mockMvc.perform(multipart("/api/passports/" + passport.getId() + "/care-records")
                .file(requestPart)
                .header("Authorization", "Bearer " + token))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
            .andExpect(jsonPath("$.message").exists());
    }
}
