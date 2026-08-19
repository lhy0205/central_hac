import * as ImagePicker from "expo-image-picker";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { validatePhotos, type PickedPhoto } from "../../src/components/PhotoPicker";
import { productApi, type PassportSummary } from "../../src/api/client";
import { colors, gradeLabel } from "../../src/theme";

const bag = require("../../assets/mcm-bag.png");

const PARTS = ["모서리", "손잡이", "바닥면", "금속 부자재"] as const;

function DiagnosisHeader({ onBack }: { onBack: () => void }) {
  return (
    <SafeAreaView edges={["top"]} style={styles.headerSafe}>
      <View style={styles.header}>
        <Pressable accessibilityLabel="뒤로가기" hitSlop={14} onPress={onBack}>
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>진단</Text>
        <View style={styles.headerSpacer} />
      </View>
    </SafeAreaView>
  );
}

export default function Diagnosis() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [passport, setPassport] = useState<PassportSummary | null>(null);
  const [passports, setPassports] = useState<PassportSummary[]>([]);
  const [loadingPassport, setLoadingPassport] = useState(true);
  const [photos, setPhotos] = useState<Array<PickedPhoto | null>>([null, null, null, null]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setLoadingPassport(true);
      productApi
        .list(0, 100)
        .then((res) => {
          if (!active) return;
          setPassports(res.content);
          setPassport(id ? (res.content.find((p) => String(p.id) === id) ?? null) : null);
        })
        .catch(() => {
          if (active) {
            setPassports([]);
            setPassport(null);
          }
        })
        .finally(() => {
          if (active) setLoadingPassport(false);
        });
      return () => {
        active = false;
      };
    }, [id]),
  );
  useEffect(() => {
    setPhotos([null, null, null, null]);
  }, [id]);

  const completed = photos.filter(Boolean).length;

  async function takePhoto(index: number) {
    const permission = await ImagePicker.requestCameraPermissionsAsync();

    if (!permission.granted) {
      Alert.alert(
        "카메라 권한이 필요합니다",
        "제품 상태를 촬영하려면 설정에서 카메라 권한을 허용해주세요.",
        [
          { text: "취소", style: "cancel" },
          { text: "설정 열기", onPress: () => Linking.openSettings() },
        ],
      );
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 0.85,
      allowsEditing: false,
    });

    if (result.canceled) return;

    const asset = result.assets[0];
    const next = [...photos];
    next[index] = {
      uri: asset.uri,
      name: asset.fileName ?? `${PARTS[index]}-${Date.now()}.jpg`,
      type: asset.mimeType ?? "image/jpeg",
      fileSize: asset.fileSize,
    };
    setPhotos(next);
  }

  function removePhoto(index: number) {
    const next = [...photos];
    next[index] = null;
    setPhotos(next);
  }

  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)/home");
  }

  function startAnalysis() {
    if (!id) return;
    const selected = photos.filter((photo): photo is PickedPhoto => photo !== null);
    if (selected.length !== 4) return;
    const fileError = validatePhotos(selected);
    if (fileError) return Alert.alert("파일 확인", fileError);

    router.push({
      pathname: "/diagnosis/analysis",
      params: { id, photos: JSON.stringify(selected) },
    });
  }

  if (!id) {
    return (
      <View style={styles.screen}>
        <DiagnosisHeader onBack={goBack} />
        {loadingPassport ? (
          <View style={styles.selectionLoading}>
            <ActivityIndicator color={colors.brown} />
            <Text style={styles.selectionLoadingText}>가방을 불러오고 있습니다</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.selectionContent}>
            <Text style={styles.selectionTitle}>진단할 가방을 선택해주세요</Text>
            <Text style={styles.selectionDescription}>
              등록된 가방 중 상태를 확인할 제품을 눌러주세요.
            </Text>
            {passports.length === 0 ? (
              <View style={styles.selectionEmpty}>
                <Text style={styles.selectionEmptyTitle}>등록된 가방이 없습니다</Text>
                <Text style={styles.selectionEmptyText}>
                  진단을 시작하려면 먼저 제품을 등록해주세요.
                </Text>
                <Pressable
                  style={styles.selectionRegister}
                  onPress={() => router.push("/register")}
                >
                  <Text style={styles.selectionRegisterText}>＋ 제품 등록하기</Text>
                </Pressable>
              </View>
            ) : (
              passports.map((item) => (
                <Pressable
                  key={item.id}
                  style={styles.selectionCard}
                  onPress={() =>
                    router.replace({
                      pathname: "/(tabs)/diagnosis",
                      params: { id: String(item.id) },
                    })
                  }
                >
                  <View style={styles.selectionImageBox}>
                    <Image source={bag} style={styles.selectionBag} />
                  </View>
                  <View style={styles.selectionCopy}>
                    <Text numberOfLines={1} style={styles.selectionName}>
                      {item.nickname || item.modelName}
                    </Text>
                    <Text numberOfLines={1} style={styles.selectionModel}>
                      {item.modelName}
                    </Text>
                    <Text style={styles.selectionMeta}>
                      {item.overallGrade ? `등급 ${gradeLabel(item.overallGrade)}` : "진단 전"} ·
                      함께한 지 {item.ownershipDays}일
                    </Text>
                  </View>
                  <Text style={styles.selectionChevron}>›</Text>
                </Pressable>
              ))
            )}
          </ScrollView>
        )}
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <DiagnosisHeader onBack={goBack} />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.progressTrack}>
          <View style={styles.progressValue} />
        </View>

        <View style={styles.rowBetween}>
          <Text style={styles.stepText}>1단계 · 촬영</Text>
          <Text style={styles.processText}>촬영 → 분석 → 결과</Text>
        </View>

        {loadingPassport ? (
          <ActivityIndicator style={{ marginTop: 16 }} />
        ) : (
          <View style={styles.productCard}>
            <Image source={bag} style={styles.bagImage} />
            <View style={styles.productCopy}>
              <Text numberOfLines={1} style={styles.productName}>
                {passport?.nickname || passport?.modelName || "제품 정보 없음"}
              </Text>
              <Text style={styles.productMeta}>
                {passport
                  ? `${passport.overallGrade ? `등급 ${gradeLabel(passport.overallGrade)}` : "진단 전"} · ${passport.ownershipDays}일`
                  : ""}
              </Text>
            </View>
            <Pressable
              style={styles.changeButton}
              onPress={() => router.replace("/(tabs)/diagnosis")}
            >
              <Text style={styles.changeText}>변경</Text>
            </Pressable>
          </View>
        )}

        <View style={[styles.rowBetween, styles.photoHeading]}>
          <Text style={styles.sectionTitle}>부위별 사진 4장</Text>
          <Text style={styles.count}>{completed} / 4</Text>
        </View>

        <View style={styles.grid}>
          {PARTS.map((part, index) => {
            const photo = photos[index];
            return (
              <Pressable
                key={part}
                style={styles.photoSlot}
                onPress={() => (photo ? removePhoto(index) : takePhoto(index))}
              >
                {photo ? (
                  <View style={styles.previewWrap}>
                    <Image source={{ uri: photo.uri }} style={styles.preview} />
                    <View style={styles.retakeBadge}>
                      <Text style={styles.retakeText}>다시 촬영</Text>
                    </View>
                  </View>
                ) : (
                  <View style={styles.guideImage}>
                    <Text style={styles.guideText}>가이드 이미지</Text>
                  </View>
                )}
                <Text style={styles.partName}>{part}</Text>
                <Text style={styles.captureText}>{photo ? "사진 삭제" : "+ 촬영하기"}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.notice}>
          <Text style={styles.noticeTitle}>촬영 시 유의사항</Text>
          <Text style={styles.noticeText}>밝은 곳에서 그림자 없이 촬영해 주세요</Text>
          <Text style={styles.noticeText}>흐릿하면 다시 찍어달라고 안내해 드립니다</Text>
        </View>

        <Text style={styles.disclaimer}>
          제공되는 가이드는 자가 점검용 참고 자료이며, 정품 감정 서비스가 아닙니다.{"\n"}정확한 정품
          판정을 원하실 경우 전문 감정사를 통해 별도 문의해 주시기 바랍니다.
        </Text>

        <Pressable
          disabled={completed !== 4}
          onPress={startAnalysis}
          style={[styles.submitButton, completed !== 4 && styles.submitDisabled]}
        >
          <Text style={styles.submitText}>
            {completed === 4 ? "진단 시작" : "사진 4장을 모두 올려주세요"}
          </Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#FFFFFF" },
  headerSafe: { backgroundColor: "#FFFFFF" },
  header: {
    height: 58,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#E8E8E8",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  back: { color: "#333333", fontSize: 31, fontWeight: "300", lineHeight: 34 },
  headerTitle: { color: "#303030", fontSize: 18, fontWeight: "500" },
  headerSpacer: { width: 16 },
  content: { paddingHorizontal: 16, paddingTop: 18, paddingBottom: 112 },
  selectionLoading: { flex: 1, alignItems: "center", justifyContent: "center" },
  selectionLoadingText: { fontSize: 11, color: "#999", marginTop: 10 },
  selectionContent: { padding: 18, paddingBottom: 105, backgroundColor: "#fff", flexGrow: 1 },
  selectionTitle: { fontSize: 20, fontWeight: "600", color: "#333", marginTop: 10 },
  selectionDescription: { fontSize: 11, color: "#999", marginTop: 7, marginBottom: 20 },
  selectionCard: {
    minHeight: 108,
    borderWidth: 1,
    borderColor: "#e5e1da",
    borderRadius: 9,
    padding: 11,
    marginBottom: 11,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
  },
  selectionImageBox: {
    width: 92,
    height: 80,
    borderRadius: 7,
    backgroundColor: "#f7f5f1",
    alignItems: "center",
    justifyContent: "center",
  },
  selectionBag: { width: 88, height: 68, resizeMode: "contain" },
  selectionCopy: { flex: 1, paddingHorizontal: 12 },
  selectionName: { fontSize: 14, color: "#333", marginBottom: 4 },
  selectionModel: { fontSize: 9, color: "#aaa", marginBottom: 7 },
  selectionMeta: { fontSize: 10, color: "#777" },
  selectionChevron: { fontSize: 22, color: "#a58d6c" },
  selectionEmpty: {
    minHeight: 390,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#d8d1c7",
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  selectionEmptyTitle: { fontSize: 14, color: "#444" },
  selectionEmptyText: { fontSize: 10, color: "#999", marginTop: 8 },
  selectionRegister: {
    height: 44,
    paddingHorizontal: 24,
    borderRadius: 5,
    backgroundColor: colors.dark,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 20,
  },
  selectionRegisterText: { fontSize: 11, color: "#fff" },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    overflow: "hidden",
    backgroundColor: "#EEEEEE",
  },
  progressValue: {
    width: "33.333%",
    height: "100%",
    borderRadius: 2,
    backgroundColor: "#927A59",
  },
  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  stepText: { marginTop: 12, color: "#373737", fontSize: 13 },
  processText: { marginTop: 12, color: "#A0A0A0", fontSize: 12 },
  productCard: {
    height: 80,
    marginTop: 16,
    paddingHorizontal: 12,
    borderRadius: 9,
    backgroundColor: "#F7F7F7",
    flexDirection: "row",
    alignItems: "center",
  },
  bagImage: { width: 70, height: 58, resizeMode: "contain" },
  productCopy: { flex: 1, marginLeft: 10 },
  productName: { color: "#383838", fontSize: 13, lineHeight: 20 },
  productMeta: { marginTop: 1, color: "#A3A3A3", fontSize: 12 },
  changeButton: {
    minWidth: 52,
    height: 29,
    borderWidth: 1,
    borderColor: "#BEBEBE",
    borderRadius: 5,
    alignItems: "center",
    justifyContent: "center",
  },
  changeText: { color: "#555555", fontSize: 12 },
  photoHeading: { marginTop: 20, marginBottom: 10 },
  sectionTitle: { color: "#383838", fontSize: 16, fontWeight: "500" },
  count: { color: "#A3A3A3", fontSize: 13 },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 10,
  },
  photoSlot: {
    width: "48.7%",
    minHeight: 176,
    paddingHorizontal: 12,
    paddingTop: 20,
    paddingBottom: 14,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#CBCBCB",
    borderRadius: 8,
    alignItems: "center",
    backgroundColor: "#FFFFFF",
  },
  guideImage: {
    width: "72%",
    height: 72,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F5F5F5",
  },
  guideText: { color: "#D0D0D0", fontSize: 11 },
  previewWrap: { width: "100%", height: 72 },
  preview: { width: "100%", height: "100%", borderRadius: 6, resizeMode: "cover" },
  retakeBadge: {
    position: "absolute",
    right: 5,
    bottom: 5,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 9,
    backgroundColor: "rgba(0,0,0,0.62)",
  },
  retakeText: { color: "#FFFFFF", fontSize: 9 },
  partName: { marginTop: 13, color: "#3F3F3F", fontSize: 13 },
  captureText: { marginTop: 7, color: "#A4A4A4", fontSize: 12 },
  notice: {
    marginTop: 14,
    paddingHorizontal: 15,
    paddingVertical: 14,
    borderRadius: 8,
    backgroundColor: "#F6F6F6",
  },
  noticeTitle: { marginBottom: 7, color: "#454545", fontSize: 13 },
  noticeText: { color: "#929292", fontSize: 11, lineHeight: 17 },
  disclaimer: {
    marginTop: 32,
    paddingHorizontal: 6,
    color: "#9B9B9B",
    fontSize: 10,
    lineHeight: 15,
  },
  submitButton: {
    height: 54,
    marginTop: 8,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.dark,
  },
  submitDisabled: { backgroundColor: "#414141" },
  submitText: { color: "#FFFFFF", fontSize: 15 },
});
