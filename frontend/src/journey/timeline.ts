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

// 스탬프 상세의 노트에 들어갈 본문. 사용자가 직접 쓴 기록은 메모를 그대로 보여준다.
export function noteFor(item: TimelineItem) {
  if (item.type === "USER_EVENT") return String(item.detail.note ?? "");
  if (item.type === "DIAGNOSIS") return String(item.detail.evidenceText ?? "");
  if (item.type === "CARE") return String(item.detail.notes ?? item.detail.careType ?? "");
  return titleFor(item);
}

export function stampDate(value: string) {
  return value.slice(0, 10).replaceAll("-", ".");
}
