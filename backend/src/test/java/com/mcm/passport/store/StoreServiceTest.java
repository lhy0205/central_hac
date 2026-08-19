package com.mcm.passport.store;

import com.mcm.passport.common.exception.ApiException;
import com.mcm.passport.common.exception.ErrorCode;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalTime;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class StoreServiceTest {

    @Mock private StoreRepository storeRepository;

    private StoreService storeService;

    @Test
    void listAppendsIdAsStableSortTiebreaker() {
        // 정렬이 아예 없으면 Postgres가 LIMIT/OFFSET 사이 순서를
        // 보장하지 않는다 — PassportService.list()와 같은 방식으로 id 타이브레이커를 붙였는지 검증한다.
        storeService = new StoreService(storeRepository);
        org.springframework.data.domain.Pageable requested = org.springframework.data.domain.PageRequest.of(0, 20);
        when(storeRepository.findAll(org.mockito.ArgumentMatchers.any(org.springframework.data.domain.Pageable.class)))
            .thenReturn(new org.springframework.data.domain.PageImpl<>(java.util.List.of()));

        storeService.list(requested);

        org.mockito.ArgumentCaptor<org.springframework.data.domain.Pageable> captor =
            org.mockito.ArgumentCaptor.forClass(org.springframework.data.domain.Pageable.class);
        verify(storeRepository).findAll(captor.capture());
        assertThat(captor.getValue().getSort().getOrderFor("id")).isNotNull();
        assertThat(captor.getValue().getSort().getOrderFor("id").getDirection())
            .isEqualTo(org.springframework.data.domain.Sort.Direction.ASC);
    }

    @Test
    void getDetailReturnsStoreResponse() {
        storeService = new StoreService(storeRepository);
        Store store = newStore();
        when(storeRepository.findById(1L)).thenReturn(Optional.of(store));

        var response = storeService.getDetail(1L);

        assertThat(response.name()).isEqualTo("MCM 강남점");
        assertThat(response.slotLengthMinutes()).isEqualTo(60);
    }

    @Test
    void getDetailThrowsNotFoundWhenStoreMissing() {
        storeService = new StoreService(storeRepository);
        when(storeRepository.findById(999L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> storeService.getDetail(999L))
            .isInstanceOf(ApiException.class)
            .extracting(e -> ((ApiException) e).getErrorCode())
            .isEqualTo(ErrorCode.STORE_NOT_FOUND);
    }

    private Store newStore() {
        Store store = org.mockito.Mockito.mock(Store.class);
        when(store.getName()).thenReturn("MCM 강남점");
        when(store.getAddress()).thenReturn("서울 강남구 압구정로 165");
        when(store.getBusinessHoursStart()).thenReturn(LocalTime.of(10, 0));
        when(store.getBusinessHoursEnd()).thenReturn(LocalTime.of(19, 0));
        when(store.getSlotLengthMinutes()).thenReturn(60);
        return store;
    }
}
