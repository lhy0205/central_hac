import { router } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { accountApi, ApiError, authApi, type AccountInfo } from "../../src/api/client";
import { Header } from "../../src/components/UI";
import { useAuth } from "../../src/context/AuthContext";
import { colors } from "../../src/theme";

type Step = "verify" | "choose" | "loginId" | "email" | "nickname";

export default function Account() {
  const { logout, token } = useAuth();
  const isDemo = token === "mcm-care-demo";
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("verify");
  const [currentId, setCurrentId] = useState("");
  const [password, setPassword] = useState("");
  const [nextValue, setNextValue] = useState("");
  const [nickname, setNickname] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    accountApi
      .me()
      .then((value) => {
        setAccount(value);
        setCurrentId(value.email);
        setNickname(value.nickname);
        setLoadError(null);
      })
      .catch((error) => {
        // 체험 모드에서만 예시 값을 쓴다. 실제 사용자에게까지 가짜 신원을 채우면 본인확인
        // 가드가 placeholder끼리 비교해 통과하고, 진짜 비밀번호가 남의 이메일로 전송된다.
        if (isDemo) {
          setAccount({ id: 0, email: "user@example.com", nickname: "닉네임", createdAt: "" });
          setCurrentId("user@example.com");
          setNickname("닉네임");
          setLoadError(null);
          return;
        }
        setAccount(null);
        setLoadError(
          error instanceof ApiError
            ? error.message
            : "계정 정보를 불러오지 못했습니다. 네트워크를 확인해주세요.",
        );
      })
      .finally(() => setLoading(false));
  }, [isDemo]);

  async function verifyIdentity() {
    if (!currentId.trim() || !password) {
      Alert.alert("입력 확인", "현재 아이디와 비밀번호를 입력해주세요.");
      return;
    }
    if (currentId.trim().toLowerCase() !== account?.email.toLowerCase()) {
      Alert.alert("본인확인 실패", "현재 사용 중인 아이디를 확인해주세요.");
      return;
    }

    setSubmitting(true);
    try {
      if (!isDemo) {
        await authApi.login({ email: currentId.trim(), password });
      }
      setPassword("");
      setStep("choose");
    } catch (error) {
      Alert.alert(
        "본인확인 실패",
        error instanceof ApiError ? error.message : "아이디 또는 비밀번호가 올바르지 않습니다.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  function openChange(nextStep: "loginId" | "email" | "nickname") {
    setNextValue("");
    if (nextStep === "nickname") setNickname(account?.nickname ?? "");
    setStep(nextStep);
  }

  function saveChange() {
    const value = nextValue.trim();
    if (!value) {
      Alert.alert(
        "입력 확인",
        step === "email" ? "변경할 이메일을 입력해주세요." : "변경할 아이디를 입력해주세요.",
      );
      return;
    }
    if (step === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      Alert.alert("입력 확인", "올바른 이메일 형식으로 입력해주세요.");
      return;
    }
    if (step === "loginId" && !/^[A-Za-z0-9._-]{4,30}$/.test(value)) {
      Alert.alert(
        "입력 확인",
        "아이디는 영문, 숫자, 점, 밑줄, 하이픈을 사용해 4~30자로 입력해주세요.",
      );
      return;
    }

    // 백엔드에 아이디/이메일 변경 엔드포인트가 아직 없다(AccountController는 signup/login/
    // updateMe/changePassword뿐이고 UpdateProfileRequest에는 nickname만 있다). 호출 없이
    // "요청 완료"를 띄우면 사용자는 바뀐 줄 알고 그 아이디로 로그인을 시도하게 되므로,
    // 미지원임을 그대로 알린다.
    Alert.alert(
      "아직 지원하지 않는 기능",
      `${step === "email" ? "이메일" : "아이디"} 변경은 서버 API가 준비되면 제공될 예정입니다. 입력하신 ${value}(으)로는 아직 변경되지 않았습니다.`,
      [{ text: "확인", onPress: () => setStep("choose") }],
    );
  }

  async function saveNickname() {
    const value = nickname.trim();
    if (!value) {
      Alert.alert("입력 확인", "닉네임을 입력해주세요.");
      return;
    }
    if (value === account?.nickname) {
      setStep("choose");
      return;
    }
    setSubmitting(true);
    try {
      const updated = await accountApi.updateMe({ nickname: value });
      setAccount(updated);
      setNickname(updated.nickname);
      Alert.alert("변경 완료", "닉네임이 변경되었습니다.", [
        { text: "확인", onPress: () => setStep("choose") },
      ]);
    } catch (error) {
      Alert.alert(
        "변경 실패",
        error instanceof ApiError ? error.message : "닉네임을 변경하지 못했습니다.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  function withdraw() {
    Alert.alert("회원 탈퇴", "계정과 서비스 이용 권한이 삭제됩니다. 탈퇴하시겠어요?", [
      { text: "취소", style: "cancel" },
      {
        text: "탈퇴",
        style: "destructive",
        onPress: async () => {
          try {
            await accountApi.withdraw();
            await logout();
            router.replace("/(auth)/login");
          } catch (error) {
            Alert.alert(
              "탈퇴 실패",
              error instanceof ApiError ? error.message : "회원 탈퇴를 처리하지 못했습니다.",
            );
          }
        },
      },
    ]);
  }

  if (loading) {
    return (
      <View style={styles.screen}>
        <Header title="회원 정보 변경" back />
        <View style={styles.loading}>
          <ActivityIndicator color={colors.brown} />
        </View>
      </View>
    );
  }

  if (loadError != null) {
    return (
      <View style={styles.screen}>
        <Header title="회원 정보 변경" back />
        <View style={styles.loading}>
          <Text style={styles.description}>{loadError}</Text>
          <PrimaryButton label="돌아가기" onPress={() => router.back()} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <Header title="회원 정보 변경" back />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {step === "verify" && (
          <>
            <Text style={styles.title}>회원 정보 변경</Text>
            <Text style={styles.description}>
              안전한 정보 변경을 위해 먼저 본인확인을 진행해주세요.
            </Text>
            <LabeledInput
              label="현재 아이디"
              value={currentId}
              onChangeText={setCurrentId}
              autoCapitalize="none"
            />
            <LabeledInput
              label="비밀번호"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
            <PrimaryButton
              label={submitting ? "확인 중..." : "본인확인"}
              disabled={submitting}
              onPress={verifyIdentity}
            />
          </>
        )}

        {step === "choose" && (
          <>
            <Text style={styles.title}>변경할 정보를 선택해주세요</Text>
            <Text style={styles.description}>본인확인이 완료되었습니다.</Text>
            <View style={styles.menuGroup}>
              <MenuRow
                label="닉네임 변경"
                value={account?.nickname ?? ""}
                onPress={() => openChange("nickname")}
              />
              <MenuRow
                label="이메일 변경"
                value={account?.email ?? ""}
                onPress={() => openChange("email")}
              />
              <MenuRow
                label="아이디 변경"
                value={currentId}
                onPress={() => openChange("loginId")}
              />
              <MenuRow label="비밀번호 변경" onPress={() => router.push("/profile/password")} />
            </View>
            <Pressable style={styles.verifyAgain} onPress={() => setStep("verify")}>
              <Text style={styles.verifyAgainText}>다시 본인확인</Text>
            </Pressable>
            <View style={styles.flexSpacer} />
            <Pressable style={styles.withdraw} onPress={withdraw}>
              <Text style={styles.withdrawText}>회원 탈퇴</Text>
            </Pressable>
          </>
        )}

        {step === "nickname" && (
          <>
            <Text style={styles.title}>닉네임 변경</Text>
            <Text style={styles.description}>새로 사용할 닉네임을 입력해주세요.</Text>
            <View style={styles.currentBlock}>
              <Text style={styles.fieldLabel}>현재</Text>
              <Text style={styles.currentValue}>{account?.nickname}</Text>
            </View>
            <LabeledInput label="변경할 닉네임" value={nickname} onChangeText={setNickname} />
            <PrimaryButton
              label={submitting ? "변경 중..." : "확인"}
              disabled={submitting}
              onPress={saveNickname}
            />
            <Pressable style={styles.cancelButton} onPress={() => setStep("choose")}>
              <Text style={styles.cancelText}>취소</Text>
            </Pressable>
          </>
        )}

        {(step === "loginId" || step === "email") && (
          <>
            <Text style={styles.title}>{step === "email" ? "이메일 변경" : "아이디 변경"}</Text>
            <Text style={styles.description}>
              {step === "email"
                ? "새로 사용할 이메일을 입력해주세요."
                : "새로 사용할 아이디를 입력해주세요."}
            </Text>
            <View style={styles.currentBlock}>
              <Text style={styles.fieldLabel}>현재</Text>
              <Text style={styles.currentValue}>
                {step === "email" ? account?.email : currentId}
              </Text>
            </View>
            <LabeledInput
              label={step === "email" ? "변경할 이메일" : "변경할 아이디"}
              value={nextValue}
              onChangeText={setNextValue}
              autoCapitalize="none"
              keyboardType={step === "email" ? "email-address" : "default"}
            />
            <PrimaryButton label="확인" onPress={saveChange} />
            <Pressable style={styles.cancelButton} onPress={() => setStep("choose")}>
              <Text style={styles.cancelText}>취소</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function LabeledInput(props: React.ComponentProps<typeof TextInput> & { label: string }) {
  const { label, ...inputProps } = props;
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput {...inputProps} placeholderTextColor="#AAA" style={styles.input} />
    </View>
  );
}

function PrimaryButton({
  label,
  disabled = false,
  onPress,
}: {
  label: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={[styles.primaryButton, disabled && styles.disabled]}
    >
      <Text style={styles.primaryText}>{label}</Text>
    </Pressable>
  );
}

function MenuRow({
  label,
  value,
  onPress,
}: {
  label: string;
  value?: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.menuRow} onPress={onPress}>
      <View>
        <Text style={styles.menuLabel}>{label}</Text>
        {value ? <Text style={styles.menuValue}>{value}</Text> : null}
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#FFF" },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { flexGrow: 1, paddingHorizontal: 22, paddingTop: 24, paddingBottom: 28 },
  title: {
    fontSize: 18,
    color: "#333",
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#E8E8E8",
  },
  description: { fontSize: 11, color: "#666", marginTop: 18, marginBottom: 18 },
  field: { marginBottom: 18 },
  fieldLabel: { fontSize: 10, color: "#555", marginBottom: 7 },
  input: {
    height: 42,
    borderWidth: 1,
    borderColor: "#D8D8D8",
    paddingHorizontal: 12,
    color: "#222",
    backgroundColor: "#FFF",
  },
  primaryButton: {
    alignSelf: "center",
    width: 160,
    height: 42,
    marginTop: 20,
    borderRadius: 5,
    backgroundColor: "#444",
    alignItems: "center",
    justifyContent: "center",
  },
  primaryText: { color: "#FFF", fontSize: 11 },
  disabled: { opacity: 0.45 },
  menuGroup: { borderTopWidth: 1, borderTopColor: "#E8E8E8" },
  menuRow: {
    minHeight: 68,
    borderBottomWidth: 1,
    borderBottomColor: "#E8E8E8",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 2,
  },
  menuLabel: { fontSize: 12, color: "#444" },
  menuValue: { fontSize: 9, color: "#999", marginTop: 7 },
  chevron: { fontSize: 17, color: "#B8B8B8" },
  verifyAgain: { alignSelf: "flex-start", marginTop: 18, paddingVertical: 8 },
  verifyAgainText: { fontSize: 10, color: colors.brown, textDecorationLine: "underline" },
  currentBlock: { marginTop: 22, marginBottom: 20 },
  currentValue: { fontSize: 10, color: "#777" },
  cancelButton: { alignSelf: "center", padding: 14 },
  cancelText: { color: "#888", fontSize: 11 },
  flexSpacer: { flex: 1, minHeight: 120 },
  withdraw: {
    height: 42,
    borderWidth: 1,
    borderColor: "#CCC",
    borderRadius: 5,
    alignItems: "center",
    justifyContent: "center",
  },
  withdrawText: { color: "#888", fontSize: 10 },
});
