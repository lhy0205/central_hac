import { router } from "expo-router";
import ARScanScreen from "../../src/ar/screens/ARScanScreen";
import { type IdentifyResponse } from "../../src/ar/api";
import { useAndroidBack } from "../../src/hooks/useAndroidBack";
export default function ArScan() {
  useAndroidBack("/ar/intro", true);
  function handleCapture(result: IdentifyResponse) {
    router.replace({ pathname: "/ar/result", params: { result: JSON.stringify(result) } });
  }
  return <ARScanScreen onClose={() => router.replace("/ar/intro")} onCapture={handleCapture} />;
}
