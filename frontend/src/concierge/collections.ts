export type Collection = {
  id: string;
  video: NodeRequire;
  kicker: string;
  title: string;
  caption: string;

  summary: string;
  story: string;
  facts: string[];

  product: string;
};

export const COLLECTIONS: Collection[] = [
  {
    id: "nomad",
    video: require("../../assets/ar/videos/bag-editorial.mp4"),
    kicker: "ICON",
    title: "Nomad Backpack",
    caption: "떠나는 사람의 가방",
    summary: "공항에서 시작해 도시로 이어지는 가방",
    story:
      "노마드 라인은 도시를 옮겨 다니는 사람을 위해 설계됐습니다. 어깨에 닿는 각도, 검색대에서 열리는 방향까지 이동을 전제로 만들어졌습니다.",
    facts: ["코팅 캔버스", "브라스 플레이트", "1976 뮌헨"],
    product: "Himmel 백팩",
  },
  {
    id: "aren",
    video: require("../../assets/ar/videos/bag-collection.mp4"),
    kicker: "NEW ARRIVAL",
    title: "Aren 스쿨 토트",
    caption: "매일 드는 가방의 조건",
    summary: "코팅 캔버스와 브라스 플레이트",
    story:
      "매일 드는 가방은 매일 시험받습니다. 아렌은 책과 노트북의 무게를 견디도록 바닥을 보강하고, 손잡이가 닿는 자리에 두께를 더했습니다.",
    facts: ["코팅 캔버스", "보강 바닥", "A4 수납"],
    product: "Aren 비세토스 스쿨 토트",
  },
  {
    id: "patina",
    video: require("../../assets/ar/videos/bag3.mp4"),
    kicker: "CRAFTSMANSHIP",
    title: "오래 쓴 가방의 얼굴",
    caption: "마모는 결함이 아니라 기록입니다",
    summary: "파티나가 생기는 원리",
    story:
      "코팅 캔버스는 시간이 지나며 모서리부터 색이 옅어집니다. 이 변화는 손상이 아니라 그 가방이 어디를 다녔는지 남는 흔적입니다. 여권은 이 흔적을 기록으로 바꿉니다.",
    facts: ["모서리 마모", "브라스 산화", "케어 가이드 연결"],
    product: "Visetos 숄더백",
  },
  {
    id: "visetos",
    video: require("../../assets/ar/videos/bag8.mp4"),
    kicker: "HERITAGE",
    title: "Visetos, 여행이 남긴 무늬",
    caption: "1976년 뮌헨에서 시작된 여정",
    summary: "로고가 무늬가 되기까지",
    story:
      "비세토스는 여행 가방의 외장재로 출발했습니다. 긁힘과 물에 강해야 했기에 코팅을 입혔고, 그 위에 반복된 로고가 지금의 무늬가 되었습니다.",
    facts: ["1976 뮌헨", "코팅 캔버스", "트래블 헤리티지"],
    product: "Nomad 토트",
  },
];
