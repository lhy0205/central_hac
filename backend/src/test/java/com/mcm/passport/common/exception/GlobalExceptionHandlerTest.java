package com.mcm.passport.common.exception;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@RestController
class TestController {
    @GetMapping("/api/test/boom")
    public void boom() {
        throw new ApiException(ErrorCode.PASSPORT_NOT_FOUND);
    }

    @GetMapping("/api/test/unexpected-boom")
    public void unexpectedBoom() {
        throw new IllegalStateException("something unmapped broke");
    }

    @GetMapping("/api/test/type-mismatch")
    public void typeMismatch(@RequestParam com.mcm.passport.diagnosis.DiagnosisType value) {
    }

    @GetMapping("/api/test/missing-param")
    public void missingParam(@RequestParam String value) {
    }

    @PostMapping(value = "/api/test/missing-part", consumes = "multipart/form-data")
    public void missingPart(@RequestPart("file") MultipartFile file) {
    }

    @PostMapping("/api/test/bad-body")
    public void badBody(@org.springframework.web.bind.annotation.RequestBody TestBody body) {
    }

    record TestBody(com.mcm.passport.diagnosis.DiagnosisType type) {
    }
}

// addFilters = false: no SecurityConfig bean exists yet at this scaffolding stage, so
// Spring Security's default auto-config would otherwise secure every endpoint (401).
// A later task wires up SecurityConfig and permits /api/test/** explicitly.
@WebMvcTest(controllers = TestController.class)
@AutoConfigureMockMvc(addFilters = false)
@Import(GlobalExceptionHandler.class)
class GlobalExceptionHandlerTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void apiExceptionMapsToErrorResponse() throws Exception {
        mockMvc.perform(get("/api/test/boom"))
            .andExpect(status().isNotFound())
            .andExpect(jsonPath("$.code").value("PASSPORT_NOT_FOUND"))
            .andExpect(jsonPath("$.message").value("여권을 찾을 수 없습니다."));
    }

    @Test
    void unhandledExceptionMapsToInternalErrorResponse() throws Exception {
        mockMvc.perform(get("/api/test/unexpected-boom"))
            .andExpect(status().isInternalServerError())
            .andExpect(jsonPath("$.code").value("INTERNAL_ERROR"))
            .andExpect(jsonPath("$.message").value("서버 오류가 발생했습니다."));
    }

    @Test
    void typeMismatchMapsToValidationErrorInsteadOfInternalError() throws Exception {
        mockMvc.perform(get("/api/test/type-mismatch").param("value", "NOT_A_REAL_ENUM_VALUE"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
            .andExpect(jsonPath("$.message").exists());
    }

    @Test
    void missingRequestParameterMapsToValidationErrorInsteadOfInternalError() throws Exception {
        mockMvc.perform(get("/api/test/missing-param"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
            .andExpect(jsonPath("$.message").exists());
    }

    @Test
    void missingRequestPartMapsToValidationErrorInsteadOfInternalError() throws Exception {
        mockMvc.perform(multipart("/api/test/missing-part"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
            .andExpect(jsonPath("$.message").exists());
    }

    @Test
    void invalidEnumLiteralInRequestBodyMapsToValidationErrorInsteadOfInternalError() throws Exception {
        mockMvc.perform(post("/api/test/bad-body")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"type\":\"NOT_A_REAL_ENUM_VALUE\"}"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
            .andExpect(jsonPath("$.message").exists());
    }

    @Test
    void malformedJsonMapsToValidationErrorInsteadOfInternalError() throws Exception {
        mockMvc.perform(post("/api/test/bad-body")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{not valid json"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
            .andExpect(jsonPath("$.message").exists());
    }
}
