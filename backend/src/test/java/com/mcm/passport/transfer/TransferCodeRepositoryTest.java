package com.mcm.passport.transfer;

import com.mcm.passport.account.Account;
import com.mcm.passport.account.AccountRepository;
import com.mcm.passport.passport.Passport;
import com.mcm.passport.passport.PassportRepository;
import com.mcm.passport.passport.UsageFrequency;
import com.mcm.passport.support.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class TransferCodeRepositoryTest extends AbstractIntegrationTest {

    @Autowired private TransferCodeRepository transferCodeRepository;
    @Autowired private PassportRepository passportRepository;
    @Autowired private AccountRepository accountRepository;

    @Test
    void savesAndFindsByCode() {
        Account owner = accountRepository.save(new Account("owner@test.com", "hash", "닉네임"));
        Passport passport = passportRepository.save(new Passport("A1234", 2024, owner.getId(),
            "Nomad Backpack", "애칭", LocalDate.of(2024, 1, 1), "MCM 강남점", null, false,
            List.of(), UsageFrequency.DAILY));
        transferCodeRepository.save(new TransferCode(
            passport.getId(), "AB12CD", owner.getId(), LocalDateTime.now().plusDays(7)));

        var found = transferCodeRepository.findByCode("AB12CD");

        assertThat(found).isPresent();
        assertThat(found.get().getStatus()).isEqualTo(TransferStatus.ISSUED);
        List<TransferCode> issued = transferCodeRepository.findAllByPassportIdAndStatus(
            passport.getId(), TransferStatus.ISSUED);
        assertThat(issued).hasSize(1);
    }
}
