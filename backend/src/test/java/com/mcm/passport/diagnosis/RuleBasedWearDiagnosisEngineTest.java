package com.mcm.passport.diagnosis;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class RuleBasedWearDiagnosisEngineTest {

    private final RuleBasedWearDiagnosisEngine engine = new RuleBasedWearDiagnosisEngine();

    @Test
    void firstDiagnosisWithThreeImagesStartsFromBaseline() {
        DiagnosisResult result = engine.diagnose(
            List.of("https://cdn/1.jpg", "https://cdn/2.jpg", "https://cdn/3.jpg"), null);

        assertThat(result.itemScores().get("마모")).isEqualTo(25); // 기본 20 + 3장 이상이라 +5
        assertThat(result.itemScores().get("코팅벗겨짐")).isEqualTo(20); // 25 - 5
        assertThat(result.itemScores().get("변색")).isEqualTo(15); // 25 - 10
        assertThat(result.itemScores().get("부자재상태")).isEqualTo(10); // 25 - 15
        assertThat(result.overallGrade()).isEqualTo(OverallGrade.A); // 25점: 15~29 구간
    }

    @Test
    void wearScoreIncreasesFromPreviousDiagnosis() {
        Diagnosis previous = new Diagnosis(1L, DiagnosisType.SELF,
            List.of("https://cdn/old.jpg"), Map.of("마모", 60), OverallGrade.C, "이전");

        DiagnosisResult result = engine.diagnose(List.of("https://cdn/1.jpg"), previous);

        assertThat(result.itemScores().get("마모")).isEqualTo(70); // 이전 60 + 사진 1장이라 +10
        assertThat(result.overallGrade()).isEqualTo(OverallGrade.D); // 70점: 70 이상 구간
    }

    @Test
    void wearScoreCapsAt100() {
        Diagnosis previous = new Diagnosis(1L, DiagnosisType.SELF,
            List.of("https://cdn/old.jpg"), Map.of("마모", 95), OverallGrade.D, "이전");

        DiagnosisResult result = engine.diagnose(List.of("https://cdn/1.jpg"), previous);

        assertThat(result.itemScores().get("마모")).isEqualTo(100);
    }

    @Test
    void nullImageUrlsHandledGracefully() {
        DiagnosisResult result = engine.diagnose(null, null);

        assertThat(result.itemScores().get("마모")).isEqualTo(30); // 기본 20 + null이므로 +10
        assertThat(result.overallGrade()).isEqualTo(OverallGrade.B); // 30점: 30~39 구간(경계값)
    }

    @Test
    void fiveGradeThresholdBoundaries() {
        // 경계값을 명시적으로 고정한다 — 15/30/40/70이 등급이 바뀌는 지점이고, 그중 40과 70은
        // NotificationService가 셀프케어/매장서비스 알림을 띄우는 기준이기도 하다.
        assertThat(gradeForWearScore(0)).isEqualTo(OverallGrade.S);
        assertThat(gradeForWearScore(14)).isEqualTo(OverallGrade.S);
        assertThat(gradeForWearScore(15)).isEqualTo(OverallGrade.A);
        assertThat(gradeForWearScore(29)).isEqualTo(OverallGrade.A);
        assertThat(gradeForWearScore(30)).isEqualTo(OverallGrade.B);
        assertThat(gradeForWearScore(39)).isEqualTo(OverallGrade.B);
        assertThat(gradeForWearScore(40)).isEqualTo(OverallGrade.C);
        assertThat(gradeForWearScore(69)).isEqualTo(OverallGrade.C);
        assertThat(gradeForWearScore(70)).isEqualTo(OverallGrade.D);
        assertThat(gradeForWearScore(100)).isEqualTo(OverallGrade.D);
    }

    /** 이미지 1장이면 이전 점수에 +10 하므로, 원하는 마모 점수를 만들려면 그만큼 낮춰서 넣는다. */
    private OverallGrade gradeForWearScore(int wearScore) {
        Diagnosis previous = new Diagnosis(1L, DiagnosisType.SELF,
            List.of("https://cdn/old.jpg"), Map.of("마모", wearScore - 10), OverallGrade.S, "이전");
        return engine.diagnose(List.of("https://cdn/1.jpg"), previous).overallGrade();
    }
}
