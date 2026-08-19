/* 카탈로그 API가 아직 없어 임시로 두는 제품 목록.
   register/index.tsx 안에 있던 MOCK_PRODUCTS를 색상 칩까지 쓸 수 있게 옮겨 왔다.
   실제 카탈로그 API가 생기면 이 파일만 바꿔 끼우면 된다. */
export type CatalogItem = { id: string; name: string; color: string; price: number };

export const MOCK_PRODUCTS: CatalogItem[] = [
  { id: "m1", name: "Aren 비세토스 스쿨 토트", color: "Soft Pink", price: 1250000 },
  { id: "m2", name: "Pina 비세토스 스터드 장식 토트", color: "Cognac", price: 1450000 },
  { id: "m3", name: "Visetos 숄더백", color: "Black", price: 980000 },
  { id: "m4", name: "Liz 클러치", color: "Ivory", price: 650000 },
  { id: "m5", name: "Himmel 백팩", color: "Camel", price: 1650000 },
  { id: "m6", name: "Odeon 크로스바디", color: "Berry", price: 890000 },
  { id: "m7", name: "Nomad 토트", color: "Sand", price: 1350000 },
  { id: "m8", name: "Klara 숄더백", color: "White", price: 1120000 },
];

// 목록에 색상 칩을 같이 보여주기 위한 대응표. 카탈로그에 색상 코드가 생기면 대체된다.
export const COLOR_SWATCH: Record<string, string> = {
  "Soft Pink": "#F2C9CE",
  Cognac: "#9A5B2B",
  Black: "#1C1C1C",
  Ivory: "#F2EADA",
  Camel: "#C08E52",
  Berry: "#7B2740",
  Sand: "#DCC9A6",
  White: "#FFFFFF",
};

export function priceText(value: number) {
  return `₩ ${value.toLocaleString("ko-KR")}`;
}
