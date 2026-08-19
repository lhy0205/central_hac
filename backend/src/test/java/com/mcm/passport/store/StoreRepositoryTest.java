package com.mcm.passport.store;

import com.mcm.passport.support.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.time.LocalTime;

import static org.assertj.core.api.Assertions.assertThat;

class StoreRepositoryTest extends AbstractIntegrationTest {

    @Autowired
    private StoreRepository storeRepository;

    @Test
    void migrationSeedsThreeStores() {
        assertThat(storeRepository.findAll()).hasSize(3);
    }

    @Test
    void seededStoreHasBusinessHoursAndSlotLength() {
        Store gangnam = storeRepository.findAll().stream()
            .filter(s -> s.getName().equals("MCM 강남점"))
            .findFirst().orElseThrow();

        assertThat(gangnam.getBusinessHoursStart()).isEqualTo(LocalTime.of(10, 0));
        assertThat(gangnam.getBusinessHoursEnd()).isEqualTo(LocalTime.of(19, 0));
        assertThat(gangnam.getSlotLengthMinutes()).isEqualTo(60);
    }
}
