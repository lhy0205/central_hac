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
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;

// @Transactional이 없으면 issueCode()가 expire()로 바꾼 엔티티도 명시적 save() 없이는 DB에
// 반영이 안 될 수 있다. 트랜잭션 의미론은 Mockito로는 검증이 안 되니 실제 DB(Testcontainers)로 확인.
class TransferServiceIntegrationTest extends AbstractIntegrationTest {

    @Autowired
    private TransferService transferService;
    @Autowired
    private TransferCodeRepository transferCodeRepository;
    @Autowired
    private PassportRepository passportRepository;
    @Autowired
    private AccountRepository accountRepository;

    @Test
    void issueCodeExpiresPriorOutstandingCodeInDatabase() {
        Account owner = accountRepository.save(new Account("transfer-owner@example.com", "hash", "닉네임"));
        Passport passport = passportRepository.save(new Passport("A1234", 2024, owner.getId(), "Nomad Backpack",
            "애칭", LocalDate.of(2024, 1, 15), "MCM 강남점", null, false, List.of(), UsageFrequency.OCCASIONAL));
        TransferCode original = transferCodeRepository.save(
            new TransferCode(passport.getId(), "OLD123", owner.getId(), LocalDateTime.now().plusDays(7)));

        transferService.issueCode(passport.getId(), owner.getId());

        TransferCode reloaded = transferCodeRepository.findById(original.getId()).orElseThrow();
        assertThat(reloaded.getStatus()).isEqualTo(TransferStatus.EXPIRED);
    }

