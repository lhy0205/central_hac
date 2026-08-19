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

// 회귀 방지 테스트: confirmPasswordReset()이 findByToken(잠금 없음)으로 토큰을 조회하면, 같은
// 토큰에 대한 동시 요청 둘 다 isUsable() 체크를 통과해버려서 토큰의 1회용 불변식이 깨지고 비밀번호가
// 두 번(서로 다른 값으로) 바뀔 수 있다. findByTokenForUpdate(PESSIMISTIC_WRITE)로 바꾸면 두 번째
// 트랜잭션이 첫 번째가 커밋할 때까지 블록되고, 커밋 후 usedAt이 채워진 상태를 다시 읽어 정상적으로
// 거부된다. Mockito 단위 테스트로는 실제 행 잠금/트랜잭션 순서를 검증할 수 없으므로 실제 DB
// (Testcontainers)와 스레드 두 개로 확인한다.
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

    // 회귀 방지 테스트: withdraw()가 소유 여권을 잠금 없이 읽고 그대로 softDelete하면, redeem()이
    // 먼저 소유권을 다른 계정으로 옮기고 커밋해도 withdraw()는 그 사실을 모른 채 id 기준으로 그대로
    // DELETED 처리해버려서 새 소유자의 여권이 조용히 사라진다. findByIdAndStatusForUpdate로 재조회 +
    // 소유권 재확인하도록 고친 뒤에는, 잠금을 먼저 얻어 커밋한 쪽이 이기고 나머지는 최신 상태를
    // 반영해 올바르게 동작해야 한다(redeem이 이겼다면 여권이 그대로 ACTIVE로 남아야 하고, withdraw가
    // 이겼다면 redeem은 PASSPORT_NOT_FOUND로 거부되어야 한다). 실제 행 잠금/트랜잭션 순서는
    // Mockito로 검증할 수 없으므로 실제 DB(Testcontainers)와 스레드 두 개로 확인한다.
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
            // redeem이 이겼다: 새 소유자 소유로 여전히 ACTIVE여야 하고, withdraw는 이 여권을
            // 건드리지 않았어야 한다 (조용히 사라지면 안 됨).
            assertThat(redeemRejected.get()).isZero();
            assertThat(reloaded.getStatus()).isEqualTo(PassportStatus.ACTIVE);
            assertThat(reloaded.getOwnerAccountId()).isEqualTo(redeemer.getId());
        } else {
            // withdraw가 이겼다: 여권은 삭제되고, redeem은 정상적으로 거부되어야 한다.
            assertThat(redeemRejected.get()).isEqualTo(1);
            assertThat(reloaded.getStatus()).isEqualTo(PassportStatus.DELETED);
        }
    }

    // 회귀 방지 테스트: withdrawAndRedeemDoNotRaceOnTheSamePassport()의 반대 방향. withdraw(X)가
    // 소유 여권 스냅샷을 잠금 없이 뜬 뒤 그대로 캐스케이드 취소하면, 그 스냅샷 이후 redeem()이
    // 다른 계정(Y) 소유의 여권을 X로 승계·커밋해도 withdraw()는 그 여권의 존재를 몰라 취소 대상에서
    // 빠뜨린다 — 결과적으로 "탈퇴 계정이 소유한 ACTIVE 여권"이 영구히 남는다. withdraw()가 Account
    // 행을 잠그고, redeem()이 소유권 이전 직전에 같은 행을 잠그고 재확인하도록 고친 뒤에는, 잠금을
    // 먼저 얻어 커밋한 쪽이 이기고 나머지는 최신 상태를 반영해 올바르게 동작해야 한다(redeem이
    // 이겼다면 withdraw의 캐스케이드가 그 여권까지 포함해 DELETED 처리해야 하고, withdraw가
    // 이겼다면 redeem은 ACCOUNT_NOT_FOUND로 거부되어 여권이 원래 소유자(Y)에게 그대로 남아야 한다).
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
            // redeem이 이겼다: withdraw()의 캐스케이드가 (redeem 커밋 이후 새로 잡은 스냅샷에서) 이
            // 여권도 발견해 DELETED 처리했어야 한다 — 탈퇴 계정 소유로 ACTIVE인 채 남으면 안 된다.
            assertThat(redeemRejected.get()).isZero();
            assertThat(reloaded.getOwnerAccountId()).isEqualTo(withdrawingAccount.getId());
            assertThat(reloaded.getStatus()).isEqualTo(PassportStatus.DELETED);
        } else {
            // withdraw가 이겼다: redeem은 거부되고, 여권은 원래 소유자에게 그대로 ACTIVE로 남아야 한다.
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
