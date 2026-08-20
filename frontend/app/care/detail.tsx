import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Image, ScrollView, View } from "react-native";
import { Text } from "../../src/components/BrandText";
import { careRecordApi, type CareRecordDetail } from "../../src/api/client";
import { AppButton, Header } from "../../src/components/UI";
import { colors, common } from "../../src/theme";
export default function CareDetail() {
  const { id, passportId } = useLocalSearchParams<{ id: string; passportId?: string }>();
  const [record, setRecord] = useState<CareRecordDetail | null>(null);
  useEffect(() => {
    if (id)
      careRecordApi
        .detail(id)
        .then(setRecord)
        .catch(() => Alert.alert("불러오기 실패", "케어 기록을 불러오지 못했습니다."));
  }, [id]);
  if (!record)
    return (
      <>
        <Header title="케어 기록 상세" back />
        <View style={[common.content, { alignItems: "center", paddingTop: 60 }]}>
          <ActivityIndicator />
        </View>
      </>
    );
  return (
    <>
      <Header title="케어 기록 상세" back />
      <ScrollView contentContainerStyle={common.content}>
        <Text style={common.title}>{record.careType}</Text>
        <Text style={common.muted}>{record.completedAt.replace("T", " ").slice(0, 16)}</Text>
        {record.imageUrl && (
          <Image
            source={{ uri: record.imageUrl }}
            style={{
              width: "100%",
              height: 220,
              backgroundColor: colors.soft,
              resizeMode: "cover",
            }}
          />
        )}
        <View style={common.card}>
          <Text>소재</Text>
          <Text style={common.muted}>{record.materialType || "기록 없음"}</Text>
          <Text style={{ marginTop: 14 }}>메모</Text>
          <Text style={common.muted}>{record.notes || "기록 없음"}</Text>
        </View>
        <AppButton
          outline
          title="돌아가기"
          onPress={() =>
            passportId
              ? router.replace({ pathname: "/journey/passport", params: { id: passportId } })
              : router.back()
          }
        />
      </ScrollView>
    </>
  );
}
