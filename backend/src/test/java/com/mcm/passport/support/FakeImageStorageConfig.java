package com.mcm.passport.support;

import com.mcm.passport.common.storage.ImageStorageService;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;

@TestConfiguration
public class FakeImageStorageConfig {

    @Bean
    @Primary
    public ImageStorageService fakeImageStorageService() {
        return new ImageStorageService() {
            @Override
            public String upload(org.springframework.web.multipart.MultipartFile file) {
                return "https://fake-cdn.test/" + file.getOriginalFilename();
            }

            @Override
            public void delete(String url) {
            }
        };
    }
}
