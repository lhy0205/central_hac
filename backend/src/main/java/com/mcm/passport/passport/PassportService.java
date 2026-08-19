package com.mcm.passport.passport;

import com.mcm.passport.account.AccountService;
import com.mcm.passport.common.exception.ApiException;
import com.mcm.passport.common.exception.ErrorCode;
import com.mcm.passport.common.storage.ImageStorageService;
import com.mcm.passport.diagnosis.Diagnosis;
import com.mcm.passport.passport.dto.PassportResponse;
import com.mcm.passport.passport.dto.PassportSummaryResponse;
import com.mcm.passport.passport.dto.RegisterPassportRequest;
import com.mcm.passport.passport.dto.UpdatePassportRequest;
import com.mcm.passport.reservation.ReservationRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.Locale;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional
public class PassportService {

    private final PassportRepository passportRepository;
    private final ImageStorageService imageStorageService;
    private final com.mcm.passport.diagnosis.DiagnosisRepository diagnosisRepository;
    private final AccountService accountService;
    private final PassportOwnershipGuard passportOwnershipGuard;
    private final ReservationRepository reservationRepository;
    private final java.time.Clock clock;

    // 업로드는 Cloudinary로의 외부 HTTP 호출이라 DB 커넥션을 쥔 채로 기다리면 커넥션 풀을
    // 불필요하게 오래 점유한다. 클래스 레벨 @Transactional을 이 메서드에서만 걷어내
    // (Spring Data 리포지토리 메서드는 각자 자체 트랜잭션을 가지므로 원자성은 그대로 유지된다),
    // 업로드가 끝난 뒤에야 DB 트랜잭션이 시작되도록 한다.
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    public PassportResponse register(Long ownerAccountId, RegisterPassportRequest request,
                                      MultipartFile receiptImage, List<MultipartFile> baselineImages) {
        accountService.getActiveAccountOrThrow(ownerAccountId);
        if (!SerialValidator.isValid(request.serialNumber())) {
            throw new ApiException(ErrorCode.INVALID_SERIAL_FORMAT);
        }
        // 대소문자만 다른 시리얼로 같은 가방이 두 번 등록되지 않도록 대문자로 정규화한 뒤 이 값만
        // 쓴다. Locale.ROOT를 명시하는 건 터키어 로케일에서 'i'가 'İ'로 바뀌는 걸 막기 위함이다.
        String serialNumber = request.serialNumber().toUpperCase(Locale.ROOT);
        int purchaseYear = request.purchaseDate().getYear();
        if (passportRepository.existsBySerialNumberAndPurchaseYearAndStatus(
                serialNumber, purchaseYear, PassportStatus.ACTIVE)) {
            throw new ApiException(ErrorCode.SERIAL_ALREADY_REGISTERED);
        }

        String receiptImageUrl = receiptImage != null && !receiptImage.isEmpty()
            ? imageStorageService.upload(receiptImage) : null;
        List<String> baselineImageUrls = baselineImages.stream()
            .map(imageStorageService::upload)
            .toList();

        Passport passport = new Passport(
            serialNumber, purchaseYear, ownerAccountId, request.modelName(),
            request.nickname(), request.purchaseDate(), request.purchasePlace(),
            receiptImageUrl, receiptImageUrl != null, baselineImageUrls, request.usageFrequency());

        try {
            // 업로드(외부 HTTP 호출)가 오래 걸리는 동안 계정이 탈퇴했을 수 있으므로 저장 직전에
            // 다시 확인한다 — 시작할 때 한 번만 확인하면 그 사이 탈퇴한 계정도 등록에 성공해버린다.
            // 이 재확인도 try 블록 안에 있어야, 재확인이 던지는 예외도 아래 catch의 고아 이미지
            // 정리를 거친다.
            accountService.getActiveAccountOrThrow(ownerAccountId);
            return PassportResponse.from(passportRepository.save(passport));
        } catch (DataIntegrityViolationException e) {
            // 사전 존재여부 체크와 실제 저장 사이의 경합 상태를 대비한 DB 레벨 안전망 — 이미 업로드된
            // 이미지는 이제 어떤 여권에도 연결되지 못하는 고아가 되므로 베스트에포트로 정리한다
            // (정리 실패는 로그만 남기고 원래 SERIAL_ALREADY_REGISTERED 예외를 가리지 않는다).
            cleanupUploadedImages(receiptImageUrl, baselineImageUrls);
            throw new ApiException(ErrorCode.SERIAL_ALREADY_REGISTERED);
        } catch (RuntimeException e) {
            // DiagnosisService.submit()/CareRecordService.create()와 같은 이유로, 위 DataIntegrityViolationException
            // 외의 어떤 RuntimeException(재확인이 던지는 ApiException 포함)에도 동일하게 고아 이미지를
            // 정리해야 한다 — 이전에는 이 catch가 없어서 형제 서비스들과 동작이 갈렸다.
            cleanupUploadedImages(receiptImageUrl, baselineImageUrls);
            throw e;
        }
    }

