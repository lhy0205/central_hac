package com.mcm.passport.common.storage;

import org.springframework.web.multipart.MultipartFile;

public interface ImageStorageService {
    String upload(MultipartFile file);

    void delete(String url);
}
