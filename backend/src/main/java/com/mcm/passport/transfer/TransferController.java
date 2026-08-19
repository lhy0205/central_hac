package com.mcm.passport.transfer;

import com.mcm.passport.common.security.CurrentAccount;
import com.mcm.passport.transfer.dto.TransferCodeResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
public class TransferController {

    private final TransferService transferService;

    @PostMapping("/api/passports/{passportId}/transfer-code")
    public ResponseEntity<TransferCodeResponse> issueCode(
            Authentication authentication, @PathVariable Long passportId) {
        return ResponseEntity.ok(transferService.issueCode(passportId, CurrentAccount.id(authentication)));
    }

    @GetMapping("/api/passports/transfer/{code}/preview")
    public ResponseEntity<com.mcm.passport.transfer.dto.TransferPreviewResponse> preview(
            Authentication authentication, @PathVariable String code) {
        return ResponseEntity.ok(transferService.preview(code, CurrentAccount.id(authentication)));
    }

    @PostMapping("/api/passports/transfer/redeem")
    public ResponseEntity<com.mcm.passport.passport.dto.PassportResponse> redeem(
            Authentication authentication,
            @org.springframework.web.bind.annotation.RequestBody @jakarta.validation.Valid
            com.mcm.passport.transfer.dto.RedeemTransferRequest request) {
        return ResponseEntity.ok(transferService.redeem(request.code(), CurrentAccount.id(authentication)));
    }
}
