package com.mcm.passport.store;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.Map;
import java.util.stream.Collectors;

public interface StoreRepository extends JpaRepository<Store, Long> {

    default Map<Long, String> namesByIds(Collection<Long> storeIds) {
        return findAllById(storeIds).stream().collect(Collectors.toMap(Store::getId, Store::getName));
    }
}