    // redeem()이 여권 행을 안 잠그면 동시 요청 둘 다 ISSUED 상태를 통과해서 같은 코드가 두 번
    // redeem될 수 있다. findByIdAndStatusForUpdate로 잠그면 두 번째 트랜잭션이 첫 번째 커밋을 기다렸다가
    // REDEEMED를 다시 읽고 정상 거부된다. 실제 잠금/트랜잭션 순서는 Mockito로 검증 안 되니 DB와
    // 스레드 두 개로 확인.
    @Test
    void redeemUnderConcurrentRequestsOnlyOneSucceeds() throws Exception {
        Account issuer = accountRepository.save(new Account("transfer-issuer@example.com", "hash", "발급자"));
        Account redeemerA = accountRepository.save(new Account("redeemer-a@example.com", "hash", "수신자A"));
        Account redeemerB = accountRepository.save(new Account("redeemer-b@example.com", "hash", "수신자B"));
        Passport passport = passportRepository.save(new Passport("RACE01P", 2024, issuer.getId(), "Nomad Backpack",
            "애칭", LocalDate.of(2024, 1, 15), "MCM 강남점", null, false, List.of(), UsageFrequency.OCCASIONAL));
        transferCodeRepository.save(
            new TransferCode(passport.getId(), "RACE01", issuer.getId(), LocalDateTime.now().plusDays(7)));

        ExecutorService executor = Executors.newFixedThreadPool(2);
        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch start = new CountDownLatch(1);
        AtomicInteger successCount = new AtomicInteger();
        AtomicInteger conflictCount = new AtomicInteger();
        try {
            List<java.util.concurrent.Future<?>> futures = List.of(
                executor.submit(() -> redeemAndClassify(
                    redeemerA.getId(), ready, start, successCount, conflictCount)),
                executor.submit(() -> redeemAndClassify(
                    redeemerB.getId(), ready, start, successCount, conflictCount)));
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
        TransferCode reloaded = transferCodeRepository.findByCode("RACE01").orElseThrow();
        assertThat(reloaded.getStatus()).isEqualTo(TransferStatus.REDEEMED);
        assertThat(reloaded.getRedeemedByAccountId()).isIn(redeemerA.getId(), redeemerB.getId());
        Passport reloadedPassport = passportRepository.findById(passport.getId()).orElseThrow();
        assertThat(reloadedPassport.getOwnerAccountId()).isEqualTo(reloaded.getRedeemedByAccountId());
    }

    // issueCode()가 여권을 잠금 없이 조회하면 동시 발급 요청 둘 다 "기존 코드 만료 → 새 코드 생성"을
    // 통과해서 ISSUED 코드가 두 개 남을 수 있다(나중에 서로 다른 사람에게 redeem되면 소유권이 꼬임).
    // findByIdAndStatusForUpdate로 잠그면 두 번째 요청이 첫 번째 커밋을 기다렸다가 직렬화된다.
    @Test
    void issueCodeUnderConcurrentRequestsLeavesExactlyOneIssuedCode() throws Exception {
        Account owner = accountRepository.save(new Account("transfer-owner2@example.com", "hash", "닉네임"));
        Passport passport = passportRepository.save(new Passport("RACE02P", 2024, owner.getId(), "Nomad Backpack",
            "애칭", LocalDate.of(2024, 1, 15), "MCM 강남점", null, false, List.of(), UsageFrequency.OCCASIONAL));

        ExecutorService executor = Executors.newFixedThreadPool(2);
        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch start = new CountDownLatch(1);
        try {
            List<java.util.concurrent.Future<?>> futures = List.of(
                executor.submit(() -> issueCodeAndWait(passport.getId(), owner.getId(), ready, start)),
                executor.submit(() -> issueCodeAndWait(passport.getId(), owner.getId(), ready, start)));
            ready.await(5, TimeUnit.SECONDS);
            start.countDown();
            for (java.util.concurrent.Future<?> future : futures) {
                future.get(10, TimeUnit.SECONDS);
            }
        } finally {
            executor.shutdown();
        }

        List<TransferCode> issued = transferCodeRepository.findAllByPassportIdAndStatus(
            passport.getId(), TransferStatus.ISSUED);
        assertThat(issued).hasSize(1);
    }

    // issueCode()와 redeem()이 여권 행/TransferCode 행을 잠그는 순서가 어긋나면 동시 실행 시
    // Postgres가 교착상태로 판단해 한쪽 트랜잭션을 강제 중단시키고 500으로 새어나갈 수 있다.
    // 두 메서드가 같은 순서(여권 행 먼저)로 잠가야 항상 정상 직렬화된다. 실제 잠금 순서는
    // 단일 스레드/Mockito로는 검증 안 되니 DB와 스레드 두 개로 확인.
    @Test
    void issueCodeAndRedeemDoNotDeadlockOnConcurrentRequests() throws Exception {
        Account owner = accountRepository.save(new Account("transfer-owner3@example.com", "hash", "닉네임"));
        Account redeemer = accountRepository.save(new Account("redeemer-c@example.com", "hash", "수신자C"));
        Passport passport = passportRepository.save(new Passport("RACE03P", 2024, owner.getId(), "Nomad Backpack",
            "애칭", LocalDate.of(2024, 1, 15), "MCM 강남점", null, false, List.of(), UsageFrequency.OCCASIONAL));
        transferCodeRepository.save(
            new TransferCode(passport.getId(), "RACE03", owner.getId(), LocalDateTime.now().plusDays(7)));

        ExecutorService executor = Executors.newFixedThreadPool(2);
        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch start = new CountDownLatch(1);
        try {
            List<java.util.concurrent.Future<?>> futures = List.of(
                executor.submit(() -> issueCodeAndWait(passport.getId(), owner.getId(), ready, start)),
                executor.submit(() -> {
                    ready.countDown();
                    try {
                        start.await(5, TimeUnit.SECONDS);
                    } catch (InterruptedException e) {
                        Thread.currentThread().interrupt();
                        throw new RuntimeException(e);
                    }
                    try {
                        transferService.redeem("RACE03", redeemer.getId());
                    } catch (com.mcm.passport.common.exception.ApiException e) {
                        if (e.getErrorCode() != com.mcm.passport.common.exception.ErrorCode.TRANSFER_CODE_EXPIRED_OR_USED) {
                            throw e;
                        }
                        // issueCode()가 먼저 커밋해서 코드를 만료시켰다면 정상적인 결과 — 교착상태만
                        // 아니면(즉 여기까지 예외 없이 도달했다면) 통과.
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
    }

    private void issueCodeAndWait(Long passportId, Long ownerAccountId, CountDownLatch ready, CountDownLatch start) {
        ready.countDown();
        try {
            start.await(5, TimeUnit.SECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new RuntimeException(e);
        }
        transferService.issueCode(passportId, ownerAccountId);
    }

    private void redeemAndClassify(Long redeemerAccountId, CountDownLatch ready, CountDownLatch start,
                                    AtomicInteger successCount, AtomicInteger conflictCount) {
        ready.countDown();
        try {
            start.await(5, TimeUnit.SECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new RuntimeException(e);
        }
        try {
            transferService.redeem("RACE01", redeemerAccountId);
            successCount.incrementAndGet();
        } catch (com.mcm.passport.common.exception.ApiException e) {
            if (e.getErrorCode() == com.mcm.passport.common.exception.ErrorCode.TRANSFER_CODE_EXPIRED_OR_USED) {
                conflictCount.incrementAndGet();
            } else {
                throw e;
            }
        }
    }
}
