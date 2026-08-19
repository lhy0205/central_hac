package com.mcm.passport.account;

import com.mcm.passport.support.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class AccountRepositoryTest extends AbstractIntegrationTest {

    @Autowired
    private AccountRepository accountRepository;

    @Test
    void savesAndFindsByEmail() {
        Account account = new Account("user@example.com", "hashed-pw", "닉네임");

        accountRepository.save(account);

        assertThat(accountRepository.existsByEmailAndStatus("user@example.com", AccountStatus.ACTIVE)).isTrue();
        assertThat(accountRepository.findByEmailAndStatus("user@example.com", AccountStatus.ACTIVE))
            .isPresent()
            .get()
            .extracting(Account::getNickname)
            .isEqualTo("닉네임");
    }

    @Test
    void findByEmailReturnsEmptyWhenNotFound() {
        assertThat(accountRepository.findByEmailAndStatus("nobody@example.com", AccountStatus.ACTIVE)).isEmpty();
    }

    @Test
    void allowsReSignupWithSameEmailAfterWithdrawal() {
        // V8 마이그레이션: 유니크 인덱스가 ACTIVE로만 스코프되어 있어, 탈퇴한 계정과 같은 이메일로
        // 새 계정을 만들 수 있어야 한다.
        Account withdrawn = accountRepository.save(new Account("reuse@example.com", "hash", "이전"));
        withdrawn.withdraw(LocalDateTime.now());
        accountRepository.saveAndFlush(withdrawn);

        Account rejoined = accountRepository.saveAndFlush(new Account("reuse@example.com", "hash2", "새로"));

        assertThat(accountRepository.existsByEmailAndStatus("reuse@example.com", AccountStatus.ACTIVE)).isTrue();
        assertThat(accountRepository.findByEmailAndStatus("reuse@example.com", AccountStatus.ACTIVE))
            .isPresent()
            .get()
            .extracting(Account::getId)
            .isEqualTo(rejoined.getId());
    }

    @Test
    void rejectsTwoActiveAccountsWithSameEmail() {
        accountRepository.saveAndFlush(new Account("dup@example.com", "hash", "닉네임"));

        assertThatThrownBy(() -> accountRepository.saveAndFlush(new Account("dup@example.com", "hash2", "닉네임2")))
            .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void rejectsTwoActiveAccountsWithEmailDifferingOnlyByCase() {
        // 앱 레벨 정규화(AccountService)를 우회하는 경로에서도 대소문자만
        // 다른 이메일은 같은 사용자로 취급돼야 한다 — V14 마이그레이션이 인덱스 자체를 LOWER(email)
        // 기준으로 걸었으므로 앱 레벨 정규화 없이도 DB가 막아야 한다.
        accountRepository.saveAndFlush(new Account("case@example.com", "hash", "닉네임"));

        assertThatThrownBy(() -> accountRepository.saveAndFlush(new Account("Case@Example.com", "hash2", "닉네임2")))
            .isInstanceOf(DataIntegrityViolationException.class);
    }
}
