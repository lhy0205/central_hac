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

    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    public PassportResponse register(Long ownerAccountId, RegisterPassportRequest request,
                                      MultipartFile receiptImage, List<MultipartFile> baselineImages) {
        accountService.getActiveAccountOrThrow(ownerAccountId);
        if (!SerialValidator.isValid(request.serialNumber())) {
            throw new ApiException(ErrorCode.INVALID_SERIAL_FORMAT);
        }

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

            accountService.getActiveAccountOrThrow(ownerAccountId);
            return PassportResponse.from(passportRepository.save(passport));
        } catch (DataIntegrityViolationException e) {

            cleanupUploadedImages(receiptImageUrl, baselineImageUrls);
            throw new ApiException(ErrorCode.SERIAL_ALREADY_REGISTERED);
        } catch (RuntimeException e) {

            cleanupUploadedImages(receiptImageUrl, baselineImageUrls);
            throw e;
        }
    }

    private void cleanupUploadedImages(String receiptImageUrl, List<String> baselineImageUrls) {

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

        Passport passport = passportOwnershipGuard.getOwnedActivePassportForUpdate(passportId, requesterAccountId);
        passport.softDelete();
        reservationRepository.cancelAllRequestedForPassport(passportId);
    }

    private Passport getOwnedActivePassport(Long passportId, Long requesterAccountId) {
        return passportOwnershipGuard.getOwnedActivePassport(passportId, requesterAccountId);
    }
}
