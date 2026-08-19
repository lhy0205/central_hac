import { router } from "expo-router";
import { useCameraPermission } from "react-native-vision-camera";
import ARIntroScreen from "../../src/ar/screens/ARIntroScreen";
import { useAndroidBack } from "../../src/hooks/useAndroidBack";
export default function ArIntro() {
  useAndroidBack("/(tabs)/home", true);
  const { requestPermission } = useCameraPermission();
  function goHome() {
    if (router.canDismiss()) router.dismissAll();
    router.replace("/(tabs)/home");
  }
  async function handleAllow() {
    const granted = await requestPermission();
    if (granted) router.replace("/ar/scan");
  }
  return <ARIntroScreen onBack={goHome} onAllow={handleAllow} />;
}
