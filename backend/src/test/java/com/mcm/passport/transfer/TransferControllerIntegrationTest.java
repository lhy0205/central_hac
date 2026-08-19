package com.mcm.passport.transfer;

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

// @AutoConfigureMockMvc + @Import(FakeImageStorageConfig.class) follow the same pattern as
// EndToEndFlowTest: AbstractIntegrationTest's bare @SpringBootTest does not register a
// MockMvc bean, and passport registration needs a fake image storage bean wired in test.
@AutoConfigureMockMvc
@Import(FakeImageStorageConfig.class)
class TransferControllerIntegrationTest extends AbstractIntegrationTest {

    @Autowired
    private MockMvc mockMvc;
    @Autowired
    private ObjectMapper objectMapper;

    @Test
    void fullTransferFlowMovesOwnershipFromAToB() throws Exception {
        // 1. 회원가입 - A, B
        signup("transfer-a@example.com", "A유저");
        signup("transfer-b@example.com", "B유저");

        // 2. 로그인 - A
        String tokenA = login("transfer-a@example.com");

        // 3. A가 여권 등록
        MockMultipartFile requestPart = new MockMultipartFile("request", "", "application/json",
            """
            {"serialNumber":"T1234","modelName":"Nomad Backpack","purchaseDate":"2024-01-01","usageFrequency":"DAILY"}
            """.getBytes());
        String registerResponse = mockMvc.perform(multipart("/api/passports")
                .file(requestPart)
                .header("Authorization", "Bearer " + tokenA))
            .andExpect(status().isCreated())
            .andReturn().getResponse().getContentAsString();
        long passportId = objectMapper.readTree(registerResponse).get("id").asLong();

        // 4. A가 승계 코드 발급
        String issueResponse = mockMvc.perform(post("/api/passports/" + passportId + "/transfer-code")
                .header("Authorization", "Bearer " + tokenA))
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
        String code = objectMapper.readTree(issueResponse).get("code").asText();

        // 5. 로그인 - B
        String tokenB = login("transfer-b@example.com");

        // 6. B가 코드로 미리보기 조회
        mockMvc.perform(get("/api/passports/transfer/" + code + "/preview")
                .header("Authorization", "Bearer " + tokenB))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.modelName").value("Nomad Backpack"));

        // 7. B가 승계 실행
        String redeemJson = "{\"code\":\"" + code + "\"}";
        mockMvc.perform(post("/api/passports/transfer/redeem")
                .contentType("application/json")
                .content(redeemJson)
                .header("Authorization", "Bearer " + tokenB))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.id").value(passportId));

        // 8. B의 여권 목록에 해당 여권이 나타나는지 확인
        mockMvc.perform(get("/api/passports")
                .header("Authorization", "Bearer " + tokenB))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.content[?(@.id == " + passportId + ")]").exists());

        // 9. A의 여권 목록에서는 더 이상 보이지 않는지 확인 (ownerAccountId가 더 이상 A가 아니므로)
        mockMvc.perform(get("/api/passports")
                .header("Authorization", "Bearer " + tokenA))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.content[?(@.id == " + passportId + ")]").doesNotExist());
    }

    private void signup(String email, String nickname) throws Exception {
        String signupJson = """
            {"email":"%s","password":"password123","nickname":"%s"}
            """.formatted(email, nickname);
        mockMvc.perform(post("/api/auth/signup").contentType("application/json").content(signupJson))
            .andExpect(status().isCreated());
    }

    private String login(String email) throws Exception {
        String loginJson = """
            {"email":"%s","password":"password123"}
            """.formatted(email);
        String loginResponse = mockMvc.perform(post("/api/auth/login").contentType("application/json").content(loginJson))
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(loginResponse).get("accessToken").asText();
    }
}
