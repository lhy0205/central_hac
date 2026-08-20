export const PRODUCT_CLASS_LABELS: Record<string, string> = {
  Handbag: "핸드백",
  Backpack: "백팩",
  Suitcase: "캐리어",
  Belt: "벨트",
  Sunglasses: "선글라스",
  Scarf: "스카프",
  Footwear: "신발",
  Wallet: "지갑",
  Shirt: "셔츠",
  Jacket: "재킷",
  Coat: "코트",
  Trousers: "바지",
  Skirt: "스커트",
  Shorts: "반바지",
  Sweater: "스웨터",
  Hat: "모자",
};

export function getProductClassLabel(className: string): string {
  return PRODUCT_CLASS_LABELS[className] ?? className;
}