    private void cleanupUploadedImages(String receiptImageUrl, List<String> baselineImageUrls) {
        // 이미지별로 개별 try/catch를 둔다 — 하나로 묶으면 앞쪽 이미지 삭제가 실패했을 때
        // forEach가 중단되어 뒤쪽 이미지들은 시도조차 되지 않은 채 고아로 남는다.
        if (receiptImageUrl != null) {
            deleteQuietly(receiptImageUrl);
        }
        baselineImageUrls.forEach(this::deleteQuietly);
    }

    private void deleteQuietly(String imageUrl) {
        try {
            imageStorageService.delete(imageUrl);
        } catch (Exception cleanupException) {
            log.warn("여권 등록 실패 후 고아 이미지 정리 중 오류(url={})", imageUrl, cleanupException);
        }
    }

    public Page<PassportSummaryResponse> list(
            Long ownerAccountId, Pageable pageable) {
        accountService.getActiveAccountOrThrow(ownerAccountId);
        // id를 타이브레이커로 항상 덧붙여서, 클라이언트가 정렬을 지정하지 않아도(혹은 동일 값이 있어도)
        // 페이지 간 행 순서가 안정적으로 유지되도록 한다.
        Pageable stablePageable = PageRequest.of(
            pageable.getPageNumber(), pageable.getPageSize(),
            pageable.getSort().and(Sort.by(Sort.Direction.ASC, "id")));
        Page<Passport> page =
            passportRepository.findAllByOwnerAccountIdAndStatus(ownerAccountId, PassportStatus.ACTIVE, stablePageable);

        List<Long> passportIds = page.getContent().stream().map(Passport::getId).toList();
        Map<Long, Diagnosis> latestDiagnosisByPassportId =
            diagnosisRepository.findLatestByPassportIdIn(passportIds);

        return page.map(passport -> PassportSummaryResponse.withDiagnosis(
            passport, latestDiagnosisByPassportId.get(passport.getId()), clock));
    }

    public PassportResponse getDetail(Long passportId, Long requesterAccountId) {
        Passport passport = getOwnedActivePassport(passportId, requesterAccountId);
        return PassportResponse.from(passport);
    }

    public PassportResponse update(Long passportId, Long requesterAccountId, UpdatePassportRequest request) {
        Passport passport = getOwnedActivePassport(passportId, requesterAccountId);
        passport.updateProfile(request.nickname(), request.usageFrequency());
        return PassportResponse.from(passport);
    }

    public void delete(Long passportId, Long requesterAccountId) {
        // 잠금 없는 조회로 여권을 읽은 뒤 그대로 softDelete하면, 이 트랜잭션이 커밋되기 전에 다른
        // 트랜잭션(예: 승계 코드 redeem)이 먼저 소유권을 다른 계정으로 옮기고 커밋해도 이 트랜잭션은
        // 그 사실을 모른 채 그대로 DELETED 처리해버릴 수 있다(새 소유자의 여권이 조용히 사라짐).
        // AccountService.withdraw()가 이미 겪은 것과 동일한 경합이라 같은 잠금 조회로 막는다.
        Passport passport = passportOwnershipGuard.getOwnedActivePassportForUpdate(passportId, requesterAccountId);
        passport.softDelete();
        reservationRepository.cancelAllRequestedForPassport(passportId);
    }

    private Passport getOwnedActivePassport(Long passportId, Long requesterAccountId) {
        return passportOwnershipGuard.getOwnedActivePassport(passportId, requesterAccountId);
    }
}
