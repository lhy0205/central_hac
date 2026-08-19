package com.mcm.passport.account;

import com.mcm.passport.common.security.JwtProperties;
import com.mcm.passport.common.security.JwtTokenProvider;
import com.mcm.passport.support.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

// @AutoConfigureMockMvc added (not in task-7-brief's verbatim snippet): AbstractIntegrationTest's
// bare @SpringBootTest does not register a MockMvc bean on its own. HealthEndpointSecurityTest
// establishes this pattern for integration tests that need MockMvc against the
// real SecurityFilterChain; followed here rather than inventing a new approach.
@AutoConfigureMockMvc
class AccountControllerIntegrationTest extends AbstractIntegrationTest {

    @Autowired
    private MockMvc mockMvc;
    @Autowired
    private AccountRepository accountRepository;
    @Autowired
    private PasswordEncoder passwordEncoder;
    @Autowired
    private JwtTokenProvider jwtTokenProvider;

    @Test
    void meWithoutTokenReturns401() throws Exception {
        mockMvc.perform(get("/api/account/me"))
            .andExpect(status().isUnauthorized())
            .andExpect(jsonPath("$.code").value("UNAUTHORIZED"));
    }

    @Test
    void meWithValidTokenReturns200() throws Exception {
        Account account = accountRepository.save(
            new Account("me@example.com", passwordEncoder.encode("password123"), "닉네임"));
        String token = jwtTokenProvider.generateToken(account.getId());

        mockMvc.perform(get("/api/account/me").header("Authorization", "Bearer " + token))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.email").value("me@example.com"));
    }
}
