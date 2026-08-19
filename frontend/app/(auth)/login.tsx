import { router } from "expo-router";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
} from "react-native";
import { ApiError } from "../../src/api/client";
import { AppButton, Field } from "../../src/components/UI";
import { useAuth } from "../../src/context/AuthContext";
import { common, colors } from "../../src/theme";
export default function Login() {
  const auth = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  async function submit() {
    if (!email || !password) return setError("이메일과 비밀번호를 입력해주세요.");
    setLoading(true);
    setError("");
    try {
      await auth.login(email.trim(), password);
      router.replace("/(tabs)/home");
    } catch (reason) {
      setError(
        reason instanceof ApiError
          ? reason.message
          : "서버에 연결할 수 없습니다. 백엔드 주소와 실행 상태를 확인해주세요.",
      );
    } finally {
      setLoading(false);
    }
  }
  async function demo() {
    await auth.enterDemo();
    router.replace("/(tabs)/home");
  }
  return (
    <KeyboardAvoidingView
      style={common.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.logo}>
          MCM<Text style={styles.care}>Care</Text>
        </Text>
        <Text style={styles.eyebrow}>CARE JOURNEY</Text>
        <Text style={styles.title}>다시 만나서 반가워요</Text>
        <Text style={common.muted}>나의 가방과 함께한 케어 여정을 계속 기록해보세요.</Text>
        <Field label="이메일" value={email} onChange={setEmail} />
        <Field label="비밀번호" value={password} onChange={setPassword} secure error={error} />
        <Pressable onPress={() => router.push("/(auth)/forgot")}>
          <Text style={styles.rightLink}>비밀번호 찾기</Text>
        </Pressable>
        <AppButton
          disabled={loading}
          title={loading ? "로그인 중..." : "로그인"}
          onPress={submit}
        />
        <Pressable style={styles.signupButton} onPress={() => router.push("/(auth)/signup")}>
          <Text style={styles.signupText}>
            아직 계정이 없으신가요? <Text style={styles.signupStrong}>회원가입</Text>
          </Text>
        </Pressable>
        <Pressable style={styles.demoButton} onPress={demo}>
          <Text style={styles.demoText}>백엔드 없이 화면 체험하기</Text>
        </Pressable>
        <Text style={styles.demoHelp}>
          개발 확인용이며 실제 계정이나 데이터는 저장되지 않습니다.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
const styles = StyleSheet.create({
  scroll: { backgroundColor: "#fff" },
  content: {
    padding: 22,
    paddingTop: 52,
    paddingBottom: 80,
    gap: 14,
    backgroundColor: "#fff",
    flexGrow: 1,
  },
  logo: { fontSize: 27, fontWeight: "800", color: "#202020" },
  care: { fontSize: 13, fontWeight: "400", color: "#202020" },
  eyebrow: { marginTop: 66, color: colors.gold, letterSpacing: 2, fontSize: 12 },
  title: { fontSize: 25, fontWeight: "600", color: "#292929" },
  rightLink: { textAlign: "right", color: "#444", fontSize: 12 },
  signupButton: { minHeight: 44, alignItems: "center", justifyContent: "center" },
  signupText: { color: "#555", fontSize: 13 },
  signupStrong: { color: colors.brown, fontWeight: "700" },
  demoButton: {
    height: 46,
    borderWidth: 1,
    borderColor: "#C9B79D",
    borderRadius: 5,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FBF7F0",
  },
  demoText: { color: colors.brown, fontSize: 13, fontWeight: "600" },
  demoHelp: { color: "#999", fontSize: 10, textAlign: "center" },
});
