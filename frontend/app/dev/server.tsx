import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, ScrollView, StyleSheet, View } from "react-native";
import { Text } from "../../src/components/BrandText";
import { AppButton, Field, Header } from "../../src/components/UI";
import { clearOverrides, getCurrentAddresses, setOverrides } from "../../src/config/serverAddress";
import { common, colors } from "../../src/theme";

/* 데모 중 서버 주소가 틀어졌을 때 앱을 재빌드/재설치하지 않고 그 자리에서 고치기 위한
   비상용 화면. 프로필 화면의 제목을 길게 눌러야 열리므로 일반 사용자는 마주치지 않는다.
   자세한 배경은 src/config/serverAddress.ts 주석 참고. */

export default function DevServerAddress() {
  const [api, setApi] = useState("");
  const [ar, setAr] = useState("");
  const [ocr, setOcr] = useState("");
  const [defaults, setDefaults] = useState({ api: "", ar: "", ocr: "" });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    getCurrentAddresses().then((current) => {
      if (!active) return;
      setApi(current.api);
      setAr(current.ar);
      setOcr(current.ocr);
      setDefaults(current.defaults);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  async function save() {
    try {
      await setOverrides(api, ar, ocr);
      Alert.alert("저장했습니다", "새 주소는 다음 요청부터 적용됩니다.", [
        { text: "확인", onPress: () => router.back() },
      ]);
    } catch {
      Alert.alert("저장 실패", "주소를 저장하지 못했습니다. 다시 시도해주세요.");
    }
  }

  async function reset() {
    try {
      await clearOverrides();
      const current = await getCurrentAddresses();
      setApi(current.api);
      setAr(current.ar);
      setOcr(current.ocr);
      Alert.alert("기본값으로 되돌렸습니다", "빌드에 포함된 주소를 다시 사용합니다.");
    } catch {
      Alert.alert("초기화 실패", "다시 시도해주세요.");
    }
  }

  if (loading) {
    return (
      <>
        <Header title="서버 주소" back hideProfile />
        <View style={common.content} />
      </>
    );
  }

  return (
    <>
      <Header title="서버 주소" back hideProfile />
      <ScrollView contentContainerStyle={common.content}>
        <Text style={common.title}>서버 주소 재정의</Text>
        <Text style={common.muted}>
          데모 중 주소가 바뀌었을 때만 사용하세요. 비워두고 저장하면 빌드에 포함된 기본 주소를 다시
          씁니다.
        </Text>

        <Field
          label="백엔드 API"
          value={api}
          onChange={setApi}
          placeholder="http://192.168.0.10:8080"
        />
        <Text style={st.hint}>기본값: {defaults.api || "(설정 안 됨)"}</Text>

        <Field
          label="AR 인식 서버"
          value={ar}
          onChange={setAr}
          placeholder="http://192.168.0.10:8001"
        />
        <Text style={st.hint}>기본값: {defaults.ar || "(설정 안 됨)"}</Text>

        <Field
          label="일련번호 OCR 서버"
          value={ocr}
          onChange={setOcr}
          placeholder="http://192.168.0.10:8002"
        />
        <Text style={st.hint}>기본값: {defaults.ocr || "(설정 안 됨)"}</Text>

        <AppButton title="저장" onPress={save} />
        <AppButton outline title="기본값으로 되돌리기" onPress={reset} />
      </ScrollView>
    </>
  );
}

const st = StyleSheet.create({
  hint: { fontSize: 10, color: colors.muted, marginTop: -6 },
});
