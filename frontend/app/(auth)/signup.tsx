import { router } from "expo-router";
import { useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text } from "react-native";
import { ApiError, authApi } from "../../src/api/client";
import { AppButton, Field, Header } from "../../src/components/UI";
import { common } from "../../src/theme";
export default function Signup() {
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
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Header title="회원가입" back />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>새로운 케어 여정을 시작하세요</Text>
        <Text style={styles.description}>
          계정 정보를 입력하면 MCM Care 서비스를 이용할 수 있습니다.
        </Text>
        <Field label="닉네임" value={nickname} onChange={setNickname} placeholder="사용할 닉네임" />
        <Field label="이메일" value={email} onChange={setEmail} placeholder="user@example.com" />
        <Field
          label="비밀번호"
          value={password}
          onChange={setPassword}
          secure
          placeholder="8자 이상"
        />
        <Field
          label="비밀번호 확인"
          value={confirm}
          onChange={setConfirm}
          secure
          placeholder="비밀번호 재입력"
        />
        <AppButton
          disabled={loading}
          title={loading ? "가입 중..." : "회원가입"}
          onPress={submit}
        />
        <Text style={styles.help}>
          백엔드 서버가 실행되지 않은 상태에서는 실제 회원가입이 저장되지 않습니다. 화면 확인은
          로그인 화면의 체험하기를 이용해주세요.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#fff" },
  scroll: { backgroundColor: "#fff" },
  content: { padding: 22, paddingBottom: 80, gap: 15, backgroundColor: "#fff", flexGrow: 1 },
  title: { fontSize: 23, fontWeight: "600", color: "#2B2B2B", marginTop: 12 },
  description: { fontSize: 12, lineHeight: 18, color: "#888", marginBottom: 8 },
  help: { fontSize: 10, lineHeight: 15, color: "#999", textAlign: "center", marginTop: 2 },
});
