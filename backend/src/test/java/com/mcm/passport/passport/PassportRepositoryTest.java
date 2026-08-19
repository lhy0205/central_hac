package com.mcm.passport.passport;

import com.mcm.passport.account.Account;
import com.mcm.passport.account.AccountRepository;
import com.mcm.passport.support.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;

import java.time.LocalDate;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class PassportRepositoryTest extends AbstractIntegrationTest {

    @Autowired
    private PassportRepository passportRepository;
    @Autowired
    private AccountRepository accountRepository;

    @Test
    void duplicateActiveSerialAndYearIsRejectedByDbConstraint() {
        Account owner = accountRepository.save(new Account("a@example.com", "hash", "닉네임"));
        passportRepository.saveAndFlush(newPassport(owner.getId(), "A1234", 2024));

        assertThatThrownBy(() ->
            passportRepository.saveAndFlush(newPassport(owner.getId(), "A1234", 2024)))
            .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void duplicateActiveSerialDifferingOnlyByCaseIsRejectedByDbConstraint() {
        // 앱 레벨 정규화(PassportService.register())를 우회하는 경로
        // (예: 이 테스트처럼 리포지토리를 직접 쓰는 경우)에서도 대소문자만 다른 시리얼은 같은
        // 실물 가방으로 취급돼야 한다 — V13 마이그레이션이 인덱스 자체를 UPPER(serial_number)
        // 기준으로 걸었으므로 앱 레벨 정규화 없이도 DB가 막아야 한다.
        Account owner = accountRepository.save(new Account("d@example.com", "hash", "닉네임"));
        passportRepository.saveAndFlush(newPassport(owner.getId(), "d3333", 2022));

        assertThatThrownBy(() ->
            passportRepository.saveAndFlush(newPassport(owner.getId(), "D3333", 2022)))
            .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void sameSerialAndYearAllowedAfterSoftDelete() {
        Account owner = accountRepository.save(new Account("b@example.com", "hash", "닉네임"));
        Passport first = passportRepository.saveAndFlush(newPassport(owner.getId(), "B1111", 2020));
        first.softDelete();
        passportRepository.saveAndFlush(first);

        Passport second = passportRepository.saveAndFlush(newPassport(owner.getId(), "B1111", 2020));

        assertThat(second.getId()).isNotEqualTo(first.getId());
    }

    @Test
    void existsBySerialAndYearAndStatusDetectsActiveDuplicate() {
        Account owner = accountRepository.save(new Account("c@example.com", "hash", "닉네임"));
        passportRepository.save(newPassport(owner.getId(), "C2222", 2021));

        assertThat(passportRepository.existsBySerialNumberAndPurchaseYearAndStatus(
            "C2222", 2021, PassportStatus.ACTIVE)).isTrue();
    }

    private Passport newPassport(Long ownerId, String serial, int year) {
        return new Passport(serial, year, ownerId, "Nomad Backpack", "애칭",
            LocalDate.of(year, 1, 15), "MCM 강남점", null, false,
            List.of(), UsageFrequency.OCCASIONAL);
    }
}
