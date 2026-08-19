package com.mcm.passport.diagnosis;

import java.util.List;

public interface WearDiagnosisEngine {
    DiagnosisResult diagnose(List<String> imageUrls, Diagnosis previousDiagnosis);
}
