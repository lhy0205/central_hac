package com.mcm.passport.diagnosis;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestClient;

@Configuration
public class WearDiagnosisEngineConfig {

    @Bean
    @ConditionalOnProperty(name = "wear-diagnosis.engine", havingValue = "rule-based", matchIfMissing = true)
    public WearDiagnosisEngine ruleBasedWearDiagnosisEngine() {
        return new RuleBasedWearDiagnosisEngine();
    }

    @Bean
    @ConditionalOnProperty(name = "wear-diagnosis.engine", havingValue = "ml")
    public WearDiagnosisEngine mlWearDiagnosisEngine(
        RestClient.Builder restClientBuilder,
        @Value("${wear-diagnosis.defect-api-url:http://localhost:8000}") String defectApiUrl,

        @Value("${wear-diagnosis.defect-api-key:}") String defectApiKey
    ) {
        return new MlWearDiagnosisEngine(restClientBuilder, defectApiUrl, defectApiKey);
    }
}
