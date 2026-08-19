import { useState } from "react";
import { Alert, View } from "react-native";
import { AppButton, Field, Header } from "../../src/components/UI";
import { ApiError, accountApi } from "../../src/api/client";
import { common } from "../../src/theme";
export default function Password() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  async function save() {
    if (!(current && next.length >= 8 && next.length <= 72 && next === confirm))
      return Alert.alert("확인", "8~72자이며 서로 일치해야 합니다.");
    setSaving(true);
    try {
      await accountApi.changePassword({ currentPassword: current, newPassword: next });
      Alert.alert("변경 완료");
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch (error) {
      /* 에러 코드는 ApiError.code에 있고 문자열 표현(name: message)에는 나타나지 않아,
         String(error).includes(...)는 항상 false였다. */
      Alert.alert(
        "변경 실패",
        error instanceof ApiError && error.code === "INVALID_CURRENT_PASSWORD"
          ? "현재 비밀번호가 올바르지 않습니다."
          : error instanceof ApiError
            ? error.message
            : "비밀번호 변경에 실패했습니다.",
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <>
      <Header title="비밀번호 변경" back />
      <View style={common.content}>
        <Field label="현재 비밀번호" value={current} onChange={setCurrent} secure />
        <Field label="새 비밀번호" value={next} onChange={setNext} secure />
        <Field label="새 비밀번호 확인" value={confirm} onChange={setConfirm} secure />
        <AppButton
          title={saving ? "변경 중..." : "비밀번호 변경"}
          disabled={saving}
          onPress={save}
        />
      </View>
    </>
  );
}
