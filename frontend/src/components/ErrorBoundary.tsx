import { Component, type ErrorInfo, type ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

/* 렌더 중에 예외가 나면 React가 트리를 통째로 버린다. 릴리스 빌드에는 개발용 빨간 화면이
   없어서 사용자 눈에는 "앱이 그냥 꺼졌다"로 보이고, 로그를 못 뽑으면 원인도 남지 않는다.
   여기서 잡아 화면에 그대로 띄운다 — 데모 중에 앱이 죽는 것보다 낫고, 사진 한 장이면
   무엇이 터졌는지 알 수 있다. */
type Props = { children: ReactNode };
type State = { error: Error | null; stack: string | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, stack: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // adb를 붙일 수 있는 상황이면 logcat에서도 보이도록 남긴다.
    console.error("[ErrorBoundary]", error, info.componentStack);
    this.setState({ stack: info.componentStack ?? null });
  }

  render() {
    const { error, stack } = this.state;
    if (!error) return this.props.children;
    return (
      <View style={styles.screen}>
        <Text style={styles.title}>문제가 발생했습니다</Text>
        <Text style={styles.message}>{error.message || String(error)}</Text>
        <ScrollView style={styles.stackBox}>
          <Text style={styles.stack}>{stack ?? error.stack ?? "스택 정보 없음"}</Text>
        </ScrollView>
        <Pressable
          onPress={() => this.setState({ error: null, stack: null })}
          style={({ pressed }) => [styles.retry, pressed && styles.retryPressed]}
        >
          <Text style={styles.retryText}>다시 시도</Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#fff", padding: 24, justifyContent: "center" },
  title: { fontSize: 18, fontWeight: "700", color: "#1A1A1A", marginBottom: 10 },
  message: { fontSize: 13, color: "#B23A3A", marginBottom: 16, lineHeight: 20 },
  stackBox: { maxHeight: 260, backgroundColor: "#F5F4F1", borderRadius: 8, padding: 12 },
  stack: { fontSize: 10.5, color: "#555", lineHeight: 16 },
  retry: {
    height: 50,
    borderRadius: 8,
    backgroundColor: "#1A1A1A",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 20,
  },
  retryPressed: { opacity: 0.85 },
  retryText: { color: "#fff", fontSize: 14, fontWeight: "600" },
});
