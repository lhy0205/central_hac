import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, Image, ScrollView, View } from "react-native";
import { Text, TextInput } from "../../src/components/BrandText";
import { AppButton, Header } from "../../src/components/UI";
import { journeyApi, type TimelineEventDetail } from "../../src/api/client";
import { common, colors } from "../../src/theme";
const bag = require("../../assets/mcm-bag.png");
const EVENT_TYPE_LABEL: Record<string, string> = {
  MOMENT: "순간 기록",
  STORE_VISIT: "매장 방문",
  SELF_CARE: "셀프 케어",
  OTHER: "기타",
};
export default function Detail() {
  const { id, passportId } = useLocalSearchParams<{ id: string; passportId: string }>();
  const [event, setEvent] = useState<TimelineEventDetail | null>(null);
  const [note, setNote] = useState("");
  const [edit, setEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  useFocusEffect(
    useCallback(() => {
      if (!id) return;
      let active = true;
      setLoading(true);
      journeyApi
        .detail(id)
        .then((e) => {
          if (active) {
            setEvent(e);
            setNote(e.note || "");
          }
        })
        .catch(() => {
          if (active) Alert.alert("불러오기 실패", "기록을 불러오지 못했습니다.");
        })
        .finally(() => {
          if (active) setLoading(false);
        });
      return () => {
        active = false;
      };
    }, [id]),
  );
  if (loading || !event)
    return (
      <>
        <Header title="기록 상세" back />
        <View style={[common.content, { alignItems: "center", paddingTop: 60 }]}>
          <ActivityIndicator />
        </View>
      </>
    );
  return (
    <>
      <Header title="기록 상세" back />
      <ScrollView contentContainerStyle={common.content}>
        <Text style={common.title}>{EVENT_TYPE_LABEL[event.eventType] || "기록"}</Text>
        <Text style={common.muted}>{event.eventDate.slice(0, 10)}</Text>
        {event.imageUrl && (
          <Image
            source={{ uri: event.imageUrl }}
            style={{
              width: "100%",
              height: 210,
              resizeMode: "cover",
              backgroundColor: colors.soft,
            }}
          />
        )}
        <Text>내용</Text>
        <TextInput
          editable={edit}
          style={common.textarea}
          multiline
          value={note}
          onChangeText={setNote}
        />
        {edit ? (
          <AppButton
            title="저장"
            onPress={async () => {
              try {
                const updated = await journeyApi.update(id, { note });
                setEvent(updated);
                setEdit(false);
              } catch {
                Alert.alert("저장 실패", "수정에 실패했습니다.");
              }
            }}
          />
        ) : (
          <AppButton outline title="수정" onPress={() => setEdit(true)} />
        )}
        <AppButton
          outline
          title="기록 삭제"
          onPress={() =>
            Alert.alert("기록 삭제", "삭제하시겠습니까?", [
              { text: "취소" },
              {
                text: "삭제",
                style: "destructive",
                onPress: async () => {
                  try {
                    await journeyApi.remove(id);
                    router.replace(
                      passportId
                        ? { pathname: "/journey/passport", params: { id: passportId } }
                        : "/journey",
                    );
                  } catch {
                    Alert.alert("삭제 실패", "기록 삭제에 실패했습니다.");
                  }
                },
              },
            ])
          }
        />
      </ScrollView>
    </>
  );
}
