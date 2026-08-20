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
