package com.mcm.passport.reservation;

import com.mcm.passport.common.security.CurrentAccount;
import com.mcm.passport.reservation.dto.CreateReservationRequest;
import com.mcm.passport.reservation.dto.ReservationResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

@RestController
@RequiredArgsConstructor
public class ReservationController {

    private final ReservationService reservationService;

    @PostMapping("/api/passports/{passportId}/reservations")
    public ResponseEntity<ReservationResponse> create(
            Authentication authentication, @PathVariable Long passportId,
            @Valid @RequestBody CreateReservationRequest request) {
        ReservationResponse response = reservationService.create(
            passportId, CurrentAccount.id(authentication), request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @GetMapping("/api/passports/{passportId}/reservations")
    public ResponseEntity<Page<ReservationResponse>> list(
            Authentication authentication, @PathVariable Long passportId,
            @PageableDefault(size = 20) Pageable pageable) {
        return ResponseEntity.ok(
            reservationService.list(passportId, CurrentAccount.id(authentication), pageable));
    }

    @GetMapping("/api/reservations/{id}")
    public ResponseEntity<ReservationResponse> getDetail(Authentication authentication, @PathVariable Long id) {
        return ResponseEntity.ok(reservationService.getDetail(id, CurrentAccount.id(authentication)));
    }

    @PatchMapping("/api/reservations/{id}/cancel")
    public ResponseEntity<Void> cancel(Authentication authentication, @PathVariable Long id) {
        reservationService.cancel(id, CurrentAccount.id(authentication));
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/api/stores/{storeId}/available-slots")
    public ResponseEntity<List<LocalDateTime>> getAvailableSlots(
            @PathVariable Long storeId,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        return ResponseEntity.ok(reservationService.getAvailableSlots(storeId, date));
    }
}
