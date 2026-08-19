import Svg, { Circle, Defs, G, Path, Text as SvgText, TextPath } from "react-native-svg";
import { StyleSheet, View, type ViewStyle } from "react-native";

import { colors } from "../theme";

/* 여권 스탬프. 실제 고무도장처럼 이중 원테 + 위쪽 아치 영문 + 가운데 선화 + 아래 한글.
   타입 키는 journey/index.tsx의 typeLabel()이 만들어내는 라벨과 같은 집합이라,
   타임라인 항목의 라벨을 그대로 넘기면 된다. */
export type StampType =
  | "등록"
  | "진단"
  | "케어"
  | "순간 기록"
  | "매장 방문"
  | "셀프 케어"
  | "기타"
  | "승계"
  | "예약"
  | "알림";

const GLYPHS: Record<StampType, { en: string; path: string }> = {
  등록: {
    en: "REGISTER",
    path: "M38 34h20a3 3 0 0 1 3 3v26a3 3 0 0 1-3 3H38a3 3 0 0 1-3-3V37a3 3 0 0 1 3-3zM43 42h10M43 48h10M43 54h6",
  },
  진단: {
    en: "DIAGNOSIS",
    path: "M40 40a7 7 0 0 1 14 0M36 40h22l2 20H34zM47 50m-7.5 0a7.5 7.5 0 1 0 15 0a7.5 7.5 0 1 0-15 0M52.6 55.6l5.6 5.6",
  },
  케어: {
    en: "CARE",
    path: "M42 38a5.5 5.5 0 0 1 11 0M38.5 38h18l1.6 15H36.9zM40 44h13M43.5 41.5v3M49.5 41.5v3M43.5 47.5v3M49.5 47.5v3M33 66c1.5-5 4.5-8 8-9M62 66c-1.5-5-4.5-8-8-9M36 68c3-2 7-3 11-3s8 1 11 3",
  },
  "순간 기록": {
    en: "MOMENT",
    path: "M34 42h5l2.5-4h13l2.5 4h5a2 2 0 0 1 2 2v18a2 2 0 0 1-2 2H34a2 2 0 0 1-2-2V44a2 2 0 0 1 2-2zM47 53m-7 0a7 7 0 1 0 14 0a7 7 0 1 0-14 0",
  },
  "매장 방문": { en: "STORE", path: "M33 44h28v22H33zM33 44l3-8h22l3 8M41 66V54h12v12" },
  "셀프 케어": {
    en: "SELF CARE",
    path: "M43 34h8v7h-8zM47 41v5M38 46h18l2.4 20H35.6zM43 53h8M43 58h8",
  },
  기타: { en: "OTHER", path: "M47 50m-14 0a14 14 0 1 0 28 0a14 14 0 1 0-28 0M47 43v9M47 57.5v.5" },
  승계: { en: "TRANSFER", path: "M34 44h22l-6-6M60 56H38l6 6" },
  예약: { en: "BOOKING", path: "M34 40h26v24H34zM34 48h26M41 36v6M53 36v6M41 55h5" },
  알림: {
    en: "NOTICE",
    path: "M47 34a11 11 0 0 1 11 11c0 12 4 15 4 15H32s4-3 4-15a11 11 0 0 1 11-11zM43.5 62a3.6 3.6 0 0 0 7 0",
  },
};

export function Stamp({
  type,
  size = 86,
  locked = false,
  style,
}: {
  type: string;
  size?: number;
  locked?: boolean;
  style?: ViewStyle;
}) {
  const glyph = GLYPHS[type as StampType] ?? GLYPHS["기타"];
  const ink = locked ? colors.inkLocked : colors.ink;
  // TextPath는 같은 문서 안에서 id가 겹치면 첫 번째 경로만 따라가므로 타입별로 나눠 둔다.
  const arcId = `stamp-arc-${glyph.en.replace(/\s/g, "")}-${locked ? "off" : "on"}`;

  return (
    <View
      style={[
        styles.paper,
        { width: size, height: size, borderRadius: size / 2 },
        locked && styles.paperLocked,
        style,
      ]}
    >
      <Svg width={size} height={size} viewBox="0 0 94 94">
        <Defs>
          <Path id={arcId} d="M 16,50 A 31,31 0 0 1 78,50" fill="none" />
        </Defs>
        <Circle cx="47" cy="47" r="44" fill="none" stroke={ink} strokeWidth={1.7} />
        <Circle cx="47" cy="47" r="38.5" fill="none" stroke={ink} strokeWidth={1} />
        <SvgText fontSize="9.4" fill={ink} fontWeight="500">
          <TextPath href={`#${arcId}`} startOffset="50%" textAnchor="middle">
            {glyph.en}
          </TextPath>
        </SvgText>
        <G fill="none" stroke={ink} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
          <Path d={glyph.path} />
        </G>
        <SvgText x="47" y="79.5" textAnchor="middle" fontSize="9.6" fill={ink}>
          {type}
        </SvgText>
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  paper: {
    backgroundColor: colors.stampPaper,
    alignItems: "center",
    justifyContent: "center",
    // 종이 두께처럼 보이도록 아래쪽에만 단단한 그림자를 준다.
    shadowColor: "#5A3E1A",
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  paperLocked: { backgroundColor: "#F7F7F9", shadowOpacity: 0.1 },
});
