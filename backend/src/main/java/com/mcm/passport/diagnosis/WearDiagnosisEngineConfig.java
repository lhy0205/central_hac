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

    // ml/defect-detection/api_server.py를 호출하는 구현체. wear-diagnosis.engine=ml일 때만 켜진다
    // (기본값 rule-based에서는 이 빈이 아예 생성되지 않으므로 모델 서버가 없어도 앱 기동에 영향 없음).
    @Bean
    @ConditionalOnProperty(name = "wear-diagnosis.engine", havingValue = "ml")
    public WearDiagnosisEngine mlWearDiagnosisEngine(
        RestClient.Builder restClientBuilder,
        @Value("${wear-diagnosis.defect-api-url:http://localhost:8000}") String defectApiUrl
    ) {
        return new MlWearDiagnosisEngine(restClientBuilder, defectApiUrl);
    }
}
