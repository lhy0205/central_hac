import * as SecureStore from "expo-secure-store";

/* 예비 여권 — Concierge에서 "관심 등록"을 누른 제품.

   아직 사지 않았으니 서버에 여권을 만들 수 없다(여권은 일련번호가 있어야 생긴다).
   그렇다고 관심을 그냥 흘려보내면 구매 전과 구매 후가 끊긴다. 그래서 기기에만 저장해 두고
   홈 "내 가방"에 점선 카드로 세워 둔다. 실제로 구매해 시리얼을 스캔하면 그 자리가 진짜
   여권으로 바뀌고 이 항목은 지워진다.

   백엔드 MVP 범위 밖이라 로컬 저장이다. 관심 목록 API가 생기면 이 파일만 바꿔 끼우면 된다.
   AsyncStorage가 설치돼 있지 않아 토큰과 같은 SecureStore를 쓴다 — 항목이 몇 개뿐이라
   값 크기 제한에 걸릴 일이 없다. */
const KEY = "pendingPassports";

export type PendingPassport = {
  /* 컬렉션 id이자 목록 안에서의 식별자. 같은 컬렉션을 두 번 담아도 하나로 취급한다. */
  id: string;
  modelName: string;
  addedAt: string;
};

export async function listPending(): Promise<PendingPassport[]> {
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    // 저장 형식이 바뀌었거나 값이 깨졌을 때 홈 전체가 죽지 않도록 방어한다.
    return Array.isArray(parsed) ? (parsed as PendingPassport[]) : [];
  } catch {
    return [];
  }
}

async function write(items: PendingPassport[]) {
  await SecureStore.setItemAsync(KEY, JSON.stringify(items));
}

export async function addPending(entry: Omit<PendingPassport, "addedAt">) {
  const items = await listPending();
  if (items.some((item) => item.id === entry.id)) return items;
  const next = [...items, { ...entry, addedAt: new Date().toISOString() }];
  await write(next);
  return next;
}

export async function removePending(id: string) {
  const next = (await listPending()).filter((item) => item.id !== id);
  await write(next);
  return next;
}
