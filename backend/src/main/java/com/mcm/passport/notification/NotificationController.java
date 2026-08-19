package com.mcm.passport.notification;

import com.mcm.passport.common.security.CurrentAccount;
import com.mcm.passport.notification.dto.NotificationResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@RestController
@RequiredArgsConstructor
public class NotificationController {

    private final NotificationService notificationService;

    @GetMapping("/api/passports/{passportId}/notifications")
    public ResponseEntity<Page<NotificationResponse>> list(
            Authentication authentication, @PathVariable Long passportId,
            @PageableDefault(size = 20) Pageable pageable) {
        return ResponseEntity.ok(
            notificationService.list(passportId, CurrentAccount.id(authentication), pageable));
    }

    @PatchMapping("/api/notifications/{id}/read")
    public ResponseEntity<Void> markRead(Authentication authentication, @PathVariable Long id) {
        notificationService.markRead(id, CurrentAccount.id(authentication));
        return ResponseEntity.noContent().build();
    }

    @PatchMapping("/api/notifications/{id}/dismiss")
    public ResponseEntity<Void> markDismiss(Authentication authentication, @PathVariable Long id) {
        notificationService.markDismiss(id, CurrentAccount.id(authentication));
        return ResponseEntity.noContent().build();
    }
}
