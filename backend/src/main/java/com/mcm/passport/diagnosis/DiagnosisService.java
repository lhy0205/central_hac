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

            passport = getOwnedActivePassport(passportId, requesterAccountId);
            saved = diagnosisRepository.save(diagnosis);
        } catch (RuntimeException e) {

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
