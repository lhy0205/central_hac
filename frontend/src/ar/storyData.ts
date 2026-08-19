// AR 결과 화면에서 보여줄 카테고리별 스토리 문구.
// 키는 탐지 모델(YOLOv8n)의 클래스명 — productLabels.ts의 PRODUCT_CLASS_LABELS와 같은 집합이다.
// 730 SKU 개별 제품 스토리는 아직 없어서, 우선 카테고리 단위 문구로 채운 목데이터다.
export interface StoryEntry {
  emoji: string;
  story: string;
}

const STORY_DATA: Record<string, StoryEntry> = {
  Handbag: {
    emoji: "👜",
    story:
      "작은 공간이지만 손거울, 립스틱, 영수증 한 장까지 — 주인의 하루가 통째로 담겨 있는 작은 세계예요.",
  },
  Backpack: {
    emoji: "🎒",
    story:
      "매일 아침 노트북과 책, 그리고 하루치 각오를 함께 짊어졌어요. 지퍼 자국 하나하나가 그 여정의 흔적이에요.",
  },
  Suitcase: {
    emoji: "🧳",
    story: "바퀴에 남은 흠집은 지나온 공항의 개수예요. 낯선 도시의 첫 새벽을 늘 함께한 동행이죠.",
  },
  Wallet: {
    emoji: "👛",
    story:
      '닳은 모서리는 수백 번의 "감사합니다"를 대신 말해줘요. 카드 한 장 한 장에 그날의 선택이 숨어 있어요.',
  },
  Belt: {
    emoji: "🔗",
    story: "버클의 잔주름은 계절이 바뀔 때마다 조여온 자리예요. 매일의 마무리를 책임져온 조연이죠.",
  },
  Sunglasses: {
    emoji: "🕶️",
    story:
      "눈부신 여름 해변, 낯선 도시의 골목길 — 렌즈 너머로 본 풍경들이 이 안경에 조용히 쌓여 있어요.",
  },
  Scarf: {
    emoji: "🧣",
    story: "목덜미에 닿던 첫 찬바람을 대신 막아준 자리. 결마다 그해 겨울의 온도가 남아 있어요.",
  },
  Footwear: {
    emoji: "👟",
    story:
      "밑창의 마모는 걸어온 거리의 기록이에요. 새벽 공기를 가르며 쌓인 킬로미터가 이 안에 남아있어요.",
  },
  Shirt: {
    emoji: "👔",
    story:
      "접힌 깃의 각도마다 중요한 자리의 긴장이 배어 있어요. 단정함으로 하루를 시작하게 해준 옷이죠.",
  },
  Jacket: {
    emoji: "🧥",
    story: "소매 끝의 결은 수없이 걷어붙인 순간들이에요. 어깨선에는 그날의 자세가 그대로 남아요.",
  },
  Coat: {
    emoji: "🧥",
    story: "긴 겨울을 함께 건너온 옷. 주머니 깊은 곳에는 잊고 지낸 영수증과 그날의 온기가 있어요.",
  },
  Trousers: {
    emoji: "👖",
    story: "무릎의 옅은 주름은 앉고 일어선 횟수만큼의 하루예요. 가장 오래 몸에 붙어 있던 옷이죠.",
  },
  Skirt: {
    emoji: "👗",
    story: "걸음마다 흔들린 밑단의 결. 계절이 바뀔 때마다 가장 먼저 꺼내 입은 옷이에요.",
  },
  Shorts: {
    emoji: "🩳",
    story: "여름의 한복판을 통과한 옷. 밑단의 바랜 색이 그해 햇볕의 세기를 말해줘요.",
  },
  Sweater: {
    emoji: "🧶",
    story: "보풀 하나하나가 껴안았던 순간들이에요. 가장 편한 자리에서 가장 오래 입은 옷이죠.",
  },
  Hat: {
    emoji: "🧢",
    story:
      "챙 끝의 바랜 색은 정수리로 받아낸 햇볕의 양이에요. 가장 높은 곳에서 하루를 함께 견딘 물건이죠.",
  },
};

const FALLBACK_STORY: StoryEntry = {
  emoji: "✨",
  story:
    "오래 곁에 둔 물건에는 저마다의 시간이 쌓여 있어요. 이 제품에도 당신의 이야기가 남아 있을 거예요.",
};

export function getStory(className: string): StoryEntry {
  return STORY_DATA[className] ?? FALLBACK_STORY;
}
