package com.mcm.passport.diagnosis;

import java.util.Map;

public record DiagnosisResult(Map<String, Integer> itemScores, OverallGrade overallGrade, String evidenceText) {
}
