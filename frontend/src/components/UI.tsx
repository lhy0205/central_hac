import { router } from "expo-router";
import React from "react";
import { Image, Pressable, StyleSheet, View } from "react-native";
import { Text, TextInput } from "./BrandText";
import { SafeAreaView } from "react-native-safe-area-context";

import { colors, common } from "../theme";

const bag = require("../../assets/mcm-bag.png");

export function Header({
  title,
  back = false,
  hideProfile = false,
}: {
  title?: string;
  back?: boolean;
  hideProfile?: boolean;
}) {
  return (
    <SafeAreaView edges={["top"]} style={st.safeHeader}>
      <View style={st.header}>
        {back ? (
          <Pressable accessibilityLabel="뒤로가기" hitSlop={12} onPress={() => router.back()}>
            <Text style={st.back}>‹</Text>
          </Pressable>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="홈으로 이동"
            hitSlop={12}
            onPress={() => router.replace("/(tabs)/home")}
          >
            <Text style={st.logo}>
              Care<Text style={st.logoSub}>Passport</Text>
            </Text>
          </Pressable>
        )}
        <Text pointerEvents="none" style={st.headTitle}>
          {title}
        </Text>
        <View style={st.icons}>
          {!hideProfile && (
            <Pressable
              accessibilityLabel="프로필"
              hitSlop={10}
              onPress={() => router.push("/(tabs)/profile")}
              style={st.headerIconButton}
            >
              <View style={st.personHead} />
              <View style={st.personBody} />
            </Pressable>
          )}
          <Pressable
            accessibilityLabel="알림"
            hitSlop={10}
            onPress={() => router.push("/(tabs)/notifications")}
            style={st.headerIconButton}
          >
            <View style={st.bellBody} />
            <View style={st.bellClapper} />
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

export function AppButton({
  title,
  onPress,
  outline = false,
  disabled = false,
}: {
  title: string;
  onPress: () => void;
  outline?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={[common.button, outline && common.outline, disabled && { opacity: 0.4 }]}
    >
      <Text style={[common.buttonText, outline && common.outlineText]}>{title}</Text>
    </Pressable>
  );
}

export function Field({
  label,
  value,
  onChange,
  secure = false,
  placeholder,
  error,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  secure?: boolean;
  placeholder?: string;
  error?: string;
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={st.fieldLabel}>{label}</Text>
      <TextInput
        style={common.input}
        value={value}
        onChangeText={onChange}
        secureTextEntry={secure}
        autoCapitalize="none"
        placeholder={placeholder}
        placeholderTextColor="#A9A9A9"
      />
      {error ? <Text style={common.error}>{error}</Text> : null}
    </View>
  );
}

export function ProductCard({ action }: { action?: () => void }) {
  return (
    <View style={st.product}>
      <Image source={bag} style={st.bag} />
      <View style={{ flex: 1 }}>
        <Text>Pina 비세토스 스터드 장식 토트</Text>
        <Text style={common.muted}>등급 B · 412일</Text>
      </View>
      {action ? (
        <Pressable onPress={action} style={st.change}>
          <Text>변경</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const st = StyleSheet.create({
  safeHeader: { backgroundColor: "#fff" },
  header: {
    height: 58,
    borderBottomWidth: 1,
    borderColor: colors.line,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    backgroundColor: "#fff",
  },
  logo: { fontSize: 22, fontWeight: "800" },
  logoSub: { fontSize: 12, fontWeight: "400" },
  back: { fontSize: 30 },
  headTitle: {
    position: "absolute",
    left: 70,
    right: 70,
    textAlign: "center",
    fontSize: 17,
  },
  icons: { marginLeft: "auto", flexDirection: "row", gap: 15 },
  headerIconButton: { width: 19, height: 25, alignItems: "center", justifyContent: "center" },
  personHead: {
    position: "absolute",
    top: 3,
    width: 7,
    height: 7,
    borderRadius: 4,
    borderWidth: 1.3,
    borderColor: "#222",
  },
  personBody: {
    position: "absolute",
    bottom: 3,
    width: 13,
    height: 10,
    borderWidth: 1.3,
    borderBottomWidth: 0,
    borderColor: "#222",
    borderTopLeftRadius: 7,
    borderTopRightRadius: 7,
  },
  bellBody: {
    position: "absolute",
    top: 5,
    width: 12,
    height: 14,
    borderWidth: 1.3,
    borderColor: "#222",
    borderTopLeftRadius: 7,
    borderTopRightRadius: 7,
    borderBottomLeftRadius: 3,
    borderBottomRightRadius: 3,
  },
  bellClapper: {
    position: "absolute",
    bottom: 3,
    width: 4,
    height: 2,
    borderRadius: 2,
    backgroundColor: "#222",
  },
  product: {
    height: 76,
    backgroundColor: colors.soft,
    borderRadius: 8,
    padding: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  bag: { width: 72, height: 58, resizeMode: "contain" },
  change: {
    borderWidth: 1,
    borderColor: "#bbb",
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 4,
  },
  fieldLabel: { color: "#333333", fontSize: 13 },
});
