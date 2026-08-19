package com.mcm.passport.account;

import com.mcm.passport.account.dto.ConfirmPasswordResetRequest;
import com.mcm.passport.common.exception.ApiException;
import com.mcm.passport.common.exception.ErrorCode;
import com.mcm.passport.passport.Passport;
import com.mcm.passport.passport.PassportRepository;
import com.mcm.passport.passport.PassportStatus;
import com.mcm.passport.passport.UsageFrequency;
import com.mcm.passport.support.AbstractIntegrationTest;
import com.mcm.passport.transfer.TransferCode;
import com.mcm.passport.transfer.TransferCodeRepository;
import com.mcm.passport.transfer.TransferService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;

// findByToken은 잠금이 없어서 같은 토큰에 대한 동시 요청 둘 다 isUsable() 체크를 통과해버릴 수 있다.
// findByTokenForUpdate(PESSIMISTIC_WRITE)로 잠가야 두 번째 트랜잭션이 첫 번째 커밋을 기다렸다가
// usedAt이 채워진 걸 보고 제대로 거부된다. 행 잠금 순서는 Mockito로는 검증이 안 되니
// Testcontainers + 스레드 두 개로 직접 확인.
class AccountServiceIntegrationTest extends AbstractIntegrationTest {

    @Autowired
    private AccountService accountService;
    @Autowired
    private AccountRepository accountRepository;
    @Autowired
    private PasswordResetTokenRepository passwordResetTokenRepository;
    @Autowired
    private PasswordEncoder passwordEncoder;
    @Autowired
    private PassportRepository passportRepository;
    @Autowired
    private TransferCodeRepository transferCodeRepository;
    @Autowired
    private TransferService transferService;

    @Test
    void confirmPasswordResetUnderConcurrentRequestsOnlyOneSucceeds() throws Exception {
        Account account = accountRepository.save(
            new Account("reset-race@example.com", passwordEncoder.encode("old-password"), "닉네임"));
        // DB에는 원문이 아니라 해시만 저장되므로, confirmPasswordReset()에
        // "RACE-TOKEN"(원문)을 넘기려면 여기 픽스처도 그 해시로 저장해야 한다.
        passwordResetTokenRepository.save(
            new PasswordResetToken(account.getId(), AccountService.hashToken("RACE-TOKEN"), LocalDateTime.now().plusMinutes(30)));

        ExecutorService executor = Executors.newFixedThreadPool(2);
        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch start = new CountDownLatch(1);
        AtomicInteger successCount = new AtomicInteger();
        AtomicInteger conflictCount = new AtomicInteger();
        try {
            List<java.util.concurrent.Future<?>> futures = List.of(
                executor.submit(() -> confirmAndClassify("new-password-A", ready, start, successCount, conflictCount)),
                executor.submit(() -> confirmAndClassify("new-password-B", ready, start, successCount, conflictCount)));
            ready.await(5, TimeUnit.SECONDS);
            start.countDown();
            for (java.util.concurrent.Future<?> future : futures) {
                future.get(10, TimeUnit.SECONDS);
            }
        } finally {
            executor.shutdown();
        }

        assertThat(successCount.get()).isEqualTo(1);
        assertThat(conflictCount.get()).isEqualTo(1);
        Account reloaded = accountRepository.findById(account.getId()).orElseThrow();
        boolean matchesA = passwordEncoder.matches("new-password-A", reloaded.getPasswordHash());
        boolean matchesB = passwordEncoder.matches("new-password-B", reloaded.getPasswordHash());
        assertThat(matchesA ^ matchesB).isTrue(); // 둘 중 정확히 하나만 반영되어야 한다
    }

    // withdraw()가 소유 여권을 잠금 없이 읽고 지우면, 그 사이 redeem()이 소유권을 옮겨도 모르고
    // 새 주인의 여권을 조용히 삭제해버릴 수 있다. findByIdAndStatusForUpdate로 재조회 + 소유권
    // 재확인하게 고치면, 먼저 잠금을 얻어 커밋한 쪽이 이기고 나머지는 최신 상태를 보고 정상 처리된다.
    // 행 잠금 순서는 Mockito로는 못 잡아서 Testcontainers + 스레드 두 개로 확인.
    @Test
    void withdrawAndRedeemDoNotRaceOnTheSamePassport() throws Exception {
        Account owner = accountRepository.save(
            new Account("withdraw-race-owner@example.com", passwordEncoder.encode("password123"), "닉네임"));
        Account redeemer = accountRepository.save(
            new Account("withdraw-race-redeemer@example.com", passwordEncoder.encode("password123"), "수신자"));
        Passport passport = passportRepository.save(new Passport("WRACE1", 2024, owner.getId(), "Nomad Backpack",
            "애칭", LocalDate.of(2024, 1, 15), "MCM 강남점", null, false, List.of(), UsageFrequency.OCCASIONAL));
        transferCodeRepository.save(
            new TransferCode(passport.getId(), "WRACE1", owner.getId(), LocalDateTime.now().plusDays(7)));

        ExecutorService executor = Executors.newFixedThreadPool(2);
        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch start = new CountDownLatch(1);
        AtomicInteger redeemSucceeded = new AtomicInteger();
        AtomicInteger redeemRejected = new AtomicInteger();
        try {
            List<java.util.concurrent.Future<?>> futures = List.of(
                executor.submit(() -> {
                    ready.countDown();
                    awaitStart(start);
                    accountService.withdraw(owner.getId());
                }),
                executor.submit(() -> {
                    ready.countDown();
                    awaitStart(start);
                    try {
                        transferService.redeem("WRACE1", redeemer.getId());
                        redeemSucceeded.incrementAndGet();
                    } catch (ApiException e) {
                        if (e.getErrorCode() == ErrorCode.PASSPORT_NOT_FOUND) {
                            redeemRejected.incrementAndGet();
                        } else {
                            throw e;
                        }
                    }
                }));
            ready.await(5, TimeUnit.SECONDS);
            start.countDown();
            for (java.util.concurrent.Future<?> future : futures) {
                future.get(10, TimeUnit.SECONDS);
            }
        } finally {
            executor.shutdown();
        }

        Passport reloaded = passportRepository.findById(passport.getId()).orElseThrow();
        if (redeemSucceeded.get() == 1) {
            // redeem이 이겼다: 새 소유자 것으로 ACTIVE 유지, withdraw는 이 여권을 건드리면 안 된다.
            assertThat(redeemRejected.get()).isZero();
            assertThat(reloaded.getStatus()).isEqualTo(PassportStatus.ACTIVE);
            assertThat(reloaded.getOwnerAccountId()).isEqualTo(redeemer.getId());
        } else {
            // withdraw가 이겼다: 여권은 삭제되고 redeem은 거부되어야 한다.
            assertThat(redeemRejected.get()).isEqualTo(1);
            assertThat(reloaded.getStatus()).isEqualTo(PassportStatus.DELETED);
        }
    }

