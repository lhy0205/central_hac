import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

// (tabs)/_layout.tsx의 실제 탭바와 BottomTabBar(탭 네비게이터 밖 화면용 대체 탭바)가
// 똑같은 아이콘을 쓰도록 공유하는 파일.
//
// 예전에는 View를 겹쳐 그렸다 — borderRadius로 곡선을, rotate로 사선을 흉내 내는 식이라
// 집 지붕이나 여행가방 화살표처럼 꺾이는 선은 원본 도안과 늘 조금씩 어긋났다. 지금은
// react-native-svg가 들어와 있으므로(스탬프에서 이미 쓴다) 전부 패스로 그린다.
export type IconProps = { color: string; focused: boolean };

const BOX = 36;
const SIZE = 29;
const VIEW_BOX = "0 0 24 24";
const STROKE = 1.7;

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
        {/* 지붕에서 벽, 바닥까지 한 붓으로 잇는다. 조각을 따로 두면 꼭짓점이 벌어진다. */}
        <Path
          d="M3.6 10.4 L12 3.6 L20.4 10.4 V20.2 H3.6 Z"
          stroke={color}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        {/* 바닥에 붙은 아치형 문 */}
        <Path
          d="M9.9 20.2 V15.9 a2.1 2.1 0 0 1 4.2 0 V20.2"
          stroke={color}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </Svg>
    </View>
  );
}

// 네 모서리 브래킷 안에 AR 글자. 스캔 프레임을 축소한 형태다.
export function ArIcon({ color }: IconProps) {
  return (
    <View style={styles.iconBox}>
      <Svg width={SIZE} height={SIZE} viewBox={VIEW_BOX}>
        <Path
          d="M3.4 8.6 V5.6 a2.2 2.2 0 0 1 2.2 -2.2 h3
             M20.6 8.6 V5.6 a2.2 2.2 0 0 0 -2.2 -2.2 h-3
             M20.6 15.4 V18.4 a2.2 2.2 0 0 1 -2.2 2.2 h-3
             M3.4 15.4 V18.4 a2.2 2.2 0 0 0 2.2 2.2 h3"
          stroke={color}
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </Svg>
      {/* 글자는 SVG Text 대신 RN Text로 둔다 — 앱 글꼴이 그대로 적용돼 나머지 UI와 붙는다. */}
      <Text style={[styles.arText, { color }]}>AR</Text>
    </View>
  );
}

// 가운데 탭. 검은 원 위에 흰 돋보기가 올라간다(원 배경은 탭바가 그린다).
export function DiagnosisIcon({ color }: IconProps) {
  return (
    <View style={styles.iconBox}>
      <Svg width={31} height={31} viewBox={VIEW_BOX}>
        <Circle cx={10.6} cy={10.6} r={6.6} stroke={color} strokeWidth={2.1} fill="none" />
        <Path
          d="M15.5 15.5 L20.4 20.4"
          stroke={color}
          strokeWidth={2.1}
          strokeLinecap="round"
          fill="none"
        />
      </Svg>
    </View>
  );
}

// 여권 = 여행가방 + 떠나는 방향을 가리키는 화살표.
export function JourneyIcon({ color }: IconProps) {
  return (
    <View style={styles.iconBox}>
      <Svg width={SIZE} height={SIZE} viewBox={VIEW_BOX}>
        {/* 손잡이 */}
        <Path
          d="M9.4 6.2 V5.2 a1.6 1.6 0 0 1 1.6-1.6 h2 a1.6 1.6 0 0 1 1.6 1.6 v1"
          stroke={color}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        {/* 가방 몸통 */}
        <Path
          d="M6 6.2 h12 a2.4 2.4 0 0 1 2.4 2.4 v9.4 a2.4 2.4 0 0 1 -2.4 2.4 h-12
             a2.4 2.4 0 0 1 -2.4 -2.4 v-9.4 a2.4 2.4 0 0 1 2.4 -2.4 z"
          stroke={color}
          strokeWidth={STROKE}
          strokeLinejoin="round"
          fill="none"
        />
        <Path
          d="M8.7 13.4 L15.6 10.1 L12.3 17 L11.5 14.2 Z"
          stroke={color}
          strokeWidth={STROKE}
          strokeLinejoin="round"
          fill="none"
        />
      </Svg>
    </View>
  );
}

export function ProfileIcon({ color }: IconProps) {
  return (
    <View style={styles.iconBox}>
      <Svg width={SIZE} height={SIZE} viewBox={VIEW_BOX}>
        <Circle cx={12} cy={8.4} r={4.1} stroke={color} strokeWidth={STROKE} fill="none" />
        {/* 어깨선. 양 끝을 닫지 않아야 원본처럼 열린 호로 보인다. */}
        <Path
          d="M4.6 20.4 a7.4 7.4 0 0 1 14.8 0"
          stroke={color}
          strokeWidth={STROKE}
          strokeLinecap="round"
          fill="none"
        />
      </Svg>
    </View>
  );
}

export const styles = StyleSheet.create({
  iconBox: { width: BOX, height: BOX, alignItems: "center", justifyContent: "center" },
  arText: { position: "absolute", fontSize: 11.5, fontWeight: "700", letterSpacing: 0.2 },
});
