package com.mcm.passport.reservation;

import com.mcm.passport.account.Account;
import com.mcm.passport.account.AccountRepository;
import com.mcm.passport.passport.Passport;
import com.mcm.passport.passport.PassportRepository;
import com.mcm.passport.passport.UsageFrequency;
import com.mcm.passport.support.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ReservationRepositoryTest extends AbstractIntegrationTest {

    @Autowired private ReservationRepository reservationRepository;
    @Autowired private PassportRepository passportRepository;
    @Autowired private AccountRepository accountRepository;

    @Test
    void doubleBookingSameStoreAndSlotIsRejectedByDbConstraint() {
        Long passportId = newPassport("res-a@example.com", "A1234");
        LocalDateTime slot = LocalDateTime.of(2026, 9, 1, 14, 0);
        reservationRepository.saveAndFlush(
            new Reservation(passportId, 1L, slot, List.of(CareRequestItemType.LEATHER_CLEANING.name())));

        assertThatThrownBy(() -> reservationRepository.saveAndFlush(
                new Reservation(passportId, 1L, slot, List.of(CareRequestItemType.OTHER.name()))))
            .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void sameSlotAllowedAfterCancellation() {
        Long passportId = newPassport("res-b@example.com", "B1111");
        LocalDateTime slot = LocalDateTime.of(2026, 9, 1, 15, 0);
        Reservation first = reservationRepository.saveAndFlush(
            new Reservation(passportId, 1L, slot, List.of(CareRequestItemType.OTHER.name())));
        first.cancel();
        reservationRepository.saveAndFlush(first);

        Reservation second = reservationRepository.saveAndFlush(
            new Reservation(passportId, 1L, slot, List.of(CareRequestItemType.OTHER.name())));

        assertThat(second.getId()).isNotEqualTo(first.getId());
    }

    @Test
    void cancelAllRequestedForPassportOnlyTouchesRequestedRows() {
        Long passportId = newPassport("res-c@example.com", "C2222");
        Reservation requested = reservationRepository.saveAndFlush(new Reservation(
            passportId, 1L, LocalDateTime.of(2026, 9, 2, 10, 0), List.of(CareRequestItemType.OTHER.name())));
        Reservation alreadyCancelled = reservationRepository.saveAndFlush(new Reservation(
            passportId, 1L, LocalDateTime.of(2026, 9, 2, 11, 0), List.of(CareRequestItemType.OTHER.name())));
        alreadyCancelled.cancel();
        reservationRepository.saveAndFlush(alreadyCancelled);

        reservationRepository.cancelAllRequestedForPassport(passportId);
        reservationRepository.flush();

        Reservation reloaded = reservationRepository.findById(requested.getId()).orElseThrow();
        assertThat(reloaded.getStatus()).isEqualTo(ReservationStatus.CANCELLED);
    }

    private Long newPassport(String email, String serial) {
        Account account = accountRepository.save(new Account(email, "hash", "닉네임"));
        Passport passport = passportRepository.save(new Passport(serial, 2024, account.getId(),
            "Nomad Backpack", "애칭", LocalDate.of(2024, 1, 1), "MCM 강남점", null, false,
            List.of(), UsageFrequency.OCCASIONAL));
        return passport.getId();
    }
}
