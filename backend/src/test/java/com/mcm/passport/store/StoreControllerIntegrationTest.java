package com.mcm.passport.store;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mcm.passport.account.Account;
import com.mcm.passport.account.AccountRepository;
import com.mcm.passport.common.security.JwtTokenProvider;
import com.mcm.passport.support.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
class StoreControllerIntegrationTest extends AbstractIntegrationTest {

    @Autowired private MockMvc mockMvc;
    @Autowired private AccountRepository accountRepository;
    @Autowired private JwtTokenProvider jwtTokenProvider;

    @Test
    void listReturnsSeededStores() throws Exception {
        Account account = accountRepository.save(new Account("store-list@example.com", "hash", "닉네임"));
        String token = jwtTokenProvider.generateToken(account.getId());

        mockMvc.perform(get("/api/stores").header("Authorization", "Bearer " + token))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.content.length()").value(3));
    }

    @Test
    void getDetailReturns404ForUnknownStore() throws Exception {
        Account account = accountRepository.save(new Account("store-detail@example.com", "hash", "닉네임"));
        String token = jwtTokenProvider.generateToken(account.getId());

        mockMvc.perform(get("/api/stores/999999").header("Authorization", "Bearer " + token))
            .andExpect(status().isNotFound())
            .andExpect(jsonPath("$.code").value("STORE_NOT_FOUND"));
    }

    @Test
    void listRequiresAuthentication() throws Exception {
        mockMvc.perform(get("/api/stores"))
            .andExpect(status().isUnauthorized());
    }
}
