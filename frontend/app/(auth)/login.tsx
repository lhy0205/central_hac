import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { Text, TextInput } from "../../src/components/BrandText";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ApiError } from "../../src/api/client";
import { BrandBackdrop, BrandMark } from "../../src/components/BrandBackdrop";
import { useAuth } from "../../src/context/AuthContext";

/* 스플래시·시작 화면과 같은 배경 영상 위에 올라간다 — 로고는 위로 올라가고 폼이 아래에 붙는다. */
export default function Login() {
  const auth = useAuth();
  const insets = useSafeAreaInsets();
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
    <View style={styles.screen}>
      <StatusBar style="light" />
      <BrandBackdrop dim />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 30 },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <Pressable
            accessibilityLabel="뒤로"
            hitSlop={12}
            onPress={() => router.replace("/(auth)/landing")}
            style={styles.back}
          >
            <Text style={styles.backText}>‹</Text>
          </Pressable>

          <BrandMark style={styles.mark} />

          <Text style={styles.eyebrow}>CARE JOURNEY</Text>
          <Text style={styles.title}>다시 만나서 반가워요</Text>
          <Text style={styles.desc}>나의 가방과 함께한 케어 여정을 계속 기록해보세요.</Text>

          <Text style={styles.label}>이메일</Text>
          <TextInput
            autoCapitalize="none"
            keyboardType="email-address"
            onChangeText={setEmail}
            placeholderTextColor="rgba(255,255,255,0.32)"
            style={styles.input}
            value={email}
          />

          <Text style={styles.label}>비밀번호</Text>
          <TextInput
            onChangeText={setPassword}
            placeholderTextColor="rgba(255,255,255,0.32)"
            secureTextEntry
            style={styles.input}
            value={password}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable onPress={() => router.push("/(auth)/forgot")} style={styles.rightLink}>
            <Text style={styles.rightLinkText}>비밀번호 찾기</Text>
          </Pressable>

          <Pressable
            disabled={loading}
            onPress={submit}
            style={({ pressed }) => [styles.cta, pressed && styles.pressed]}
          >
            <Text style={styles.ctaText}>{loading ? "로그인 중..." : "로그인"}</Text>
          </Pressable>

          <Text style={styles.hint}>
            아직 계정이 없으신가요?{" "}
            <Text onPress={() => router.push("/(auth)/signup")} style={styles.link}>
              회원가입
            </Text>
          </Text>

          <Pressable onPress={demo} style={styles.demo}>
            <Text style={styles.demoText}>백엔드 없이 화면 체험하기</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#150E06" },
  flex: { flex: 1 },
  content: { paddingHorizontal: 26 },
  back: { width: 34, height: 34, justifyContent: "center" },
  backText: { fontSize: 26, color: "rgba(255,255,255,0.8)" },
  mark: { marginTop: 6, marginBottom: 34, transform: [{ scale: 0.72 }] },
  eyebrow: { fontSize: 9, letterSpacing: 3.2, color: "rgba(226,203,150,0.75)", marginBottom: 12 },
  title: { fontSize: 19, fontWeight: "700", color: "#F6F1E7", marginBottom: 8 },
  desc: { fontSize: 12.5, color: "rgba(255,255,255,0.55)", lineHeight: 20, marginBottom: 24 },
  label: { fontSize: 11, color: "rgba(255,255,255,0.55)", marginBottom: 6 },
  input: {
    height: 44,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.24)",
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.07)",
    paddingHorizontal: 12,
    color: "#F4EEE2",
    fontSize: 13,
    marginBottom: 16,
  },
  error: { fontSize: 11.5, color: "#F0A0A0", marginTop: -8, marginBottom: 12 },
  rightLink: { alignSelf: "flex-end", marginTop: -6, marginBottom: 6 },
  rightLinkText: {
    fontSize: 11.5,
    color: "rgba(255,255,255,0.55)",
    textDecorationLine: "underline",
  },
  cta: {
    height: 54,
    borderRadius: 27,
    backgroundColor: "#D2AC6B",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 12,
  },
  pressed: { transform: [{ scale: 0.98 }] },
  ctaText: { fontSize: 15, fontWeight: "700", color: "#2B1C12" },
  hint: { marginTop: 15, textAlign: "center", fontSize: 12.5, color: "rgba(255,255,255,0.6)" },
  link: { color: "#E4CB93", fontWeight: "700", textDecorationLine: "underline" },
  demo: { alignSelf: "center", marginTop: 14, padding: 6 },
  demoText: {
    fontSize: 12,
    color: "rgba(255,255,255,0.45)",
    textDecorationLine: "underline",
  },
});
