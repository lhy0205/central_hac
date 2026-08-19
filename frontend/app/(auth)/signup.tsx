import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ApiError, authApi } from "../../src/api/client";
import { BrandBackdrop, BrandMark } from "../../src/components/BrandBackdrop";

/* 로그인과 같은 배경 영상 위에 올라간다. */
export default function Signup() {
  const insets = useSafeAreaInsets();
  const [nickname, setNickname] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (!nickname.trim()) return Alert.alert("입력 확인", "닉네임을 입력해주세요.");
    if (!/^\S+@\S+\.\S+$/.test(email))
      return Alert.alert("입력 확인", "올바른 이메일을 입력해주세요.");
    if (password.length < 8 || password.length > 72)
      return Alert.alert("입력 확인", "비밀번호는 8~72자로 입력해주세요.");
    if (password !== confirm) return Alert.alert("입력 확인", "비밀번호가 일치하지 않습니다.");
    setLoading(true);
    try {
      await authApi.signup({ email: email.trim(), password, nickname: nickname.trim() });
      Alert.alert("가입 완료", "입력한 계정으로 로그인해주세요.", [
        { text: "로그인", onPress: () => router.replace("/(auth)/login") },
      ]);
    } catch (reason) {
      const message =
        reason instanceof ApiError
          ? reason.message
          : "서버에 연결할 수 없습니다. 백엔드가 실행 중인지, 휴대폰과 PC가 같은 네트워크인지 확인해주세요.";
      Alert.alert("가입 실패", message);
    } finally {
      setLoading(false);
    }
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
          <Text style={styles.title}>새로운 케어 여정을 시작하세요</Text>
          <Text style={styles.desc}>
            계정 정보를 입력하면 MCM Care 서비스를 이용할 수 있습니다.
          </Text>

          <Text style={styles.label}>닉네임</Text>
          <TextInput
            onChangeText={setNickname}
            placeholder="사용할 닉네임"
            placeholderTextColor="rgba(255,255,255,0.32)"
            style={styles.input}
            value={nickname}
          />

          <Text style={styles.label}>이메일</Text>
          <TextInput
            autoCapitalize="none"
            keyboardType="email-address"
            onChangeText={setEmail}
            placeholder="user@example.com"
            placeholderTextColor="rgba(255,255,255,0.32)"
            style={styles.input}
            value={email}
          />

          <Text style={styles.label}>비밀번호</Text>
          <TextInput
            onChangeText={setPassword}
            placeholder="8자 이상"
            placeholderTextColor="rgba(255,255,255,0.32)"
            secureTextEntry
            style={styles.input}
            value={password}
          />

          <Text style={styles.label}>비밀번호 확인</Text>
          <TextInput
            onChangeText={setConfirm}
            placeholder="비밀번호 재입력"
            placeholderTextColor="rgba(255,255,255,0.32)"
            secureTextEntry
            style={styles.input}
            value={confirm}
          />

          <Pressable
            disabled={loading}
            onPress={submit}
            style={({ pressed }) => [styles.cta, pressed && styles.pressed]}
          >
            <Text style={styles.ctaText}>{loading ? "가입 중..." : "회원가입"}</Text>
          </Pressable>

          <Text style={styles.hint}>
            이미 회원이신가요?{" "}
            <Text onPress={() => router.replace("/(auth)/login")} style={styles.link}>
              로그인
            </Text>
          </Text>
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
  mark: { marginTop: 6, marginBottom: 30, transform: [{ scale: 0.72 }] },
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
});
