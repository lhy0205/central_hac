import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  ImageBackground,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

import {
  ApiError,
  journeyApi,
  productApi,
  type PassportDetail,
  type TimelineItem,
} from "../../src/api/client";
import { BottomTabBar } from "../../src/components/BottomTabBar";
import { Header } from "../../src/components/UI";
import { colors } from "../../src/theme";

const passportBackground = require("../../assets/journey-passport.png");
const bag = require("../../assets/mcm-bag.png");
const STAMPS_PER_PAGE = 7;
const MAX_STAMPS = 50;
// 배경 아트워크(journey-passport.png)의 점선 경로는 우상단 원에서 시작해 좌상단으로
// 이어진 뒤 아래로 내려간다 — 그 순서를 그대로 스탬프 채움 순서로 쓴다.
const STOPS = [
  { top: "20%", right: "17%" },
  { top: "20%", left: "18%" },
  { top: "39%", left: "4%" },
  { top: "46%", left: "38%" },
  { top: "46%", right: "5%" },
  { top: "70%", right: "20%" },
  { top: "70%", left: "22%" },
] as const;

function formatStampDate(iso: string) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export default function JourneyPassport() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { width } = useWindowDimensions();
  const listRef = useRef<FlatList<number>>(null);
  const [passport, setPassport] = useState<PassportDetail | null>(null);
  const [items, setItems] = useState<TimelineItem[] | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useFocusEffect(
    useCallback(() => {
      if (!id) return;
      let active = true;
      // 여권을 바꿔 들어오면 이전 가방 데이터가 남아 그대로 렌더되므로 먼저 비운다.
      setPassport(null);
      setItems(null);
      setLoadError(null);
      Promise.all([productApi.detail(id), journeyApi.list(id)])
        .then(([passportValue, timelineValue]) => {
          if (!active) return;
          setPassport(passportValue);
          setItems(timelineValue);
          setPageIndex(0);
        })
        .catch((error) => {
          // items만 채우면 렌더 가드(!passport)를 영영 못 넘어 무한 스피너가 된다.
          if (!active) return;
          setLoadError(error instanceof ApiError ? error.message : "여권을 불러오지 못했습니다.");
        });
      return () => {
        active = false;
      };
    }, [id, reloadKey]),
  );

  if (loadError != null) {
    return (
      <View style={styles.screen}>
        <Header />
        <View style={styles.loading}>
          <Text style={styles.loadingText}>{loadError}</Text>
          <Pressable onPress={() => setReloadKey((k) => k + 1)}>
            <Text
              style={[
                styles.loadingText,
                { color: colors.brown, textDecorationLine: "underline", marginTop: 12 },
              ]}
            >
              다시 시도
            </Text>
          </Pressable>
        </View>
        <BottomTabBar active="journey" />
      </View>
    );
  }

  if (!passport || items === null) {
    return (
      <View style={styles.screen}>
        <Header />
        <View style={styles.loading}>
          <ActivityIndicator color={colors.brown} />
          <Text style={styles.loadingText}>여권을 불러오고 있습니다</Text>
        </View>
        <BottomTabBar active="journey" />
      </View>
    );
  }

  // 백엔드 타임라인은 오래된 순(TimelineService가 occurredAt 오름차순 정렬)으로 온다.
  // 그대로 앞에서 50개를 자르면 최신 기록이 잘려나가므로, 넘칠 때는 뒤(최신)에서 자른다.
  const visibleItems = items.length > MAX_STAMPS ? items.slice(items.length - MAX_STAMPS) : items;
  const stampCount = Math.max(1, visibleItems.length);
  const pageCount = Math.max(1, Math.ceil(stampCount / STAMPS_PER_PAGE));
  const pages = Array.from({ length: pageCount }, (_, index) => index);

  function openStamp(globalIndex: number) {
    const item = visibleItems[globalIndex];
    // RESERVATION/TRANSFER도 백엔드가 실제로 내보내는 타입이다. 분기에서 빠져 있으면
    // 스탬프가 눌리는 것처럼 보이면서 아무 일도 일어나지 않으므로 타임라인으로 보낸다.
    if (
      !item ||
      item.type === "REGISTRATION" ||
      item.type === "NOTIFICATION" ||
      item.type === "RESERVATION" ||
      item.type === "TRANSFER"
    ) {
      router.push({ pathname: "/journey", params: { id } });
      return;
    }
    if (item.type === "USER_EVENT") {
      router.push({ pathname: "/journey/detail", params: { id: String(item.id), passportId: id } });
      return;
    }
    if (item.type === "DIAGNOSIS") {
      router.push({
        pathname: "/diagnosis/result",
        params: { id: String(item.id), passportId: id },
      });
      return;
    }
    if (item.type === "CARE") {
      router.push({ pathname: "/care/detail", params: { id: String(item.id), passportId: id } });
    }
  }

  function changePage(nextPage: number) {
    if (nextPage < 0 || nextPage >= pageCount) return;
    listRef.current?.scrollToIndex({ index: nextPage, animated: true });
    setPageIndex(nextPage);
  }

  function updatePage(event: NativeSyntheticEvent<NativeScrollEvent>) {
    setPageIndex(Math.round(event.nativeEvent.contentOffset.x / width));
  }

  return (
    <View style={styles.screen}>
      <Header />
      <FlatList
        ref={listRef}
        data={pages}
        keyExtractor={(page) => String(page)}
        horizontal
        pagingEnabled
        bounces={false}
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={updatePage}
        getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
        renderItem={({ item: page }) => {
          const start = page * STAMPS_PER_PAGE;
          const pageFilled = Math.min(STAMPS_PER_PAGE, Math.max(0, stampCount - start));
          return (
            <ImageBackground
              source={passportBackground}
              resizeMode="stretch"
              style={[styles.passport, { width }]}
            >
              <View style={styles.productBadge}>
                <Text numberOfLines={1} style={styles.productName}>
                  {passport.nickname || passport.modelName}
                </Text>
                <Text style={styles.productMeta}>
                  {stampCount} / {MAX_STAMPS}개의 여정 스탬프
                </Text>
              </View>

              {STOPS.map((position, localIndex) => {
                const filled = localIndex < pageFilled;
                const globalIndex = start + localIndex;
                const item = filled ? visibleItems[globalIndex] : null;
                return (
                  <View key={localIndex} style={[styles.stopWrap, position]}>
                    <Pressable
                      accessibilityLabel={
                        filled ? `${globalIndex + 1}번째 여권 기록 열기` : "빈 여권 스탬프"
                      }
                      disabled={!filled}
                      onPress={() => openStamp(globalIndex)}
                      style={[styles.stop, filled && styles.filledStop]}
                    >
                      {filled ? <Image source={bag} style={styles.stopBag} /> : null}
                    </Pressable>
                    {item ? (
                      <Text style={styles.stopDate}>{formatStampDate(item.occurredAt)}</Text>
                    ) : null}
                  </View>
                );
              })}

              <View style={styles.pageControls}>
                <Pressable
                  accessibilityLabel="이전 여권 페이지"
                  disabled={page === 0}
                  onPress={() => changePage(page - 1)}
                  style={[styles.arrowButton, page === 0 && styles.hidden]}
                >
                  <Text style={styles.arrow}>‹</Text>
                </Pressable>
                <View style={styles.pageStatus}>
                  <Text style={styles.pageNumber}>
                    {page + 1} / {pageCount}
                  </Text>
                  <View style={styles.dots}>
                    {pages.map((dotPage) => (
                      <View
                        key={dotPage}
                        style={[styles.dot, dotPage === pageIndex && styles.activeDot]}
                      />
                    ))}
                  </View>
                </View>
                <Pressable
                  accessibilityLabel="다음 여권 페이지"
                  disabled={page === pageCount - 1}
                  onPress={() => changePage(page + 1)}
                  style={[styles.arrowButton, page === pageCount - 1 && styles.hidden]}
                >
                  <Text style={styles.arrow}>›</Text>
                </Pressable>
              </View>

              <Pressable
                style={styles.timelineButton}
                onPress={() => router.push({ pathname: "/journey", params: { id } })}
              >
                <Text style={styles.timelineButtonText}>전체 타임라인 보기</Text>
              </Pressable>
            </ImageBackground>
          );
        }}
      />
      <BottomTabBar active="journey" />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F4E9D5" },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#FFF" },
  loadingText: { fontSize: 11, color: "#999", marginTop: 10 },
  passport: { flex: 1, position: "relative" },
  productBadge: {
    position: "absolute",
    top: 10,
    left: 18,
    right: 18,
    alignItems: "center",
    zIndex: 3,
  },
  productName: { fontSize: 11, color: "#725B3C", fontWeight: "600", maxWidth: 190 },
  productMeta: { fontSize: 8, color: "#A18B6B", marginTop: 2 },
  stopWrap: {
    position: "absolute",
    width: "25%",
    aspectRatio: 1,
    alignItems: "center",
  },
  stop: {
    width: "100%",
    height: "100%",
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  filledStop: { backgroundColor: "rgba(255,255,255,.88)" },
  stopBag: { width: "112%", height: "86%", resizeMode: "contain" },
  stopDate: { fontSize: 8, color: "#8C704B", marginTop: 3 },
  pageControls: {
    position: "absolute",
    left: 25,
    right: 25,
    bottom: 62,
    height: 38,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  arrowButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: "#A88961",
    backgroundColor: "rgba(255,250,241,.9)",
    alignItems: "center",
    justifyContent: "center",
  },
  arrow: { color: "#755A37", fontSize: 24, lineHeight: 26 },
  hidden: { opacity: 0 },
  pageStatus: { alignItems: "center" },
  pageNumber: { fontSize: 9, color: "#755A37", marginBottom: 5 },
  dots: { flexDirection: "row", gap: 5 },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: "#D2C0A5" },
  activeDot: { width: 13, backgroundColor: "#80623D" },
  timelineButton: {
    position: "absolute",
    left: "28%",
    right: "28%",
    bottom: 18,
    height: 35,
    borderWidth: 1,
    borderColor: "#A88961",
    borderRadius: 18,
    backgroundColor: "rgba(255,250,241,.9)",
    alignItems: "center",
    justifyContent: "center",
  },
  timelineButtonText: { fontSize: 9, color: "#755A37" },
});
