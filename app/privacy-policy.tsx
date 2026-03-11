import React from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";

export default function PrivacyPolicyScreen() {
  const router = useRouter();

  return (
    <ScreenContainer containerClassName="bg-white" safeAreaClassName="bg-white">
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backArrow}>‹</Text>
          <Text style={styles.backLabel}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Privacy Policy</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Text style={styles.lastUpdated}>Last updated: March 2026</Text>

        <Text style={styles.section}>1. Introduction</Text>
        <Text style={styles.body}>
          Later! ("we," "our," or "us") operates the Later! mobile application (the "App"). This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our App. Please read this policy carefully.
        </Text>

        <Text style={styles.section}>2. Information We Collect</Text>
        <Text style={styles.body}>
          We collect the following types of information:{"\n\n"}
          <Text style={styles.bold}>Account Information:</Text> When you register, we collect your username, email address, date of birth, and password (stored as a secure hash).{"\n\n"}
          <Text style={styles.bold}>Profile Information:</Text> Display name, status message, and optional profile photo or video you choose to upload.{"\n\n"}
          <Text style={styles.bold}>Usage Data:</Text> Chat room participation, message timestamps, and connection metadata. Private messages (PMs) are end-to-end encrypted and cannot be read by us.{"\n\n"}
          <Text style={styles.bold}>Device Information:</Text> Device type, operating system version, and app version for technical support purposes.
        </Text>

        <Text style={styles.section}>3. End-to-End Encryption</Text>
        <Text style={styles.body}>
          All private messages (PMs) between users are protected with end-to-end encryption (E2EE). This means only you and the person you are communicating with can read your private messages. Later! does not have access to the content of your private conversations.{"\n\n"}
          Secret Mode messages are additionally configured to auto-delete after a timer you set (5–60 seconds).
        </Text>

        <Text style={styles.section}>4. How We Use Your Information</Text>
        <Text style={styles.body}>
          We use the information we collect to:{"\n\n"}
          • Provide, operate, and maintain the App{"\n"}
          • Create and manage your account{"\n"}
          • Enable real-time communication features{"\n"}
          • Enforce our Terms of Service and Community Guidelines{"\n"}
          • Respond to support requests{"\n"}
          • Improve the App's performance and features
        </Text>

        <Text style={styles.section}>5. Information Sharing</Text>
        <Text style={styles.body}>
          We do not sell, trade, or rent your personal information to third parties. We may share information only in the following circumstances:{"\n\n"}
          • With your consent{"\n"}
          • To comply with legal obligations or valid legal process{"\n"}
          • To protect the rights, safety, or property of Later!, our users, or the public{"\n"}
          • In connection with a merger, acquisition, or sale of assets (with prior notice)
        </Text>

        <Text style={styles.section}>6. Data Retention</Text>
        <Text style={styles.body}>
          We retain your account information for as long as your account is active. You may request deletion of your account and associated data by contacting us. Public chat room messages may be retained for moderation purposes. Private messages are encrypted and stored only for offline delivery; once delivered, they are marked as read.
        </Text>

        <Text style={styles.section}>7. Age Restriction</Text>
        <Text style={styles.body}>
          Later! is strictly for users who are 18 years of age or older. We do not knowingly collect personal information from individuals under 18. If we become aware that a user is under 18, we will immediately terminate their account and delete their data.
        </Text>

        <Text style={styles.section}>8. Security</Text>
        <Text style={styles.body}>
          We implement industry-standard security measures including:{"\n\n"}
          • End-to-end encryption for all private messages{"\n"}
          • Secure password hashing (bcrypt){"\n"}
          • HTTPS/TLS for all data in transit{"\n"}
          • Screenshot prevention on native devices{"\n"}
          • Rate limiting to prevent abuse
        </Text>

        <Text style={styles.section}>9. Your Rights</Text>
        <Text style={styles.body}>
          Depending on your location, you may have the right to:{"\n\n"}
          • Access the personal information we hold about you{"\n"}
          • Correct inaccurate information{"\n"}
          • Request deletion of your data{"\n"}
          • Object to or restrict certain processing{"\n"}
          • Data portability{"\n\n"}
          To exercise these rights, please contact us at the address below.
        </Text>

        <Text style={styles.section}>10. Changes to This Policy</Text>
        <Text style={styles.body}>
          We may update this Privacy Policy from time to time. We will notify you of significant changes by posting the new policy in the App. Your continued use of the App after changes constitutes acceptance of the updated policy.
        </Text>

        <Text style={styles.section}>11. Contact Us</Text>
        <Text style={styles.body}>
          If you have questions about this Privacy Policy, please contact us at:{"\n\n"}
          Later! Support{"\n"}
          Email: support@later.chat{"\n"}
          Website: later.chat
        </Text>

        <View style={styles.footer}>
          <Text style={styles.footerText}>© {new Date().getFullYear()} Later. All rights reserved.</Text>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#7B1FA2",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backBtn: { flexDirection: "row", alignItems: "center", width: 60 },
  backArrow: { color: "#fff", fontSize: 28, lineHeight: 32 },
  backLabel: { color: "#fff", fontSize: 16 },
  headerTitle: { color: "#fff", fontSize: 17, fontWeight: "700" },
  scroll: { flex: 1 },
  content: { padding: 20, paddingBottom: 40 },
  lastUpdated: { color: "#888", fontSize: 12, marginBottom: 20 },
  section: { color: "#4A0072", fontSize: 15, fontWeight: "700", marginTop: 20, marginBottom: 6 },
  body: { color: "#333", fontSize: 14, lineHeight: 22 },
  bold: { fontWeight: "700" },
  footer: { marginTop: 32, alignItems: "center" },
  footerText: { color: "#aaa", fontSize: 11 },
});
