import { ScrollView } from "react-native";
import { Text } from "../../src/components/BrandText";
import { Header } from "../../src/components/UI";
import { common } from "../../src/theme";
export default function Legal() {
  return (
    <>
      <Header title="약관 및 개인정보" back />
      <ScrollView contentContainerStyle={common.content}>
        <Text style={common.section}>서비스 이용약관</Text>
        <Text style={common.muted}>
          실제 서비스 약관이 확정되면 이 영역을 교체합니다. 앱 이용 조건, 회원 권리와 의무, 서비스
          제공 범위를 표시합니다.
        </Text>
        <Text style={common.section}>개인정보 처리방침</Text>
        <Text style={common.muted}>
          수집 항목, 이용 목적, 보관 기간, 제3자 제공 및 삭제 요청 방법을 표시합니다.
        </Text>
      </ScrollView>
    </>
  );
}
