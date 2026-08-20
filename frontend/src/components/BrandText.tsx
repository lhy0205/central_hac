import {
  StyleSheet,
  Text as RNText,
  TextInput as RNTextInput,
  type TextInputProps,
  type TextProps,
  type TextStyle,
} from "react-native";

function familyFor(weight: TextStyle["fontWeight"]) {
  const value = weight == null ? "400" : String(weight);
  if (value === "100" || value === "200" || value === "300") return "GmarketSansLight";
  if (value === "600" || value === "700" || value === "800" || value === "900" || value === "bold")
    return "GmarketSansBold";
  return "GmarketSansMedium";
}

function withFont(style: TextProps["style"]) {
  const flat = (StyleSheet.flatten(style) ?? {}) as TextStyle;
  if (flat.fontFamily) return style;
  return [style, { fontFamily: familyFor(flat.fontWeight), fontWeight: undefined }];
}

export function Text(props: TextProps) {
  return <RNText {...props} style={withFont(props.style)} />;
}

export function TextInput(props: TextInputProps) {
  return <RNTextInput {...props} style={withFont(props.style)} />;
}
