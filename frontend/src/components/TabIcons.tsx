import { StyleSheet, View } from "react-native";
import { Text } from "./BrandText";
import Svg, { Circle, G, Path } from "react-native-svg";

export type IconProps = { color: string; focused: boolean };

const BOX = 40;
const SIZE = 33;
const VIEW_BOX = "0 0 24 24";
const STROKE = 1.7;

const SCALE = 20 / 17.2;
const GROW = `translate(12 12) scale(${SCALE}) translate(-12 -12)`;
const LINE = STROKE / SCALE;

export function Diamond({ color, size = 8 }: { color: string; size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        backgroundColor: color,
        transform: [{ rotate: "45deg" }],
      }}
    />
  );
}

export function HomeIcon({ color }: IconProps) {
  return (
    <View style={styles.iconBox}>
      <Svg width={SIZE} height={SIZE} viewBox={VIEW_BOX}>
        <G transform={GROW}>
          <Path
            d="M3.6 10.4 L12 3.6 L20.4 10.4 V20.2 H3.6 Z"
            stroke={color}
            strokeWidth={LINE}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
          <Path
            d="M9.9 20.2 V15.9 a2.1 2.1 0 0 1 4.2 0 V20.2"
            stroke={color}
            strokeWidth={LINE}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </G>
      </Svg>
    </View>
  );
}

export function ArIcon({ color }: IconProps) {
  return (
    <View style={styles.iconBox}>
      <Svg width={SIZE} height={SIZE} viewBox={VIEW_BOX}>
        <G transform={GROW}>
          <Path
            d="M3.4 8.6 V5.6 a2.2 2.2 0 0 1 2.2 -2.2 h3
             M20.6 8.6 V5.6 a2.2 2.2 0 0 0 -2.2 -2.2 h-3
             M20.6 15.4 V18.4 a2.2 2.2 0 0 1 -2.2 2.2 h-3
             M3.4 15.4 V18.4 a2.2 2.2 0 0 0 2.2 2.2 h3"
            stroke={color}
            strokeWidth={1.8 / SCALE}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </G>
      </Svg>
      <Text style={[styles.arText, { color }]}>AR</Text>
    </View>
  );
}

export function DiagnosisIcon({ color }: IconProps) {
  return (
    <View style={styles.iconBox}>
      <Svg width={35} height={35} viewBox={VIEW_BOX}>
        <G transform={GROW}>
          <Circle
            cx={10.6}
            cy={10.6}
            r={6.6}
            stroke={color}
            strokeWidth={2.1 / SCALE}
            fill="none"
          />
          <Path
            d="M15.5 15.5 L20.4 20.4"
            stroke={color}
            strokeWidth={2.1 / SCALE}
            strokeLinecap="round"
            fill="none"
          />
        </G>
      </Svg>
    </View>
  );
}

export function JourneyIcon({ color }: IconProps) {
  return (
    <View style={styles.iconBox}>
      <Svg width={SIZE} height={SIZE} viewBox={VIEW_BOX}>
        <G transform={GROW}>
          <Path
            d="M9.4 6.2 V5.2 a1.6 1.6 0 0 1 1.6-1.6 h2 a1.6 1.6 0 0 1 1.6 1.6 v1"
            stroke={color}
            strokeWidth={LINE}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
          <Path
            d="M6 6.2 h12 a2.4 2.4 0 0 1 2.4 2.4 v9.4 a2.4 2.4 0 0 1 -2.4 2.4 h-12
             a2.4 2.4 0 0 1 -2.4 -2.4 v-9.4 a2.4 2.4 0 0 1 2.4 -2.4 z"
            stroke={color}
            strokeWidth={LINE}
            strokeLinejoin="round"
            fill="none"
          />
          <Path
            d="M8.7 13.4 L15.6 10.1 L12.3 17 L11.5 14.2 Z"
            stroke={color}
            strokeWidth={LINE}
            strokeLinejoin="round"
            fill="none"
          />
        </G>
      </Svg>
    </View>
  );
}

export function ProfileIcon({ color }: IconProps) {
  return (
    <View style={styles.iconBox}>
      <Svg width={SIZE} height={SIZE} viewBox={VIEW_BOX}>
        <G transform={GROW}>
          <Circle cx={12} cy={8.4} r={4.1} stroke={color} strokeWidth={LINE} fill="none" />
          <Path
            d="M4.6 20.4 a7.4 7.4 0 0 1 14.8 0"
            stroke={color}
            strokeWidth={LINE}
            strokeLinecap="round"
            fill="none"
          />
        </G>
      </Svg>
    </View>
  );
}

export const styles = StyleSheet.create({
  iconBox: { width: BOX, height: BOX, alignItems: "center", justifyContent: "center" },
  arText: { position: "absolute", fontSize: 14.5, fontWeight: "700", letterSpacing: 0.2 },
});
