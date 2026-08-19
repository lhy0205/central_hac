package com.mcm.passport.store;

import com.mcm.passport.common.exception.ApiException;
import com.mcm.passport.common.exception.ErrorCode;
import com.mcm.passport.store.dto.StoreResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional
public class StoreService {

    private final StoreRepository storeRepository;

    public Page<StoreResponse> list(Pageable pageable) {
        // 정렬이 아예 없으면 Postgres가 LIMIT/OFFSET 사이 순서를 보장하지 않는다 — 다른 모든
        // list()가 타이브레이커를 갖도록 고친 것과 같은 이유로 id를 기본 정렬로 둔다
        // . 클라이언트가 이미 정렬을 지정했다면 그 뒤에 이어붙는다.
        Pageable stablePageable = org.springframework.data.domain.PageRequest.of(
            pageable.getPageNumber(), pageable.getPageSize(),
            pageable.getSort().and(org.springframework.data.domain.Sort.by(org.springframework.data.domain.Sort.Direction.ASC, "id")));
        return storeRepository.findAll(stablePageable).map(StoreResponse::from);
    }

    public StoreResponse getDetail(Long storeId) {
        return storeRepository.findById(storeId)
            .map(StoreResponse::from)
            .orElseThrow(() -> new ApiException(ErrorCode.STORE_NOT_FOUND));
    }
}
