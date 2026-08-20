/* "왜 지금 이 알림을 받았는가"를 사람이 읽는 문구로 바꾼다.

   백엔드 NotificationService.buildReasonFactors가 알림마다 판단 근거를 jsonb로 내려주는데
   (마모도·사용빈도·계절·구매경과일, 재구매 알림에는 연속긴급진단까지) 화면은 그걸 버리고
   타입별 고정 문구만 보여주고 있었다. 값은 이미 응답에 들어 있으므로 여기서 풀기만 하면 된다.

   키가 한글인 이유는 백엔드가 그렇게 넣기 때문이고, 마모도만 항목별 점수 맵이라 따로 푼다. */

const USAGE_LABEL: Record<string, string> = {
  DAILY: "매일 사용",
  FEW_TIMES_A_WEEK: "주 여러 번 사용",
  OCCASIONAL: "가끔 사용",
  RARE: "거의 사용 안 함",
};

/* 항목 점수는 높을수록 나쁜 상태다(WearDiagnosisEngine은 마모·하자 심각도를 점수로 매기고
   최고점으로 등급을 정한다). 그래서 가장 높은 항목이 이 알림의 직접적인 이유가 된다.
   항목 이름은 엔진에 따라 달라진다 — 규칙 기반은 마모/코팅벗겨짐/변색/부자재상태, ML은
   탐지된 하자 종류라서 고정 목록을 두지 않고 받은 키를 그대로 쓴다. */
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

  // 재구매 제안에만 붙는다. Care-First 원칙상 "오래 썼다"만으로는 권하지 않고
  // 긴급 등급이 연속으로 나와야 뜨므로, 그 조건이 충족됐다는 사실 자체가 근거다.
  const urgent = factors["연속긴급진단"];
  if (typeof urgent === "number") chips.push(`긴급 진단 ${urgent}회 연속`);

  return chips;
}
