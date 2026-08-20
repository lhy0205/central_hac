export type CareMaterial = "코팅 캔버스" | "가죽" | "금속";
export type CareSymptom = "모서리 마모" | "코팅 벗겨짐" | "변색" | "금속 부자재";
export type CareGuide = {
  steps: Array<[string, string]>;
  supplies: string[];
  warnings: string[];
  minutes: number;
  officialRecommended: boolean;
};
export const MATERIALS: CareMaterial[] = ["코팅 캔버스", "가죽", "금속"];
export const SYMPTOMS: CareSymptom[] = ["모서리 마모", "코팅 벗겨짐", "변색", "금속 부자재"];
const MATERIAL_CONFIG: Record<
  CareMaterial,
  { prep: string; protect: string; supplies: string[]; warnings: string[] }
> = {
  "코팅 캔버스": {
    prep: "마른 극세사 천으로 결을 따라 표면 먼지를 제거합니다",
    protect: "코팅 표면용 보호제를 아주 얇게 펴 바릅니다",
    supplies: ["극세사 천 2장", "코팅 캔버스 전용 클리너", "코팅 표면용 보호제"],
    warnings: ["알코올·아세톤·물티슈를 사용하지 마세요", "인쇄 무늬를 강하게 문지르지 마세요"],
  },
  가죽: {
    prep: "부드러운 마른 천으로 가죽 표면의 먼지를 털어냅니다",
    protect: "가죽 컨디셔너를 천에 소량 묻혀 얇게 도포합니다",
    supplies: ["부드러운 극세사 천 2장", "중성 가죽 클리너", "가죽 컨디셔너"],
    warnings: [
      "가죽에 물을 직접 뿌리지 마세요",
      "눈에 띄지 않는 부분에 먼저 테스트하세요",
      "젖은 가죽에 열풍을 사용하지 마세요",
    ],
  },
  금속: {
    prep: "마른 천으로 금속 부자재의 먼지와 지문을 제거합니다",
    protect: "마른 천으로 잔여물을 완전히 닦아 광택을 정리합니다",
    supplies: ["안경닦이용 극세사 천", "면봉", "비연마성 금속 클리너"],
    warnings: [
      "연마제·치약·거친 수세미를 사용하지 마세요",
      "클리너가 가죽이나 캔버스에 닿지 않게 하세요",
    ],
  },
};
const SYMPTOM_CONFIG: Record<
  CareSymptom,
  {
    title: string;
    action: (material: CareMaterial) => string;
    supplies: string[];
    warnings: string[];
    minutes: number;
    official: boolean;
  }
> = {
  "모서리 마모": {
    title: "모서리 집중 관리",
    action: (material) =>
      material === "가죽"
        ? "클리너를 천에 소량 묻혀 마모된 모서리를 누르듯 닦고 가죽 컨디셔너로 마무리합니다"
        : "모서리의 오염만 가볍게 닦고 표면이 더 벗겨지지 않도록 보호제를 얇게 바릅니다",
    supplies: ["면봉"],
    warnings: ["마모 부위를 반복해서 세게 문지르지 마세요"],
    minutes: 8,
    official: false,
  },
  "코팅 벗겨짐": {
    title: "코팅 손상 보호",
    action: () => "들뜬 코팅을 뜯지 말고 주변 오염만 정리한 뒤 마찰이 생기지 않도록 보호합니다",
    supplies: ["부드러운 면봉"],
    warnings: [
      "접착제나 투명 매니큐어로 임의 보수하지 마세요",
      "벗겨짐이 넓으면 공식 수선을 이용하세요",
    ],
    minutes: 7,
    official: true,
  },
  변색: {
    title: "변색 부위 정리",
    action: (material) =>
      material === "금속"
        ? "클리너를 면봉에 극소량 묻혀 변색된 금속만 닦은 뒤 즉시 마른 천으로 마무리합니다"
        : "오염에 의한 변색인지 작은 부위에서 확인하고 전용 클리너로 한 방향으로 가볍게 닦습니다",
    supplies: ["흰색 테스트 천"],
    warnings: [
      "염료가 묻어나오면 즉시 중단하세요",
      "햇빛 표백이나 산소계 표백제를 사용하지 마세요",
    ],
    minutes: 10,
    official: false,
  },
  "금속 부자재": {
    title: "금속 부자재 관리",
    action: () => "면봉으로 연결부 먼지를 제거하고 비연마성 클리너를 천에 묻혀 금속만 닦습니다",
    supplies: ["면봉", "비연마성 금속 클리너"],
    warnings: ["도금이 벗겨진 부위는 광택제로 복원할 수 없습니다"],
    minutes: 8,
    official: true,
  },
};

export function symptomsFromScores(scores: Record<string, number>): CareSymptom[] {
  const found = new Set<CareSymptom>();
  Object.entries(scores)
    .filter(([, score]) => Number(score) > 0)
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .forEach(([key]) => {
      const normalized = key.replaceAll(" ", "");
      if (normalized.includes("코팅") || normalized.includes("벗겨")) found.add("코팅 벗겨짐");
      else if (
        normalized.includes("변색") ||
        normalized.includes("오염") ||
        normalized.includes("얼룩")
      )
        found.add("변색");
      else if (
        normalized.includes("부자재") ||
        normalized.includes("금속") ||
        normalized.includes("지퍼") ||
        normalized.includes("버클")
      )
        found.add("금속 부자재");
      else if (
        normalized.includes("마모") ||
        normalized.includes("모서리") ||
        normalized.includes("스크래치")
      )
        found.add("모서리 마모");
    });
  return [...found];
}
export function buildCareGuide(material: CareMaterial, symptoms: CareSymptom[]): CareGuide {
  const base = MATERIAL_CONFIG[material];
  const active = symptoms.length ? symptoms : ["모서리 마모" as CareSymptom];
  const symptomSteps = active.slice(0, 2).map((symptom) => {
    const config = SYMPTOM_CONFIG[symptom];
    return [config.title, config.action(material)] as [string, string];
  });
  return {
    steps: [
      ["표면 먼지 제거", base.prep],
      ...symptomSteps,
      ["보호 및 건조", `${base.protect}. 직사광선을 피해 통풍이 되는 곳에서 충분히 건조합니다`],
    ],
    supplies: [
      ...new Set([
        ...base.supplies,
        ...active.flatMap((symptom) => SYMPTOM_CONFIG[symptom].supplies),
      ]),
    ],
    warnings: [
      ...new Set([
        ...base.warnings,
        ...active.flatMap((symptom) => SYMPTOM_CONFIG[symptom].warnings),
      ]),
    ],
    minutes: 15 + active.reduce((sum, symptom) => sum + SYMPTOM_CONFIG[symptom].minutes, 0),
    officialRecommended: active.some((symptom) => SYMPTOM_CONFIG[symptom].official),
  };
}
