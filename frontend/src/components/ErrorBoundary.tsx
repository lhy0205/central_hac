import { Component, type ErrorInfo, type ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Text } from "./BrandText";

type Props = { children: ReactNode };
type State = { error: Error | null; stack: string | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, stack: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
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
