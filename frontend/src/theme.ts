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

  ink: "#9A6F3E",
  inkLocked: "#BFBFC7",
  stampPaper: "#FDFBF6",
  stampEdge: "#E7DCC6",
  goldLight: "#E2C68A",
  goldDeep: "#B8934E",
  night: "#150E06",
};

export const GRADE_COLORS: Record<string, string> = {
  S: "#1F7A5C",
  A: "#4C9F70",
  B: "#C9A227",
  C: "#D77A2B",
  D: "#A04747",
};
export function gradeColor(grade: string | null | undefined) {
  return grade ? (GRADE_COLORS[grade] ?? colors.line) : "#DADADA";
}

export function gradeLabel(grade: string | null | undefined) {
  return grade ?? null;
}

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
