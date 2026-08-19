import { StyleSheet, Text, View } from "react-native";

// (tabs)/_layout.tsx의 실제 탭바와 BottomTabBar(탭 네비게이터 밖 화면용 대체 탭바)가
// 똑같은 아이콘을 쓰도록 공유하는 파일.
//
// 리디자인 기준: 선으로만 그린 아이콘 5개 + 가운데 검은 원(진단). react-native-svg를
// 쓰지 않는 프로젝트라 전부 View 조합으로 그린다 — 곡선은 borderRadius, 사선은 rotate.
export type IconProps = { color: string; focused: boolean };

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
      <View style={[styles.homeRoofLeft, { backgroundColor: color }]} />
      <View style={[styles.homeRoofRight, { backgroundColor: color }]} />
      <View style={[styles.homeBody, { borderColor: color }]}>
        <View style={[styles.homeDoor, { borderColor: color }]} />
      </View>
    </View>
  );
}

// 네 모서리 브래킷 안에 AR 글자. 스캔 프레임을 축소한 형태다.
export function ArIcon({ color }: IconProps) {
  return (
    <View style={styles.iconBox}>
      <View style={[styles.bracket, styles.bracketTL, { borderColor: color }]} />
      <View style={[styles.bracket, styles.bracketTR, { borderColor: color }]} />
      <View style={[styles.bracket, styles.bracketBL, { borderColor: color }]} />
      <View style={[styles.bracket, styles.bracketBR, { borderColor: color }]} />
      <Text style={[styles.arText, { color }]}>AR</Text>
    </View>
  );
}

// 가운데 탭. 검은 원 위에 흰 돋보기가 올라간다(원 배경은 _layout.tsx가 그린다).
export function DiagnosisIcon({ color }: IconProps) {
  return (
    <View style={styles.searchBox}>
      <View style={[styles.searchLens, { borderColor: color }]} />
      <View style={[styles.searchHandle, { backgroundColor: color }]} />
    </View>
  );
}

// 여권 = 여행가방 + 안쪽 방향 화살표.
export function JourneyIcon({ color }: IconProps) {
  return (
    <View style={styles.iconBox}>
      <View style={[styles.caseHandle, { borderColor: color }]} />
      <View style={[styles.caseBody, { borderColor: color }]}>
        <View style={[styles.caseArrow, { borderBottomColor: color }]} />
      </View>
    </View>
  );
}

export function ProfileIcon({ color }: IconProps) {
  return (
    <View style={styles.iconBox}>
      <View style={[styles.personHead, { borderColor: color }]} />
      <View style={[styles.personBody, { borderColor: color }]} />
    </View>
  );
}

export const styles = StyleSheet.create({
  iconBox: { width: 34, height: 34, alignItems: "center", justifyContent: "center" },

  homeRoofLeft: {
    position: "absolute",
    top: 8,
    left: 3,
    width: 18,
    height: 1.6,
    borderRadius: 1,
    transform: [{ rotate: "-41deg" }],
  },
  homeRoofRight: {
    position: "absolute",
    top: 8,
    right: 3,
    width: 18,
    height: 1.6,
    borderRadius: 1,
    transform: [{ rotate: "41deg" }],
  },
  homeBody: {
    position: "absolute",
    top: 14,
    width: 24,
    height: 16,
    borderWidth: 1.6,
    borderTopWidth: 0,
    alignItems: "center",
    justifyContent: "flex-end",
  },
  homeDoor: { width: 8, height: 8, borderWidth: 1.6, borderBottomWidth: 0 },

  bracket: { position: "absolute", width: 8, height: 8, borderColor: "#000" },
  bracketTL: { top: 5, left: 3, borderTopWidth: 1.8, borderLeftWidth: 1.8, borderTopLeftRadius: 2 },
  bracketTR: {
    top: 5,
    right: 3,
    borderTopWidth: 1.8,
    borderRightWidth: 1.8,
    borderTopRightRadius: 2,
  },
  bracketBL: {
    bottom: 5,
    left: 3,
    borderBottomWidth: 1.8,
    borderLeftWidth: 1.8,
    borderBottomLeftRadius: 2,
  },
  bracketBR: {
    bottom: 5,
    right: 3,
    borderBottomWidth: 1.8,
    borderRightWidth: 1.8,
    borderBottomRightRadius: 2,
  },
  arText: { fontSize: 11, fontWeight: "700", letterSpacing: 0.3 },

  searchBox: { width: 34, height: 34, alignItems: "center", justifyContent: "center" },
  searchLens: {
    position: "absolute",
    top: 5,
    left: 5,
    width: 19,
    height: 19,
    borderRadius: 10,
    borderWidth: 2,
  },
  searchHandle: {
    position: "absolute",
    right: 6,
    bottom: 7,
    width: 10,
    height: 2,
    borderRadius: 1,
    transform: [{ rotate: "45deg" }],
  },

  caseHandle: {
    position: "absolute",
    top: 4,
    width: 12,
    height: 6,
    borderWidth: 1.6,
    borderBottomWidth: 0,
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
  },
  caseBody: {
    position: "absolute",
    top: 9,
    width: 25,
    height: 20,
    borderWidth: 1.6,
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  // 종이비행기 대신 삼각형 하나로 방향을 표현한다(테두리 삼각형 기법).
  caseArrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 4.5,
    borderRightWidth: 4.5,
    borderBottomWidth: 9,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    transform: [{ rotate: "38deg" }],
  },

  personHead: {
    position: "absolute",
    top: 6,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 1.7,
  },
  personBody: {
    position: "absolute",
    bottom: 6,
    width: 24,
    height: 12,
    borderWidth: 1.7,
    borderBottomWidth: 0,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  },
});
