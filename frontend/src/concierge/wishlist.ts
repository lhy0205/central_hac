import * as SecureStore from "expo-secure-store";

const KEY = "pendingPassports";

export type PendingPassport = {
  id: string;
  modelName: string;
  addedAt: string;
};

export async function listPending(): Promise<PendingPassport[]> {
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);

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
