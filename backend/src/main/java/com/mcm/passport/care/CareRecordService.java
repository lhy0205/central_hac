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

    // PassportService.register()/DiagnosisService.submit()과 같은 이유로 업로드를 클래스 레벨
    // @Transactional 밖으로 뺀다 — Spring Data 리포지토리 메서드는 각자 자체 트랜잭션을 가지므로
    // 원자성은 그대로 유지된다.
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    public CareRecordResponse create(Long passportId, Long requesterAccountId,
                                      CreateCareRecordRequest request, MultipartFile image) {
        getOwnedPassport(passportId, requesterAccountId);
        String imageUrl = image != null && !image.isEmpty() ? imageStorageService.upload(image) : null;
        try {
            // 업로드가 오래 걸리는 사이 탈퇴/소유권 변경이 있었을 수 있어 저장 직전에 다시 확인한다.
            // 이 재확인도 try 안에 있어야 여기서 나는 예외까지 아래 catch의 고아 이미지 정리를 거친다.
            // 잠금을 걸지 않는 이유는 DiagnosisService.submit()의 같은 지점 주석 참고.
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
        // completedAt은 사용자가 직접 입력하는 값이라 동시각 충돌 가능성이 낮지 않다 — 타이브레이커
        // 없이는 페이지 간 순서가 불안정해질 수 있어 id를 덧붙인다.
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
