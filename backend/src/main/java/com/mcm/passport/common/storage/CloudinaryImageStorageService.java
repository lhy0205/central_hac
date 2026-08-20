package com.mcm.passport.common.storage;

import com.cloudinary.Cloudinary;
import com.cloudinary.utils.ObjectUtils;
import com.mcm.passport.common.exception.ApiException;
import com.mcm.passport.common.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Slf4j
@Service
@RequiredArgsConstructor
public class CloudinaryImageStorageService implements ImageStorageService {

    private static final Pattern PUBLIC_ID_PATTERN = Pattern.compile("/upload/(?:v\\d+/)?(.+)\\.[a-zA-Z0-9]+$");

    private final Cloudinary cloudinary;

    @Override
    public String upload(MultipartFile file) {
        try {
            Map<?, ?> result = cloudinary.uploader().upload(file.getBytes(), ObjectUtils.emptyMap());
            Object secureUrl = result.get("secure_url");
            if (!(secureUrl instanceof String)) {
                throw new ApiException(ErrorCode.IMAGE_UPLOAD_FAILED);
            }
            return (String) secureUrl;
        } catch (IOException e) {
            throw new ApiException(ErrorCode.IMAGE_UPLOAD_FAILED);
        } catch (ApiException e) {
            throw e;
        } catch (RuntimeException e) {

            String message = e.getMessage() == null ? "" : e.getMessage();
            if (message.toLowerCase().contains("invalid image")) {
                log.warn("이미지가 아닌 파일 업로드 시도 (name={})", file.getOriginalFilename());
                throw new ApiException(ErrorCode.INVALID_IMAGE_FILE);
            }
            log.error("Cloudinary 업로드 실패 (name={})", file.getOriginalFilename(), e);
            throw new ApiException(ErrorCode.IMAGE_UPLOAD_FAILED);
        }
    }

    @Override
    public void delete(String url) {
        String publicId = extractPublicId(url);
        if (publicId == null) {
            log.warn("Cloudinary public_id를 URL에서 추출하지 못해 정리를 건너뜀: {}", url);
            return;
        }
        try {
            cloudinary.uploader().destroy(publicId, ObjectUtils.emptyMap());
        } catch (Exception e) {
            log.warn("고아 이미지 정리 실패(public_id={})", publicId, e);
        }
    }

    private String extractPublicId(String url) {
        Matcher matcher = PUBLIC_ID_PATTERN.matcher(url);
        return matcher.find() ? matcher.group(1) : null;
    }
}
