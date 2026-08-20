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
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

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

    private static final String EVIDENCE_PREFIX = "ML 하자 탐지: ";
    private static final String EVIDENCE_NONE = "ML 하자 탐지 결과 특이사항 없음";
    private static final Pattern COUNT_PATTERN = Pattern.compile("([^,:\\s]+)\\s+(\\d+)건");

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

        Map<String, Integer> counts = new LinkedHashMap<>();
        Map<String, String> worstSeverity = new LinkedHashMap<>();

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

                counts.merge(label, 1, Integer::sum);
                if (score >= scores.getOrDefault(label, -1)) {
                    worstSeverity.put(label, defect.severityLabel());
                }
                scores.merge(label, score, Math::max);
            }
        }

        int maxScore = scores.values().stream().mapToInt(Integer::intValue).max().orElse(0);
        OverallGrade grade = toGrade(maxScore);

        return new DiagnosisResult(
            scores, grade, truncate(buildEvidence(counts, worstSeverity, grade, previousDiagnosis)));
    }

    private String buildEvidence(Map<String, Integer> counts, Map<String, String> severityLabels,
                                  OverallGrade grade, Diagnosis previous) {
        if (counts.isEmpty()) {
            return EVIDENCE_NONE;
        }

        List<String> parts = new ArrayList<>();
        counts.forEach((label, count) -> {
            String severity = severityLabels.get(label);
            parts.add(severity == null || severity.isBlank()
                ? "%s %d건".formatted(label, count)
                : "%s %d건(%s)".formatted(label, count, severity));
        });
        String head = EVIDENCE_PREFIX + String.join(", ", parts);

        Map<String, Integer> before = previous == null ? null : parseCounts(previous.getEvidenceText());
        if (before == null) {
            return head + "\n첫 진단 · 종합 등급 " + grade.name();
        }

        List<String> deltas = new ArrayList<>();
        Set<String> labels = new LinkedHashSet<>(counts.keySet());
        labels.addAll(before.keySet());
        for (String label : labels) {
            int diff = counts.getOrDefault(label, 0) - before.getOrDefault(label, 0);
            if (diff != 0) {
                deltas.add("%s %+d건".formatted(label, diff));
            }
        }

        String change = deltas.isEmpty() ? "직전 대비 변화 없음" : "직전 진단 대비 " + String.join(", ", deltas);
        String gradePart = previous.getOverallGrade() == grade
            ? "종합 등급 %s 유지".formatted(grade.name())
            : "종합 등급 %s → %s".formatted(previous.getOverallGrade().name(), grade.name());

        return head + "\n" + change + " · " + gradePart;
    }

    private Map<String, Integer> parseCounts(String evidenceText) {
        if (evidenceText == null) {
            return null;
        }
        if (evidenceText.startsWith(EVIDENCE_NONE)) {
            return Map.of();
        }
        if (!evidenceText.startsWith(EVIDENCE_PREFIX)) {
            return null;
        }
        Map<String, Integer> counts = new LinkedHashMap<>();
        Matcher matcher = COUNT_PATTERN.matcher(evidenceText.split("\n", 2)[0]);
        while (matcher.find()) {
            counts.put(matcher.group(1), Integer.parseInt(matcher.group(2)));
        }
        return counts;
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
