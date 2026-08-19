package com.mcm.passport.passport;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mcm.passport.account.Account;
import com.mcm.passport.account.AccountRepository;
import com.mcm.passport.common.security.JwtTokenProvider;
import com.mcm.passport.support.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;

import java.nio.charset.StandardCharsets;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

// @AutoConfigureMockMvc follows the same pattern established by AccountControllerIntegrationTest
//  / HealthEndpointSecurityTest: AbstractIntegrationTest's bare @SpringBootTest
// does not register a MockMvc bean, and the real SecurityFilterChain (no addFilters=false) must
// stay wired so this test actually exercises @RequestPart @Valid end-to-end.
@AutoConfigureMockMvc
class PassportControllerIntegrationTest extends AbstractIntegrationTest {

    @Autowired
    private MockMvc mockMvc;
    @Autowired
    private AccountRepository accountRepository;
    @Autowired
    private PasswordEncoder passwordEncoder;
    @Autowired
    private JwtTokenProvider jwtTokenProvider;

    @Test
    void registerWithBlankSerialNumberReturns400() throws Exception {
        Account account = accountRepository.save(
            new Account("passport-owner@example.com", passwordEncoder.encode("password123"), "닉네임"));
        String token = jwtTokenProvider.generateToken(account.getId());

        String requestJson = """
            {
              "serialNumber": "",
              "modelName": "Nomad Backpack",
              "nickname": "애칭",
              "purchaseDate": "2024-03-01",
              "purchasePlace": "MCM 강남점",
              "usageFrequency": "OCCASIONAL"
            }
            """;
        MockMultipartFile requestPart = new MockMultipartFile(
            "request", "", "application/json", requestJson.getBytes(StandardCharsets.UTF_8));

        mockMvc.perform(multipart("/api/passports")
                .file(requestPart)
                .header("Authorization", "Bearer " + token))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
            .andExpect(jsonPath("$.message").exists());
    }

    @Test
    void registerWithMissingPurchaseDateReturns400() throws Exception {
        Account account = accountRepository.save(
            new Account("passport-owner-2@example.com", passwordEncoder.encode("password123"), "닉네임"));
        String token = jwtTokenProvider.generateToken(account.getId());

        String requestJson = """
            {
              "serialNumber": "A1234",
              "modelName": "Nomad Backpack",
              "nickname": "애칭",
              "purchasePlace": "MCM 강남점",
              "usageFrequency": "OCCASIONAL"
            }
            """;
        MockMultipartFile requestPart = new MockMultipartFile(
            "request", "", "application/json", requestJson.getBytes(StandardCharsets.UTF_8));

        mockMvc.perform(multipart("/api/passports")
                .file(requestPart)
                .header("Authorization", "Bearer " + token))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
    }

    // 부분 유니크 인덱스 설계(소프트 삭제된 여권은 동일 시리얼+연도 재등록을 허용해야 함)에
    // 대한 회귀 방지 테스트. 등록 -> 소프트 삭제(DELETE) -> 동일 시리얼+연도로 재등록 순으로 검증한다.
    @Test
    void reRegistrationAllowedAfterSoftDelete() throws Exception {
        Account owner = accountRepository.save(
            new Account("owner@example.com", passwordEncoder.encode("password123"), "닉네임"));
        String token = jwtTokenProvider.generateToken(owner.getId());
        String requestJson = "{\"serialNumber\":\"D5555\",\"modelName\":\"Nomad Backpack\","
            + "\"purchaseDate\":\"2023-06-01\",\"usageFrequency\":\"DAILY\"}";
        MockMultipartFile requestPart = new MockMultipartFile(
            "request", "", "application/json", requestJson.getBytes(StandardCharsets.UTF_8));

        String responseBody = mockMvc.perform(multipart("/api/passports")
                .file(requestPart)
                .header("Authorization", "Bearer " + token))
            .andExpect(status().isCreated())
            .andReturn().getResponse().getContentAsString();

        JsonNode json = new ObjectMapper().readTree(responseBody);
        long passportId = json.get("id").asLong();

        mockMvc.perform(delete("/api/passports/" + passportId).header("Authorization", "Bearer " + token))
            .andExpect(status().isNoContent());

        MockMultipartFile requestPartAgain = new MockMultipartFile(
            "request", "", "application/json", requestJson.getBytes(StandardCharsets.UTF_8));
        mockMvc.perform(multipart("/api/passports")
                .file(requestPartAgain)
                .header("Authorization", "Bearer " + token))
            .andExpect(status().isCreated());
    }
}
