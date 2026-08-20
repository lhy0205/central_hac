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
