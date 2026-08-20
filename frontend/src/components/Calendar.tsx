import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "./BrandText";

import { colors } from "../theme";

const WEEK = ["일", "월", "화", "수", "목", "금", "토"];

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/* 구매일(제품 등록)과 예약일(공식 케어 예약)이 같은 달력을 쓴다.
   value/onSelect는 백엔드가 받는 형식 그대로 YYYY-MM-DD 문자열이다. */
export function Calendar({
  value,
  onSelect,
  disabledDates,
  markers,
}: {
  value: string | null;
  onSelect: (date: string) => void;
  disabledDates?: (date: string) => boolean;
  markers?: Record<string, string>;
}) {
  const initial = value ? new Date(value) : new Date();
  const [year, setYear] = useState(initial.getFullYear());
  const [month, setMonth] = useState(initial.getMonth());

  const firstDay = new Date(year, month, 1).getDay();
  const dayCount = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array.from({ length: firstDay }, () => null),
    ...Array.from({ length: dayCount }, (_, i) => i + 1),
  ];

  function shift(delta: number) {
    const next = new Date(year, month + delta, 1);
    setYear(next.getFullYear());
    setMonth(next.getMonth());
  }

  return (
    <View>
      <View style={styles.head}>
        <Pressable accessibilityLabel="이전 달" onPress={() => shift(-1)} style={styles.nav}>
          <Text style={styles.navText}>‹</Text>
        </Pressable>
        <Text style={styles.title}>
          {year}.{pad(month + 1)}
        </Text>
        <Pressable accessibilityLabel="다음 달" onPress={() => shift(1)} style={styles.nav}>
          <Text style={styles.navText}>›</Text>
        </Pressable>
      </View>

      <View style={styles.grid}>
        {WEEK.map((label) => (
          <Text key={label} style={styles.dow}>
            {label}
          </Text>
        ))}
        {cells.map((day, index) => {
          if (day == null) return <View key={`blank-${index}`} style={styles.cell} />;
          const iso = `${year}-${pad(month + 1)}-${pad(day)}`;
          const disabled = disabledDates?.(iso) ?? false;
          const selected = value === iso;
          const sunday = index % 7 === 0;
          return (
            <Pressable
              key={iso}
              accessibilityLabel={`${month + 1}월 ${day}일`}
              disabled={disabled}
              onPress={() => onSelect(iso)}
              style={[styles.cell, selected && styles.cellOn]}
            >
              <Text
                style={[
                  styles.day,
                  sunday && styles.sunday,
                  disabled && styles.disabled,
                  selected && styles.dayOn,
                ]}
              >
                {day}
              </Text>
              {markers?.[iso] ? (
                <Text style={[styles.marker, selected && styles.markerOn]}>{markers[iso]}</Text>
              ) : disabled ? (
                <Text style={styles.marker}>마감</Text>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  nav: { width: 34, height: 34, alignItems: "center", justifyContent: "center", borderRadius: 17 },
  navText: { fontSize: 20, color: "#555" },
  title: { fontSize: 14, fontWeight: "600", color: "#1A1A1A" },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  dow: {
    width: `${100 / 7}%`,
    textAlign: "center",
    fontSize: 10.5,
    color: "#A8A8A8",
    paddingBottom: 6,
  },
  cell: {
    width: `${100 / 7}%`,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 6,
  },
  cellOn: { backgroundColor: colors.brown },
  day: { fontSize: 12.5, color: "#333" },
  dayOn: { color: "#fff" },
  sunday: { color: "#D45B5B" },
  disabled: { color: "#CFCFCF" },
  marker: { fontSize: 7.5, color: "#C08A8A", lineHeight: 10 },
  markerOn: { color: "rgba(255,255,255,0.75)" },
});
