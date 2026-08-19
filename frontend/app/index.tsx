import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { useAuth } from "../src/context/AuthContext";
export default function Index() {
  const { ready, token } = useAuth();
  if (!ready)
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
      </View>
    );
  return <Redirect href={token ? "/(tabs)/home" : "/(auth)/login"} />;
}
