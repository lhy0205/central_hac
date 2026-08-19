import { StyleSheet, View } from "react-native";

// (tabs)/_layout.tsx의 실제 탭바와 BottomTabBar(탭 네비게이터 밖 화면용 대체 탭바)가
// 똑같은 아이콘을 쓰도록 공유하는 파일.
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
        <Diamond color={color} size={7} />
      </View>
    </View>
  );
}

export function ArIcon({ color }: IconProps) {
  return (
    <View style={styles.arIconBox}>
      <View style={[styles.arOrbit, { borderColor: color }]} />
      <View style={[styles.arPhone, { borderColor: color }]}>
        <View style={[styles.arSpeaker, { backgroundColor: color }]} />
        <Diamond color={color} size={8} />
      </View>
      <View style={[styles.arBaseDash, styles.arBaseOne, { backgroundColor: color }]} />
      <View style={[styles.arBaseDash, styles.arBaseTwo, { backgroundColor: color }]} />
      <View style={[styles.arBaseDash, styles.arBaseThree, { backgroundColor: color }]} />
      <View style={[styles.arBaseDash, styles.arBaseFour, { backgroundColor: color }]} />
      <View style={[styles.arBaseDash, styles.arBaseFive, { backgroundColor: color }]} />
    </View>
  );
}

export function DiagnosisIcon({ color }: IconProps) {
  return (
    <View style={[styles.diagnosisHalo, { borderColor: color }]}>
      <View style={[styles.diagnosisLens, { borderColor: color }]}>
        <Diamond color={color} size={7} />
      </View>
      <View style={[styles.diagnosisHandle, { backgroundColor: color }]} />
    </View>
  );
}

export function JourneyIcon({ color }: IconProps) {
  return (
    <View style={styles.iconBox}>
      <View style={[styles.passport, { borderColor: color }]}>
        <View style={[styles.passportFold, { borderColor: color }]} />
        <Diamond color={color} size={6} />
      </View>
    </View>
  );
}

export function ProfileIcon({ color }: IconProps) {
  return (
    <View style={styles.iconBox}>
      <View style={[styles.profileCircle, { borderColor: color }]}>
        <View style={[styles.profileHead, { borderColor: color }]} />
        <View style={styles.profileDiamondWrap}>
          <Diamond color={color} size={7} />
        </View>
      </View>
    </View>
  );
}

export const styles = StyleSheet.create({
  iconBox: { width: 43, height: 39, alignItems: "center", justifyContent: "center" },
  arIconBox: { width: 54, height: 42, alignItems: "center", justifyContent: "center" },
  homeRoofLeft: {
    position: "absolute",
    top: 7,
    left: 4,
    width: 20,
    height: 1.5,
    transform: [{ rotate: "-40deg" }],
  },
  homeRoofRight: {
    position: "absolute",
    top: 7,
    right: 4,
    width: 20,
    height: 1.5,
    transform: [{ rotate: "40deg" }],
  },
  homeBody: {
    position: "absolute",
    top: 13,
    width: 30,
    height: 23,
    borderWidth: 1.5,
    borderTopWidth: 0,
    borderBottomLeftRadius: 1,
    borderBottomRightRadius: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  arOrbit: {
    position: "absolute",
    top: 12,
    width: 52,
    height: 14,
    borderWidth: 1.5,
    borderRadius: 26,
  },
  arPhone: {
    position: "absolute",
    top: 0,
    width: 24,
    height: 33,
    borderWidth: 1.6,
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  arSpeaker: {
    position: "absolute",
    top: 4,
    width: 6,
    height: 1.5,
    borderRadius: 1,
  },
  arBaseDash: {
    position: "absolute",
    width: 8,
    height: 1.4,
    borderRadius: 1,
  },
  arBaseOne: { left: 5, bottom: 7, transform: [{ rotate: "27deg" }] },
  arBaseTwo: { left: 14, bottom: 3, transform: [{ rotate: "27deg" }] },
  arBaseThree: { left: 23, bottom: 0 },
  arBaseFour: { right: 14, bottom: 3, transform: [{ rotate: "-27deg" }] },
  arBaseFive: { right: 5, bottom: 7, transform: [{ rotate: "-27deg" }] },
  diagnosisHalo: {
    width: 54,
    height: 54,
    borderRadius: 27,
    borderWidth: 1.4,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFF",
  },
  diagnosisLens: {
    width: 27,
    height: 27,
    borderRadius: 14,
    borderWidth: 1.4,
    alignItems: "center",
    justifyContent: "center",
  },
  diagnosisHandle: {
    position: "absolute",
    width: 13,
    height: 1.5,
    right: 7,
    bottom: 10,
    transform: [{ rotate: "45deg" }],
  },
  passport: {
    width: 27,
    height: 31,
    borderWidth: 1.5,
    borderRadius: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  passportFold: {
    position: "absolute",
    top: -3,
    left: 2,
    width: 22,
    height: 4,
    borderTopWidth: 1.2,
    transform: [{ rotate: "-7deg" }],
  },
  profileCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1.5,
    alignItems: "center",
  },
  profileHead: {
    width: 10,
    height: 10,
    marginTop: 4,
    borderRadius: 5,
    borderWidth: 1.4,
  },
  profileDiamondWrap: {
    position: "absolute",
    bottom: 6,
    alignItems: "center",
    justifyContent: "center",
  },
});
