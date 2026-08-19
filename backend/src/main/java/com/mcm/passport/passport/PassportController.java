package com.mcm.passport.passport;

import com.mcm.passport.common.security.CurrentAccount;
import com.mcm.passport.passport.dto.PassportResponse;
import com.mcm.passport.passport.dto.RegisterPassportRequest;
import com.mcm.passport.passport.dto.UpdatePassportRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

@RestController
@RequestMapping("/api/passports")
@RequiredArgsConstructor
public class PassportController {

    private final PassportService passportService;

    @PostMapping(consumes = "multipart/form-data")
    public ResponseEntity<PassportResponse> register(
            Authentication authentication,
            @RequestPart("request") @Valid RegisterPassportRequest request,
            @RequestPart(value = "receiptImage", required = false) MultipartFile receiptImage,
            @RequestPart(value = "baselineImages", required = false) List<MultipartFile> baselineImages) {
        List<MultipartFile> images = baselineImages != null ? baselineImages : List.of();
        PassportResponse response = passportService.register(
            CurrentAccount.id(authentication), request, receiptImage, images);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @GetMapping
    public ResponseEntity<org.springframework.data.domain.Page<com.mcm.passport.passport.dto.PassportSummaryResponse>> list(
            Authentication authentication,
            @org.springframework.data.web.PageableDefault(size = 20) org.springframework.data.domain.Pageable pageable) {
        return ResponseEntity.ok(passportService.list(CurrentAccount.id(authentication), pageable));
    }

    @GetMapping("/{id}")
    public ResponseEntity<PassportResponse> getDetail(Authentication authentication, @PathVariable Long id) {
        return ResponseEntity.ok(passportService.getDetail(id, CurrentAccount.id(authentication)));
    }

    @PatchMapping("/{id}")
    public ResponseEntity<PassportResponse> update(
            Authentication authentication, @PathVariable Long id,
            @RequestBody @Valid UpdatePassportRequest request) {
        return ResponseEntity.ok(passportService.update(id, CurrentAccount.id(authentication), request));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(Authentication authentication, @PathVariable Long id) {
        passportService.delete(id, CurrentAccount.id(authentication));
        return ResponseEntity.noContent().build();
    }
}
