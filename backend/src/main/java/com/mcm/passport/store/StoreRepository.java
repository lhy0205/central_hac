package com.mcm.passport.store;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.Map;
import java.util.stream.Collectors;

public interface StoreRepository extends JpaRepository<Store, Long> {

    // storeId 목록을 배치 조회해 id->name 맵으로 만든다. 존재하지 않는 id는 맵에서 빠지므로
    // 호출부는 getOrDefault를 쓸 것.
    default Map<Long, String> namesByIds(Collection<Long> storeIds) {
        return findAllById(storeIds).stream().collect(Collectors.toMap(Store::getId, Store::getName));
    }
}
