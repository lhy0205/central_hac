package com.mcm.passport.diagnosis;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.mcm.passport.common.exception.ApiException;
import com.mcm.passport.common.exception.ErrorCode;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.MediaType;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Slf4j
public class MlWearDiagnosisEngine implements WearDiagnosisEngine {

    private static final Map<String, String> TYPE_LABELS = Map.of(
        "tear", "찢어짐",
        "scratch", "스크래치",
        "stain", "오염",
        "wear", "마모",
        "sole_separation", "밑창분리",
        "zipper_damage", "지퍼파손",
        "deformation", "변형"
    );

    private static final Map<String, Integer> SEVERITY_SCORE = Map.of(
        "minor", 30,
        "moderate", 55,
        "severe", 80
    );

    private static final double MIN_CONFIDENCE = 0.35;

    private static final int MAX_EVIDENCE_LENGTH = 900;

    private static final Duration CONNECT_TIMEOUT = Duration.ofSeconds(5);
    private static final Duration READ_TIMEOUT = Duration.ofSeconds(60);

    private static final String API_KEY_HEADER = "X-API-Key";

    private final RestClient imageDownloadClient;
    private final RestClient defectApiClient;

    public MlWearDiagnosisEngine(
        RestClient.Builder restClientBuilder,
        String defectApiBaseUrl,
        String defectApiKey
    ) {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout((int) CONNECT_TIMEOUT.toMillis());
        factory.setReadTimeout((int) READ_TIMEOUT.toMillis());
        this.imageDownloadClient = restClientBuilder.clone().requestFactory(factory).build();

        RestClient.Builder defectBuilder = restClientBuilder.clone()
            .requestFactory(factory)
            .baseUrl(defectApiBaseUrl);

        if (defectApiKey != null && !defectApiKey.isBlank()) {
            defectBuilder = defectBuilder.defaultHeader(API_KEY_HEADER, defectApiKey.trim());
        } else {
            log.warn("DEFECT_API_KEY가 비어 있어 인증 헤더 없이 하자 탐지 서버를 호출합니다. "
                + "서버에 API_KEY가 설정돼 있으면 401로 거절됩니다.");
        }
        this.defectApiClient = defectBuilder.build();
    }

    @Override
    public DiagnosisResult diagnose(List<String> imageUrls, Diagnosis previousDiagnosis) {
        List<String> images = imageUrls == null ? List.of() : imageUrls;

        Map<String, Integer> scores = new LinkedHashMap<>();
        for (String label : TYPE_LABELS.values()) {
            scores.put(label, 0);
        }

        List<String> summaries = new ArrayList<>();
        for (String imageUrl : images) {
            PredictResponse response = predict(imageUrl);
            List<Defect> defects = response == null || response.defects() == null ? List.of() : response.defects();
            for (Defect defect : defects) {

                if (defect.confidence() < MIN_CONFIDENCE) {
                    continue;
                }

                String type = defect.type();
                String label = type == null ? "기타" : TYPE_LABELS.getOrDefault(type, type);
                String severity = defect.severity();
                int score = severity == null ? 50 : SEVERITY_SCORE.getOrDefault(severity, 50);
                scores.merge(label, score, Math::max);
                summaries.add("%s(%s)".formatted(label, defect.severityLabel()));
            }
        }

        int maxScore = scores.values().stream().mapToInt(Integer::intValue).max().orElse(0);
        OverallGrade grade = toGrade(maxScore);
        String evidence = summaries.isEmpty()
            ? "ML 하자 탐지 결과 특이사항 없음"
            : truncate("ML 하자 탐지: " + String.join(", ", summaries));

        return new DiagnosisResult(scores, grade, evidence);
    }

    private String truncate(String evidence) {
        if (evidence.length() <= MAX_EVIDENCE_LENGTH) {
            return evidence;
        }
        return evidence.substring(0, MAX_EVIDENCE_LENGTH - 3) + "...";
    }

    private OverallGrade toGrade(int score) {
        if (score >= 70) return OverallGrade.D;
        if (score >= 40) return OverallGrade.C;
        if (score >= 30) return OverallGrade.B;
        if (score >= 15) return OverallGrade.A;
        return OverallGrade.S;
    }

    private PredictResponse predict(String imageUrl) {
        byte[] imageBytes;
        try {
            imageBytes = imageDownloadClient.get().uri(imageUrl).retrieve().body(byte[].class);
        } catch (RestClientException e) {
            log.error("진단 이미지 다운로드 실패 (url={})", imageUrl, e);
            throw new ApiException(ErrorCode.DEFECT_DETECTION_UNAVAILABLE);
        }

        MultiValueMap<String, Object> body = new LinkedMultiValueMap<>();
        body.add("file", new ByteArrayResource(imageBytes) {
            @Override
            public String getFilename() {
                return "diagnosis.jpg";
            }
        });

        try {
            return defectApiClient.post()
                .uri("/predict")
                .contentType(MediaType.MULTIPART_FORM_DATA)
                .body(body)
                .retrieve()
                .body(PredictResponse.class);
        } catch (HttpClientErrorException e) {

            if (e.getStatusCode().value() == 401 || e.getStatusCode().value() == 403) {
                log.error("하자 탐지 API 인증 실패 (status={}). DEFECT_API_KEY와 서버의 API_KEY가 "
                    + "같은 값인지 확인할 것.", e.getStatusCode());
                throw new ApiException(ErrorCode.DEFECT_DETECTION_UNAVAILABLE);
            }

            log.warn("하자 탐지 API가 입력 오류를 반환 (status={}, url={})", e.getStatusCode(), imageUrl);
            throw new ApiException(ErrorCode.DIAGNOSIS_IMAGE_UNREADABLE);
        } catch (RestClientException e) {
            log.error("하자 탐지 API 호출 실패 (url={})", imageUrl, e);
            throw new ApiException(ErrorCode.DEFECT_DETECTION_UNAVAILABLE);
        }
    }

    private record Defect(
        String type,
        double confidence,
        String severity,
        @JsonProperty("severity_label") String severityLabel
    ) {
    }

    private record PredictResponse(List<Defect> defects) {
    }
}
