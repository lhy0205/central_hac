package com.mcm.passport.reservation;

import com.mcm.passport.account.Account;
import com.mcm.passport.account.AccountRepository;
import com.mcm.passport.common.security.JwtTokenProvider;
import com.mcm.passport.passport.Passport;
import com.mcm.passport.passport.PassportRepository;
import com.mcm.passport.passport.UsageFrequency;
import com.mcm.passport.support.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.time.LocalDate;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
class ReservationControllerIntegrationTest extends AbstractIntegrationTest {

    @Autowired private MockMvc mockMvc;
    @Autowired private AccountRepository accountRepository;
    @Autowired private PassportRepository passportRepository;
    @Autowired private JwtTokenProvider jwtTokenProvider;

    @Test
    void fullCreateListDetailCancelFlow() throws Exception {
        Account account = accountRepository.save(new Account("res-flow@example.com", "hash", "닉네임"));
        String token = jwtTokenProvider.generateToken(account.getId());
        Passport passport = passportRepository.save(new Passport("A1234", 2024, account.getId(),
            "Nomad Backpack", "애칭", LocalDate.of(2024, 1, 1), "MCM 강남점", null, false,
            java.util.List.of(), UsageFrequency.DAILY));

        String createBody = """
            {"storeId": 1, "slotDateTime": "2026-09-01T14:00:00", "requestItems": ["LEATHER_CLEANING"]}
            """;

        String createResponse = mockMvc.perform(post("/api/passports/" + passport.getId() + "/reservations")
                .header("Authorization", "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON)
                .content(createBody))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.status").value("REQUESTED"))
            .andExpect(jsonPath("$.storeName").isNotEmpty())
            .andReturn().getResponse().getContentAsString();

        Long reservationId = com.jayway.jsonpath.JsonPath.read(createResponse, "$.id") instanceof Integer i
            ? i.longValue() : (Long) com.jayway.jsonpath.JsonPath.read(createResponse, "$.id");

        mockMvc.perform(get("/api/passports/" + passport.getId() + "/reservations")
                .header("Authorization", "Bearer " + token))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.content.length()").value(1));

        mockMvc.perform(get("/api/reservations/" + reservationId)
                .header("Authorization", "Bearer " + token))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("REQUESTED"));

        mockMvc.perform(patch("/api/reservations/" + reservationId + "/cancel")
                .header("Authorization", "Bearer " + token))
            .andExpect(status().isNoContent());

        // 멱등 — 다시 취소해도 에러 없이 204
        mockMvc.perform(patch("/api/reservations/" + reservationId + "/cancel")
                .header("Authorization", "Bearer " + token))
            .andExpect(status().isNoContent());
    }

    @Test
    void createRejectsNullElementInRequestItemsWith400() throws Exception {
        // 리스트 자체의 @NotNull/@Size만으로는 원소가 null인 것까지는
        // 막지 못해서, requestItems().stream().map(Enum::name)에서 처리되지 않은 NPE(500)가 나갔다
        // — 원소별 @NotNull로 요청 단계에서 400을 돌려줘야 한다.
        Account account = accountRepository.save(new Account("res-null-item@example.com", "hash", "닉네임"));
        String token = jwtTokenProvider.generateToken(account.getId());
        Passport passport = passportRepository.save(new Passport("A1234", 2024, account.getId(),
            "Nomad Backpack", "애칭", LocalDate.of(2024, 1, 1), "MCM 강남점", null, false,
            java.util.List.of(), UsageFrequency.DAILY));
        String body = """
            {"storeId": 1, "slotDateTime": "2026-09-04T10:00:00", "requestItems": ["OTHER", null]}
            """;

        mockMvc.perform(post("/api/passports/" + passport.getId() + "/reservations")
                .header("Authorization", "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isBadRequest());
    }

    @Test
    void secondBookingOfSameSlotReturns409() throws Exception {
        Account account = accountRepository.save(new Account("res-dup@example.com", "hash", "닉네임"));
        String token = jwtTokenProvider.generateToken(account.getId());
        Passport passportA = passportRepository.save(new Passport("A1234", 2024, account.getId(),
            "Nomad Backpack", "애칭", LocalDate.of(2024, 1, 1), "MCM 강남점", null, false,
            java.util.List.of(), UsageFrequency.DAILY));
        Passport passportB = passportRepository.save(new Passport("B5678", 2024, account.getId(),
            "Nomad Tote", "애칭2", LocalDate.of(2024, 1, 1), "MCM 강남점", null, false,
            java.util.List.of(), UsageFrequency.DAILY));

        String body = """
            {"storeId": 1, "slotDateTime": "2026-09-02T11:00:00", "requestItems": ["OTHER"]}
            """;

        mockMvc.perform(post("/api/passports/" + passportA.getId() + "/reservations")
                .header("Authorization", "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isCreated());

        // 같은 계정이 소유한 '다른' 여권으로 같은 매장·같은 시각 재요청 — 슬롯 정원이 여권이 아니라
        // 매장+시각 기준이라 여기서도 막혀야 한다(스펙 문서 4절 참고).
        mockMvc.perform(post("/api/passports/" + passportB.getId() + "/reservations")
                .header("Authorization", "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.code").value("SLOT_ALREADY_BOOKED"));
    }

    @Test
    void availableSlotsExcludesAlreadyBookedTime() throws Exception {
        Account account = accountRepository.save(new Account("res-slots@example.com", "hash", "닉네임"));
        String token = jwtTokenProvider.generateToken(account.getId());
        Passport passport = passportRepository.save(new Passport("C9999", 2024, account.getId(),
            "Nomad Backpack", "애칭", LocalDate.of(2024, 1, 1), "MCM 강남점", null, false,
            java.util.List.of(), UsageFrequency.DAILY));
        String body = """
            {"storeId": 1, "slotDateTime": "2026-09-03T10:00:00", "requestItems": ["OTHER"]}
            """;
        mockMvc.perform(post("/api/passports/" + passport.getId() + "/reservations")
                .header("Authorization", "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isCreated());

        mockMvc.perform(get("/api/stores/1/available-slots")
                .param("date", "2026-09-03")
                .header("Authorization", "Bearer " + token))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[?(@ == '2026-09-03T10:00:00')]").doesNotExist());
    }
}
