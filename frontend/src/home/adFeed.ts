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
