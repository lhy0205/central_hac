import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
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
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { productApi, storeApi, transferApi, type StoreSummary } from "../../src/api/client";
import { Calendar } from "../../src/components/Calendar";
import { PackingAnimation } from "../../src/components/PackingAnimation";
import { PhotoPicker, validatePhotos, type PickedPhoto } from "../../src/components/PhotoPicker";
import { Header } from "../../src/components/UI";
import { COLOR_SWATCH, MOCK_PRODUCTS, priceText } from "../../src/register/catalog";
import { recognizeSerial } from "../../src/register/ocr";
import { SerialScanner } from "../../src/register/SerialScanner";
import { colors } from "../../src/theme";

type UsageFrequency = "DAILY" | "FEW_TIMES_A_WEEK" | "OCCASIONAL" | "RARE";
const USAGE_OPTIONS: { label: string; value: UsageFrequency }[] = [
  { label: "매일", value: "DAILY" },
  { label: "주 여러 번", value: "FEW_TIMES_A_WEEK" },
  { label: "가끔", value: "OCCASIONAL" },
  { label: "거의 안 씀", value: "RARE" },
];
const SERIAL_PATTERN = /^([A-Za-z]\d{4}|\d{4})$/;

// 기준 사진은 부위별로 찍는다 — 이후 진단이 "어디가 얼마나 상했는지" 비교하는 기준점이 된다.
const SHOTS = ["모서리", "손잡이", "바닥면", "금속 부자재"] as const;

/* 화면 흐름
   choose → (승계) transfer
          → (신규) permission → scan → confirm | manual → model(1/5) → purchase(2/5)
                    → receipt(3/5) → photos(4/5) → nickname(5/5) → done */
type Step =
  | "choose"
  | "transfer"
  | "permission"
  | "scan"
  | "confirm"
  | "manual"
  | "model"
  | "purchase"
  | "receipt"
  | "photos"
  | "nickname"
  | "done";

const PROGRESS: Partial<Record<Step, number>> = {
  model: 1,
  purchase: 2,
  receipt: 3,
  photos: 4,
  nickname: 5,
};

