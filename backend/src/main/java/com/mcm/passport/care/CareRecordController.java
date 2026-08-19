package com.mcm.passport.care;

import com.mcm.passport.care.dto.CareRecordResponse;
import com.mcm.passport.care.dto.CreateCareRecordRequest;
import com.mcm.passport.common.security.CurrentAccount;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequiredArgsConstructor
public class CareRecordController {

    private final CareRecordService careRecordService;

    @PostMapping(value = "/api/passports/{passportId}/care-records", consumes = "multipart/form-data")
    public ResponseEntity<CareRecordResponse> create(
            Authentication authentication, @PathVariable Long passportId,
            @RequestPart("request") @Valid CreateCareRecordRequest request,
            @RequestPart(value = "image", required = false) MultipartFile image) {
        CareRecordResponse response = careRecordService.create(
            passportId, CurrentAccount.id(authentication), request, image);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @GetMapping("/api/passports/{passportId}/care-records")
    public ResponseEntity<Page<CareRecordResponse>> list(
            Authentication authentication, @PathVariable Long passportId,
            @PageableDefault(size = 20) Pageable pageable) {
        return ResponseEntity.ok(
            careRecordService.list(passportId, CurrentAccount.id(authentication), pageable));
    }

    @GetMapping("/api/care-records/{id}")
    public ResponseEntity<CareRecordResponse> getDetail(Authentication authentication, @PathVariable Long id) {
        return ResponseEntity.ok(careRecordService.getDetail(id, CurrentAccount.id(authentication)));
    }
}
