import type { TimelineItem } from "../api/client";
import { gradeLabel } from "../theme";

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
    String(item.detail.note ?? "")
      .split("\n")[0]
      .trim() ||
    EVENT_TYPE_LABEL[String(item.detail.eventType)] ||
    "기록"
  );
}

export function noteFor(item: TimelineItem) {
  const detail = item.detail as Record<string, unknown>;

  if (item.type === "USER_EVENT") {
    const body = String(detail.note ?? "")
      .split("\n")
      .slice(1)
      .join("\n")
      .trim();
    return body || "적어 둔 메모가 없습니다.";
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
