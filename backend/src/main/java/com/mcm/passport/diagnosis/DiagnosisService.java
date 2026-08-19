package com.mcm.passport.diagnosis;

import com.mcm.passport.common.exception.ApiException;
import com.mcm.passport.common.exception.ErrorCode;
import com.mcm.passport.common.storage.ImageStorageService;
import com.mcm.passport.diagnosis.dto.DiagnosisResponse;
import com.mcm.passport.notification.NotificationService;
import com.mcm.passport.passport.Passport;
import com.mcm.passport.passport.PassportOwnershipGuard;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.Optional;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional
public class DiagnosisService {

    private final DiagnosisRepository diagnosisRepository;
    private final ImageStorageService imageStorageService;
    private final WearDiagnosisEngine wearDiagnosisEngine;
    private final NotificationService notificationService;
    private final PassportOwnershipGuard passportOwnershipGuard;

    // register()와 같은 이유로 업로드를 클래스 레벨 @Transactional 밖으로 뺀다 — Spring Data
    // 리포지토리 메서드는 각자 자체 트랜잭션을 가지므로 원자성은 그대로 유지된다.
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    public DiagnosisResponse submit(Long passportId, Long requesterAccountId,
                                     DiagnosisType diagnosisType, List<MultipartFile> images) {
        Passport passport = getOwnedActivePassport(passportId, requesterAccountId);

        List<String> imageUrls = images.stream().map(imageStorageService::upload).toList();
        Optional<Diagnosis> previous;
        Diagnosis saved;
        try {
            previous = diagnosisRepository.findFirstByPassportIdOrderByDiagnosedAtDescIdDesc(passportId);
            DiagnosisResult result = wearDiagnosisEngine.diagnose(imageUrls, previous.orElse(null));

            Diagnosis diagnosis = new Diagnosis(passportId, diagnosisType, imageUrls,
                result.itemScores(), result.overallGrade(), result.evidenceText());
            // 업로드가 오래 걸리는 사이 탈퇴/소유권 변경이 있었을 수 있어 저장 직전에 다시 확인한다.
            // 예외도 try 안에서 나야 아래 catch의 고아 이미지 정리를 거친다.
            // 잠금은 안 건다 — NOT_SUPPORTED라 앰비언트 트랜잭션이 없어 PESSIMISTIC_WRITE 조회가 실패하고, 통과해도 save()까지 안 이어진다.
            passport = getOwnedActivePassport(passportId, requesterAccountId);
            saved = diagnosisRepository.save(diagnosis);
        } catch (RuntimeException e) {
            // 저장이 실패하면 방금 업로드한 이미지가 고아가 되므로 베스트에포트로 정리한다
            // (정리 실패는 로그만 남기고 원래 예외는 유지). 이미지별로 개별 try/catch — 하나로 묶으면 앞쪽 삭제 실패 시 뒤쪽이 시도조차 안 된다.
            imageUrls.forEach(url -> {
                try {
                    imageStorageService.delete(url);
                } catch (Exception cleanupException) {
                    log.warn("진단 저장 실패 후 고아 이미지 정리 중 오류(url={})", url, cleanupException);
                }
            });
            throw e;
        }
        try {
            notificationService.evaluateAfterDiagnosis(passport, saved);
        } catch (Exception e) {
            log.error("진단(id={}) 이후 알림 평가 실패", saved.getId(), e);
        }

        return DiagnosisResponse.from(saved, previous.orElse(null));
    }

    public org.springframework.data.domain.Page<DiagnosisResponse> list(
            Long passportId, Long requesterAccountId, org.springframework.data.domain.Pageable pageable) {
        getOwnedActivePassport(passportId, requesterAccountId);
        return diagnosisRepository.findAllByPassportIdOrderByDiagnosedAtDescIdDesc(passportId, pageable)
            .map(d -> DiagnosisResponse.from(d, null));
    }

    public DiagnosisResponse getDetail(Long diagnosisId, Long requesterAccountId) {
        Diagnosis diagnosis = diagnosisRepository.findById(diagnosisId)
            .orElseThrow(() -> new ApiException(ErrorCode.DIAGNOSIS_NOT_FOUND));
        getOwnedActivePassport(diagnosis.getPassportId(), requesterAccountId);
        return DiagnosisResponse.from(diagnosis, null);
    }

    private Passport getOwnedActivePassport(Long passportId, Long requesterAccountId) {
        return passportOwnershipGuard.getOwnedActivePassport(passportId, requesterAccountId);
    }
}
