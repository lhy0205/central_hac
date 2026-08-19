package com.mcm.passport.store;

import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalTime;

// 매장 CRUD API는 없다(기획서 3.8절, 확정) — 이 엔티티는 시드 마이그레이션으로만 채워지고
// 앱 코드에서는 읽기 전용으로만 쓰인다.
@Entity
@Table(name = "store")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Store {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String name;

    private String address;

    private LocalTime businessHoursStart;

    private LocalTime businessHoursEnd;

    private int slotLengthMinutes;
}
