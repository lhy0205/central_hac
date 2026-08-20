package com.mcm.passport.common.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.MediaType;
import org.springframework.http.converter.HttpMessageConverter;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.util.List;

@Configuration
public class WebMvcConfig implements WebMvcConfigurer {

    @Override
    public void extendMessageConverters(List<HttpMessageConverter<?>> converters) {

        ObjectMapper objectMapper = converters.stream()
            .filter(MappingJackson2HttpMessageConverter.class::isInstance)
            .map(converter -> ((MappingJackson2HttpMessageConverter) converter).getObjectMapper())
            .findFirst()
            .orElseThrow(() -> new IllegalStateException("MappingJackson2HttpMessageConverter를 찾을 수 없습니다."));

        MappingJackson2HttpMessageConverter readOnlyConverter =
            new MappingJackson2HttpMessageConverter(objectMapper) {
                @Override
                public boolean canWrite(Class<?> clazz, MediaType mediaType) {
                    return false;
                }
            };
        readOnlyConverter.setSupportedMediaTypes(List.of(
            MediaType.TEXT_PLAIN,
            MediaType.APPLICATION_OCTET_STREAM
        ));

        converters.add(0, readOnlyConverter);
    }
}
