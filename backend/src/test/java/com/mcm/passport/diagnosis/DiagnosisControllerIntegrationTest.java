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

// @AutoConfigureMockMvc follows the same pattern established by PassportControllerIntegrationTest
// : AbstractIntegrationTest's bare @SpringBootTest does not register a MockMvc bean,
// and the real SecurityFilterChain (no addFilters=false) must stay wired so this test actually
// exercises the real filter chain + @RequestParam binding end-to-end.
//
// ImageStorageService is @MockBean'd here (not exercised for real) because the real
// CloudinaryImageStorageService would attempt a network call to Cloudinary using the
// demo/fake credentials from application.yml -- unrelated to what this test is verifying
// (multipart form-field binding of diagnosisType), and would make the test flaky/slow/networked.
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

    // Regression test for the original defect: @RequestPart("diagnosisType") DiagnosisType
    // returned HTTP 415 for an ordinary multipart form field (Content-Type: text/plain or
    // absent), which is how every real multipart client (curl -F, mobile app form encoders)
    // sends a non-file field. The fix switched to @RequestParam, which binds via Spring's
    // ConversionService (StringToEnumConverterFactory) regardless of the field's Content-Type.
    // This test sends diagnosisType the way a real client would -- as a plain form field via
    // .param(), NOT as a JSON-typed @RequestPart -- so it would have caught the original bug.
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
