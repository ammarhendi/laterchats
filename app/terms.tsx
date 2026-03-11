import { ScrollView, Text, View, TouchableOpacity, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";

export default function TermsOfServiceScreen() {
  const router = useRouter();

  return (
    <ScreenContainer edges={["top", "left", "right", "bottom"]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Terms of Service</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Text style={styles.lastUpdated}>Last updated: March 2026</Text>

        <Text style={styles.intro}>
          Welcome to Later! Chat. By using this application, you agree to these Terms of Service. Please read them carefully.
        </Text>

        <Text style={styles.sectionTitle}>1. Eligibility</Text>
        <Text style={styles.body}>
          You must be at least 18 years old to use Later! Chat. By registering, you confirm that you are 18 or older. If we discover that a user is under 18, we will immediately terminate their account.
        </Text>

        <Text style={styles.sectionTitle}>2. Account Responsibility</Text>
        <Text style={styles.body}>
          You are responsible for maintaining the confidentiality of your account credentials. You are responsible for all activities that occur under your account. Do not share your password with anyone.{"\n\n"}
          You agree to provide accurate information when registering and to keep your profile information current.
        </Text>

        <Text style={styles.sectionTitle}>3. Acceptable Use</Text>
        <Text style={styles.body}>
          You agree NOT to use Later! Chat to:{"\n"}
          • Harass, bully, threaten, or intimidate other users{"\n"}
          • Share illegal content, including but not limited to child sexual abuse material (CSAM){"\n"}
          • Spam, flood, or disrupt chat rooms{"\n"}
          • Impersonate other users or public figures{"\n"}
          • Share personal information of others without their consent{"\n"}
          • Engage in commercial solicitation or advertising without permission{"\n"}
          • Attempt to hack, exploit, or disrupt the service{"\n"}
          • Use the service for any illegal purpose{"\n\n"}
          Violation of these rules may result in immediate account suspension or termination.
        </Text>

        <Text style={styles.sectionTitle}>4. Content Standards</Text>
        <Text style={styles.body}>
          Later! Chat is an adult platform (18+). While adult conversation is permitted between consenting adults, the following content is strictly prohibited:{"\n"}
          • Any sexual content involving minors{"\n"}
          • Non-consensual sharing of intimate images{"\n"}
          • Content that promotes violence or self-harm{"\n"}
          • Hate speech targeting individuals or groups based on protected characteristics
        </Text>

        <Text style={styles.sectionTitle}>5. Moderation</Text>
        <Text style={styles.body}>
          Chat rooms may have designated moderators and administrators who have the authority to remove users from rooms, mute users, or take other moderation actions. Room administrators may set their own rules within the bounds of these Terms of Service.{"\n\n"}
          Later! Chat reserves the right to remove any content and suspend any account that violates these Terms of Service.
        </Text>

        <Text style={styles.sectionTitle}>6. Privacy</Text>
        <Text style={styles.body}>
          Your use of Later! Chat is also governed by our Privacy Policy, which is incorporated into these Terms of Service by reference.
        </Text>

        <Text style={styles.sectionTitle}>7. Intellectual Property</Text>
        <Text style={styles.body}>
          The Later! Chat application, including its design, features, and code, is owned by Later! Chat and protected by intellectual property laws. You may not copy, modify, or distribute the application without permission.{"\n\n"}
          Content you post in chat rooms remains yours. By posting, you grant Later! Chat a limited license to display that content within the service.
        </Text>

        <Text style={styles.sectionTitle}>8. Disclaimers</Text>
        <Text style={styles.body}>
          Later! Chat is provided "as is" without warranties of any kind. We do not guarantee uninterrupted service availability. We are not responsible for the content posted by users.
        </Text>

        <Text style={styles.sectionTitle}>9. Limitation of Liability</Text>
        <Text style={styles.body}>
          To the maximum extent permitted by law, Later! Chat shall not be liable for any indirect, incidental, special, or consequential damages arising from your use of the service.
        </Text>

        <Text style={styles.sectionTitle}>10. Changes to Terms</Text>
        <Text style={styles.body}>
          We may update these Terms of Service from time to time. Continued use of Later! Chat after changes constitutes acceptance of the updated terms.
        </Text>

        <Text style={styles.sectionTitle}>11. Contact</Text>
        <Text style={styles.body}>
          For questions about these Terms, contact us at:{"\n"}
          Email: legal@later.chat{"\n"}
          Website: https://later.chat
        </Text>

        <View style={{ height: 40 }} />
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
    backgroundColor: "#fff",
  },
  backBtn: {
    padding: 4,
    width: 60,
  },
  backBtnText: {
    color: "#7C3AED",
    fontSize: 15,
    fontWeight: "600",
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#111827",
  },
  scroll: {
    flex: 1,
    backgroundColor: "#fff",
  },
  content: {
    padding: 20,
  },
  lastUpdated: {
    fontSize: 13,
    color: "#9CA3AF",
    marginBottom: 16,
  },
  intro: {
    fontSize: 15,
    color: "#374151",
    lineHeight: 22,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
    marginTop: 20,
    marginBottom: 8,
  },
  body: {
    fontSize: 14,
    color: "#4B5563",
    lineHeight: 22,
  },
});
