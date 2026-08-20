import { router } from "expo-router";
import { useState } from "react";
import { Alert, ScrollView } from "react-native";
import { Text } from "../../src/components/BrandText";
import { ApiError, authApi } from "../../src/api/client";
import { AppButton, Field, Header } from "../../src/components/UI";
import { common } from "../../src/theme";
export default function Forgot() {
  const [step, setStep] = useState<"request" | "confirm">("request");
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  async function request() {
    if (!/^\S+@\S+\.\S+$/.test(email)) return Alert.alert("확인", "올바른 이메일을 입력해주세요.");
    setLoading(true);
    try {
      await authApi.forgot(email.trim());
      setStep("confirm");
      Alert.alert("전송 완료", "이메일로 받은 재설정 토큰을 입력해주세요.");
    } catch (error) {
      Alert.alert(
        "전송 실패",
        error instanceof ApiError ? error.message : "요청을 처리하지 못했습니다.",
      );
    } finally {
      setLoading(false);
    }
  }
  async function reset() {
    if (!token.trim() || pw.length < 8 || pw.length > 72 || pw !== confirm)
      return Alert.alert("확인", "토큰과 새 비밀번호(8~72자)를 확인해주세요.");
    setLoading(true);
    try {
      await authApi.resetConfirm({ token: token.trim(), newPassword: pw });
      Alert.alert("변경 완료", "새 비밀번호로 로그인해주세요.", [
        { text: "확인", onPress: () => router.replace("/(auth)/login") },
      ]);
    } catch (error) {
      Alert.alert(
        "변경 실패",
        error instanceof ApiError ? error.message : "비밀번호를 변경하지 못했습니다.",
      );
    } finally {
      setLoading(false);
    }
  }
  return (
    <>
      <Header title="비밀번호 찾기" back />
      <ScrollView contentContainerStyle={common.content}>
        <Text style={common.title}>
          {step === "request" ? "가입한 이메일을 입력해주세요" : "새 비밀번호를 설정해주세요"}
        </Text>
        {step === "request" ? (
          <>
            <Text style={common.muted}>비밀번호 재설정 안내를 보내드릴게요.</Text>
            <Field label="이메일" value={email} onChange={setEmail} />
            <AppButton
              disabled={loading}
              title={loading ? "전송 중..." : "재설정 메일 보내기"}
              onPress={request}
            />
          </>
        ) : (
          <>
            <Field label="이메일로 받은 토큰" value={token} onChange={setToken} />
            <Field label="새 비밀번호" value={pw} onChange={setPw} secure />
            <Field label="새 비밀번호 확인" value={confirm} onChange={setConfirm} secure />
            <AppButton
              disabled={loading}
              title={loading ? "변경 중..." : "비밀번호 변경"}
              onPress={reset}
            />
            <AppButton outline title="메일 다시 보내기" onPress={() => setStep("request")} />
          </>
        )}
      </ScrollView>
    </>
  );
}
