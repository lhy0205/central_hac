import { StyleSheet } from "react-native";
export const colors = {
  brown: "#7C5A34",
  gold: "#9B7A54",
  dark: "#3F3F3F",
  line: "#E5E5E5",
  soft: "#F6F6F6",
  muted: "#999",
  ivory: "#F6EFE1",
  danger: "#A04747",
};
/* 백엔드 OverallGrade가 S/A/B/C/D를 그대로 내려준다. 한글 라벨을 따로 두지 않는다 —
   진단 결과 화면이 이미 글자 등급으로 차트를 그리므로 목록만 한글로 바꾸면 표기가 갈린다. */
export function gradeLabel(grade: string | null | undefined) {
  return grade ?? null;
}
// app/diagnosis/result.tsx가 이 이름으로 가져다 쓴다. gradeLabel과 동작이 같아져서
// 별칭만 남긴다.
export const displayGrade = gradeLabel;
export const common = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 18, gap: 12, paddingBottom: 100, backgroundColor: "#fff" },
  title: { fontSize: 21, fontWeight: "500", color: "#2F2F2F" },
  section: { fontSize: 15, fontWeight: "600", marginTop: 12, color: "#2F2F2F" },
  muted: { fontSize: 12, color: colors.muted, lineHeight: 18 },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  card: { backgroundColor: colors.soft, borderRadius: 8, padding: 14 },
  input: {
    height: 46,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 5,
    paddingHorizontal: 12,
    color: "#222",
    backgroundColor: "#fff",
  },
  textarea: {
    height: 130,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 5,
    padding: 12,
    textAlignVertical: "top",
    color: "#222",
    backgroundColor: "#fff",
  },
  button: {
    height: 48,
    borderRadius: 5,
    backgroundColor: colors.dark,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: { color: "#fff", fontSize: 14 },
  outline: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#bbb" },
  outlineText: { color: colors.dark },
  error: { color: colors.danger, fontSize: 11 },
  bag: { width: 130, height: 100, resizeMode: "contain" },
  separator: { height: 1, backgroundColor: colors.line },
});
