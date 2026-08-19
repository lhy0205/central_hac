package com.mcm.passport.common.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.MediaType;
import org.springframework.http.converter.HttpMessageConverter;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.util.List;

// React Native의 FormData는 문자열 파트에 Content-Type을 지정할 수 없어 @RequestPart("request")가
// text/plain으로 도착한다. 그대로 두면 HttpMessageNotReadableException("요청 본문을 읽을 수 없습니다")이 난다.
@Configuration
public class WebMvcConfig implements WebMvcConfigurer {

    @Override
    public void extendMessageConverters(List<HttpMessageConverter<?>> converters) {
        // Spring Boot가 구성한 ObjectMapper를 그대로 재사용한다. 새 ObjectMapper를 만들면
        // JavaTimeModule 등이 빠져 LocalDate(purchaseDate)·LocalDateTime(slotDateTime) 파싱이 깨진다.
        ObjectMapper objectMapper = converters.stream()
            .filter(MappingJackson2HttpMessageConverter.class::isInstance)
            .map(converter -> ((MappingJackson2HttpMessageConverter) converter).getObjectMapper())
            .findFirst()
            .orElseThrow(() -> new IllegalStateException("MappingJackson2HttpMessageConverter를 찾을 수 없습니다."));

        // 읽기 전용으로 둔다. 기존 JSON 컨버터의 지원 타입에 text/plain을 그냥 추가하면 쓰기에도
        // 적용돼, Accept: text/plain 요청에 JSON 본문이 text/plain으로 잘못 라벨링돼 나간다.
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

        // 기본 JSON 컨버터보다 앞에 두어야 text/plain 파트를 먼저 집는다.
        converters.add(0, readOnlyConverter);
    }
}
