import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Alert, ScrollView } from "react-native";
import { Text } from "../../src/components/BrandText";
import { ApiError, careRecordApi } from "../../src/api/client";
import { AppButton, Field, Header } from "../../src/components/UI";
import { PhotoPicker, validatePhotos, type PickedPhoto } from "../../src/components/PhotoPicker";
import { common } from "../../src/theme";
// toISOString()은 UTC 기준이라 그 문자열을 그대로 뒀다가 new Date(text)로 다시 파싱하면
// 로컬 시간대로 잘못 해석돼 KST 기준 9시간이 어긋난다. 로컬 필드로 직접 조합해 피한다.
function localDateTimeInput(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
export default function CareRecord() {
  const {
    id,
    careType: initialType,
    materialType: initialMaterial,
    notes: initialNotes,
  } = useLocalSearchParams<{
    id: string;
    careType?: string;
    materialType?: string;
    notes?: string;
  }>();
  const [careType, setCareType] = useState(initialType || "");
  const [materialType, setMaterialType] = useState(initialMaterial || "");
  const [notes, setNotes] = useState(initialNotes || "");
  const [completedAt, setCompletedAt] = useState(localDateTimeInput(new Date()));
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  const [loading, setLoading] = useState(false);
  async function submit() {
    if (!id || !careType.trim()) return Alert.alert("확인", "케어 유형을 입력해주세요.");
    const fileError = validatePhotos(photos);
    if (fileError) return Alert.alert("파일 확인", fileError);
    const date = new Date(completedAt);
    if (Number.isNaN(date.getTime()) || date.getTime() > Date.now())
      return Alert.alert("확인", "완료 일시는 현재 또는 과거여야 합니다.");
    setLoading(true);
    try {
      const record = await careRecordApi.create(
        id,
        {
          careType: careType.trim(),
          materialType: materialType.trim() || undefined,
          notes: notes.trim() || undefined,
          completedAt: date.toISOString(),
        },
        photos[0],
      );
      Alert.alert("기록 완료", "케어 기록이 여권에 추가되었습니다.", [
        {
          text: "확인",
          onPress: () =>
            router.replace({
              pathname: "/care/detail",
              params: { id: String(record.id), passportId: id },
            }),
        },
      ]);
    } catch (error) {
      Alert.alert(
        "기록 실패",
        error instanceof ApiError ? error.message : "케어 기록을 저장하지 못했습니다.",
      );
    } finally {
      setLoading(false);
    }
  }
  return (
    <>
      <Header title="케어 기록" back />
      <ScrollView contentContainerStyle={common.content} keyboardShouldPersistTaps="handled">
        <Text style={common.title}>완료한 케어를 기록해주세요</Text>
        <Field
          label="케어 유형"
          value={careType}
          onChange={setCareType}
          placeholder="예: 셀프 케어"
        />
        <Field
          label="소재"
          value={materialType}
          onChange={setMaterialType}
          placeholder="선택 입력"
        />
        <Field
          label="완료 일시"
          value={completedAt}
          onChange={setCompletedAt}
          placeholder="2026-08-14T10:30"
        />
        <Field
          label="메모"
          value={notes}
          onChange={setNotes}
          placeholder="케어 과정을 기록해주세요"
        />
        <Text style={{ color: "#333" }}>사진 (선택)</Text>
        <PhotoPicker max={1} onChange={setPhotos} />
        <AppButton
          disabled={loading}
          title={loading ? "저장 중..." : "여권에 기록하기"}
          onPress={submit}
        />
      </ScrollView>
    </>
  );
}
