/* 홈 배경에 계속 이어지는 캠페인 영상 목록.
   영상 자체는 AR 스토리용으로 이미 번들에 들어 있는 파일을 재사용한다 —
   실제 캠페인 소재가 준비되면 source만 갈아끼우면 된다. */
/* require()가 돌려주는 에셋 핸들은 react-native-video의 source 타입과 형태가 달라
   number로 두면 타입이 맞지 않는다. 실제로 넘겨야 하는 값은 그 핸들 그대로다. */
export type AdSlide = {
  key: string;
  source: NodeRequire;
  badge: string;
  title: string;
  caption: string;
};

export const AD_SLIDES: AdSlide[] = [
  {
    key: "heritage",
    source: require("../../assets/ar/videos/bag-editorial.mp4"),
    badge: "MCM CAMPAIGN",
    title: "Visetos Heritage",
    caption: "2026 F/W 캠페인",
  },
  {
    key: "arrival",
    source: require("../../assets/ar/videos/bag1.mp4"),
    badge: "NEW ARRIVAL",
    title: "Pina Studded Tote",
    caption: "지금 매장에서 만나보세요",
  },
  {
    key: "care",
    source: require("../../assets/ar/videos/bag3.mp4"),
    badge: "CARE STORY",
    title: "오래 쓰는 법",
    caption: "MCM 공식 케어 서비스",
  },
  {
    key: "nomad",
    source: require("../../assets/ar/videos/bag8.mp4"),
    badge: "EDITORIAL",
    title: "Nomad Passport",
    caption: "가방의 여정을 기록하다",
  },
];
