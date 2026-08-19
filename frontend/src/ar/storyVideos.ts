// AR 결과 화면에서 카테고리별로 보여줄 실제 촬영 영상.
// 탐지 모델(YOLOv8n) 17클래스 중 "가방류"(핸드백/백팩/지갑/벨트/선글라스)는 촬영본이
// 12개+3개로 풍부해서 제품마다 다른 걸 보여줄 수 있다. 신발/캐리어는 각 2개, 스카프는
// 전용 1개. 나머지 의류 카테고리(셔츠/재킷/코트/바지/스커트/반바지/스웨터/모자)는 촬영본이
// 없어 기존 placeholder로 대체한다.
const PLACEHOLDER = require("../../assets/ar/story_placeholder.mp4");

const BAG_VIDEOS = [
  require("../../assets/ar/videos/bag1.mp4"),
  require("../../assets/ar/videos/bag2.mp4"),
  require("../../assets/ar/videos/bag3.mp4"),
  require("../../assets/ar/videos/bag4.mp4"),
  require("../../assets/ar/videos/bag5.mp4"),
  require("../../assets/ar/videos/bag6.mp4"),
  require("../../assets/ar/videos/bag7.mp4"),
  require("../../assets/ar/videos/bag8.mp4"),
  require("../../assets/ar/videos/bag9.mp4"),
  require("../../assets/ar/videos/bag10.mp4"),
  require("../../assets/ar/videos/bag11.mp4"),
  require("../../assets/ar/videos/bag12.mp4"),
  require("../../assets/ar/videos/bag-collection.mp4"),
  require("../../assets/ar/videos/bag-editorial.mp4"),
];
const SCARF_VIDEOS = [require("../../assets/ar/videos/bag-scarf.mp4")];
const SHOES_VIDEOS = [
  require("../../assets/ar/videos/shoes1.mp4"),
  require("../../assets/ar/videos/shoes2.mp4"),
];
const SUITCASE_VIDEOS = [
  require("../../assets/ar/videos/suitcase1.mp4"),
  require("../../assets/ar/videos/suitcase2.mp4"),
];

// 탐지 클래스 -> 영상 풀. 여기 없는 클래스(의류 등)는 placeholder를 쓴다.
const VIDEO_POOLS: Record<string, unknown[]> = {
  Handbag: BAG_VIDEOS,
  Backpack: BAG_VIDEOS,
  Wallet: BAG_VIDEOS,
  Belt: BAG_VIDEOS,
  Sunglasses: BAG_VIDEOS,
  Scarf: SCARF_VIDEOS,
  Footwear: SHOES_VIDEOS,
  Suitcase: SUITCASE_VIDEOS,
};

// 같은 제품이면 항상 같은 영상이 나오도록(재조회 시 매번 바뀌면 어색하다), productId 등
// 안정적인 키를 해시해 풀 안에서 하나를 고른다.
function pick<T>(pool: T[], seed: string): T {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return pool[hash % pool.length];
}

export function getStoryVideo(className: string, seed: string) {
  const pool = VIDEO_POOLS[className];
  if (!pool || pool.length === 0) return PLACEHOLDER;
  return pick(pool, seed);
}
