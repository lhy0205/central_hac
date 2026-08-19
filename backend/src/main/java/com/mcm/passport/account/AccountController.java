package com.mcm.passport.account;

import com.mcm.passport.account.dto.AccountResponse;
import com.mcm.passport.account.dto.ConfirmPasswordResetRequest;
import com.mcm.passport.account.dto.LoginRequest;
import com.mcm.passport.account.dto.LoginResponse;
import com.mcm.passport.account.dto.PasswordResetRequest;
import com.mcm.passport.account.dto.SignupRequest;
import com.mcm.passport.account.dto.UpdateProfileRequest;
import com.mcm.passport.common.security.CurrentAccount;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
public class AccountController {

    private final AccountService accountService;

    @PostMapping("/auth/signup")
    public ResponseEntity<AccountResponse> signup(@Valid @RequestBody SignupRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(accountService.signup(request));
    }

    @PostMapping("/auth/login")
    public ResponseEntity<LoginResponse> login(@Valid @RequestBody LoginRequest request) {
        return ResponseEntity.ok(accountService.login(request));
    }

    @GetMapping("/account/me")
    public ResponseEntity<AccountResponse> getMe(Authentication authentication) {
        return ResponseEntity.ok(accountService.getMe(CurrentAccount.id(authentication)));
    }

    @PatchMapping("/account/me")
    public ResponseEntity<AccountResponse> updateMe(
            Authentication authentication, @Valid @RequestBody UpdateProfileRequest request) {
        return ResponseEntity.ok(accountService.updateProfile(CurrentAccount.id(authentication), request));
    }

    @PatchMapping("/account/me/password")
    public ResponseEntity<Void> changePassword(
            Authentication authentication, @Valid @RequestBody com.mcm.passport.account.dto.ChangePasswordRequest request) {
        accountService.changePassword(CurrentAccount.id(authentication), request);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/account/me/notification-preferences")
    public ResponseEntity<com.mcm.passport.account.dto.NotificationPreferencesResponse> getNotificationPreferences(
            Authentication authentication) {
        return ResponseEntity.ok(accountService.getNotificationPreferences(CurrentAccount.id(authentication)));
    }

    @PatchMapping("/account/me/notification-preferences")
    public ResponseEntity<com.mcm.passport.account.dto.NotificationPreferencesResponse> updateNotificationPreferences(
            Authentication authentication,
            @Valid @RequestBody com.mcm.passport.account.dto.UpdateNotificationPreferencesRequest request) {
        return ResponseEntity.ok(
            accountService.updateNotificationPreferences(CurrentAccount.id(authentication), request));
    }

    @PostMapping("/auth/password-reset")
    public ResponseEntity<Void> requestPasswordReset(@Valid @RequestBody PasswordResetRequest request) {
        accountService.requestPasswordReset(request.email());
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/auth/password-reset/confirm")
    public ResponseEntity<Void> confirmPasswordReset(@Valid @RequestBody ConfirmPasswordResetRequest request) {
        accountService.confirmPasswordReset(request);
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/account/me")
    public ResponseEntity<Void> withdraw(Authentication authentication) {
        accountService.withdraw(CurrentAccount.id(authentication));
        return ResponseEntity.noContent().build();
    }
}
