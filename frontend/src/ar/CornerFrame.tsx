import React from "react";
import { View, StyleSheet } from "react-native";

export default function CornerFrame({
  size = 24,
  thickness = 2,
  armLength,
  color = "#1A1A1A",
  style,
}: {
  size?: number;
  thickness?: number;
  armLength?: number;
  color?: string;
  style?: any;
}) {
  const arm = armLength ?? size * 0.4;
  const corner = (position: { top?: number; bottom?: number; left?: number; right?: number }) => {
    const borders: Record<string, number> = {};
    if (position.top != null) borders.borderTopWidth = thickness;
    if (position.bottom != null) borders.borderBottomWidth = thickness;
    if (position.left != null) borders.borderLeftWidth = thickness;
    if (position.right != null) borders.borderRightWidth = thickness;
    return (
      <View
        style={[
          styles.corner,
          { width: arm, height: arm, borderColor: color, ...position, ...borders },
        ]}
      />
    );
  };

  return (
    <View style={[{ width: size, height: size }, style]}>
      {corner({ top: 0, left: 0 })}
      {corner({ top: 0, right: 0 })}
      {corner({ bottom: 0, left: 0 })}
      {corner({ bottom: 0, right: 0 })}
    </View>
  );
}

const styles = StyleSheet.create({
  corner: { position: "absolute" },
});
