import { useState } from "react";
import {
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { AppButton, Field, Header } from "../../src/components/UI";
import { colors, common } from "../../src/theme";
type Page = "menu" | "faq" | "centers" | "hours" | "inquiry";
const FAQ = [
  {
    q: "제품 등록이 되지 않아요",
    a: "일련번호와 구매일을 다시 확인해주세요. 이미 등록된 제품이라면 기존 소유자에게 여권 승계 코드를 받아 등록할 수 있습니다.",
  },
  {
    q: "진단 사진은 어떻게 촬영하나요?",
    a: "밝은 곳에서 모서리·손잡이·바닥면·금속 부자재가 화면 안에 모두 보이도록 각각 촬영해주세요. 흐리거나 반사가 심한 사진은 다시 촬영하는 것이 좋습니다.",
  },
  {
    q: "진단 결과는 정품 감정 결과인가요?",
    a: "MCM Care의 진단은 제품 상태 관리를 위한 참고 자료이며 정품 감정 서비스가 아닙니다. 정품 여부는 공식 매장을 통해 문의해주세요.",
  },
  {
    q: "여권 승계 코드는 언제 사용하나요?",
    a: "등록된 제품을 다른 사람이 양도받았을 때 사용합니다. 기존 소유자가 승계 코드를 발급하고 새 소유자가 로그인 후 코드를 입력하면 여권이 이전됩니다.",
  },
  {
    q: "케어 기록을 수정하거나 삭제할 수 있나요?",
    a: "사용자가 직접 추가한 여정 기록은 상세 화면에서 수정·삭제할 수 있습니다. 진단과 공식 케어 기록은 이력 보호를 위해 직접 수정할 수 없습니다.",
  },
  {
    q: "알림이 오지 않아요",
    a: "프로필의 알림 설정과 휴대폰 설정의 MCM Care 알림 권한을 모두 확인해주세요. 일부 알림은 새로운 진단 결과가 생성된 이후 발송됩니다.",
  },
];
const CENTERS = [
  {
    name: "MCM 청담 플래그십 스토어",
    address: "서울 강남구 압구정로 412",
    phone: "02-540-1400",
    hours: "매일 11:00–20:00",
  },
  {
    name: "MCM 롯데백화점 본점",
    address: "서울 중구 남대문로 81",
    phone: "02-772-3682",
    hours: "월–목 10:30–20:00 · 금–일 10:30–20:30",
  },
  {
    name: "MCM 신세계백화점 센텀시티",
    address: "부산 해운대구 센텀남대로 35",
    phone: "051-745-2418",
    hours: "월–목 10:30–20:00 · 금–일 10:30–20:30",
  },
];
export default function Support() {
  const [page, setPage] = useState<Page>("menu");
  const [opened, setOpened] = useState<number | null>(0);
  const [category, setCategory] = useState("제품 등록");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [email, setEmail] = useState("");
  function submit() {
    if (!title.trim() || !content.trim() || !/^\S+@\S+\.\S+$/.test(email))
      return Alert.alert("입력 확인", "제목, 문의 내용과 회신 이메일을 확인해주세요.");
    Alert.alert(
      "문의 접수 완료",
      "문의가 임시 접수되었습니다. 고객센터 API가 연결되면 실제 접수 번호가 발급됩니다.",
      [
        {
          text: "확인",
          onPress: () => {
            setTitle("");
            setContent("");
            setPage("menu");
          },
        },
      ],
    );
  }
  const titleMap: Record<Page, string> = {
    menu: "고객센터",
    faq: "자주 묻는 질문",
    centers: "서비스센터 찾기",
    hours: "운영시간 안내",
    inquiry: "1:1 문의",
  };
  return (
    <View style={styles.screen}>
      <Header title={titleMap[page]} back={page === "menu"} />
      {page !== "menu" && (
        <Pressable style={styles.localBack} onPress={() => setPage("menu")}>
          <Text style={styles.localBackText}>‹ 고객센터</Text>
        </Pressable>
      )}
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {page === "menu" && (
          <>
            <Text style={styles.hero}>무엇을 도와드릴까요?</Text>
            <Text style={styles.description}>
              궁금한 내용을 선택하면 상세 안내를 확인할 수 있습니다.
            </Text>
            {(
              [
                { key: "faq", title: "자주 묻는 질문", sub: "제품 등록·진단·승계 관련 도움말" },
                { key: "inquiry", title: "1:1 문의", sub: "해결되지 않은 문제를 문의해주세요" },
                { key: "centers", title: "서비스센터 찾기", sub: "가까운 공식 매장과 연락처" },
                { key: "hours", title: "운영시간 안내", sub: "전화·온라인 상담 운영시간" },
              ] as const
            ).map((item) => (
              <Pressable key={item.key} style={styles.menuRow} onPress={() => setPage(item.key)}>
                <View>
                  <Text style={styles.menuTitle}>{item.title}</Text>
                  <Text style={styles.menuSub}>{item.sub}</Text>
                </View>
                <Text style={styles.chevron}>›</Text>
              </Pressable>
            ))}
          </>
        )}
        {page === "faq" &&
          FAQ.map((item, index) => (
            <View key={item.q} style={styles.faqItem}>
              <Pressable
                style={styles.faqQuestion}
                onPress={() => setOpened(opened === index ? null : index)}
              >
                <Text style={styles.qMark}>Q</Text>
                <Text style={styles.question}>{item.q}</Text>
                <Text style={styles.chevron}>{opened === index ? "⌃" : "⌄"}</Text>
              </Pressable>
              {opened === index && (
                <View style={styles.answer}>
                  <Text style={styles.aMark}>A</Text>
                  <Text style={styles.answerText}>{item.a}</Text>
                </View>
              )}
            </View>
          ))}
        {page === "centers" && (
          <>
            <Text style={styles.notice}>
              방문 전 매장에 연락해 케어 접수 가능 여부와 준비물을 확인해주세요.
            </Text>
            {CENTERS.map((center) => (
              <View key={center.name} style={styles.centerCard}>
                <Text style={styles.centerName}>{center.name}</Text>
                <Text style={styles.centerInfo}>{center.address}</Text>
                <Text style={styles.centerInfo}>{center.hours}</Text>
                <View style={styles.centerActions}>
                  <Pressable
                    style={styles.smallButton}
                    onPress={() => Linking.openURL(`tel:${center.phone.replaceAll("-", "")}`)}
                  >
                    <Text style={styles.smallButtonText}>전화하기</Text>
                  </Pressable>
                  <Pressable
                    style={styles.smallButton}
                    onPress={() =>
                      Linking.openURL(
                        `https://map.naver.com/p/search/${encodeURIComponent(center.name)}`,
                      )
                    }
                  >
                    <Text style={styles.smallButtonText}>지도 보기</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </>
        )}
        {page === "hours" && (
          <>
            <View style={styles.hoursCard}>
              <Text style={styles.hoursTitle}>전화 상담</Text>
              <Text style={styles.hoursValue}>평일 10:00–18:00</Text>
              <Text style={styles.centerInfo}>점심시간 12:30–13:30 · 토·일·공휴일 휴무</Text>
              <Pressable onPress={() => Linking.openURL("tel:16001976")}>
                <Text style={styles.phone}>1600-1976</Text>
              </Pressable>
            </View>
            <View style={styles.hoursCard}>
              <Text style={styles.hoursTitle}>1:1 온라인 문의</Text>
              <Text style={styles.hoursValue}>24시간 접수 가능</Text>
              <Text style={styles.centerInfo}>
                영업일 기준 1–2일 안에 입력한 이메일로 답변드립니다.
              </Text>
            </View>
            <View style={styles.hoursCard}>
              <Text style={styles.hoursTitle}>공식 매장</Text>
              <Text style={styles.hoursValue}>매장별 운영시간 상이</Text>
              <Text style={styles.centerInfo}>
                백화점 휴점일과 공휴일 운영시간은 해당 매장에 확인해주세요.
              </Text>
              <AppButton outline title="서비스센터 확인" onPress={() => setPage("centers")} />
            </View>
          </>
        )}
        {page === "inquiry" && (
          <>
            <Text style={styles.notice}>
              문의 내용을 자세히 작성하면 더 빠르게 안내받을 수 있습니다.
            </Text>
            <Text style={styles.fieldLabel}>문의 유형</Text>
            <View style={styles.categoryRow}>
              {["제품 등록", "진단", "케어·수선", "계정", "기타"].map((item) => (
                <Pressable
                  key={item}
                  onPress={() => setCategory(item)}
                  style={[styles.category, category === item && styles.categoryOn]}
                >
                  <Text style={[styles.categoryText, category === item && styles.categoryTextOn]}>
                    {item}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Field
              label="제목"
              value={title}
              onChange={setTitle}
              placeholder="문의 제목을 입력해주세요"
            />
            <Text style={styles.fieldLabel}>문의 내용</Text>
            <TextInput
              value={content}
              onChangeText={setContent}
              multiline
              placeholder="발생한 문제와 확인이 필요한 내용을 적어주세요"
              placeholderTextColor="#AAA"
              style={styles.textarea}
            />
            <Field
              label="회신 이메일"
              value={email}
              onChange={setEmail}
              placeholder="user@example.com"
            />
            <Text style={styles.privacy}>
              문의 답변을 위해 이메일과 문의 내용을 이용합니다. 실제 개인정보 처리 및 문의 저장은
              고객센터 API 연결 후 적용됩니다.
            </Text>
            <AppButton title="문의 접수" onPress={submit} />
          </>
        )}
      </ScrollView>
    </View>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 20, paddingBottom: 70, backgroundColor: "#fff" },
  localBack: {
    height: 38,
    paddingHorizontal: 20,
    justifyContent: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  localBackText: { color: colors.brown, fontSize: 12 },
  hero: { fontSize: 22, fontWeight: "600", color: "#333", marginTop: 8 },
  description: { fontSize: 11, color: "#999", marginTop: 7, marginBottom: 20 },
  menuRow: {
    minHeight: 76,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  menuTitle: { fontSize: 14, color: "#333", marginBottom: 5 },
  menuSub: { fontSize: 10, color: "#aaa" },
  chevron: { color: "#888", fontSize: 18 },
  faqItem: { borderBottomWidth: 1, borderBottomColor: "#eee" },
  faqQuestion: { minHeight: 62, flexDirection: "row", alignItems: "center", gap: 10 },
  qMark: { color: colors.brown, fontWeight: "700" },
  question: { flex: 1, fontSize: 13, color: "#333" },
  answer: {
    flexDirection: "row",
    gap: 10,
    backgroundColor: "#f7f7f7",
    padding: 15,
    marginBottom: 10,
    borderRadius: 6,
  },
  aMark: { color: colors.gold, fontWeight: "700" },
  answerText: { flex: 1, fontSize: 11, color: "#666", lineHeight: 18 },
  notice: {
    fontSize: 11,
    color: "#777",
    lineHeight: 17,
    backgroundColor: "#f7f7f7",
    padding: 13,
    borderRadius: 6,
    marginBottom: 14,
  },
  centerCard: {
    borderWidth: 1,
    borderColor: "#e2e2e2",
    borderRadius: 8,
    padding: 15,
    marginBottom: 12,
  },
  centerName: { fontSize: 14, fontWeight: "600", color: "#333", marginBottom: 8 },
  centerInfo: { fontSize: 10, color: "#888", lineHeight: 17 },
  centerActions: { flexDirection: "row", gap: 8, marginTop: 12 },
  smallButton: {
    flex: 1,
    height: 36,
    borderWidth: 1,
    borderColor: "#bbb",
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  smallButtonText: { fontSize: 10, color: "#555" },
  hoursCard: { padding: 16, borderBottomWidth: 1, borderBottomColor: "#eee", gap: 7 },
  hoursTitle: { fontSize: 12, color: colors.brown },
  hoursValue: { fontSize: 17, fontWeight: "600", color: "#333" },
  phone: { fontSize: 14, color: colors.brown, textDecorationLine: "underline", marginTop: 5 },
  fieldLabel: { fontSize: 13, color: "#333", marginTop: 8, marginBottom: 7 },
  categoryRow: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginBottom: 13 },
  category: {
    height: 30,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 15,
    justifyContent: "center",
  },
  categoryOn: { backgroundColor: "#444", borderColor: "#444" },
  categoryText: { fontSize: 10, color: "#666" },
  categoryTextOn: { color: "#fff" },
  textarea: {
    height: 145,
    borderWidth: 1,
    borderColor: "#e0e0e0",
    borderRadius: 5,
    padding: 12,
    textAlignVertical: "top",
    color: "#222",
    backgroundColor: "#fff",
    fontSize: 12,
  },
  privacy: { fontSize: 9, color: "#aaa", lineHeight: 14, marginVertical: 12 },
});
