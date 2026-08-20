const USAGE_LABEL: Record<string, string> = {
  DAILY: "매일 사용",
  FEW_TIMES_A_WEEK: "주 여러 번 사용",
  OCCASIONAL: "가끔 사용",
  RARE: "거의 사용 안 함",
};

function worstItem(value: unknown): string | null {
  if (value == null || typeof value !== "object") return null;
  const entries = Object.entries(value as Record<string, unknown>).filter(
    (entry): entry is [string, number] => typeof entry[1] === "number",
  );
  if (entries.length === 0) return null;
  const [label, score] = entries.reduce((worst, entry) => (entry[1] > worst[1] ? entry : worst));
  return `${label} ${score}점`;
}

export function reasonChips(factors: Record<string, unknown> | undefined | null): string[] {
  if (!factors) return [];
  const chips: string[] = [];

  const worst = worstItem(factors["마모도"]);
  if (worst) chips.push(worst);

  const usage = factors["사용빈도"];
  if (typeof usage === "string") chips.push(USAGE_LABEL[usage] ?? usage);

  const season = factors["계절"];
  if (typeof season === "string") chips.push(`${season} 시즌`);

  const days = factors["구매경과일"];
  if (typeof days === "number") chips.push(`보유 ${days}일`);

  const urgent = factors["연속긴급진단"];
  if (typeof urgent === "number") chips.push(`긴급 진단 ${urgent}회 연속`);

  return chips;
}
