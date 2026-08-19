package com.mcm.passport.diagnosis;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public class RuleBasedWearDiagnosisEngine implements WearDiagnosisEngine {

    private static final int BASELINE_WEAR = 20;

    @Override
    public DiagnosisResult diagnose(List<String> imageUrls, Diagnosis previousDiagnosis) {
        int previousWear = previousDiagnosis != null
            ? previousDiagnosis.getItemScores().getOrDefault("마모", BASELINE_WEAR)
            : BASELINE_WEAR;

        List<String> images = imageUrls == null ? List.of() : imageUrls;
        int increment = images.size() >= 3 ? 5 : 10;
        int wear = Math.min(100, previousWear + increment);
        int coating = Math.max(0, wear - 5);
        int discoloration = Math.max(0, wear - 10);
        int hardware = Math.max(0, wear - 15);

        Map<String, Integer> scores = new LinkedHashMap<>();
        scores.put("마모", wear);
        scores.put("코팅벗겨짐", coating);
        scores.put("변색", discoloration);
        scores.put("부자재상태", hardware);

        OverallGrade grade = toGrade(wear);
        String evidence = "직전 마모 점수 %d에서 %d로 변화, 종합 등급 %s".formatted(previousWear, wear, grade);

        return new DiagnosisResult(scores, grade, evidence);
    }

    // 40(셀프케어 알림)과 70(매장서비스 알림)은 NotificationService가 쓰는 경계라 그대로 두고,
    // 예전에 GOOD 하나였던 0~39 구간만 S/A/B로 더 잘게 나눈다.
    private OverallGrade toGrade(int wearScore) {
        if (wearScore >= 70) return OverallGrade.D;
        if (wearScore >= 40) return OverallGrade.C;
        if (wearScore >= 30) return OverallGrade.B;
        if (wearScore >= 15) return OverallGrade.A;
        return OverallGrade.S;
    }
}