export default function Register() {
  const insets = useSafeAreaInsets();
  // 등록 화면엔 탭바가 없다. 시트·본문 하단이 내비게이션 바에 물리지 않게만 띄운다.
  const bottomPad = insets.bottom + 24;
  const [step, setStep] = useState<Step>("choose");
  const [intro, setIntro] = useState(true);

  // 승계
  const [code, setCode] = useState("");
  const [codeConfirm, setCodeConfirm] = useState("");
  const [transferLoading, setTransferLoading] = useState(false);

  // 스캔 / 일련번호
  const [scannedSerial, setScannedSerial] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [serialConfirm, setSerialConfirm] = useState("");

  // 등록 정보
  const [modelName, setModelName] = useState("");
  const [search, setSearch] = useState("");
  const [purchaseDate, setPurchaseDate] = useState<string | null>(null);
  const [showCalendar, setShowCalendar] = useState(false);
  const [purchasePlace, setPurchasePlace] = useState("");
  const [showStores, setShowStores] = useState(false);
  const [stores, setStores] = useState<StoreSummary[] | null>(null);
  const [storeSearch, setStoreSearch] = useState("");
  const [usageFrequency, setUsageFrequency] = useState<UsageFrequency | null>(null);
  const [receiptPhoto, setReceiptPhoto] = useState<PickedPhoto[]>([]);
  const [baselinePhotos, setBaselinePhotos] = useState<Record<string, PickedPhoto[]>>({});
  const [nickname, setNickname] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function redeemTransfer() {
    const normalized = code.trim().toUpperCase();
    if (!normalized || normalized !== codeConfirm.trim().toUpperCase())
      return Alert.alert("확인", "코드를 동일하게 입력해주세요.");
    setTransferLoading(true);
    try {
      await transferApi.redeem(normalized);
      Alert.alert("승계 완료", "제품이 내 가방에 추가되었습니다.", [
        { text: "확인", onPress: () => router.replace("/(tabs)/home") },
      ]);
    } catch {
      Alert.alert(
        "승계 실패",
        "승계 처리 중 문제가 발생했습니다. 코드가 이미 사용되었을 수 있습니다.",
      );
    } finally {
      setTransferLoading(false);
    }
  }

  async function loadStores() {
    setShowStores(true);
    if (stores != null) return;
    try {
      const page = await storeApi.list(0, 50);
      setStores(page.content);
    } catch {
      setStores([]);
    }
  }

  async function submit() {
    if (submitting) return;
    const shots = Object.values(baselinePhotos).flat();
    const fileError = validatePhotos([...receiptPhoto, ...shots]);
    if (fileError) return Alert.alert("파일 확인", fileError);
    if (!purchaseDate) return Alert.alert("확인", "구매일을 선택해주세요.");
    if (usageFrequency == null) return Alert.alert("확인", "사용 빈도를 선택해주세요.");
    setSubmitting(true);
    try {
      await productApi.create(
        {
          serialNumber,
          modelName,
          nickname: nickname || undefined,
          purchaseDate,
          purchasePlace: purchasePlace || undefined,
          usageFrequency,
        },
        receiptPhoto[0],
        shots,
      );
      setStep("done");
    } catch (error) {
      const message = String(error);
      const friendly =
        error instanceof Error && error.message
          ? error.message
          : message.includes("SERIAL_ALREADY_REGISTERED")
            ? "이미 등록된 시리얼입니다."
            : message.includes("INVALID_SERIAL_FORMAT")
              ? "시리얼 번호 형식이 올바르지 않습니다."
              : "등록 중 문제가 발생했습니다. 다시 시도해주세요.";
      Alert.alert("등록 실패", friendly);
    } finally {
      setSubmitting(false);
    }
  }

  const progress = PROGRESS[step];
  const catalog = MOCK_PRODUCTS.filter(
    (item) => !search || item.name.toLowerCase().includes(search.toLowerCase()),
  );
  const storeList = (stores ?? []).filter(
    (store) =>
      !storeSearch || store.name.includes(storeSearch) || store.address.includes(storeSearch),
  );

  // 스캔은 카메라를 계속 띄워 놓고 자동으로 읽는다.
  if (step === "scan") {
    return (
      <SerialScanner
        onClose={() => setStep("choose")}
        onFound={(found) => {
          setScannedSerial(found);
          setStep("confirm");
        }}
      />
    );
  }

  // 확인/직접입력은 스캔 화면 위에 시트로 올라간다.
  if (step === "confirm" || step === "manual") {
    return (
      <View style={styles.camera}>
        <View style={styles.cameraHead}>
          <Pressable
            accessibilityLabel="닫기"
            hitSlop={12}
            onPress={() => setStep("choose")}
            style={styles.cameraClose}
          >
            <Text style={styles.cameraCloseText}>✕</Text>
          </Pressable>
        </View>
        <View style={styles.pill}>
          <Text style={styles.pillText}>제품에 있는 일련번호를 스캔해주세요</Text>
        </View>
        <View style={styles.frame}>
          <View style={[styles.corner, styles.cornerTL]} />
          <View style={[styles.corner, styles.cornerTR]} />
          <View style={[styles.corner, styles.cornerBL]} />
          <View style={[styles.corner, styles.cornerBR]} />
        </View>

        {step === "confirm" ? (
          <View style={[styles.sheet, { paddingBottom: bottomPad }]}>
            <Text style={styles.sheetQuestion}>현재 스캔한 제품의 일련번호가 맞나요?</Text>
            <TextInput
              accessibilityLabel="인식된 일련번호"
              autoCapitalize="characters"
              onChangeText={setScannedSerial}
              style={styles.input}
              value={scannedSerial}
            />
            <View style={styles.sheetRow}>
              <Pressable
                onPress={() => {
                  if (!SERIAL_PATTERN.test(scannedSerial))
                    return Alert.alert("확인", "일련번호 형식을 확인해주세요.");
                  setSerialNumber(scannedSerial);
                  setStep("model");
                }}
                style={({ pressed }) => [styles.outline, styles.half, pressed && styles.pressed]}
              >
                <Text style={styles.outlineText}>맞습니다</Text>
              </Pressable>
              <Pressable
                onPress={() => setStep("manual")}
                style={({ pressed }) => [styles.filled, styles.half, pressed && styles.pressed]}
              >
                <Text style={styles.filledText}>아닙니다</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {step === "manual" ? (
          <View style={[styles.sheet, { paddingBottom: bottomPad }]}>
            <Text style={styles.sheetQuestion}>일련번호를 입력해주세요</Text>
            <Text style={styles.label}>제품 일련번호</Text>
            <TextInput
              autoCapitalize="characters"
              onChangeText={setSerialNumber}
              style={styles.input}
              value={serialNumber}
            />
            <Text style={styles.label}>제품 일련번호 재입력</Text>
            <TextInput
              autoCapitalize="characters"
              onChangeText={setSerialConfirm}
              style={styles.input}
              value={serialConfirm}
            />
            <Pressable
              onPress={() => {
                if (!SERIAL_PATTERN.test(serialNumber) || serialNumber !== serialConfirm)
                  return Alert.alert("확인", "일련번호를 동일하게 입력해주세요.");
                setStep("model");
              }}
              style={({ pressed }) => [styles.filled, styles.wide, pressed && styles.pressed]}
            >
              <Text style={styles.filledText}>다음 단계로</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <Header title="제품 등록" back hideProfile />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: bottomPad + 8 }]}>
        <Text style={styles.title}>제품 등록</Text>
        <View style={styles.rule} />

        {step === "choose" ? (
          <>
            <Text style={styles.question}>이미 등록되어 있는 제품인가요?</Text>
            <Text style={styles.guide}>
              이미 타인에 의해 여권이 생성된 제품일 경우 승계코드가 필요합니다
            </Text>
            <View style={styles.chooseActions}>
              <Pressable
                onPress={() => setStep("transfer")}
                style={({ pressed }) => [styles.outline, styles.wide, pressed && styles.pressed]}
              >
                <Text style={styles.outlineText}>네 이미 여권이 존재합니다</Text>
              </Pressable>
              <Pressable
                onPress={() => setStep("permission")}
                style={({ pressed }) => [styles.filled, styles.wide, pressed && styles.pressed]}
              >
                <Text style={styles.filledText}>아니요 처음 등록합니다</Text>
              </Pressable>
            </View>
          </>
        ) : null}

        {step === "transfer" ? (
          <>
            <Text style={styles.question}>승계 코드를 입력해주세요</Text>
            <Text style={styles.label}>승계 코드</Text>
            <TextInput
              autoCapitalize="characters"
              onChangeText={setCode}
              style={styles.input}
              value={code}
            />
            <Text style={styles.label}>승계 코드 재입력</Text>
            <TextInput
              autoCapitalize="characters"
              onChangeText={setCodeConfirm}
              style={styles.input}
              value={codeConfirm}
            />
            <View style={styles.navRow}>
              <Pressable
                onPress={() => setStep("choose")}
                style={({ pressed }) => [styles.outline, styles.half, pressed && styles.pressed]}
              >
                <Text style={styles.outlineText}>이전 단계로</Text>
              </Pressable>
              <Pressable
                disabled={transferLoading}
                onPress={() => void redeemTransfer()}
                style={({ pressed }) => [styles.filled, styles.half, pressed && styles.pressed]}
              >
                <Text style={styles.filledText}>
                  {transferLoading ? "확인 중..." : "다음 단계로"}
                </Text>
              </Pressable>
            </View>
          </>
        ) : null}

        {step === "permission" ? (
          <View style={styles.permission}>
            <View style={styles.permIcon}>
              <View style={styles.permLens} />
            </View>
            <Text style={styles.permTitle}>카메라 접근을 허용해 주세요</Text>
            <Text style={styles.permDesc}>
              가방을 비추면 마모와 변색 상태를{"\n"}자동으로 분석해 등급을 매겨드려요
            </Text>
            <View style={styles.permRow}>
              <Text style={styles.permRowTitle}>실시간 가방 인식</Text>
              <Text style={styles.permRowText}>촬영 중에만 카메라를 사용해요</Text>
            </View>
            <View style={styles.permRow}>
              <Text style={styles.permRowTitle}>사진은 내 가방에만 저장</Text>
              <Text style={styles.permRowText}>외부에 공유되지 않아요</Text>
            </View>
            <Text style={styles.permNote}>권한은 설정에서 언제든 바꿀 수 있어요</Text>
            <Pressable
              onPress={() => setStep("scan")}
              style={({ pressed }) => [styles.filled, styles.wide, pressed && styles.pressed]}
            >
              <Text style={styles.filledText}>허용하고 시작</Text>
            </Pressable>
          </View>
        ) : null}

        {step === "model" ? (
          <>
            <Text style={styles.question}>등록할 제품을 선택해주세요</Text>
            <View style={styles.catalogBox}>
              <TextInput
                onChangeText={setSearch}
                placeholder="검색..."
                placeholderTextColor="#C0C0C0"
                style={styles.searchInput}
                value={search}
              />
              {catalog.map((item) => (
                <Pressable
                  key={item.id}
                  onPress={() => setModelName(item.name)}
                  style={[styles.catalogRow, modelName === item.name && styles.catalogRowOn]}
                >
                  <View style={styles.catalogThumb}>
                    <Image
                      source={require("../../assets/mcm-bag.png")}
                      style={styles.catalogImage}
                    />
                  </View>
                  <View style={styles.catalogInfo}>
                    <Text style={styles.catalogName}>{item.name}</Text>
                    <View style={styles.colorRow}>
                      <View
                        style={[
                          styles.swatch,
                          { backgroundColor: COLOR_SWATCH[item.color] ?? "#DDD" },
                        ]}
                      />
                      <Text style={styles.colorName}>{item.color}</Text>
                    </View>
                  </View>
                  <Text style={styles.price}>{priceText(item.price)}</Text>
                </Pressable>
              ))}
            </View>
            <StepNav
              onBack={() => setStep("choose")}
              onNext={() => {
                if (!modelName) return Alert.alert("확인", "등록할 제품을 선택해주세요.");
                setStep("purchase");
              }}
            />
          </>
        ) : null}

        {step === "purchase" ? (
          <>
            <Text style={styles.question}>아래 정보를 입력해주세요</Text>

            <Text style={styles.label}>구매일</Text>
            <Pressable onPress={() => setShowCalendar((open) => !open)} style={styles.picker}>
              <Text style={purchaseDate ? styles.pickerValue : styles.pickerPlaceholder}>
                {purchaseDate ?? "달력에서 구매일을 선택해주세요"}
              </Text>
            </Pressable>
            {showCalendar ? (
              <View style={styles.panel}>
                <Calendar
                  onSelect={(date) => {
                    setPurchaseDate(date);
                    setShowCalendar(false);
                  }}
                  value={purchaseDate}
                />
              </View>
            ) : null}

            <Text style={styles.label}>구매처</Text>
            <Pressable onPress={() => void loadStores()} style={styles.picker}>
              <Text style={purchasePlace ? styles.pickerValue : styles.pickerPlaceholder}>
                {purchasePlace || "지도에서 구매한 매장을 선택해주세요"}
              </Text>
            </Pressable>
            {showStores ? (
              <View style={styles.panel}>
                {/* 지도 SDK가 아직 없어 매장 목록/검색으로 고른다. 좌표 필드가 생기면 지도로 대체. */}
                <View style={styles.mapPlaceholder}>
                  <Text style={styles.mapText}>지도</Text>
                </View>
                <TextInput
                  onChangeText={setStoreSearch}
                  placeholder="매장 검색"
                  placeholderTextColor="#C0C0C0"
                  style={styles.searchInput}
                  value={storeSearch}
                />
                {stores == null ? (
                  <ActivityIndicator style={styles.panelLoading} />
                ) : storeList.length === 0 ? (
                  <Text style={styles.emptyText}>검색 결과가 없습니다</Text>
                ) : (
                  storeList.map((store) => (
                    <Pressable
                      key={store.id}
                      onPress={() => {
                        setPurchasePlace(store.name);
                        setShowStores(false);
                      }}
                      style={styles.storeRow}
                    >
                      <Text style={styles.storeName}>{store.name}</Text>
                      <Text style={styles.storeAddress}>{store.address}</Text>
                    </Pressable>
                  ))
                )}
              </View>
            ) : null}

            <Text style={styles.label}>사용 빈도</Text>
            <View style={styles.chips}>
              {USAGE_OPTIONS.map((option) => (
                <Pressable
                  key={option.value}
                  onPress={() => setUsageFrequency(option.value)}
                  style={[styles.chip, usageFrequency === option.value && styles.chipOn]}
                >
                  <Text
                    style={[styles.chipText, usageFrequency === option.value && styles.chipTextOn]}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <StepNav
              onBack={() => setStep("model")}
              onNext={() => {
                if (!purchaseDate) return Alert.alert("확인", "구매일을 선택해주세요.");
                if (usageFrequency == null) return Alert.alert("확인", "사용 빈도를 선택해주세요.");
                setStep("receipt");
              }}
            />
          </>
        ) : null}

        {step === "receipt" ? (
          <>
            <Text style={styles.question}>영수증을 첨부해주세요</Text>
            <PhotoPicker max={1} onChange={setReceiptPhoto} />
            <Text style={styles.subQuestion}>영수증이 없나요?</Text>
            <Text style={styles.guide}>
              영수증 없이도 등록할 수 있어요. 추후 매장 방문으로 보완할 수 있습니다.
            </Text>
            <StepNav onBack={() => setStep("purchase")} onNext={() => setStep("photos")} />
          </>
        ) : null}

        {step === "photos" ? (
          <>
            <Text style={styles.question}>제품의 현 상태를 찍어주세요</Text>
            {SHOTS.map((part) => (
              <View key={part} style={styles.shotBlock}>
                <Text style={styles.shotLabel}>{part}</Text>
                <PhotoPicker
                  max={1}
                  onChange={(photos) => setBaselinePhotos((prev) => ({ ...prev, [part]: photos }))}
                />
              </View>
            ))}
            <Text style={styles.shotNote}>
              업로드된 사진은 이후 제품 상태 진단시 기준점이 됩니다
            </Text>
            <StepNav onBack={() => setStep("receipt")} onNext={() => setStep("nickname")} />
          </>
        ) : null}

        {step === "nickname" ? (
          <>
            <Text style={styles.question}>제품의 애칭을 적어주세요</Text>
            <Text style={styles.label}>애칭</Text>
            <TextInput onChangeText={setNickname} style={styles.input} value={nickname} />
            <View style={styles.navRow}>
              <Pressable
                onPress={() => setStep("photos")}
                style={({ pressed }) => [styles.outline, styles.half, pressed && styles.pressed]}
              >
                <Text style={styles.outlineText}>이전 단계로</Text>
              </Pressable>
              <Pressable
                disabled={submitting}
                onPress={() => void submit()}
                style={({ pressed }) => [styles.filled, styles.half, pressed && styles.pressed]}
              >
                <Text style={styles.filledText}>{submitting ? "등록 중..." : "다음 단계로"}</Text>
              </Pressable>
            </View>
          </>
        ) : null}

        {step === "done" ? (
          <View style={styles.done}>
            <PackingAnimation />
            <Text style={styles.doneText}>등록이 완료되었습니다!</Text>
            <Pressable
              onPress={() => router.replace("/(tabs)/home")}
              style={({ pressed }) => [styles.filled, styles.wide, pressed && styles.pressed]}
            >
              <Text style={styles.filledText}>홈으로</Text>
            </Pressable>
          </View>
        ) : null}

        {progress ? (
          <View style={styles.progressRow}>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${(progress / 5) * 100}%` }]} />
            </View>
            <Text style={styles.progressText}>{progress}/5</Text>
          </View>
        ) : null}
      </ScrollView>

      {intro && step === "choose" ? (
        <View style={styles.introLayer}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setIntro(false)} />
          <View style={[styles.introSheet, { paddingBottom: bottomPad }]}>
            <View style={styles.introGrip} />
            <Text style={styles.introTitle}>제품 등록</Text>
            <Text style={styles.introDesc}>
              가방 안쪽 황동 플레이트의 고유번호로{"\n"}나만의 여권을 시작합니다.
            </Text>
            <View style={styles.introBox}>
              <Text style={styles.introBoxTitle}>사진을 찍으면 고유번호를 자동으로 읽어드려요</Text>
              <Text style={styles.introSteps}>고유번호 › 모델 확인 › 사진 등록</Text>
            </View>
            <Pressable
              onPress={() => setIntro(false)}
              style={({ pressed }) => [styles.introCta, pressed && styles.pressed]}
            >
              <Text style={styles.filledText}>제품 등록 시작하기</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function StepNav({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  return (
    <View style={styles.navRow}>
      <Pressable
        onPress={onBack}
        style={({ pressed }) => [styles.outline, styles.half, pressed && styles.pressed]}
      >
        <Text style={styles.outlineText}>이전 단계로</Text>
      </Pressable>
      <Pressable
        onPress={onNext}
        style={({ pressed }) => [styles.filled, styles.half, pressed && styles.pressed]}
      >
        <Text style={styles.filledText}>다음 단계로</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 20 },
  title: { fontSize: 21, fontWeight: "800", color: "#111", marginBottom: 20 },
  rule: { height: 1, backgroundColor: "#DEDEDE", marginBottom: 26 },
  question: { fontSize: 15, fontWeight: "700", color: "#1A1A1A", marginBottom: 9 },
  subQuestion: {
    fontSize: 13,
    fontWeight: "600",
    color: "#1A1A1A",
    marginTop: 20,
    marginBottom: 6,
  },
  guide: { fontSize: 12, color: "#9A9A9A", lineHeight: 19, marginBottom: 18 },
  label: { fontSize: 11.5, color: "#8A8A8A", marginBottom: 6, marginTop: 8 },
  input: {
    height: 44,
    borderWidth: 1,
    borderColor: "#DDD",
    borderRadius: 6,
    paddingHorizontal: 12,
    color: "#222",
    backgroundColor: "#fff",
    marginBottom: 14,
  },
  chooseActions: { marginTop: 200, gap: 12 },
  navRow: { flexDirection: "row", gap: 10, marginTop: 26 },
  half: { flex: 1 },
  wide: { width: "100%" },
  outline: {
    height: 52,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#D5D5D5",
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  outlineText: { fontSize: 14, color: "#222" },
  filled: {
    height: 52,
    borderRadius: 8,
    backgroundColor: "#2B2B2B",
    alignItems: "center",
    justifyContent: "center",
  },
  filledText: { fontSize: 14, color: "#fff", fontWeight: "500" },
  pressed: { transform: [{ scale: 0.98 }] },

  permission: { alignItems: "center" },
  permIcon: {
    width: 78,
    height: 78,
    borderRadius: 39,
    backgroundColor: "#F8EEDF",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  permLens: { width: 26, height: 26, borderRadius: 13, borderWidth: 1.7, borderColor: "#8A6A3E" },
  permTitle: { fontSize: 16, fontWeight: "700", color: "#1A1A1A", marginBottom: 12 },
  permDesc: {
    fontSize: 12.5,
    color: "#8A8A8A",
    lineHeight: 21,
    textAlign: "center",
    marginBottom: 26,
  },
  permRow: { width: "100%", borderTopWidth: 1, borderTopColor: "#EDEDED", paddingVertical: 15 },
  permRowTitle: { fontSize: 12.5, color: "#1A1A1A", marginBottom: 3 },
  permRowText: { fontSize: 11, color: "#A0A0A0" },
  permNote: {
    width: "100%",
    borderTopWidth: 1,
    borderTopColor: "#EDEDED",
    paddingTop: 22,
    marginTop: 22,
    marginBottom: 30,
    fontSize: 11,
    color: "#B5B5B5",
    textAlign: "center",
  },

  camera: { flex: 1, backgroundColor: "#6E6E6E", alignItems: "center" },
  cameraHead: { width: "100%", flexDirection: "row", justifyContent: "flex-end", padding: 18 },
  cameraClose: { width: 34, height: 34, alignItems: "center", justifyContent: "center" },
  cameraCloseText: { color: "#fff", fontSize: 22 },
  pill: {
    marginTop: 10,
    backgroundColor: "#111",
    borderRadius: 26,
    paddingHorizontal: 26,
    paddingVertical: 15,
  },
  pillText: { color: "#fff", fontSize: 13 },
  frame: {
    width: 212,
    height: 212,
    marginTop: 44,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  corner: { position: "absolute", width: 34, height: 34, borderColor: "#fff" },
  cornerTL: { top: -2, left: -2, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 14 },
  cornerTR: {
    top: -2,
    right: -2,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: 14,
  },
  cornerBL: {
    bottom: -2,
    left: -2,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: 14,
  },
  cornerBR: {
    bottom: -2,
    right: -2,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: 14,
  },
  shutterRow: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 40,
    paddingHorizontal: 24,
    alignItems: "center",
  },
  shutter: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: "#fff",
    borderWidth: 4,
    borderColor: "rgba(255,255,255,0.55)",
  },
  shutterPressed: { transform: [{ scale: 0.92 }] },
  status: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9 },
  statusText: { color: "#fff", fontSize: 13 },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#fff",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 18,
  },
  sheetQuestion: { fontSize: 12.5, color: "#333", marginBottom: 14 },
  sheetRow: { flexDirection: "row", gap: 10, marginTop: 10 },

  catalogBox: {
    borderWidth: 1,
    borderColor: "#E3E3E3",
    borderRadius: 8,
    padding: 12,
  },
  searchInput: {
    height: 34,
    borderBottomWidth: 1,
    borderBottomColor: "#E3E3E3",
    color: "#333",
    fontSize: 12,
    marginBottom: 4,
    padding: 0,
  },
  catalogRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },
  catalogRowOn: { backgroundColor: "#F6EFE1" },
  catalogThumb: { width: 40, height: 40, borderRadius: 5, backgroundColor: "#EFEFEF" },
  catalogImage: { width: "100%", height: "100%", resizeMode: "contain" },
  catalogInfo: { flex: 1 },
  catalogName: { fontSize: 11.5, color: "#5A5A5A" },
  colorRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 3 },
  swatch: {
    width: 9,
    height: 9,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.22)",
    transform: [{ rotate: "45deg" }],
  },
  colorName: { fontSize: 10.5, color: "#9A9A9A" },
  price: { fontSize: 10.5, color: "#8A8A8A" },

  picker: {
    height: 44,
    borderWidth: 1,
    borderColor: "#DDD",
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  pickerValue: { fontSize: 13, color: "#222" },
  pickerPlaceholder: { fontSize: 13, color: "#B0B0B0" },
  panel: {
    borderWidth: 1,
    borderColor: "#EDEDED",
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  panelLoading: { paddingVertical: 20 },
  mapPlaceholder: {
    height: 130,
    borderRadius: 4,
    backgroundColor: "#D9D9D9",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  mapText: { fontSize: 12.5, color: "#7A7A7A" },
  storeRow: { paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: "#F0F0F0" },
  storeName: { fontSize: 12.5, fontWeight: "600", color: "#1A1A1A" },
  storeAddress: { fontSize: 11, color: "#9A9A9A", marginTop: 2 },
  emptyText: { fontSize: 12, color: "#9A9A9A", paddingVertical: 14, textAlign: "center" },

  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 6 },
  chip: {
    height: 33,
    paddingHorizontal: 15,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: "#DDD",
    alignItems: "center",
    justifyContent: "center",
  },
  chipOn: { backgroundColor: "#7A4E15", borderColor: "#7A4E15" },
  chipText: { fontSize: 12.5, color: "#555" },
  chipTextOn: { color: "#fff", fontWeight: "600" },

  shotBlock: { marginBottom: 16 },
  shotLabel: { fontSize: 12.5, color: "#2A2A2A", marginBottom: 8, fontWeight: "600" },
  shotNote: { fontSize: 10, color: "#B0B0B0", textAlign: "center", marginTop: 8 },

  done: { alignItems: "center", paddingTop: 20 },
  doneText: { fontSize: 15, color: "#2A2A2A", marginTop: 30, marginBottom: 40 },

  progressRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingTop: 18 },
  progressTrack: { flex: 1, height: 3, borderRadius: 2, backgroundColor: "#EDEDED" },
  progressFill: { height: 3, borderRadius: 2, backgroundColor: colors.gold },
  progressText: { fontSize: 11, color: "#A0A0A0" },

  introLayer: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(40,40,40,0.5)" },
  introSheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 22,
  },
  introGrip: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#DCDCDC",
    alignSelf: "center",
    marginBottom: 20,
  },
  introTitle: { fontSize: 20, fontWeight: "800", color: "#111", marginBottom: 12 },
  introDesc: { fontSize: 14, color: "#3A3A3A", lineHeight: 23, marginBottom: 20 },
  introBox: { backgroundColor: "#F3F1EC", borderRadius: 14, padding: 16, marginBottom: 22 },
  introBoxTitle: { fontSize: 11.5, color: "#6B6B6B", marginBottom: 10 },
  introSteps: { fontSize: 11, color: "#5C5C5C" },
  introCta: {
    height: 54,
    borderRadius: 27,
    backgroundColor: "#111",
    alignItems: "center",
    justifyContent: "center",
  },
});
