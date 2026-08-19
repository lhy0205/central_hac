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

// 회귀 방지 테스트: TransferService에 @Transactional이 없으면 issueCode()가
// transferCodeRepository.findAllByPassportIdAndStatus로 가져온 엔티티를 expire()로 변경해도
// (명시적 save() 호출이 없으므로) 트랜잭션이 없어 변경사항이 DB에 반영되지 않는 채로 조용히
// 유실된다. Mockito 단위 테스트로는 트랜잭션 의미론을 검증할 수 없으므로 실제 DB(Testcontainers)를
// 사용하는 통합 테스트로 확인한다.
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

    // 회귀 방지 테스트: redeem()이 여권 행을 잠그지 않고 코드를 조회하면, 두 개의 동시 요청이
    // 둘 다 ISSUED 상태를 통과해버려서 같은 코드가 두 번 redeem되고(둘 다 200 응답), 나중에 커밋한
    // 쪽만 실제로 소유권을 갖게 되는 경합 상태가 생긴다. findByIdAndStatusForUpdate(PESSIMISTIC_WRITE)로
    // 여권 행을 잠그면(issueCode()와 동일한 순서) 두 번째 트랜잭션이 첫 번째가 커밋할 때까지 블록되고,
    // 커밋 후 REDEEMED 상태를 다시 읽어 정상적으로 거부된다. Mockito 단위 테스트로는 실제 행 잠금/
    // 트랜잭션 순서를 검증할 수 없으므로 실제 DB(Testcontainers)와 스레드 두 개로 확인한다.
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

    // 회귀 방지 테스트: issueCode()가 findByIdAndStatus(잠금 없음)로 여권을 조회하면, 같은 여권에 대한
    // 동시 발급 요청 둘 다 "기존 ISSUED 코드 만료 → 새 코드 생성"을 통과해버려서 서로 다른 두 코드가
    // 동시에 ISSUED 상태로 남는 경합 상태가 생긴다(둘 다 나중에 서로 다른 사람에게 redeem되면 소유권이
    // 꼬인다). findByIdAndStatusForUpdate(PESSIMISTIC_WRITE)로 여권 행을 잠그면 두 번째 요청은 첫 번째가
    // 커밋할 때까지 블록되고, 커밋 후에는 방금 만료 처리된 코드를 다시 읽어 정상적으로 직렬화된다.
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

    // 회귀 방지 테스트: issueCode()는 여권 행을 먼저 잠그고 나중에 TransferCode 행을 건드리는데,
    // 이전 버전의 redeem()은 반대로 TransferCode 행을 먼저 잠그고 나중에 여권 행을 건드렸다(잠금
    // 순서 반전). 소유자가 issueCode()를 호출하는 동안 다른 사람이 같은 여권의 발급된 코드를
    // redeem()하면, Postgres가 순환 대기(교착상태)를 감지해 한쪽 트랜잭션을 강제로 중단시키고, 이
    // 예외는 어디서도 잡히지 않아 GlobalExceptionHandler의 최후 안전망을 타고 500으로 새어나간다.
    // redeem()도 issueCode()와 같은 순서(여권 행 먼저)로 잠그도록 고친 뒤에는 두 작업이 항상
    // 정상적으로 직렬화되고 어느 쪽도 예외 없이 끝나야 한다. 단일 스레드/Mockito로는 실제 잠금
    // 순서(교착상태 여부)를 검증할 수 없으므로 실제 DB와 스레드 두 개로 확인한다.
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
