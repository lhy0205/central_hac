import React, { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Linking } from "react-native";
import {
  Camera,
  useCameraDevice,
  useCameraDevices,
  useCameraFormat,
  useCameraPermission,
} from "react-native-vision-camera";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, spacing, radii } from "../design";
import CornerFrame from "../CornerFrame";
import { identifyProduct, type IdentifyResponse } from "../api";
import { ApiError } from "../../api/client";

export default function ARScanScreen({
  onClose,
  onCapture,
}: {
  onClose: () => void;
  onCapture: (result: IdentifyResponse) => void;
}) {
  const device = useCameraDevice("back");
  // VisionCamera는 CameraX(ProcessCameraProvider)를 비동기로 초기화하고, 끝나기 전까지
  // getAvailableCameraDevices()가 빈 배열을 돌려준다. 그래서 첫 렌더에서 device는 거의
  // 항상 undefined다 — 이걸 곧바로 "카메라 없음"으로 단정하면 정상 기기에서도 오진이 된다.
  // 목록이 채워질 때까지 기다렸다가, 그래도 비어 있으면 그때 오류로 처리한다.
  const devices = useCameraDevices();
  // 기본 촬영 포맷은 센서 최대 해상도(12MP 이상, JPEG 수 MB)라 업로드가 병목이 된다.
  // 서버는 어차피 탐지 후 크롭을 224px로 줄여서 쓰므로(identification/dataset.py의
  // eval_transform) 고해상도를 보낼 이유가 없다. 1280x720이면 인식에 충분하고
  // 업로드는 수백 KB 수준으로 떨어진다.
  const format = useCameraFormat(device, [{ photoResolution: { width: 1280, height: 720 } }]);
  const { hasPermission, requestPermission } = useCameraPermission();
  const [initTimedOut, setInitTimedOut] = useState(false);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    // 진단용: 네이티브가 실제로 어떤 기기를 보고하는지 Metro 콘솔에 남긴다.
    console.warn(
      `[AR] devices=${devices.length} permission=${hasPermission} ` +
        `list=${JSON.stringify(devices.map((d) => ({ id: d.id, pos: d.position })))}`,
    );
  }, [devices, hasPermission]);

  useEffect(() => {
    if (devices.length > 0) {
      setInitTimedOut(false);
      return;
    }
    const timer = setTimeout(() => setInitTimedOut(true), 4000);
    return () => clearTimeout(timer);
  }, [devices.length]);
  const [torchOn, setTorchOn] = useState(false);
  const [identifying, setIdentifying] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const cameraRef = useRef<Camera>(null);

  // 권한이 없으면 CameraX가 기기를 바인딩하지 못한다. 인트로를 거치지 않고 결과 화면에서
  // 되돌아온 경우나 설정에서 권한을 껐다 온 경우가 여기 해당한다.
  if (!hasPermission) {
    return (
      <View style={styles.centerFallback}>
        <Text style={styles.fallbackText}>카메라 권한이 필요해요.</Text>
        <Pressable style={styles.fallbackButton} onPress={() => void requestPermission()}>
          <Text style={styles.fallbackButtonText}>권한 허용하기</Text>
        </Pressable>
        <Pressable style={styles.fallbackLink} onPress={() => void Linking.openSettings()}>
          <Text style={styles.fallbackLinkText}>설정에서 직접 변경하기</Text>
        </Pressable>
        <Pressable style={styles.fallbackLink} onPress={onClose}>
          <Text style={styles.fallbackLinkText}>돌아가기</Text>
        </Pressable>
      </View>
    );
  }

  if (device == null && !initTimedOut) {
    return (
      <View style={styles.centerFallback}>
        <ActivityIndicator color="#fff" />
        <Text style={styles.fallbackText}>카메라를 준비하고 있어요…</Text>
      </View>
    );
  }

  if (device == null) {
    return (
      <View style={styles.centerFallback}>
        <Text style={styles.fallbackText}>
          {devices.length === 0
            ? "카메라를 사용할 수 없어요.\n다른 앱이 카메라를 쓰고 있다면 종료한 뒤 다시 시도해주세요."
            : "후면 카메라를 찾을 수 없어요."}
        </Text>
        <Pressable style={styles.fallbackButton} onPress={() => setInitTimedOut(false)}>
          <Text style={styles.fallbackButtonText}>다시 시도</Text>
        </Pressable>
        <Pressable style={styles.fallbackLink} onPress={onClose}>
          <Text style={styles.fallbackLinkText}>돌아가기</Text>
        </Pressable>
      </View>
    );
  }

  // 제품 인식은 전적으로 서버(/identify)가 한다. 온디바이스 사전 분류가 없으므로
  // 촬영은 요청이 진행 중일 때만 막으면 된다.
  const canCapture = !identifying;

  async function handleShutter() {
    if (cameraRef.current == null || identifying) return;
    setIdentifying(true);
    setCaptureError(null);
    try {
      const photo = await cameraRef.current.takePhoto({ flash: torchOn ? "on" : "off" });
      const result = await identifyProduct({
        uri: `file://${photo.path}`,
        name: "scan.jpg",
        type: "image/jpeg",
      });
      onCapture(result);
    } catch (error) {
      setCaptureError(
        error instanceof ApiError ? error.message : "촬영에 실패했어요. 다시 시도해주세요.",
      );
    } finally {
      setIdentifying(false);
    }
  }

  return (
    <View style={styles.container}>
      <Camera
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        device={device}
        format={format}
        isActive={true}
        photo={true}
        torch={torchOn ? "on" : "off"}
      />

      <View style={[styles.header, { top: insets.top + 12 }]}>
        <Pressable hitSlop={12} onPress={onClose} style={styles.headerSide}>
          <Text style={styles.headerIcon}>✕</Text>
        </Pressable>
        <Text style={styles.headerTitle}>AR</Text>
        <Pressable
          hitSlop={12}
          disabled={!device.hasTorch}
          onPress={() => setTorchOn((prev) => !prev)}
          style={styles.headerSide}
        >
          <Text style={[styles.headerIcon, torchOn && styles.headerIconActive]}>⚡</Text>
        </Pressable>
      </View>

      <View style={styles.frameArea} pointerEvents="none">
        <View style={styles.guideBox}>
          <CornerFrame
            size={28}
            thickness={3}
            color={colors.gold}
            style={StyleSheet.flatten([styles.guideCorner, { top: -3, left: -3 }])}
          />
          <CornerFrame
            size={28}
            thickness={3}
            color={colors.gold}
            style={StyleSheet.flatten([styles.guideCorner, { top: -3, right: -3 }])}
          />
          <CornerFrame
            size={28}
            thickness={3}
            color={colors.gold}
            style={StyleSheet.flatten([styles.guideCorner, { bottom: -3, left: -3 }])}
          />
          <CornerFrame
            size={28}
            thickness={3}
            color={colors.gold}
            style={StyleSheet.flatten([styles.guideCorner, { bottom: -3, right: -3 }])}
          />

          <View style={styles.guidancePill}>
            <Text style={styles.guidanceText}>가방 전체를 안내선에 맞춰주세요</Text>
          </View>
        </View>
      </View>

      {identifying && (
        <View style={styles.statusPill}>
          <ActivityIndicator size="small" color="#fff" />
          <Text style={styles.statusText}>제품 인식 중…</Text>
        </View>
      )}
      {captureError != null && !identifying && (
        <View style={[styles.statusPill, styles.statusPillError]}>
          <Text style={styles.statusText}>{captureError}</Text>
        </View>
      )}

      <View style={[styles.footer, { bottom: insets.bottom + 24 }]}>
        <Pressable
          disabled={!canCapture}
          onPress={handleShutter}
          style={({ pressed }) => [
            styles.scanButton,
            !canCapture && styles.scanButtonDisabled,
            pressed && styles.scanButtonPressed,
          ]}
        >
          <Text style={styles.scanButtonText}>전체 스캔</Text>
        </Pressable>

        <Pressable
          disabled={!canCapture}
          onPress={handleShutter}
          style={({ pressed }) => [
            styles.shutterButton,
            !canCapture && styles.shutterButtonDisabled,
            pressed && styles.shutterButtonPressed,
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  centerFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#000",
    padding: 24,
  },
  fallbackText: { color: "#fff", fontSize: 16, textAlign: "center", lineHeight: 24 },
  fallbackButton: {
    marginTop: 20,
    paddingHorizontal: 22,
    paddingVertical: 11,
    borderRadius: radii.pill,
    backgroundColor: colors.gold,
  },
  fallbackButtonText: { color: colors.ink, fontSize: 14, fontWeight: "700" },
  fallbackLink: { marginTop: 14, padding: 6 },
  fallbackLinkText: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 13,
    textDecorationLine: "underline",
  },

  header: {
    position: "absolute",
    top: 12,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
  },
  headerSide: { width: 32, alignItems: "center", justifyContent: "center" },
  headerIcon: { fontSize: 20, color: "#fff" },
  headerIconActive: { color: colors.gold },
  headerTitle: { fontSize: 16, fontWeight: "700", color: "#fff" },

  frameArea: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
  },
  guideBox: {
    width: "86%",
    aspectRatio: 0.82,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.55)",
    borderStyle: "dashed",
    borderRadius: radii.md,
  },
  guideCorner: { position: "absolute" },
  guidancePill: {
    position: "absolute",
    bottom: -22,
    backgroundColor: colors.overlayDark,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: radii.pill,
  },
  guidanceText: { color: "#fff", fontSize: 13, fontWeight: "600" },

  statusPill: {
    position: "absolute",
    top: 108,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.overlayDark,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radii.pill,
  },
  statusPillError: { backgroundColor: "rgba(150,0,0,0.7)" },
  statusText: { color: "#fff", fontSize: 12, fontWeight: "600" },

  footer: {
    position: "absolute",
    bottom: 24,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  scanButton: {
    backgroundColor: colors.gold,
    paddingHorizontal: 22,
    paddingVertical: 10,
    borderRadius: radii.pill,
    marginBottom: spacing.lg,
  },
  scanButtonDisabled: { opacity: 0.5 },
  scanButtonPressed: { opacity: 0.8 },
  scanButtonText: { color: colors.ink, fontSize: 14, fontWeight: "700" },

  shutterButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "rgba(255,255,255,0.9)",
    borderWidth: 4,
    borderColor: "rgba(255,255,255,0.35)",
  },
  shutterButtonDisabled: { backgroundColor: "rgba(255,255,255,0.4)" },
  shutterButtonPressed: { backgroundColor: "#ddd" },
});
