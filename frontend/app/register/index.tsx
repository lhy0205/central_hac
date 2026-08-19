import { router } from "expo-router";
import { useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { AppButton, Field, Header } from "../../src/components/UI";
import { PhotoPicker, validatePhotos, type PickedPhoto } from "../../src/components/PhotoPicker";
import { productApi, transferApi, type TransferPreview } from "../../src/api/client";
import { recognizeSerial } from "../../src/register/ocr";
import { common, colors, gradeLabel } from "../../src/theme";
type UsageFrequency = "DAILY" | "FEW_TIMES_A_WEEK" | "OCCASIONAL" | "RARE";
const USAGE_OPTIONS: { label: string; value: UsageFrequency }[] = [
  { label: "매일", value: "DAILY" },
  { label: "주 여러 번", value: "FEW_TIMES_A_WEEK" },
  { label: "가끔", value: "OCCASIONAL" },
  { label: "거의 안 씀", value: "RARE" },
];
const SERIAL_PATTERN = /^([A-Za-z]\d{4}|\d{4})$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
// 카탈로그 API가 아직 없어 임시로 넣어둔 목업 목록 — 실제 데이터 연동 전까지만 사용.
const MOCK_PRODUCTS = [
  { id: "m1", name: "Aren 비세토스 스쿨 토트", color: "Soft Pink", price: 1250000 },
  { id: "m2", name: "Pina 비세토스 스터드 장식 토트", color: "Cognac", price: 1450000 },
  { id: "m3", name: "Visetos 숄더백", color: "Black", price: 980000 },
  { id: "m4", name: "Liz 클러치", color: "Ivory", price: 650000 },
  { id: "m5", name: "Himmel 백팩", color: "Camel", price: 1650000 },
  { id: "m6", name: "Odeon 크로스바디", color: "Berry", price: 890000 },
  { id: "m7", name: "Nomad 토트", color: "Sand", price: 1350000 },
  { id: "m8", name: "Klara 숄더백", color: "White", price: 1120000 },
];
export default function Register() {
  const [mode, setMode] = useState<"choose" | "new" | "transfer">("choose");
  const [recognitionPhase, setRecognitionPhase] = useState<
    | "permission"
    | "capture"
    | "confirmSerial"
    | "manualSerial"
    | "candidates"
    | "manualModel"
    | "done"
  >("permission");
  const [scannedSerial, setScannedSerial] = useState("");
  const [candidateSearch, setCandidateSearch] = useState("");
  const [step, setStep] = useState(0);
  const [value, setValue] = useState("");
  const [confirm, setConfirm] = useState("");
  const [labelPhoto, setLabelPhoto] = useState<PickedPhoto[]>([]);
  const [serialNumber, setSerialNumber] = useState("");
  const [serialConfirm, setSerialConfirm] = useState("");
  const [modelName, setModelName] = useState("");
  const [purchaseDate, setPurchaseDate] = useState("");
  const [purchasePlace, setPurchasePlace] = useState("");
  const [usageFrequency, setUsageFrequency] = useState<UsageFrequency | null>(null);
  const [receiptPhoto, setReceiptPhoto] = useState<PickedPhoto[]>([]);
  const [baselinePhotos, setBaselinePhotos] = useState<PickedPhoto[]>([]);
  const [nickname, setNickname] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [transferPreview, setTransferPreview] = useState<TransferPreview | null>(null);
  const [transferLoading, setTransferLoading] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);

  async function loadTransferPreview() {
    // 백엔드 코드 문자 집합(CODE_CHARS)이 대문자+숫자뿐이라 소문자로 입력하면 형식 검증에서부터
    // 걸러진다. Field 컴포넌트는 autoCapitalize="none"이라 자동 대문자화가 안 되므로 여기서 정규화한다.
    const normalized = value.trim().toUpperCase();
    const normalizedConfirm = confirm.trim().toUpperCase();
    if (!normalized || normalized !== normalizedConfirm)
      return Alert.alert("확인", "코드를 동일하게 입력해주세요.");
    setValue(normalized);
    setTransferLoading(true);
    try {
      setTransferPreview(await transferApi.preview(normalized));
    } catch {
      Alert.alert("조회 실패", "코드가 만료되었거나 존재하지 않습니다.");
    } finally {
      setTransferLoading(false);
    }
  }

  async function redeemTransfer() {
    setTransferLoading(true);
    try {
      await transferApi.redeem(value.trim().toUpperCase());
      Alert.alert("승계 완료", "제품이 내 가방에 추가되었습니다.", [
        { text: "확인", onPress: () => router.replace("/bags") },
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

  function handleCapturePhoto(photos: PickedPhoto[]) {
    setLabelPhoto(photos);
  }

  // 촬영한 라벨 사진을 OCR 서버로 보내 일련번호를 자동으로 읽어낸다. 실패하거나 인식된
  // 코드가 없어도 confirmSerial 화면으로 넘어간다 — 거기서 빈 값이면 직접 입력하게 되어 있다.
  async function runOcrAndProceed() {
    setOcrLoading(true);
    try {
      const photo = labelPhoto[0];
      const result = await recognizeSerial(photo);
      setScannedSerial(result.bestCodeGuess ?? "");
    } catch (error) {
      // 실패("서버 요청 자체가 안 됨")와 "요청은 됐는데 코드가 없었음"을 구분해서 보여준다 —
      // 둘 다 조용히 넘어가면 원인을 알 방법이 없다.
      setScannedSerial("");
      const message = error instanceof Error ? error.message : String(error);
      Alert.alert("자동 인식 실패", `${message}\n직접 입력해주세요.`);
    } finally {
      setOcrLoading(false);
      setRecognitionPhase("confirmSerial");
    }
  }

  function confirmScannedSerial() {
    if (!SERIAL_PATTERN.test(scannedSerial))
      return Alert.alert("확인", "일련번호 형식을 확인해주세요.");
    setSerialNumber(scannedSerial);
    setRecognitionPhase("candidates");
  }

  function confirmManualSerial() {
    if (!(SERIAL_PATTERN.test(serialNumber) && serialNumber === serialConfirm)) return;
    setRecognitionPhase("candidates");
  }

  function pickProduct(name: string) {
    setModelName(name);
    setStep(3);
    setRecognitionPhase("done");
  }

  function skipToManualEntry() {
    setStep(1);
    setRecognitionPhase("done");
  }

  async function submit() {
    if (submitting) return;
    const fileError = validatePhotos([...receiptPhoto, ...baselinePhotos]);
    if (fileError) return Alert.alert("파일 확인", fileError);
    setSubmitting(true);
    try {
      await productApi.create(
        {
          serialNumber,
          modelName,
          nickname: nickname || undefined,
          purchaseDate,
          purchasePlace: purchasePlace || undefined,
          usageFrequency: usageFrequency as UsageFrequency,
        },
        receiptPhoto[0],
        baselinePhotos,
      );
      Alert.alert("등록 완료", "제품이 내 가방에 추가되었습니다.", [
        { text: "확인", onPress: () => router.replace("/bags") },
      ]);
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

  function canProceed() {
    if (step === 0) return labelPhoto.length > 0;
    if (step === 1) return SERIAL_PATTERN.test(serialNumber) && serialNumber === serialConfirm;
    if (step === 2) return modelName.trim().length > 0;
    if (step === 3) return DATE_PATTERN.test(purchaseDate);
    if (step === 4) return usageFrequency !== null;
    return true;
  }

  return (
    <>
      <Header title="제품 등록" back hideProfile />
      <ScrollView contentContainerStyle={common.content}>
        {mode === "choose" ? (
          <View style={registerStyles.entry}>
            <Text style={registerStyles.question}>이미 등록되어 있는 제품인가요?</Text>
            <Text style={registerStyles.guide}>
              이미 타인에 의해 여권이 생성된 제품일 경우 승계코드가 필요합니다
            </Text>
            <View style={registerStyles.choiceRow}>
              <Pressable style={registerStyles.outlineChoice} onPress={() => setMode("transfer")}>
                <Text style={registerStyles.outlineChoiceText}>네 이미 여권이 존재합니다</Text>
              </Pressable>
              <Pressable style={registerStyles.filledChoice} onPress={() => setMode("new")}>
                <Text style={registerStyles.filledChoiceText}>아니요 처음 등록합니다</Text>
              </Pressable>
            </View>
          </View>
        ) : mode === "transfer" ? (
          transferPreview ? (
            <>
              <Text style={common.title}>이 제품을 승계받으시겠어요?</Text>
              <View style={common.card}>
                <Text>{transferPreview.modelName}</Text>
                <Text style={common.muted}>
                  {transferPreview.overallGrade
                    ? `등급 ${gradeLabel(transferPreview.overallGrade)}`
                    : "진단 전"}{" "}
                  · 함께한 지 {transferPreview.ownershipDays}일
                </Text>
              </View>
              <AppButton
                title={transferLoading ? "처리 중..." : "승계받기"}
                disabled={transferLoading}
                onPress={redeemTransfer}
              />
              <AppButton
                outline
                title="취소"
                onPress={() => {
                  setTransferPreview(null);
                  setValue("");
                  setConfirm("");
                }}
              />
            </>
          ) : (
            <>
              <Text style={common.title}>승계 코드를 입력해주세요</Text>
              <Field label="승계 코드" value={value} onChange={setValue} />
              <Field label="승계 코드 재입력" value={confirm} onChange={setConfirm} />
              <AppButton
                title={transferLoading ? "조회 중..." : "다음"}
                disabled={transferLoading}
                onPress={loadTransferPreview}
              />
            </>
          )
        ) : recognitionPhase !== "done" ? (
          <>
            {recognitionPhase === "permission" && (
              <>
                <View style={registerStyles.permissionIconWrap}>
                  <Text style={registerStyles.permissionIcon}>◎</Text>
                </View>
                <Text style={registerStyles.permissionTitle}>카메라 접근을 허용해 주세요</Text>
                <Text style={[registerStyles.guide, { textAlign: "center" }]}>
                  제품 일련번호를 자동으로 입력해요
                </Text>
                <AppButton title="허용하고 시작" onPress={() => setRecognitionPhase("capture")} />
                <AppButton outline title="직접 입력할게요" onPress={skipToManualEntry} />
              </>
            )}
            {recognitionPhase === "capture" && (
              <>
                <Text style={common.title}>제품 등록</Text>
                <Text style={registerStyles.guide}>
                  가방 안쪽 황동 플레이트가 잘 보이도록 가까이서 찍어주세요. 일련번호를 자동으로
                  읽어드려요.
                </Text>
                <PhotoPicker max={1} onChange={handleCapturePhoto} />
                <View style={common.row}>
                  <View style={{ flex: 1 }}>
                    <AppButton
                      outline
                      title="이전 단계로"
                      disabled={ocrLoading}
                      onPress={() => setRecognitionPhase("permission")}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <AppButton
                      disabled={labelPhoto.length === 0 || ocrLoading}
                      title={ocrLoading ? "일련번호 인식 중..." : "다음 단계로"}
                      onPress={runOcrAndProceed}
                    />
                  </View>
                </View>
              </>
            )}
            {recognitionPhase === "confirmSerial" && (
              <>
                <Text style={common.title}>제품 등록</Text>
                <Text style={registerStyles.guide}>
                  {scannedSerial
                    ? "현재 스캔한 제품의 일련번호가 맞나요?"
                    : "자동으로 인식하지 못했어요. 직접 입력하거나 다시 촬영해주세요."}
                </Text>
                <Field
                  label="일련번호"
                  value={scannedSerial}
                  onChange={setScannedSerial}
                  placeholder="예: A1234"
                />
                <View style={common.row}>
                  <View style={{ flex: 1 }}>
                    <AppButton
                      outline
                      title="아닙니다"
                      onPress={() => setRecognitionPhase("manualSerial")}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <AppButton title="맞습니다" onPress={confirmScannedSerial} />
                  </View>
                </View>
                <AppButton
                  outline
                  title="이전 단계로"
                  onPress={() => setRecognitionPhase("capture")}
                />
              </>
            )}
            {recognitionPhase === "manualSerial" && (
              <>
                <Text style={common.title}>제품 등록</Text>
                <Text style={registerStyles.guide}>
                  사진을 인식하지 못했습니다. 아래 정보를 입력해주세요.
                </Text>
                <Field label="제품 일련번호" value={serialNumber} onChange={setSerialNumber} />
                <Field
                  label="제품 일련번호 재입력"
                  value={serialConfirm}
                  onChange={setSerialConfirm}
                  error={
                    serialConfirm.length > 0 && serialNumber !== serialConfirm
                      ? "일련번호가 일치하지 않습니다."
                      : undefined
                  }
                />
                <View style={common.row}>
                  <View style={{ flex: 1 }}>
                    <AppButton
                      outline
                      title="이전 단계로"
                      onPress={() => setRecognitionPhase("confirmSerial")}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <AppButton
                      disabled={
                        !(SERIAL_PATTERN.test(serialNumber) && serialNumber === serialConfirm)
                      }
                      title="다음 단계로"
                      onPress={confirmManualSerial}
                    />
                  </View>
                </View>
              </>
            )}
            {recognitionPhase === "candidates" &&
              (() => {
                const q = candidateSearch.trim().toLowerCase();
                const filtered = q
                  ? MOCK_PRODUCTS.filter((p) => p.name.toLowerCase().includes(q))
                  : MOCK_PRODUCTS;
                return (
                  <>
                    <View style={registerStyles.candidateListBox}>
                      <Text style={registerStyles.candidateListTitle}>
                        등록할 제품을 선택해주세요
                      </Text>
                      <TextInput
                        style={registerStyles.searchInput}
                        value={candidateSearch}
                        onChangeText={setCandidateSearch}
                        placeholder="검색…"
                        placeholderTextColor="#A9A9A9"
                      />
                      <ScrollView style={registerStyles.candidateListScroll}>
                        {filtered.map((p) => (
                          <Pressable
                            key={p.id}
                            style={registerStyles.candidateRow}
                            onPress={() => pickProduct(p.name)}
                          >
                            <View style={registerStyles.candidateThumb} />
                            <View style={{ flex: 1 }}>
                              <Text numberOfLines={1}>{p.name}</Text>
                              <Text style={common.muted}>
                                {p.color} | ₩{p.price.toLocaleString()}
                              </Text>
                            </View>
                          </Pressable>
                        ))}
                        {filtered.length === 0 && (
                          <Text style={[common.muted, { padding: 14 }]}>검색 결과가 없습니다.</Text>
                        )}
                      </ScrollView>
                    </View>
                    <AppButton
                      outline
                      title="찾는 제품이 없어요"
                      onPress={() => setRecognitionPhase("manualModel")}
                    />
                  </>
                );
              })()}
            {recognitionPhase === "manualModel" && (
              <>
                <Text style={registerStyles.guide}>
                  목록에 없는 제품이네요. 다음 단계에서 다시 골라주세요.
                </Text>
                <View style={common.row}>
                  <View style={{ flex: 1 }}>
                    <AppButton
                      outline
                      title="다시 검색하기"
                      onPress={() => setRecognitionPhase("candidates")}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <AppButton
                      title="계속하기"
                      onPress={() => {
                        setStep(2);
                        setRecognitionPhase("done");
                      }}
                    />
                  </View>
                </View>
              </>
            )}
          </>
        ) : (
          <>
            <Text style={{ color: colors.gold }}>제품 등록 {step + 1}/8</Text>
            {step === 0 && (
              <>
                <Text style={common.title}>제품 안쪽 라벨을 촬영해주세요</Text>
                <Text style={common.muted}>
                  시리얼 번호가 잘 보이도록 가까이서 찍어주세요. 자동 인식은 아직 지원하지 않아 다음
                  단계에서 직접 입력해주세요.
                </Text>
                <PhotoPicker max={1} onChange={setLabelPhoto} />
              </>
            )}
            {step === 1 && (
              <>
                <Text style={common.title}>제품 일련번호를 입력해주세요</Text>
                <Text style={common.muted}>
                  신형은 영문 1자+숫자 4자리(예: A1234), 빈티지는 숫자 4자리입니다.
                </Text>
                <Field label="일련번호" value={serialNumber} onChange={setSerialNumber} />
                <Field
                  label="일련번호 재입력"
                  value={serialConfirm}
                  onChange={setSerialConfirm}
                  error={
                    serialConfirm.length > 0 && serialNumber !== serialConfirm
                      ? "일련번호가 일치하지 않습니다."
                      : undefined
                  }
                />
              </>
            )}
            {step === 2 &&
              (() => {
                const q = candidateSearch.trim().toLowerCase();
                const filtered = q
                  ? MOCK_PRODUCTS.filter((p) => p.name.toLowerCase().includes(q))
                  : MOCK_PRODUCTS;
                return (
                  <>
                    <Text style={common.title}>등록할 제품을 선택해주세요</Text>
                    <TextInput
                      style={registerStyles.searchInput}
                      value={candidateSearch}
                      onChangeText={setCandidateSearch}
                      placeholder="검색…"
                      placeholderTextColor="#A9A9A9"
                    />
                    <ScrollView style={registerStyles.candidateListScroll}>
                      {filtered.map((p) => (
                        <Pressable
                          key={p.id}
                          style={[
                            registerStyles.candidateRow,
                            modelName === p.name && registerStyles.candidateRowActive,
                          ]}
                          onPress={() => setModelName(p.name)}
                        >
                          <View style={registerStyles.candidateThumb} />
                          <View style={{ flex: 1 }}>
                            <Text numberOfLines={1}>{p.name}</Text>
                            <Text style={common.muted}>
                              {p.color} | ₩{p.price.toLocaleString()}
                            </Text>
                          </View>
                        </Pressable>
                      ))}
                      {filtered.length === 0 && (
                        <Text style={[common.muted, { padding: 14 }]}>검색 결과가 없습니다.</Text>
                      )}
                    </ScrollView>
                  </>
                );
              })()}
            {step === 3 && (
              <>
                <Text style={common.title}>구매 정보를 입력해주세요</Text>
                <Field
                  label="구매일 (YYYY-MM-DD)"
                  value={purchaseDate}
                  onChange={setPurchaseDate}
                  placeholder="2024-01-01"
                />
                <Field label="구매처" value={purchasePlace} onChange={setPurchasePlace} />
              </>
            )}
            {step === 4 && (
              <>
                <Text style={common.title}>얼마나 자주 사용하세요?</Text>
                <View style={common.row}>
                  {USAGE_OPTIONS.map((o) => (
                    <Pressable
                      key={o.value}
                      onPress={() => setUsageFrequency(o.value)}
                      style={{
                        padding: 10,
                        borderRadius: 14,
                        backgroundColor: usageFrequency === o.value ? colors.dark : colors.soft,
                      }}
                    >
                      <Text style={{ color: usageFrequency === o.value ? "#fff" : colors.dark }}>
                        {o.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </>
            )}
            {step === 5 && (
              <>
                <Text style={common.title}>영수증을 첨부해주세요</Text>
                <PhotoPicker max={1} onChange={setReceiptPhoto} />
              </>
            )}
            {step === 6 && (
              <>
                <Text style={common.title}>제품의 현 상태를 찍어주세요</Text>
                <PhotoPicker max={4} onChange={setBaselinePhotos} />
              </>
            )}
            {step === 7 && (
              <>
                <Text style={common.title}>제품에 이름을 붙여주세요</Text>
                <Field label="애칭" value={nickname} onChange={setNickname} />
              </>
            )}
            <View style={common.row}>
              {step > 0 && (
                <View style={{ flex: 1 }}>
                  <AppButton outline title="이전 단계" onPress={() => setStep((x) => x - 1)} />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <AppButton
                  disabled={!canProceed() || submitting}
                  title={submitting ? "등록 중..." : step < 7 ? "다음 단계" : "등록 완료"}
                  onPress={() => (step < 7 ? setStep((x) => x + 1) : submit())}
                />
              </View>
            </View>
          </>
        )}
      </ScrollView>
    </>
  );
}

const registerStyles = StyleSheet.create({
  entry: { paddingTop: 28 },
  permissionIconWrap: {
    alignSelf: "center",
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: "#F3E9D6",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 24,
    marginBottom: 20,
  },
  permissionIcon: { fontSize: 34, color: colors.gold },
  permissionTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: "#333",
    textAlign: "center",
    marginBottom: 8,
  },
  candidateListBox: {
    borderWidth: 1,
    borderColor: "#e5e1da",
    borderRadius: 10,
    padding: 12,
    marginTop: 8,
  },
  candidateListTitle: { fontSize: 13, color: "#333", marginBottom: 10 },
  searchInput: {
    borderBottomWidth: 1,
    borderColor: "#ddd",
    paddingVertical: 8,
    fontSize: 13,
    color: "#333",
    marginBottom: 6,
  },
  candidateListScroll: { maxHeight: 360 },
  candidateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderColor: "#f0ede7",
    borderRadius: 6,
  },
  candidateRowActive: { backgroundColor: "#faf6ef", borderColor: colors.gold },
  candidateThumb: { width: 44, height: 44, borderRadius: 6, backgroundColor: "#eee" },
  question: { fontSize: 14, color: "#3B3B3B", marginBottom: 12 },
  guide: { fontSize: 10, color: "#929292", lineHeight: 16 },
  choiceRow: { flexDirection: "row", gap: 10, marginTop: 62 },
  outlineChoice: {
    flex: 1,
    height: 43,
    borderWidth: 1,
    borderColor: "#BDBDBD",
    borderRadius: 5,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFF",
  },
  outlineChoiceText: { fontSize: 10, color: "#444" },
  filledChoice: {
    flex: 1,
    height: 43,
    borderRadius: 5,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.dark,
  },
  filledChoiceText: { fontSize: 10, color: "#FFF" },
});
