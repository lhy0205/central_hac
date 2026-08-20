package com.mcm.passport.care;

import com.mcm.passport.care.dto.CareRecordResponse;
import com.mcm.passport.care.dto.CreateCareRecordRequest;
import com.mcm.passport.common.exception.ApiException;
import com.mcm.passport.common.exception.ErrorCode;
import com.mcm.passport.common.storage.ImageStorageService;
import com.mcm.passport.passport.Passport;
import com.mcm.passport.passport.PassportOwnershipGuard;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional
public class CareRecordService {

    private final CareRecordRepository careRecordRepository;
    private final ImageStorageService imageStorageService;
    private final PassportOwnershipGuard passportOwnershipGuard;

    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    public CareRecordResponse create(Long passportId, Long requesterAccountId,
                                      CreateCareRecordRequest request, MultipartFile image) {
        getOwnedPassport(passportId, requesterAccountId);
        String imageUrl = image != null && !image.isEmpty() ? imageStorageService.upload(image) : null;
        try {

            Passport passport = getOwnedPassport(passportId, requesterAccountId);
            CareRecord record = new CareRecord(passport.getId(), request.careType(), request.materialType(),
                request.notes(), imageUrl, request.completedAt());
            return CareRecordResponse.from(careRecordRepository.save(record));
        } catch (RuntimeException e) {
            if (imageUrl != null) {
                try {
                    imageStorageService.delete(imageUrl);
                } catch (Exception cleanupException) {
                    log.warn("케어 기록 저장 실패 후 고아 이미지 정리 중 오류(url={})", imageUrl, cleanupException);
                }
            }
            throw e;
        }
    }

    public Page<CareRecordResponse> list(Long passportId, Long requesterAccountId, Pageable pageable) {
        getOwnedPassport(passportId, requesterAccountId);

        Pageable stablePageable = PageRequest.of(
            pageable.getPageNumber(), pageable.getPageSize(),
            pageable.getSort().and(Sort.by(Sort.Direction.ASC, "id")));
        return careRecordRepository.findAllByPassportIdOrderByCompletedAtDesc(passportId, stablePageable)
            .map(CareRecordResponse::from);
    }

    public CareRecordResponse getDetail(Long careRecordId, Long requesterAccountId) {
        CareRecord record = careRecordRepository.findById(careRecordId)
            .orElseThrow(() -> new ApiException(ErrorCode.CARE_RECORD_NOT_FOUND));
        getOwnedPassport(record.getPassportId(), requesterAccountId);
        return CareRecordResponse.from(record);
    }

    private Passport getOwnedPassport(Long passportId, Long requesterAccountId) {
        return passportOwnershipGuard.getOwnedActivePassport(passportId, requesterAccountId);
    }
}
