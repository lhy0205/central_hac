import { StyleSheet, View } from "react-native";
import { Text } from "./BrandText";

import { reasonChips } from "../notifications/reason";

/* 알림 카드에 판단 근거를 붙인다.
   "모든 알림에는 판단 근거를 함께 표시해서 고객이 왜 지금 이 알림을 받았는지 항상 알 수 있게
   한다"는 원칙을 화면에서 지키는 자리다. 근거가 없으면(오래된 알림 등) 아무것도 그리지 않는다. */
export function ReasonChips({ factors }: { factors: Record<string, unknown> | undefined | null }) {
  const chips = reasonChips(factors);
  if (chips.length === 0) return null;
  return (
    <View style={styles.wrap}>
      <Text style={styles.caption}>이 알림을 받은 이유</Text>
      <View style={styles.row}>
        {chips.map((text) => (
          <View key={text} style={styles.chip}>
            <Text style={styles.chipText}>{text}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 8 },
  caption: { fontSize: 10, color: "#A8A8A8", marginBottom: 5 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 5 },
  chip: {
    borderWidth: 1,
    borderColor: "#E4DCCD",
    backgroundColor: "#FBF7F0",
    borderRadius: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  chipText: { fontSize: 10.5, color: "#7A6244" },
});
