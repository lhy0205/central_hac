package com.mcm.passport.common;

import com.mcm.passport.support.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// Deliberately NOT addFilters = false: this test boots the real Spring Security
// SecurityFilterChain (SecurityConfig) via the full application context, verifying
// end-to-end that /api/health is actually reachable without an Authorization header.
// HealthControllerTest covers the @WebMvcTest slice with addFilters = false, which
// bypasses the filter chain entirely and cannot verify permitAll() behavior.
// SecurityConfig가 생긴 뒤 추가한 검증이다.
@AutoConfigureMockMvc
class HealthEndpointSecurityTest extends AbstractIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void healthIsAccessibleWithoutAuthentication() throws Exception {
        mockMvc.perform(get("/api/health"))
            .andExpect(status().isOk())
            .andExpect(content().json("{\"status\":\"UP\"}"));
    }
}
