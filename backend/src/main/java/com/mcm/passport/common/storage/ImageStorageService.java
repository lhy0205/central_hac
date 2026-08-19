package com.mcm.passport.common.storage;

import org.springframework.web.multipart.MultipartFile;

public interface ImageStorageService {
    String upload(MultipartFile file);

    // 업로드는 성공했지만 그 직후 DB 저장이 실패해(예: 시리얼 중복 경합) 고아가 된 이미지를
    // 베스트에포트로 정리하기 위한 것 — 삭제가 실패해도 원래 예외를 가려서는 안 된다.
    void delete(String url);
}
