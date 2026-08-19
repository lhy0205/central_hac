package com.mcm.passport.diagnosis;

import com.mcm.passport.common.security.CurrentAccount;
import com.mcm.passport.diagnosis.dto.DiagnosisResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

@RestController
@RequiredArgsConstructor
public class DiagnosisController {

    private final DiagnosisService diagnosisService;

    @PostMapping(value = "/api/passports/{passportId}/diagnoses", consumes = "multipart/form-data")
    public ResponseEntity<DiagnosisResponse> submit(
            Authentication authentication, @PathVariable Long passportId,
            @RequestParam("diagnosisType") DiagnosisType diagnosisType,
            @RequestPart("images") List<MultipartFile> images) {
        DiagnosisResponse response = diagnosisService.submit(
            passportId, CurrentAccount.id(authentication), diagnosisType, images);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @GetMapping("/api/passports/{passportId}/diagnoses")
    public ResponseEntity<org.springframework.data.domain.Page<DiagnosisResponse>> list(
            Authentication authentication, @PathVariable Long passportId,
            @org.springframework.data.web.PageableDefault(size = 20) org.springframework.data.domain.Pageable pageable) {
        return ResponseEntity.ok(diagnosisService.list(passportId, CurrentAccount.id(authentication), pageable));
    }

    @GetMapping("/api/diagnoses/{diagnosisId}")
    public ResponseEntity<DiagnosisResponse> getDetail(Authentication authentication, @PathVariable Long diagnosisId) {
        return ResponseEntity.ok(diagnosisService.getDetail(diagnosisId, CurrentAccount.id(authentication)));
    }
}
