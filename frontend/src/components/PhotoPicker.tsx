import * as ImagePicker from "expo-image-picker";
import React, { useState } from "react";
import { Alert, Image, Linking, Pressable, StyleSheet, View } from "react-native";
import { Text } from "./BrandText";
import { colors } from "../theme";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_REQUEST_BYTES = 50 * 1024 * 1024;
export type PickedPhoto = { uri: string; name: string; type: string; fileSize?: number };

export function validatePhotos(photos: PickedPhoto[]) {
  if (photos.some((photo) => (photo.fileSize ?? 0) > MAX_FILE_BYTES))
    return "이미지 한 장은 10MB 이하여야 합니다.";
  if (photos.reduce((sum, photo) => sum + (photo.fileSize ?? 0), 0) > MAX_REQUEST_BYTES)
    return "첨부 이미지 전체 용량은 50MB 이하여야 합니다.";
  return undefined;
}

export function PhotoPicker({
  max = 4,
  onChange,
}: {
  max?: number;
  onChange?: (photos: PickedPhoto[]) => void;
}) {
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  function denied(kind: string) {
    Alert.alert(
      `${kind} 권한 필요`,
      `${kind} 권한이 거절되었습니다. 설정에서 권한을 허용해주세요.`,
      [{ text: "취소" }, { text: "설정 열기", onPress: Linking.openSettings }],
    );
  }
  function convert(assets: ImagePicker.ImagePickerAsset[]): PickedPhoto[] {
    return assets.map((asset) => ({
      uri: asset.uri,
      name: asset.fileName || `image-${Date.now()}.jpg`,
      type: asset.mimeType || "image/jpeg",
      fileSize: asset.fileSize,
    }));
  }
  function add(items: PickedPhoto[]) {
    const next = [...photos, ...items].slice(0, max);
    const error = validatePhotos(next);
    if (error) return Alert.alert("파일 확인", error);
    setPhotos(next);
    onChange?.(next);
  }
  async function camera() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return denied("카메라");
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.8 });
    if (!result.canceled) add(convert(result.assets));
  }
  async function library() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return denied("사진");
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: max > 1,
      selectionLimit: max - photos.length,
      quality: 0.8,
    });
    if (!result.canceled) add(convert(result.assets));
  }
  function remove(uri: string) {
    const next = photos.filter((photo) => photo.uri !== uri);
    setPhotos(next);
    onChange?.(next);
  }
  return (
    <View style={{ gap: 10 }}>
      <View style={styles.grid}>
        {photos.map((photo) => (
          <Pressable key={photo.uri} onPress={() => remove(photo.uri)}>
            <Image source={{ uri: photo.uri }} style={styles.photo} />
            <Text style={styles.remove}>×</Text>
          </Pressable>
        ))}
      </View>
      {photos.length < max && (
        <View style={styles.actions}>
          <Pressable style={styles.action} onPress={camera}>
            <Text>카메라 촬영</Text>
          </Pressable>
          <Pressable style={styles.action} onPress={library}>
            <Text>사진 선택</Text>
          </Pressable>
        </View>
      )}
      <Text style={styles.count}>
        {photos.length} / {max} · 사진을 누르면 삭제됩니다.
      </Text>
    </View>
  );
}
const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  photo: { width: 82, height: 82, borderRadius: 5 },
  remove: {
    position: "absolute",
    right: 3,
    top: -3,
    color: "#fff",
    fontSize: 22,
    textShadowColor: "#000",
    textShadowRadius: 2,
  },
  actions: { flexDirection: "row", gap: 8 },
  action: {
    flex: 1,
    height: 44,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 5,
  },
  count: { fontSize: 11, color: colors.muted },
});