    // 위 테스트의 반대 방향. withdraw(X)가 소유 여권 스냅샷을 잠금 없이 뜬 뒤 캐스케이드 취소하면,
    // 그 사이 redeem()이 다른 계정(Y) 여권을 X로 넘겨도 몰라서 빠뜨리고, 탈퇴 계정 소유의 ACTIVE
    // 여권이 영구히 남을 수 있다. withdraw()가 Account 행을 잠그고 redeem()도 소유권 이전 직전에
    // 같은 행을 잠그고 재확인하게 고치면, 먼저 커밋한 쪽이 이기고 나머지는 최신 상태를 보고 처리된다.
    @Test
    void withdrawDoesNotLosePassportRedeemedInDuringWithdrawal() throws Exception {
        Account withdrawingAccount = accountRepository.save(
            new Account("reverse-race-withdrawer@example.com", passwordEncoder.encode("password123"), "탈퇴자"));
        Account otherOwner = accountRepository.save(
            new Account("reverse-race-other-owner@example.com", passwordEncoder.encode("password123"), "원소유자"));
        Passport passport = passportRepository.save(new Passport("RRACE1", 2024, otherOwner.getId(), "Nomad Backpack",
            "애칭", LocalDate.of(2024, 1, 15), "MCM 강남점", null, false, List.of(), UsageFrequency.OCCASIONAL));
        transferCodeRepository.save(
            new TransferCode(passport.getId(), "RRACE1", otherOwner.getId(), LocalDateTime.now().plusDays(7)));

        ExecutorService executor = Executors.newFixedThreadPool(2);
        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch start = new CountDownLatch(1);
        AtomicInteger redeemSucceeded = new AtomicInteger();
        AtomicInteger redeemRejected = new AtomicInteger();
        try {
            List<java.util.concurrent.Future<?>> futures = List.of(
                executor.submit(() -> {
                    ready.countDown();
                    awaitStart(start);
                    accountService.withdraw(withdrawingAccount.getId());
                }),
                executor.submit(() -> {
                    ready.countDown();
                    awaitStart(start);
                    try {
                        transferService.redeem("RRACE1", withdrawingAccount.getId());
                        redeemSucceeded.incrementAndGet();
                    } catch (ApiException e) {
                        if (e.getErrorCode() == ErrorCode.ACCOUNT_NOT_FOUND) {
                            redeemRejected.incrementAndGet();
                        } else {
                            throw e;
                        }
                    }
                }));
            ready.await(5, TimeUnit.SECONDS);
            start.countDown();
            for (java.util.concurrent.Future<?> future : futures) {
                future.get(10, TimeUnit.SECONDS);
            }
        } finally {
            executor.shutdown();
        }

        Passport reloaded = passportRepository.findById(passport.getId()).orElseThrow();
        if (redeemSucceeded.get() == 1) {
            // redeem이 이겼다: withdraw 캐스케이드가 이 여권도 새로 잡아서 DELETED 처리해야 한다
            // (탈퇴 계정 소유로 ACTIVE인 채 남으면 안 됨).
            assertThat(redeemRejected.get()).isZero();
            assertThat(reloaded.getOwnerAccountId()).isEqualTo(withdrawingAccount.getId());
            assertThat(reloaded.getStatus()).isEqualTo(PassportStatus.DELETED);
        } else {
            // withdraw가 이겼다: redeem은 거부되고, 여권은 원래 소유자에게 ACTIVE로 남아야 한다.
            assertThat(redeemRejected.get()).isEqualTo(1);
            assertThat(reloaded.getOwnerAccountId()).isEqualTo(otherOwner.getId());
            assertThat(reloaded.getStatus()).isEqualTo(PassportStatus.ACTIVE);
        }
    }

    private void awaitStart(CountDownLatch start) {
        try {
            start.await(5, TimeUnit.SECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new RuntimeException(e);
        }
    }

    private void confirmAndClassify(String newPassword, CountDownLatch ready, CountDownLatch start,
                                     AtomicInteger successCount, AtomicInteger conflictCount) {
        ready.countDown();
        try {
            start.await(5, TimeUnit.SECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new RuntimeException(e);
        }
        try {
            accountService.confirmPasswordReset(new ConfirmPasswordResetRequest("RACE-TOKEN", newPassword));
            successCount.incrementAndGet();
        } catch (ApiException e) {
            if (e.getErrorCode() == ErrorCode.RESET_TOKEN_INVALID) {
                conflictCount.incrementAndGet();
            } else {
                throw e;
            }
        }
    }
}
