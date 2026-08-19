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

// ml/defect-detection/api_server.py(FastAPI, YOLO11l-seg 7클래스)를 호출하는 WearDiagnosisEngine 구현체.
// wear-diagnosis.engine=ml일 때만 활성화된다(WearDiagnosisEngineConfig 참고) — 기본값은 여전히 rule-based.
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

    // classes.yaml의 severity_rules 단계를 RuleBasedWearDiagnosisEngine과 같은 0~100 스케일로 옮긴 값.
    private static final Map<String, Integer> SEVERITY_SCORE = Map.of(
        "minor", 30,
        "moderate", 55,
        "severe", 80
    );

    // AR 파이프라인(demo/pipeline.py)이 쓰는 DETECT_CONF와 동일한 기준.
    private static final double MIN_CONFIDENCE = 0.35;

    // diagnosis.evidence_text가 VARCHAR(1000)이다. 하자가 많으면 요약이 이를 넘겨
    // 저장 시점에 터지는데, DiagnosisService가 그 예외를 받아 업로드한 사진을 전부
    // 지우고 500을 내므로 사용자는 재시도해도 매번 사진만 잃는다. 여유를 두고 자른다.
    private static final int MAX_EVIDENCE_LENGTH = 900;

    // 타임아웃이 없으면 ML 서버가 응답하지 않을 때 Tomcat 워커가 영구히 묶여
    // 스레드가 고갈되고 로그인까지 포함한 API 전체가 멎는다.
    private static final Duration CONNECT_TIMEOUT = Duration.ofSeconds(5);
    private static final Duration READ_TIMEOUT = Duration.ofSeconds(60);

    private final RestClient imageDownloadClient;
    private final RestClient defectApiClient;

    public MlWearDiagnosisEngine(RestClient.Builder restClientBuilder, String defectApiBaseUrl) {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout((int) CONNECT_TIMEOUT.toMillis());
        factory.setReadTimeout((int) READ_TIMEOUT.toMillis());
        this.imageDownloadClient = restClientBuilder.clone().requestFactory(factory).build();
        this.defectApiClient = restClientBuilder.clone()
            .requestFactory(factory)
            .baseUrl(defectApiBaseUrl)
            .build();
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
                // 탐지 모델의 mAP50이 0.262 수준이라 낮은 신뢰도의 오탐이 흔하다. 게이트가
                // 없으면 오탐 하나로 URGENT 등급과 수리 권유 알림까지 나간다.
                // (AR 파이프라인도 같은 이유로 conf 0.35를 쓴다 — demo/pipeline.py 참고)
                if (defect.confidence() < MIN_CONFIDENCE) {
                    continue;
                }
                // Map.of는 null 키 조회에서 NPE를 던진다(getOrDefault도 마찬가지). ML 서버가
                // type/severity에 null을 담아 보내면 RestClientException이 아닌 NPE가 나가
                // 아래 catch를 우회하고 500이 된다.
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

    // RuleBasedWearDiagnosisEngine.toGrade()와 동일한 임계값을 유지한다 — 엔진을 바꿔도
    // 같은 점수가 같은 등급으로 나와야 하고, 40/70은 알림 발생 기준이기도 하다.
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
            // 4xx는 ML 서버가 의도적으로 내는 입력 오류다(예: 깨진 이미지에 400).
            // HttpClientErrorException은 RestClientException의 하위 타입이라 아래 catch에
            // 같이 잡히면 "서비스 연결 불가"(502)로 뒤바뀌어, 사용자는 다시 촬영하라는
            // 안내 대신 서버 장애로 오인하고 같은 사진을 무한 재시도하게 된다.
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
