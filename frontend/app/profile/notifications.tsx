import * as ImagePicker from "expo-image-picker";
import { useFocusEffect } from "expo-router";
import { useCameraPermission } from "react-native-vision-camera";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  PermissionsAndroid,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { ApiError, accountApi } from "../../src/api/client";
import { AppButton, Header } from "../../src/components/UI";
import { colors, common } from "../../src/theme";
type PermissionState = "granted" | "denied" | "limited" | "unknown";
function permissionLabel(value: PermissionState) {
  if (value === "granted") return "켜짐";
  if (value === "limited") return "일부 허용";
  if (value === "denied") return "꺼짐";
  return "확인 필요";
}
export default function Notifications() {
  const { hasPermission: cameraGranted, requestPermission: requestVisionCamera } =
    useCameraPermission();
  const [notification, setNotification] = useState<PermissionState>("unknown");
  const [camera, setCamera] = useState<PermissionState>(cameraGranted ? "granted" : "denied");
  const [photos, setPhotos] = useState<PermissionState>("unknown");
  const [care, setCare] = useState(true);
  const [journey, setJourney] = useState(true);
  const [marketing, setMarketing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const refreshPermissions = useCallback(async () => {
    setCamera(cameraGranted ? "granted" : "denied");
    const photo = await ImagePicker.getMediaLibraryPermissionsAsync();
    setPhotos(
      photo.granted ? (photo.accessPrivileges === "limited" ? "limited" : "granted") : "denied",
    );
    if (Platform.OS === "android") {
      if (Number(Platform.Version) < 33) setNotification("granted");
      else {
        const permission = PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS;
        setNotification((await PermissionsAndroid.check(permission)) ? "granted" : "denied");
      }
    } else setNotification("unknown");
  }, [cameraGranted]);
  useFocusEffect(
    useCallback(() => {
      let active = true;
      setLoading(true);
      Promise.all([
        accountApi
          .notificationPreferences()
          .then((value) => {
            if (active) {
              setCare(value.careAlertsEnabled);
              setJourney(value.journeyAlertsEnabled);
              setMarketing(value.marketingAlertsEnabled);
            }
          })
          .catch(() => {}),
        refreshPermissions(),
      ]).finally(() => {
        if (active) setLoading(false);
      });
      return () => {
        active = false;
      };
    }, [refreshPermissions]),
  );
  async function requestNotification() {
    if (Platform.OS === "android" && Number(Platform.Version) >= 33) {
      const result = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
      );
      setNotification(result === PermissionsAndroid.RESULTS.GRANTED ? "granted" : "denied");
      if (result !== PermissionsAndroid.RESULTS.GRANTED) showSettings("알림");
    } else Linking.openSettings();
  }
  async function requestCamera() {
    if (camera === "granted") return Linking.openSettings();
    const granted = await requestVisionCamera();
    setCamera(granted ? "granted" : "denied");
    if (!granted) showSettings("카메라");
  }
  async function requestPhotos() {
    if (photos === "granted" || photos === "limited") return Linking.openSettings();
    const result = await ImagePicker.requestMediaLibraryPermissionsAsync();
    setPhotos(
      result.granted ? (result.accessPrivileges === "limited" ? "limited" : "granted") : "denied",
    );
    if (!result.granted) showSettings("사진");
  }
  function showSettings(name: string) {
    Alert.alert(
      `${name} 권한 필요`,
      "권한이 거절되어 있습니다. 휴대폰 설정에서 MCM Care 권한을 허용해주세요.",
      [{ text: "취소" }, { text: "설정 열기", onPress: Linking.openSettings }],
    );
  }
  async function save() {
    setSaving(true);
    try {
      await accountApi.updateNotificationPreferences({
        careAlertsEnabled: care,
        journeyAlertsEnabled: journey,
        marketingAlertsEnabled: marketing,
      });
      Alert.alert("저장 완료", "서비스 알림 설정이 저장되었습니다.");
    } catch (error) {
      if (error instanceof ApiError && error.code === "DEMO_MODE")
        Alert.alert("체험 모드", "화면 설정은 적용됐지만 서버에는 저장되지 않습니다.");
      else Alert.alert("저장 실패", "알림 설정을 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }
  if (loading)
    return (
      <>
        <Header title="권한 및 알림 설정" back />
        <View style={styles.center}>
          <ActivityIndicator color={colors.brown} />
        </View>
      </>
    );
  const permissions = [
    {
      label: "알림 권한",
      description: "진단 결과와 케어 시기 알림",
      value: notification,
      onPress: requestNotification,
    },
    {
      label: "카메라 권한",
      description: "진단 촬영과 AR 가방 인식",
      value: camera,
      onPress: requestCamera,
    },
    {
      label: "사진 권한",
      description: "케어·여정 기록 이미지 첨부",
      value: photos,
      onPress: requestPhotos,
    },
  ];
  return (
    <View style={styles.screen}>
      <Header title="권한 및 알림 설정" back />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionTitle}>기기 권한</Text>
        <Text style={styles.sectionDescription}>
          꺼진 권한을 누르면 허용을 요청하거나 휴대폰 설정으로 이동합니다.
        </Text>
        <View style={styles.group}>
          {permissions.map((item) => (
            <Pressable key={item.label} style={styles.permissionRow} onPress={item.onPress}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{item.label}</Text>
                <Text style={styles.rowDescription}>{item.description}</Text>
              </View>
              <View
                style={[
                  styles.status,
                  item.value === "granted" && styles.statusOn,
                  item.value === "limited" && styles.statusLimited,
                ]}
              >
                <Text style={[styles.statusText, item.value === "granted" && styles.statusTextOn]}>
                  {permissionLabel(item.value)}
                </Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.sectionTitle}>서비스 알림</Text>
        <Text style={styles.sectionDescription}>
          MCM Care 서버에서 받을 알림 종류를 선택합니다.
        </Text>
        <View style={styles.group}>
          {[
            ["케어·재진단 알림", "진단 결과와 관리 시기 안내", care, setCare],
            ["여권 기록 알림", "새로운 여정과 스탬프 안내", journey, setJourney],
            ["마케팅 정보 알림", "이벤트와 혜택 소식", marketing, setMarketing],
          ].map(([label, description, value, setValue]) => (
            <View style={styles.switchRow} key={label as string}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{label as string}</Text>
                <Text style={styles.rowDescription}>{description as string}</Text>
              </View>
              <Switch
                value={value as boolean}
                onValueChange={setValue as (next: boolean) => void}
                trackColor={{ false: "#D9D9D9", true: "#B69A73" }}
                thumbColor="#fff"
              />
            </View>
          ))}
        </View>
        <Text style={styles.help}>
          휴대폰의 알림 권한이 꺼져 있으면 서비스 알림을 켜도 푸시 알림이 표시되지 않습니다. 필수
          서비스 안내는 설정과 관계없이 앱 내부에 표시될 수 있습니다.
        </Text>
        <AppButton
          disabled={saving}
          title={saving ? "저장 중..." : "알림 설정 저장"}
          onPress={save}
        />
        <Pressable style={styles.settingsButton} onPress={() => Linking.openSettings()}>
          <Text style={styles.settingsButtonText}>휴대폰 앱 권한 설정 열기</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#fff" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#fff" },
  content: { padding: 18, paddingBottom: 80, backgroundColor: "#fff" },
  sectionTitle: { fontSize: 15, fontWeight: "600", color: "#333", marginTop: 8 },
  sectionDescription: {
    fontSize: 10,
    color: "#999",
    lineHeight: 15,
    marginTop: 5,
    marginBottom: 11,
  },
  group: { borderTopWidth: 1, borderTopColor: "#eee", marginBottom: 22 },
  permissionRow: {
    minHeight: 68,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  switchRow: {
    minHeight: 68,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
    flexDirection: "row",
    alignItems: "center",
  },
  rowTitle: { fontSize: 13, color: "#333" },
  rowDescription: { fontSize: 9, color: "#aaa", marginTop: 5 },
  status: {
    minWidth: 54,
    height: 25,
    paddingHorizontal: 9,
    borderRadius: 13,
    backgroundColor: "#f0f0f0",
    alignItems: "center",
    justifyContent: "center",
  },
  statusOn: { backgroundColor: "#E9F1DD" },
  statusLimited: { backgroundColor: "#F4E9D8" },
  statusText: { fontSize: 9, color: "#888" },
  statusTextOn: { color: "#59733D" },
  chevron: { fontSize: 18, color: "#aaa" },
  help: {
    fontSize: 9,
    color: "#999",
    lineHeight: 15,
    backgroundColor: "#f7f7f7",
    padding: 12,
    borderRadius: 6,
    marginBottom: 15,
  },
  settingsButton: {
    height: 44,
    borderWidth: 1,
    borderColor: "#bbb",
    borderRadius: 5,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
  },
  settingsButtonText: { fontSize: 11, color: "#555" },
});
