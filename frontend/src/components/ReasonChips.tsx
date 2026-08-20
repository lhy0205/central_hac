import { StyleSheet, View } from "react-native";
import { Text } from "./BrandText";

import { reasonChips } from "../notifications/reason";

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
