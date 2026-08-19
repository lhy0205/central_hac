import * as ImagePicker from "expo-image-picker";
import { router, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import {
  Alert,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { journeyApi } from "../../src/api/client";
import { validatePhotos, type PickedPhoto } from "../../src/components/PhotoPicker";
import { Header } from "../../src/components/UI";
import { colors } from "../../src/theme";

const TYPES = ["순간 기록", "매장 방문", "셀프 케어", "기타"] as const;
const EVENT_TYPE_MAP: Record<string, "MOMENT" | "STORE_VISIT" | "SELF_CARE" | "OTHER"> = {
  "순간 기록": "MOMENT",
  "매장 방문": "STORE_VISIT",
  "셀프 케어": "SELF_CARE",
  기타: "OTHER",
};

// Date.toISOString()은 UTC로 변환하므로 KST 등 UTC보다 앞선 시간대에서는 실제 로컬 날짜보다
// 하루 이른 값이 나올 수 있다 — 로컬 필드를 직접 조합해서 피한다.
function isoDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
// 선택한 날짜에 "지금" 시각을 붙인다. T00:00:00으로 고정하면 같은 날 실제 생성 시각을 쓰는
// 다른 기록(진단·케어 등)보다 항상 타임라인에서 앞에 와버린다.
function isoDateTime(dateStr: string) {
  const now = new Date();
  const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;
  return `${dateStr}T${time}`;
}
function displayDate(value: string) {
  return value.replaceAll("-", ". ");
}

export default function Add() {
  const { id, type: initialType } = useLocalSearchParams<{ id: string; type?: string }>();
  const [type, setType] = useState(
    TYPES.includes(initialType as (typeof TYPES)[number]) ? String(initialType) : "순간 기록",
  );
  const [title, setTitle] = useState("");
  const [memo, setMemo] = useState("");
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  const [date, setDate] = useState(isoDate(new Date()));
  const [showDates, setShowDates] = useState(false);
  const [saving, setSaving] = useState(false);
  const dateOptions = useMemo(
    () =>
      Array.from({ length: 7 }, (_, index) => {
        const d = new Date();
        d.setDate(d.getDate() - index);
        return isoDate(d);
      }),
    [],
  );

  async function pickImages() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("사진 권한 필요", "설정에서 사진 접근 권한을 허용해주세요.", [
        { text: "취소" },
        { text: "설정 열기", onPress: Linking.openSettings },
      ]);
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      selectionLimit: 3 - photos.length,
      quality: 0.8,
    });
    if (result.canceled) return;
    const next = result.assets.map((asset) => ({
      uri: asset.uri,
      name: asset.fileName || `journey-${Date.now()}.jpg`,
      type: asset.mimeType || "image/jpeg",
      fileSize: asset.fileSize,
    }));
    const error = validatePhotos([...photos, ...next]);
    if (error) return Alert.alert("파일 확인", error);
    setPhotos((current) => [...current, ...next].slice(0, 3));
  }

  async function save() {
    if (!id) return Alert.alert("확인", "제품 정보를 찾을 수 없습니다.");
    if (!title.trim()) return Alert.alert("확인", "제목을 입력해주세요.");
    const fileError = validatePhotos(photos);
    if (fileError) return Alert.alert("파일 확인", fileError);
    setSaving(true);
    try {
      // 백엔드 eventDate는 LocalDateTime이라 날짜만 있는 문자열은 파싱에 실패한다(400) — 시각을 붙여 보낸다.
      await journeyApi.create(
        id,
        {
          eventType: EVENT_TYPE_MAP[type],
          note: memo ? `${title}\n${memo}` : title,
          eventDate: isoDateTime(date),
        },
        photos[0],
      );
      router.replace({ pathname: "/journey", params: { id } });
    } catch {
      Alert.alert("저장 실패", "기록 저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.screen}>
      <Header />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>기록 추가</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.photoRow}
        >
          {photos.map((photo, index) => (
            <Pressable
              key={photo.uri}
              onPress={() => setPhotos((current) => current.filter((_, i) => i !== index))}
              style={styles.photoSlot}
            >
              <Image source={{ uri: photo.uri }} style={styles.photo} />
              <View style={styles.remove}>
                <Text style={styles.removeText}>×</Text>
              </View>
            </Pressable>
          ))}
          {photos.length < 3 && (
            <Pressable style={styles.photoSlot} onPress={pickImages}>
              <Text style={styles.plus}>＋</Text>
            </Pressable>
          )}
          {Array.from({ length: Math.max(0, 2 - photos.length) }).map((_, i) => (
            <Pressable
              key={`empty-${i}`}
              style={[styles.photoSlot, styles.photoMuted]}
              onPress={pickImages}
            >
              <Text style={styles.imageInsert}>이미지 삽입</Text>
            </Pressable>
          ))}
        </ScrollView>
        <View style={styles.photoRule} />

        <Text style={styles.label}>기록 유형</Text>
        <View style={styles.typeRow}>
          {TYPES.map((item) => (
            <Pressable
              key={item}
              onPress={() => setType(item)}
              style={[styles.typeChip, type === item && styles.typeOn]}
            >
              <Text style={[styles.typeText, type === item && styles.typeTextOn]}>{item}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>날짜</Text>
        <Pressable style={styles.input} onPress={() => setShowDates((value) => !value)}>
          <Text style={styles.inputText}>{displayDate(date)}</Text>
          <Text style={styles.chevron}>⌄</Text>
        </Pressable>
        {showDates && (
          <View style={styles.dateMenu}>
            {dateOptions.map((option) => (
              <Pressable
                key={option}
                onPress={() => {
                  setDate(option);
                  setShowDates(false);
                }}
                style={[styles.dateOption, date === option && styles.dateOptionOn]}
              >
                <Text style={date === option ? styles.dateOptionTextOn : styles.dateOptionText}>
                  {displayDate(option)}
                </Text>
              </Pressable>
            ))}
          </View>
        )}

        <Text style={styles.label}>제목</Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="예: 이 가방과 오사카에 다녀왔습니다"
          placeholderTextColor="#C5C5C5"
          style={styles.input}
        />
        <Text style={styles.label}>메모</Text>
        <TextInput
          value={memo}
          onChangeText={setMemo}
          multiline
          placeholder="그날의 기억을 자유롭게 남겨보세요"
          placeholderTextColor="#C5C5C5"
          style={styles.textarea}
        />
        <Pressable
          disabled={saving}
          style={[styles.submit, saving && { opacity: 0.6 }]}
          onPress={save}
        >
          <Text style={styles.submitText}>{saving ? "게시 중..." : "게시"}</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 18, paddingBottom: 110 },
  title: { fontSize: 20, color: "#444", marginBottom: 15 },
  photoRow: { gap: 7 },
  photoSlot: {
    width: 132,
    height: 108,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#D4D4D4",
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  photoMuted: { backgroundColor: "#F3F3F3" },
  photo: { width: "100%", height: "100%", resizeMode: "cover" },
  plus: { fontSize: 24, color: "#B6B6B6", fontWeight: "200" },
  imageInsert: { fontSize: 9, color: "#B8B8B8" },
  remove: {
    position: "absolute",
    top: 5,
    right: 5,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  removeText: { color: "#fff", fontSize: 15, lineHeight: 18 },
  photoRule: { height: 1, backgroundColor: "#777", marginTop: 8, marginBottom: 10 },
  label: { fontSize: 10, color: "#8C8C8C", marginTop: 11, marginBottom: 7 },
  typeRow: { flexDirection: "row", gap: 7 },
  typeChip: {
    flex: 1,
    height: 29,
    borderWidth: 1,
    borderColor: "#DDD",
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  typeOn: { backgroundColor: "#444", borderColor: "#444" },
  typeText: { fontSize: 9, color: "#777" },
  typeTextOn: { color: "#fff" },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: "#DDD",
    borderRadius: 5,
    paddingHorizontal: 13,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    fontSize: 11,
    color: "#555",
  },
  inputText: { fontSize: 10, color: "#777" },
  chevron: { fontSize: 13, color: "#999" },
  dateMenu: { borderWidth: 1, borderColor: "#E2E2E2", borderRadius: 5, marginTop: 4, padding: 5 },
  dateOption: { height: 32, paddingHorizontal: 10, justifyContent: "center", borderRadius: 4 },
  dateOptionOn: { backgroundColor: colors.dark },
  dateOptionText: { fontSize: 10, color: "#666" },
  dateOptionTextOn: { fontSize: 10, color: "#fff" },
  textarea: {
    height: 135,
    borderWidth: 1,
    borderColor: "#DDD",
    borderRadius: 5,
    padding: 13,
    textAlignVertical: "top",
    fontSize: 11,
    color: "#555",
  },
  submit: {
    width: "42%",
    height: 38,
    marginTop: 10,
    alignSelf: "center",
    borderRadius: 4,
    backgroundColor: colors.dark,
    alignItems: "center",
    justifyContent: "center",
  },
  submitText: { fontSize: 10, color: "#fff" },
});
