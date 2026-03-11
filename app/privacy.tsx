import { ScrollView, Text, View, TouchableOpacity, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";

export default function PrivacyPolicyScreen() {
  const router = useRouter();

  return (
    <ScreenContainer edges={["top", "left", "right", "bottom"]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Privacy Policy</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Text style={styles.lastUpdated}>Last updated: March 2026</Text>

        <Text style={styles.intro}>
          Later! Chat ("Later", "we", "us", or "our") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, and protect your information when you use the Later! Chat application.
        </Text>

        <Text style={styles.sectionTitle}>1. Information We Collect</Text>
        <Text style={styles.body}>
          <Text style={styles.bold}>Account Information:</Text> When you register, we collect your username and password (stored securely as a hashed value). We do not collect your real name, email address, or phone number unless you choose to provide them in your profile.{"\n\n"}
          <Text style={styles.bold}>Chat Messages:</Text> Messages sent in public chat rooms are stored on our servers to provide chat history. Private messages (PMs) between users are fully encrypted and cannot be read by Later! Chat.{"\n\n"}
          <Text style={styles.bold}>Profile Information:</Text> Any profile picture, display name, or status message you choose to set is stored on our servers.{"\n\n"}
          <Text style={styles.bold}>Usage Data:</Text> We may collect anonymous usage statistics (such as which rooms are most active) to improve the app. This data is never linked to individual users.
        </Text>

        <Text style={styles.sectionTitle}>2. How We Use Your Information</Text>
        <Text style={styles.body}>
          We use your information solely to:{"\n"}
          • Provide and operate the Later! Chat service{"\n"}
          • Allow you to communicate with other users{"\n"}
          • Display your profile to other users in the same chat room{"\n"}
          • Improve the app based on anonymous usage patterns{"\n\n"}
          We do not sell, rent, or share your personal information with third parties for marketing purposes.
        </Text>

        <Text style={styles.sectionTitle}>3. Data Security</Text>
        <Text style={styles.body}>
          We take data security seriously:{"\n"}
          • Passwords are hashed using industry-standard algorithms and never stored in plain text{"\n"}
          • Private messages are fully encrypted using advanced cryptography{"\n"}
          • All data is transmitted over HTTPS/WSS (encrypted connections){"\n"}
          • Screenshot protection is enabled to prevent unauthorized capture of chat content
        </Text>

        <Text style={styles.sectionTitle}>4. Data Retention</Text>
        <Text style={styles.body}>
          Chat room messages are retained for 30 days. Private messages are stored until you delete them or close your account. Profile information is retained until you delete your account.
        </Text>

        <Text style={styles.sectionTitle}>5. Children's Privacy</Text>
        <Text style={styles.body}>
          Later! Chat is intended for users aged 18 and older. We do not knowingly collect personal information from anyone under 18 years of age. If we become aware that a user under 18 has registered, we will promptly delete their account.
        </Text>

        <Text style={styles.sectionTitle}>6. Your Rights</Text>
        <Text style={styles.body}>
          You have the right to:{"\n"}
          • Access the personal information we hold about you{"\n"}
          • Request deletion of your account and associated data{"\n"}
          • Update or correct your profile information at any time{"\n\n"}
          To exercise these rights, contact us at privacy@later.chat
        </Text>

        <Text style={styles.sectionTitle}>7. Changes to This Policy</Text>
        <Text style={styles.body}>
          We may update this Privacy Policy from time to time. We will notify you of any significant changes by displaying a notice in the app. Continued use of Later! Chat after changes constitutes acceptance of the updated policy.
        </Text>

        <Text style={styles.sectionTitle}>8. Contact Us</Text>
        <Text style={styles.body}>
          If you have questions about this Privacy Policy, please contact us at:{"\n"}
          Email: privacy@later.chat{"\n"}
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
  bold: {
    fontWeight: "700",
    color: "#111827",
  },
});
