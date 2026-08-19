package com.mcm.passport.diagnosis;

import com.mcm.passport.account.Account;
import com.mcm.passport.account.AccountRepository;
import com.mcm.passport.passport.Passport;
import com.mcm.passport.passport.PassportRepository;
import com.mcm.passport.passport.UsageFrequency;
import com.mcm.passport.support.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class DiagnosisRepositoryTest extends AbstractIntegrationTest {

    @Autowired
    private DiagnosisRepository diagnosisRepository;
    @Autowired
    private PassportRepository passportRepository;
    @Autowired
    private AccountRepository accountRepository;

    @Test
    void savesAndFindsLatestByPassportId() {
        Account owner = accountRepository.save(new Account("a@example.com", "hash", "닉네임"));
        Passport passport = passportRepository.save(new Passport("A1234", 2024, owner.getId(), "Nomad Backpack", "애칭",
            LocalDate.of(2024, 1, 15), "MCM 강남점", null, false, List.of(), UsageFrequency.OCCASIONAL));

        diagnosisRepository.save(new Diagnosis(passport.getId(), DiagnosisType.SELF, List.of("https://cdn/1.jpg"),
            Map.of("마모", 20), OverallGrade.A, "첫 진단"));
        Diagnosis latest = diagnosisRepository.save(new Diagnosis(passport.getId(), DiagnosisType.SELF,
            List.of("https://cdn/2.jpg"), Map.of("마모", 45), OverallGrade.C, "두번째 진단"));

        var found = diagnosisRepository.findFirstByPassportIdOrderByDiagnosedAtDescIdDesc(passport.getId());

        assertThat(found).isPresent();
        assertThat(found.get().getId()).isEqualTo(latest.getId());
        assertThat(found.get().getItemScores()).containsEntry("마모", 45);
    }
}
