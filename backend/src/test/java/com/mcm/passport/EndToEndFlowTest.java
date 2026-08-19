package com.mcm.passport;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mcm.passport.support.AbstractIntegrationTest;
import com.mcm.passport.support.FakeImageStorageConfig;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

// AbstractIntegrationTest's bare @SpringBootTest doesn't register a MockMvc bean on its own,
// so @AutoConfigureMockMvc is needed here (same story in PassportControllerIntegrationTest).
@AutoConfigureMockMvc
@Import(FakeImageStorageConfig.class)
class EndToEndFlowTest extends AbstractIntegrationTest {

    @Autowired
    private MockMvc mockMvc;
    @Autowired
    private ObjectMapper objectMapper;

    @Test
    void fullFlowFromSignupToTimeline() throws Exception {
        // 1. 회원가입
        String signupJson = """
            {"email":"e2e@example.com","password":"password123","nickname":"E2E유저"}
            """;
        mockMvc.perform(post("/api/auth/signup").contentType("application/json").content(signupJson))
            .andExpect(status().isCreated());

        // 2. 로그인
        String loginJson = """
            {"email":"e2e@example.com","password":"password123"}
            """;
        String loginResponse = mockMvc.perform(post("/api/auth/login").contentType("application/json").content(loginJson))
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
        String token = objectMapper.readTree(loginResponse).get("accessToken").asText();

        // 3. 여권 등록
        MockMultipartFile requestPart = new MockMultipartFile("request", "", "application/json",
            """
            {"serialNumber":"E1234","modelName":"Nomad Backpack","purchaseDate":"2024-01-01","usageFrequency":"DAILY"}
            """.getBytes());
        String registerResponse = mockMvc.perform(multipart("/api/passports")
                .file(requestPart)
                .header("Authorization", "Bearer " + token))
            .andExpect(status().isCreated())
            .andReturn().getResponse().getContentAsString();
        long passportId = objectMapper.readTree(registerResponse).get("id").asLong();

        // 4. 마모 진단 제출 — previous 없이 시작하면 규칙기반 엔진이 항상 GOOD로 잡으므로
        //    여기선 등급값보다 진단이 성공하고 타임라인에 반영되는지만 확인한다
        // diagnosisType은 @RequestParam이라 파일 파트가 아니라 .param()으로 넘겨야 바인딩된다
        MockMultipartFile imagePart = new MockMultipartFile("images", "photo.jpg", "image/jpeg", "fake-image".getBytes());
        mockMvc.perform(multipart("/api/passports/" + passportId + "/diagnoses")
                .file(imagePart)
                .param("diagnosisType", "SELF")
                .header("Authorization", "Bearer " + token))
            .andExpect(status().isCreated())
            // 첫 진단은 rule-based 엔진이 기준 20에 사진 1장분 +10을 더해 마모 30점을 낸다 → B 구간.
            .andExpect(jsonPath("$.overallGrade").value("B"));

        // 5. 타임라인 조회 — 등록 이벤트 + 진단 이벤트가 모두 보이는지 확인
        mockMvc.perform(get("/api/passports/" + passportId + "/timeline")
                .header("Authorization", "Bearer " + token))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[?(@.type == 'REGISTRATION')]").exists())
            .andExpect(jsonPath("$[?(@.type == 'DIAGNOSIS')]").exists());
    }
}
