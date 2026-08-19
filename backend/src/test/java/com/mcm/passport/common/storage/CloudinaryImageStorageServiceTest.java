package com.mcm.passport.common.storage;

import com.cloudinary.Cloudinary;
import com.cloudinary.Uploader;
import com.mcm.passport.common.exception.ApiException;
import com.mcm.passport.common.exception.ErrorCode;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class CloudinaryImageStorageServiceTest {

    @Mock
    private Cloudinary cloudinary;
    @Mock
    private Uploader uploader;

    @Test
    void uploadReturnsSecureUrl() throws IOException {
        when(cloudinary.uploader()).thenReturn(uploader);
        when(uploader.upload(any(byte[].class), anyMap()))
            .thenReturn(Map.of("secure_url", "https://res.cloudinary.com/demo/image/upload/sample.jpg"));
        CloudinaryImageStorageService service = new CloudinaryImageStorageService(cloudinary);
        MultipartFile file = new MockMultipartFile("file", "a.jpg", "image/jpeg", "data".getBytes());

        String url = service.upload(file);

        assertThat(url).isEqualTo("https://res.cloudinary.com/demo/image/upload/sample.jpg");
    }

    @Test
    void uploadThrowsImageUploadFailedWhenSecureUrlMissing() throws IOException {
        when(cloudinary.uploader()).thenReturn(uploader);
        when(uploader.upload(any(byte[].class), anyMap())).thenReturn(Map.of("public_id", "abc123"));
        CloudinaryImageStorageService service = new CloudinaryImageStorageService(cloudinary);
        MultipartFile file = new MockMultipartFile("file", "a.jpg", "image/jpeg", "data".getBytes());

        assertThatThrownBy(() -> service.upload(file))
            .isInstanceOf(ApiException.class)
            .extracting(e -> ((ApiException) e).getErrorCode())
            .isEqualTo(ErrorCode.IMAGE_UPLOAD_FAILED);
    }

    @Test
    void uploadFailureThrowsImageUploadFailed() throws IOException {
        when(cloudinary.uploader()).thenReturn(uploader);
        when(uploader.upload(any(byte[].class), anyMap())).thenThrow(new IOException("network error"));
        CloudinaryImageStorageService service = new CloudinaryImageStorageService(cloudinary);
        MultipartFile file = new MockMultipartFile("file", "a.jpg", "image/jpeg", "data".getBytes());

        assertThatThrownBy(() -> service.upload(file))
            .isInstanceOf(ApiException.class)
            .extracting(e -> ((ApiException) e).getErrorCode())
            .isEqualTo(ErrorCode.IMAGE_UPLOAD_FAILED);
    }
}
