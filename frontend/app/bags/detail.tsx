import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, View } from "react-native";
import { Text, TextInput } from "../../src/components/BrandText";
import { AppButton, Header } from "../../src/components/UI";
import { common, colors, gradeLabel } from "../../src/theme";
import { useAndroidBack } from "../../src/hooks/useAndroidBack";
import {
  productApi,
  diagnosisApi,
  careRecordApi,
  type PassportDetail,
  type DiagnosisDetail,
  type CareRecordDetail,
} from "../../src/api/client";
const bag = require("../../assets/mcm-bag.png");
export default function Detail() {
  useAndroidBack();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [passport, setPassport] = useState<PassportDetail | null>(null);
  const [diagnoses, setDiagnoses] = useState<DiagnosisDetail[]>([]);
  const [careRecords, setCareRecords] = useState<CareRecordDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [nickname, setNickname] = useState("");
  const [edit, setEdit] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!id) return;
      let active = true;
      setLoading(true);
      Promise.all([
        productApi.detail(id),
        diagnosisApi.list(id, 0, 100),
        careRecordApi.list(id, 0, 100, "completedAt,desc"),
      ])
        .then(([p, d, c]) => {
          if (!active) return;
          setPassport(p);
          setNickname(p.nickname || "");
          setDiagnoses(d.content);
          setCareRecords(c.content);
        })
        .catch(() => {
          if (active) Alert.alert("불러오기 실패", "제품 정보를 불러오지 못했습니다.");
        })
        .finally(() => {
          if (active) setLoading(false);
        });
      return () => {
        active = false;
      };
    }, [id]),
  );

  async function saveNickname() {
    if (!id) return;
    try {
      const updated = await productApi.update(id, { nickname });
      setPassport(updated);
      setEdit(false);
    } catch {
      Alert.alert("저장 실패", "애칭 저장에 실패했습니다.");
    }
  }

  function remove() {
    if (!id) return;
    Alert.alert(
      "제품 삭제",
      "삭제 후 복구할 수 없습니다. 지금까지의 진단·케어 기록이 모두 사라집니다.",
      [
        { text: "취소" },
        {
          text: "삭제",
          style: "destructive",
          onPress: async () => {
            try {
              await productApi.remove(id);
              router.replace("/bags");
            } catch {
              Alert.alert("삭제 실패", "제품 삭제에 실패했습니다.");
            }
          },
        },
      ],
    );
  }

  if (loading || !passport)
    return (
      <>
        <Header title="제품 상세" back />
        <View style={[common.content, { alignItems: "center", paddingTop: 60 }]}>
          <ActivityIndicator />
        </View>
      </>
    );

  return (
    <>
      <Header title="제품 상세" back />
      <ScrollView contentContainerStyle={common.content}>
        <Image
          source={bag}
          style={{
            width: "100%",
            height: 230,
            resizeMode: "contain",
            backgroundColor: colors.soft,
          }}
        />
        {edit ? (
          <TextInput style={common.input} value={nickname} onChangeText={setNickname} />
        ) : (
          <Text style={common.title}>{passport.nickname || passport.modelName}</Text>
        )}
        <Text>{passport.modelName}</Text>
        <Text style={common.muted}>{passport.serialNumber}</Text>
        <View style={common.row}>
          <Pressable onPress={() => (edit ? saveNickname() : setEdit(true))}>
            <Text>{edit ? "저장" : "제품 이름 변경"}</Text>
          </Pressable>
          <Pressable onPress={remove}>
            <Text style={{ color: colors.danger }}>제품 삭제</Text>
          </Pressable>
        </View>
        <View style={common.row}>
          <View style={{ flex: 1 }}>
            <AppButton
              outline
              title="여권 타임라인"
              onPress={() => router.push({ pathname: "/journey/passport", params: { id } })}
            />
          </View>
          <View style={{ flex: 1 }}>
            <AppButton
              title="다시 진단"
              onPress={() => router.push({ pathname: "/(tabs)/diagnosis", params: { id } })}
            />
          </View>
        </View>
        <Text style={common.section}>진단 내역</Text>
        {diagnoses.length === 0 ? (
          <Text style={common.muted}>아직 진단 기록이 없습니다.</Text>
        ) : (
          diagnoses.map((d, i) => (
            <Pressable
              key={d.id}
              style={{ paddingVertical: 15, borderBottomWidth: 1, borderColor: colors.line }}
              onPress={() =>
                router.push({
                  pathname: "/diagnosis/result",
                  params: { id: String(d.id), passportId: id },
                })
              }
            >
              <Text>
                {diagnoses.length - i}번째 진단 · 등급 {gradeLabel(d.overallGrade)}
              </Text>
              <Text style={common.muted}>{d.diagnosedAt.slice(0, 10)}</Text>
            </Pressable>
          ))
        )}
        <Text style={common.section}>케어 내역</Text>
        {careRecords.length === 0 ? (
          <Text style={common.muted}>아직 케어 기록이 없습니다.</Text>
        ) : (
          careRecords.map((record) => (
            <Pressable
              key={record.id}
              style={{ paddingVertical: 15, borderBottomWidth: 1, borderColor: colors.line }}
              onPress={() =>
                router.push({
                  pathname: "/care/detail",
                  params: { id: String(record.id), passportId: id },
                })
              }
            >
              <Text>{record.careType}</Text>
              <Text style={common.muted}>{record.completedAt.slice(0, 10)}</Text>
            </Pressable>
          ))
        )}
      </ScrollView>
    </>
  );
}
