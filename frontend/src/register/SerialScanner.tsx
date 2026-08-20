import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Linking, Pressable, StyleSheet, View } from "react-native";
import { Text } from "../components/BrandText";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Camera,
  useCameraDevice,
  useCameraDevices,
  useCameraFormat,
  useCameraPermission,
} from "react-native-vision-camera";

import { recognizeSerial } from "./ocr";

/* 일련번호 스캐너.
   "사진을 한 장 찍어서 보낸다"가 아니라, 카메라를 계속 띄워 놓고 프레임을 주기적으로
   OCR 서버에 보내다가 코드가 잡히면 멈춘다 — 사용자는 가방을 비추고 있기만 하면 된다.

   OCR이 서버에 있어서 진짜 온디바이스 실시간 인식은 아니다. 매 프레임을 올리면 서버가
   못 버티므로 한 번에 한 장씩만 올리고, 응답이 온 뒤에 다음 장을 찍는다. */
const SCAN_INTERVAL_MS = 1200;

export function SerialScanner({
  onFound,
  onClose,
}: {
  onFound: (code: string) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const device = useCameraDevice("back");
  // VisionCamera는 CameraX를 비동기로 초기화해서 첫 렌더에서 device가 거의 항상 undefined다.
  const devices = useCameraDevices();
  const format = useCameraFormat(device, [{ photoResolution: { width: 1280, height: 720 } }]);
  const { hasPermission, requestPermission } = useCameraPermission();
  const cameraRef = useRef<Camera>(null);

  const [ready, setReady] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [torch, setTorch] = useState(false);
  const stopped = useRef(false);

  useEffect(() => {
    if (!hasPermission) void requestPermission();
  }, [hasPermission, requestPermission]);

  useEffect(() => {
    return () => {
      stopped.current = true;
    };
  }, []);

  const scanOnce = useCallback(async () => {
    if (stopped.current || !cameraRef.current || !ready) return;
    setScanning(true);
    try {
      const photo = await cameraRef.current.takePhoto({ flash: "off" });
      if (stopped.current) return;
      const result = await recognizeSerial({
        uri: photo.path.startsWith("file://") ? photo.path : `file://${photo.path}`,
        name: `serial-${Date.now()}.jpg`,
        type: "image/jpeg",
      });
      if (stopped.current) return;
      if (result.bestCodeGuess) {
        stopped.current = true;
        onFound(result.bestCodeGuess);
        return;
      }
    } catch {
      // 한 번 실패했다고 스캔을 멈추면 안 된다 — 다음 프레임에서 다시 시도한다.
    } finally {
      if (!stopped.current) {
        setScanning(false);
        setAttempts((n) => n + 1);
      }
    }
  }, [onFound, ready]);

  // 한 장의 결과가 끝나면 잠깐 쉬었다가 다음 장을 찍는다.
  useEffect(() => {
    if (!ready || stopped.current) return;
    const timer = setTimeout(() => void scanOnce(), attempts === 0 ? 300 : SCAN_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [attempts, ready, scanOnce]);

  if (!hasPermission) {
    return (
      <View style={styles.fallback}>
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

  if (device == null) {
    return (
      <View style={styles.fallback}>
        <ActivityIndicator color="#fff" />
        <Text style={styles.fallbackText}>
          {devices.length === 0 ? "카메라를 준비하고 있어요…" : "카메라를 여는 중이에요…"}
        </Text>
        <Pressable style={styles.fallbackLink} onPress={onClose}>
          <Text style={styles.fallbackLinkText}>돌아가기</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <Camera
        device={device}
        format={format}
        isActive
        onInitialized={() => setReady(true)}
        photo
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        torch={torch ? "on" : "off"}
      />

      <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
        <Pressable
          accessibilityLabel="닫기"
          hitSlop={12}
          onPress={onClose}
          style={styles.iconButton}
        >
          <Text style={styles.icon}>✕</Text>
        </Pressable>
        <Pressable
          accessibilityLabel="플래시"
          hitSlop={12}
          onPress={() => setTorch((value) => !value)}
          style={styles.iconButton}
        >
          <Text style={[styles.icon, torch && styles.iconOn]}>⚡</Text>
        </Pressable>
      </View>

      <View style={styles.pill}>
        <Text style={styles.pillText}>제품에 있는 일련번호를 스캔해주세요</Text>
      </View>

      <View style={styles.frame}>
        <View style={[styles.corner, styles.tl]} />
        <View style={[styles.corner, styles.tr]} />
        <View style={[styles.corner, styles.bl]} />
        <View style={[styles.corner, styles.br]} />
      </View>

      <View style={[styles.bottom, { paddingBottom: insets.bottom + 28 }]}>
        <View style={styles.status}>
          {scanning ? <ActivityIndicator color="#fff" size="small" /> : null}
          <Text style={styles.statusText}>
            {!ready
              ? "카메라를 준비하고 있어요"
              : scanning
                ? "일련번호를 읽는 중…"
                : "번호가 잘 보이게 비춰주세요"}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#000" },
  fallback: {
    flex: 1,
    backgroundColor: "#1A1A1A",
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    padding: 24,
  },
  fallbackText: { color: "#fff", fontSize: 14, textAlign: "center" },
  fallbackButton: {
    height: 44,
    paddingHorizontal: 22,
    borderRadius: 22,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  fallbackButtonText: { color: "#1A1A1A", fontSize: 13, fontWeight: "600" },
  fallbackLink: { padding: 6 },
  fallbackLinkText: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 12.5,
    textDecorationLine: "underline",
  },

  top: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    zIndex: 3,
  },
  iconButton: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  icon: { color: "#fff", fontSize: 20 },
  iconOn: { color: "#F2C94C" },

  pill: {
    position: "absolute",
    top: "14%",
    alignSelf: "center",
    backgroundColor: "rgba(17,17,17,0.85)",
    borderRadius: 26,
    paddingHorizontal: 24,
    paddingVertical: 14,
  },
  pillText: { color: "#fff", fontSize: 13 },

  frame: {
    position: "absolute",
    top: "32%",
    alignSelf: "center",
    width: 232,
    height: 232,
    borderRadius: 14,
  },
  corner: { position: "absolute", width: 36, height: 36, borderColor: "#fff" },
  tl: { top: -2, left: -2, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 14 },
  tr: { top: -2, right: -2, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 14 },
  bl: {
    bottom: -2,
    left: -2,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: 14,
  },
  br: {
    bottom: -2,
    right: -2,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: 14,
  },

  bottom: { position: "absolute", left: 0, right: 0, bottom: 0, alignItems: "center" },
  status: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    backgroundColor: "rgba(17,17,17,0.75)",
    borderRadius: 22,
    paddingHorizontal: 18,
    paddingVertical: 11,
  },
  statusText: { color: "#fff", fontSize: 12.5 },
});
