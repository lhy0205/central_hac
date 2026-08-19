import type { TimelineItem } from "../api/client";
import { gradeLabel } from "../theme";

/* 타임라인 항목의 라벨/제목. journey/index.tsx에 있던 것을 여권 3D 맵과 스탬프 상세도
   같이 쓰도록 옮겼다 — 두 화면이 다른 문구를 보여주면 같은 기록이 달라 보인다. */
export const EVENT_TYPE_LABEL: Record<string, string> = {
  MOMENT: "순간 기록",
  STORE_VISIT: "매장 방문",
  SELF_CARE: "셀프 케어",
  OTHER: "기타",
};

export function typeLabel(item: TimelineItem) {
  if (item.type === "DIAGNOSIS") return "진단";
  if (item.type === "CARE") return "케어";
  if (item.type === "REGISTRATION") return "등록";
  if (item.type === "NOTIFICATION") return "알림";
  if (item.type === "RESERVATION") return "예약";
  if (item.type === "TRANSFER") return "승계";
  return EVENT_TYPE_LABEL[String(item.detail.eventType)] || "기타";
}

export function titleFor(item: TimelineItem) {
  if (item.type === "DIAGNOSIS")
    return `마모 진단 · 등급 ${gradeLabel(String(item.detail.overallGrade))}`;
  if (item.type === "CARE") return `케어 기록 · ${item.detail.careType}`;
  if (item.type === "NOTIFICATION") return String(item.detail.message ?? "알림");
  if (item.type === "REGISTRATION") return `여권 등록 · ${item.detail.modelName}`;
  if (item.type === "RESERVATION")
    return item.detail.status === "CANCELLED"
      ? `예약 취소 · ${item.detail.storeName}`
      : `매장 케어 예약 · ${item.detail.storeName}`;
  if (item.type === "TRANSFER") return "여권 승계 완료";
  return (
    String(item.detail.note ?? "") || EVENT_TYPE_LABEL[String(item.detail.eventType)] || "기록"
  );
}

/* 스탬프 상세의 노트 본문.
   기록 종류마다 본문이 될 만한 필드가 다르고, 진단처럼 메모 자체가 없는 것도 있다.
   빈 문자열을 그대로 돌려주면 상세가 빈 상자로 보이므로 항상 읽을 거리를 만들어 준다. */
export function noteFor(item: TimelineItem) {
  const detail = item.detail as Record<string, unknown>;

  if (item.type === "USER_EVENT") {
    const note = String(detail.note ?? "").trim();
    return note || EVENT_TYPE_LABEL[String(detail.eventType)] || "기록";
  }

  if (item.type === "DIAGNOSIS") {
    const evidence = String(detail.evidenceText ?? "").trim();
    const scores = detail.itemScores as Record<string, number> | undefined;
    const scoreLines = scores
      ? Object.entries(scores).map(([label, value]) => `${label} ${value}`)
      : [];
    return [evidence, scoreLines.join("  ·  ")].filter(Boolean).join("\n\n") || titleFor(item);
  }

  if (item.type === "CARE") {
    const notes = String(detail.notes ?? "").trim();
    const careType = String(detail.careType ?? "").trim();
    const material = String(detail.materialType ?? "").trim();
    return (
      [careType, material && `소재: ${material}`, notes].filter(Boolean).join("\n") ||
      titleFor(item)
    );
  }

  if (item.type === "RESERVATION") {
    const store = String(detail.storeName ?? "").trim();
    const slot = String(detail.slotDateTime ?? "")
      .replace("T", " ")
      .slice(0, 16);
    return [store, slot].filter(Boolean).join("\n") || titleFor(item);
  }

  return titleFor(item);
}

export function stampDate(value: string) {
  return value.slice(0, 10).replaceAll("-", ".");
}
