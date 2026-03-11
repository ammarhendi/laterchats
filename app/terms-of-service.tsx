import React from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";

export default function TermsOfServiceScreen() {
  const router = useRouter();

  return (
    <ScreenContainer containerClassName="bg-white" safeAreaClassName="bg-white">
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backArrow}>‹</Text>
          <Text style={styles.backLabel}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Terms of Service</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Text style={styles.lastUpdated}>Last updated: March 2026</Text>

        <Text style={styles.section}>1. Acceptance of Terms</Text>
        <Text style={styles.body}>
          By downloading, installing, or using the Later! application ("App"), you agree to be bound by these Terms of Service ("Terms"). If you do not agree to these Terms, do not use the App.{"\n\n"}
          You must be at least 18 years of age to use Later!. By using the App, you represent and warrant that you are 18 or older.
        </Text>

        <Text style={styles.section}>2. Description of Service</Text>
        <Text style={styles.body}>
          Later! is a real-time voice and text chat application that allows users to:{"\n\n"}
          • Join public chat rooms and communicate with other users{"\n"}
          • Send private messages (PMs) with end-to-end encryption{"\n"}
          • Make private voice calls{"\n"}
          • Manage a friends/buddy list{"\n"}
          • Share media files in private conversations
        </Text>

        <Text style={styles.section}>3. User Accounts</Text>
        <Text style={styles.body}>
          You are responsible for maintaining the confidentiality of your account credentials. You agree to:{"\n\n"}
          • Provide accurate and truthful information during registration{"\n"}
          • Keep your password secure and not share it with others{"\n"}
          • Notify us immediately of any unauthorized use of your account{"\n"}
          • Not create accounts for others without their permission{"\n"}
          • Not create multiple accounts to evade bans or restrictions
        </Text>

        <Text style={styles.section}>4. Community Guidelines</Text>
        <Text style={styles.body}>
          You agree NOT to use Later! to:{"\n\n"}
          • Post, share, or distribute illegal content of any kind{"\n"}
          • Harass, bully, threaten, or intimidate other users{"\n"}
          • Share content that is defamatory, obscene, or harmful{"\n"}
          • Impersonate any person or entity{"\n"}
          • Spam, flood, or disrupt chat rooms{"\n"}
          • Attempt to hack, reverse-engineer, or compromise the App{"\n"}
          • Use the App for commercial solicitation without permission{"\n"}
          • Violate any applicable local, national, or international law{"\n\n"}
          Violations may result in immediate account suspension or permanent ban without notice.
        </Text>

        <Text style={styles.section}>5. Content Ownership</Text>
        <Text style={styles.body}>
          You retain ownership of content you create and share. By posting content in public chat rooms, you grant Later! a non-exclusive, royalty-free license to display that content within the App.{"\n\n"}
          Private messages are end-to-end encrypted and cannot be accessed by Later!. You are solely responsible for the content of your private communications.
        </Text>

        <Text style={styles.section}>6. Moderation</Text>
        <Text style={styles.body}>
          Later! employs moderators who may:{"\n\n"}
          • Remove content that violates these Terms{"\n"}
          • Temporarily mute or ban users who violate community guidelines{"\n"}
          • Clear chat room history when necessary{"\n\n"}
          Moderation decisions are at our discretion. You may appeal a ban by contacting support.
        </Text>

        <Text style={styles.section}>7. Voice Calls</Text>
        <Text style={styles.body}>
          Voice calls use peer-to-peer WebRTC technology. By using voice features, you consent to the transmission of your voice data to the other party in the call. Later! does not record voice calls.{"\n\n"}
          You must obtain consent from the other party before recording any conversation using third-party tools.
        </Text>

        <Text style={styles.section}>8. Disclaimer of Warranties</Text>
        <Text style={styles.body}>
          THE APP IS PROVIDED "AS IS" WITHOUT WARRANTIES OF ANY KIND. WE DO NOT WARRANT THAT THE APP WILL BE UNINTERRUPTED, ERROR-FREE, OR FREE OF VIRUSES OR OTHER HARMFUL COMPONENTS.
        </Text>

        <Text style={styles.section}>9. Limitation of Liability</Text>
        <Text style={styles.body}>
          TO THE MAXIMUM EXTENT PERMITTED BY LAW, LATER! SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES ARISING FROM YOUR USE OF THE APP.
        </Text>

        <Text style={styles.section}>10. Termination</Text>
        <Text style={styles.body}>
          We reserve the right to terminate or suspend your account at any time for violations of these Terms. You may delete your account at any time through the Profile screen.
        </Text>

        <Text style={styles.section}>11. Changes to Terms</Text>
        <Text style={styles.body}>
          We may update these Terms from time to time. Continued use of the App after changes constitutes acceptance of the updated Terms.
        </Text>

        <Text style={styles.section}>12. Contact</Text>
        <Text style={styles.body}>
          For questions about these Terms, contact us at:{"\n\n"}
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
  footer: { marginTop: 32, alignItems: "center" },
  footerText: { color: "#aaa", fontSize: 11 },
});
