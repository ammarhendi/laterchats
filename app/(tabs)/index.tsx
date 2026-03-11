import { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Modal,
  Alert,
  ActivityIndicator,
  Share,
  FlatList,
} from "react-native";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ScreenContainer } from "@/components/screen-container";
import { useChat } from "@/lib/chat-context";
import { trpc } from "@/lib/trpc";
import * as ScreenCapture from "expo-screen-capture";
import { LinearGradient as ExpoLinearGradient } from "expo-linear-gradient";

const SAVED_NICKNAME_KEY = "@later_saved_nickname";
const SAVED_REGISTERED_USER_KEY = "@later_registered_user";
const SUPER_ADMIN_NICKNAMES = ["Ammar", "Later"];
const SUPER_ADMIN_NICKNAME = SUPER_ADMIN_NICKNAMES[0];

// Yahoo Messenger color palette
const YM = {
  purple: "#7B1FA2",
  purpleDark: "#4A0072",
  purpleLight: "#CE93D8",
  purpleMid: "#9C27B0",
  white: "#FFFFFF",
  offWhite: "#F5F5F5",
  lightGray: "#EEEEEE",
  midGray: "#BDBDBD",
  darkGray: "#757575",
  text: "#212121",
  textLight: "#616161",
  border: "#E0E0E0",
  inputBg: "#FAFAFA",
  error: "#D32F2F",
  online: "#43A047",
};

type Tab = "login" | "register";
type Screen = "auth" | "rooms";

const FALLBACK_ROOMS: { id: number; name: string; description: string | null }[] = [
  { id: 1, name: "Now", description: "Pull up a chair and have a chat, mate!" },
  { id: 2, name: "Arab World", description: "Arabic culture, news, and conversation." },
  { id: 3, name: "Issues", description: "Discuss world issues and current events." },
  { id: 4, name: "Social Media", description: "Talk about trends, platforms, and viral content." },
  { id: 5, name: "Chilling Out", description: "Relax, unwind, and have a good time." },
  { id: 6, name: "Dancing", description: "Music, moves, and dance culture." },
  { id: 7, name: "Blah Blah", description: "Just talk about anything and everything." },
  { id: 8, name: "Nothing Hidden", description: "Open, honest, and real conversations." },
  { id: 9, name: "For All", description: "A room for everyone — all topics welcome." },
  { id: 10, name: "Random", description: "Totally random conversations." },
];

function RoomCard({ room, onPress }: { room: { id: number; name: string; description: string | null }; onPress: () => void }) {
  const { data: countData } = trpc.chat.getRoomUserCount.useQuery(
    { roomId: room.id },
    { refetchInterval: 10000, retry: 1 }
  );
  const count = countData?.count ?? 0;
  return (
    <TouchableOpacity style={styles.roomCard} onPress={onPress} activeOpacity={0.7}>
      {/* Yahoo Chat folder icon */}
      <Text style={styles.roomFolderIcon}>📁</Text>
      <View style={styles.roomCardContent}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <Text style={styles.roomCardName}>{room.name}</Text>
          {/* User count in brackets — classic Yahoo Chat style */}
          <Text style={styles.roomCardCount}>({count})</Text>
          {count > 0 && <View style={styles.onlineDot} />}
        </View>
        <Text style={styles.roomCardDesc} numberOfLines={1}>{room.description}</Text>
      </View>
      <Text style={styles.roomCardArrow}>›</Text>
    </TouchableOpacity>
  );
}

export default function WelcomeScreen() {
  const router = useRouter();
  const {
    joinRoom,
    nickname: currentNickname,
    roomId,
  } = useChat();

  const [screen, setScreen] = useState<Screen>("auth");
  const [activeTab, setActiveTab] = useState<Tab>("login");
  const [pendingNickname, setPendingNickname] = useState("");
  const [nicknameInput, setNicknameInput] = useState("");

  // Login state
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  // Register state
  const [regUsername, setRegUsername] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regConfirmPassword, setRegConfirmPassword] = useState("");
  const [regDob, setRegDob] = useState("");

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
   const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotStep, setForgotStep] = useState<"email" | "token">("email");
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotToken, setForgotToken] = useState("");
  const [forgotNewPassword, setForgotNewPassword] = useState("");
  const [forgotMsg, setForgotMsg] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [pendingRoomId, setPendingRoomId] = useState<number | null>(null);
  const registerMutation = trpc.user.register.useMutation();
  const loginMutation = trpc.user.login.useMutation();
  const requestPasswordResetMutation = trpc.user.requestPasswordReset.useMutation();
  const resetPasswordMutation = trpc.user.resetPassword.useMutation();
  const { data: roomsData, isLoading: roomsLoading } = trpc.chat.getAllRooms.useQuery(undefined, { retry: 2 });
  const rooms = roomsData && roomsData.length > 0 ? roomsData : FALLBACK_ROOMS;

  useEffect(() => {
    let sub: { remove: () => void } | null = null;
    if (Platform.OS !== "web") {
      ScreenCapture.preventScreenCaptureAsync().catch(() => {});
      sub = ScreenCapture.addScreenshotListener(() => {
        Alert.alert("Screenshot Blocked", "Screenshots are not allowed in Later to protect user privacy.");
      });
    }
    return () => {
      if (sub) sub.remove();
      if (Platform.OS !== "web") ScreenCapture.allowScreenCaptureAsync().catch(() => {});
    };
  }, []);

  useEffect(() => {
    AsyncStorage.getItem(SAVED_NICKNAME_KEY).then((saved) => { if (saved) setNicknameInput(saved); }).catch(() => {});
    AsyncStorage.getItem(SAVED_REGISTERED_USER_KEY).then((saved) => {
      if (saved) { setLoginUsername(saved); setActiveTab("login"); }
    }).catch(() => {});
  }, []);

  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => { setIsMounted(true); }, []);
  useEffect(() => {
    if (!isMounted) return;
    if (currentNickname && roomId) router.replace("/chat" as any);
  }, [currentNickname, roomId, isMounted]);

  const handleGuestJoin = () => {
    const nick = nicknameInput.trim();
    if (!nick) { setError("Please enter a nickname"); return; }
    if (nick.length < 2) { setError("Nickname must be at least 2 characters"); return; }
    if (SUPER_ADMIN_NICKNAMES.some(n => n.toLowerCase() === nick.toLowerCase())) { setError("This nickname is reserved."); return; }
    setError("");
    AsyncStorage.setItem(SAVED_NICKNAME_KEY, nick).catch(() => {});
    setPendingNickname(nick);
    setScreen("rooms");
  };

  const handleLogin = async () => {
    const username = loginUsername.trim();
    if (!username || !loginPassword) { setError("Please fill in all fields"); return; }
    setError("");
    setLoading(true);
    try {
      const result = await loginMutation.mutateAsync({ username, password: loginPassword });
      if (result.success) {
        AsyncStorage.setItem(SAVED_REGISTERED_USER_KEY, username).catch(() => {});
        setPendingNickname(username);
        setScreen("rooms");
      } else {
        setError(result.error || "Login failed");
      }
    } catch (e: any) {
      setError(e?.message || "Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    const username = regUsername.trim();
    if (!username || !regEmail.trim() || !regPassword || !regConfirmPassword || !regDob) { setError("Please fill in all fields"); return; }
    if (regPassword !== regConfirmPassword) { setError("Passwords do not match"); return; }
    if (regPassword.length < 6) { setError("Password must be at least 6 characters"); return; }
    setError("");
    setLoading(true);
    try {
      const result = await registerMutation.mutateAsync({ username, email: regEmail.trim(), password: regPassword, dateOfBirth: regDob });
      if (result.success) {
        AsyncStorage.setItem(SAVED_REGISTERED_USER_KEY, username).catch(() => {});
        setPendingNickname(username);
        setScreen("rooms");
      } else {
        setError(result.error || "Registration failed");
      }
    } catch (e: any) {
      setError(e?.message || "Registration failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleRoomSelect = (selectedRoomId: number) => {
    setPendingRoomId(selectedRoomId);
    joinRoom(pendingNickname, selectedRoomId);
    // Navigation happens in useEffect when roomId is set (after room_joined event)
    // or after super admin auth completes
  };

  const handleForgotPassword = async () => {
    const email = forgotEmail.trim();
    if (!email) { setForgotMsg("Please enter your email address"); return; }
    setForgotLoading(true);
    setForgotMsg("");
    try {
      const result = await requestPasswordResetMutation.mutateAsync({ email });
      if (result.success) {
        setForgotMsg("✓ Reset email sent! Check your inbox and enter the token below.");
        setForgotStep("token");
      } else {
        setForgotMsg((result as any).error || "No account found with that email.");
      }
    } catch (e: any) {
      setForgotMsg(e?.message || "Failed to send reset email. Please try again.");
    } finally {
      setForgotLoading(false);
    }
  };
  const handleResetPassword = async () => {
    const token = forgotToken.trim();
    const newPass = forgotNewPassword.trim();
    if (!token || !newPass) { setForgotMsg("Please fill in both fields"); return; }
    if (newPass.length < 6) { setForgotMsg("Password must be at least 6 characters"); return; }
    setForgotLoading(true);
    setForgotMsg("");
    try {
      const result = await resetPasswordMutation.mutateAsync({ token, newPassword: newPass });
      if (result.success) {
        setForgotMsg("✓ Password reset! You can now sign in.");
        setTimeout(() => {
          setShowForgotPassword(false);
          setForgotStep("email");
          setForgotEmail("");
          setForgotToken("");
          setForgotNewPassword("");
          setForgotMsg("");
        }, 2000);
      } else {
        setForgotMsg((result as any).error || "Invalid or expired token.");
      }
    } catch (e: any) {
      setForgotMsg(e?.message || "Reset failed. Please try again.");
    } finally {
      setForgotLoading(false);
    }
  };
  const handleShare = async () => {
    try { await Share.share({ title: "Join Later Chat", message: "Join Later Chat — later.chat" }); } catch {}
  };

  // ── Room Selection Screen ─────────────────────────────────────────────────
  if (screen === "rooms") {
    return (
      <ScreenContainer containerClassName="bg-white" safeAreaClassName="bg-white">
        {/* Yahoo Chat-style header */}
        <ExpoLinearGradient
          colors={[YM.purpleDark, YM.purple, YM.purpleMid]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={styles.roomsTopBar}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
            {!SUPER_ADMIN_NICKNAMES.some(n => n.toLowerCase() === pendingNickname.toLowerCase()) && (
              <TouchableOpacity onPress={() => setScreen("auth")} style={styles.roomsBackBtn}>
                <Text style={styles.roomsBackBtnText}>‹</Text>
              </TouchableOpacity>
            )}
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", alignItems: "baseline", gap: 2 }}>
                <Text style={styles.roomsTopBarTitle}>Later</Text>
                <Text style={[styles.roomsTopBarTitle, { color: "#FFD700" }]}>!</Text>
                <Text style={[styles.roomsTopBarTitle, { color: "rgba(255,255,255,0.75)", fontSize: 14, fontWeight: "400" }]}> Chat</Text>
              </View>
              <Text style={styles.roomsTopBarSub}>Welcome, {pendingNickname} · Double-tap a room to join</Text>
            </View>
          </View>
          <Image
            source={{ uri: "https://d2xsxph8kpxj0f.cloudfront.net/310519663401644709/NzGynwH9ginkrkq4LKn7H4/later-icon-izw5PkN5zqqgPDDoynwAP6.png" }}
            style={styles.roomsTopBarLogo}
            resizeMode="contain"
          />
        </ExpoLinearGradient>

        {/* Yahoo Chat-style info bar */}
        <View style={styles.roomInfoBar}>
          <Text style={styles.roomInfoBarText}>💬 Later! Public Rooms · The number next to each room shows how many chatters are inside. Tap to join.</Text>
        </View>

        <FlatList
          data={rooms}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.roomsList}
          style={{ backgroundColor: YM.white }}
          renderItem={({ item }) => (
            <RoomCard room={item} onPress={() => handleRoomSelect(item.id)} />
          )}
          ListHeaderComponent={
            roomsLoading ? <ActivityIndicator color={YM.purple} style={{ marginVertical: 16 }} /> : null
          }
          ItemSeparatorComponent={() => <View style={styles.roomSeparator} />}
        />

      </ScreenContainer>
    );
  }

  // ── Auth Screen — Yahoo Messenger Style ──────────────────────────────────
  return (
    <ScreenContainer containerClassName="bg-white" safeAreaClassName="bg-white">
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.authScroll} keyboardShouldPersistTaps="handled">

          {/* Purple gradient header with logo — exactly like YM */}
          <ExpoLinearGradient
            colors={[YM.purpleDark, YM.purple, YM.purpleMid]}
            start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
            style={styles.ymHeader}
          >
            <Image
              source={{ uri: "https://d2xsxph8kpxj0f.cloudfront.net/310519663401644709/NzGynwH9ginkrkq4LKn7H4/later-icon-izw5PkN5zqqgPDDoynwAP6.png" }}
              style={styles.ymHeaderLogo}
              resizeMode="contain"
            />
            <Text style={styles.ymHeaderTitle}>Later!</Text>
            <Text style={styles.ymHeaderSub}>Voice &amp; Text Chat Rooms</Text>
          </ExpoLinearGradient>

          {/* White form area */}
          <View style={styles.ymFormArea}>

            {/* Tab switcher — Login / Register */}
            <View style={styles.ymTabs}>
              {(["login", "register"] as Tab[]).map((tab) => (
                <TouchableOpacity
                  key={tab}
                  style={[styles.ymTab, activeTab === tab && styles.ymTabActive]}
                  onPress={() => { setActiveTab(tab); setError(""); }}
                >
                  <Text style={[styles.ymTabText, activeTab === tab && styles.ymTabTextActive]}>
                    {tab === "login" ? "Sign In" : "Sign Up"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* LOGIN */}
            {activeTab === "login" && (
              <View style={styles.ymForm}>
                {/* YM-style grouped input */}
                <View style={styles.ymInputGroup}>
                  <View style={styles.ymInputRow}>
                    <Text style={styles.ymInputLabel}>Later! ID</Text>
                    <TextInput
                      style={styles.ymInputField}
                      value={loginUsername}
                      onChangeText={setLoginUsername}
                      placeholder="Username"
                      placeholderTextColor={YM.midGray}
                      autoCapitalize="none"
                      autoCorrect={false}
                      returnKeyType="next"
                      maxLength={32}
                    />
                  </View>
                  <View style={styles.ymInputDivider} />
                  <View style={styles.ymInputRow}>
                    <Text style={styles.ymInputLabel}>Password</Text>
                    <TextInput
                      style={styles.ymInputField}
                      value={loginPassword}
                      onChangeText={setLoginPassword}
                      placeholder="Required"
                      placeholderTextColor={YM.midGray}
                      secureTextEntry
                      autoCapitalize="none"
                      returnKeyType="done"
                      onSubmitEditing={handleLogin}
                    />
                  </View>
                </View>

                {error ? <Text style={styles.errorText}>{error}</Text> : null}

                <TouchableOpacity style={styles.ymSignInBtn} onPress={handleLogin} activeOpacity={0.85} disabled={loading}>
                  {loading ? <ActivityIndicator color={YM.white} /> : <Text style={styles.ymSignInBtnText}>Sign In</Text>}
                </TouchableOpacity>

                <TouchableOpacity onPress={() => { setActiveTab("register"); setError(""); }} style={styles.ymLinkBtn}>
                  <Text style={styles.ymLinkText}>Get a new Later! ID</Text>
                </TouchableOpacity>

                <TouchableOpacity onPress={() => setShowForgotPassword(true)} style={styles.ymLinkBtn}>
                  <Text style={styles.ymLinkText}>Forgot your password?</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* REGISTER */}
            {activeTab === "register" && (
              <View style={styles.ymForm}>
                <Text style={styles.ymFormTitle}>Create your Later! ID</Text>
                <Text style={styles.ymFormSubtitle}>18+ only. All conversations are private.</Text>

                <View style={styles.ymInputGroup}>
                  <View style={styles.ymInputRow}>
                    <Text style={styles.ymInputLabel}>Username</Text>
                    <TextInput style={styles.ymInputField} value={regUsername} onChangeText={setRegUsername} placeholder="min 3 chars" placeholderTextColor={YM.midGray} autoCapitalize="none" autoCorrect={false} returnKeyType="next" maxLength={32} />
                  </View>
                  <View style={styles.ymInputDivider} />
                  <View style={styles.ymInputRow}>
                    <Text style={styles.ymInputLabel}>Email</Text>
                    <TextInput style={styles.ymInputField} value={regEmail} onChangeText={setRegEmail} placeholder="your@email.com" placeholderTextColor={YM.midGray} autoCapitalize="none" keyboardType="email-address" returnKeyType="next" />
                  </View>
                  <View style={styles.ymInputDivider} />
                  <View style={styles.ymInputRow}>
                    <Text style={styles.ymInputLabel}>Birthday</Text>
                    <TextInput style={styles.ymInputField} value={regDob} onChangeText={setRegDob} placeholder="YYYY-MM-DD" placeholderTextColor={YM.midGray} autoCapitalize="none" keyboardType="numbers-and-punctuation" returnKeyType="next" maxLength={10} />
                  </View>
                  <View style={styles.ymInputDivider} />
                  <View style={styles.ymInputRow}>
                    <Text style={styles.ymInputLabel}>Password</Text>
                    <TextInput style={styles.ymInputField} value={regPassword} onChangeText={setRegPassword} placeholder="min 6 chars" placeholderTextColor={YM.midGray} secureTextEntry autoCapitalize="none" returnKeyType="next" />
                  </View>
                  <View style={styles.ymInputDivider} />
                  <View style={styles.ymInputRow}>
                    <Text style={styles.ymInputLabel}>Confirm</Text>
                    <TextInput style={styles.ymInputField} value={regConfirmPassword} onChangeText={setRegConfirmPassword} placeholder="Re-enter password" placeholderTextColor={YM.midGray} secureTextEntry autoCapitalize="none" returnKeyType="done" onSubmitEditing={handleRegister} />
                  </View>
                </View>

                {error ? <Text style={styles.errorText}>{error}</Text> : null}

                <TouchableOpacity style={styles.ymSignInBtn} onPress={handleRegister} activeOpacity={0.85} disabled={loading}>
                  {loading ? <ActivityIndicator color={YM.white} /> : <Text style={styles.ymSignInBtnText}>Create Account</Text>}
                </TouchableOpacity>

                <TouchableOpacity onPress={() => { setActiveTab("login"); setError(""); }} style={styles.ymLinkBtn}>
                  <Text style={styles.ymLinkText}>Already have an account? Sign In</Text>
                </TouchableOpacity>
              </View>
            )}

            <View style={styles.ymFooter}>
              <Text style={styles.ymFooterText}>18+ only · Conversations are private &amp; secure</Text>
            </View>
          </View>

          {/* Share button */}
          <TouchableOpacity style={styles.ymShareBtn} onPress={handleShare} activeOpacity={0.8}>
            <Text style={styles.ymShareBtnText}>📤  Invite Friends to Later!</Text>
          </TouchableOpacity>

          {/* Copyright */}
          <View style={styles.ymCopyright}>
            <Text style={styles.ymCopyrightTitle}>Later!</Text>
            <Text style={styles.ymCopyrightText}>© {new Date().getFullYear()} Later. All rights reserved.</Text>
            <Text style={styles.ymCopyrightSub}>Later is a registered trademark. Unauthorized reproduction or distribution of this application, or any portion of it, may result in severe civil and criminal penalties.</Text>
          </View>

        </ScrollView>
      </KeyboardAvoidingView>

      {/* Forgot Password Modal */}
      <Modal visible={showForgotPassword} transparent animationType="fade" onRequestClose={() => { setShowForgotPassword(false); setForgotStep("email"); setForgotEmail(""); setForgotToken(""); setForgotNewPassword(""); setForgotMsg(""); }}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <ExpoLinearGradient colors={[YM.purpleDark, YM.purple]} style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Reset Password</Text>
            </ExpoLinearGradient>
            <View style={styles.modalBody}>
              {forgotStep === "email" && (
                <>
                  <Text style={styles.modalSubtitle}>Enter your email address and we'll send you a reset link.</Text>
                  <TextInput
                    style={styles.ymInput}
                    value={forgotEmail}
                    onChangeText={setForgotEmail}
                    placeholder="Your email address"
                    placeholderTextColor={YM.midGray}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="send"
                    onSubmitEditing={handleForgotPassword}
                  />
                  {forgotMsg ? <Text style={[styles.errorText, forgotMsg.startsWith("✓") && { color: YM.online }]}>{forgotMsg}</Text> : null}
                  <TouchableOpacity style={styles.ymSignInBtn} onPress={handleForgotPassword} activeOpacity={0.85} disabled={forgotLoading}>
                    <Text style={styles.ymSignInBtnText}>{forgotLoading ? "Sending..." : "Send Reset Email"}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.ymLinkBtn} onPress={() => setForgotStep("token")}>
                    <Text style={styles.ymLinkText}>I already have a reset token</Text>
                  </TouchableOpacity>
                </>
              )}
              {forgotStep === "token" && (
                <>
                  <Text style={styles.modalSubtitle}>Enter the reset token from your email and choose a new password.</Text>
                  <TextInput
                    style={styles.ymInput}
                    value={forgotToken}
                    onChangeText={setForgotToken}
                    placeholder="Reset token"
                    placeholderTextColor={YM.midGray}
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="next"
                  />
                  <TextInput
                    style={styles.ymInput}
                    value={forgotNewPassword}
                    onChangeText={setForgotNewPassword}
                    placeholder="New password (min 6 chars)"
                    placeholderTextColor={YM.midGray}
                    secureTextEntry
                    returnKeyType="done"
                    onSubmitEditing={handleResetPassword}
                  />
                  {forgotMsg ? <Text style={[styles.errorText, forgotMsg.startsWith("✓") && { color: YM.online }]}>{forgotMsg}</Text> : null}
                  <TouchableOpacity style={styles.ymSignInBtn} onPress={handleResetPassword} activeOpacity={0.85} disabled={forgotLoading}>
                    <Text style={styles.ymSignInBtnText}>{forgotLoading ? "Resetting..." : "Reset Password"}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.ymLinkBtn} onPress={() => setForgotStep("email")}>
                    <Text style={styles.ymLinkText}>← Back</Text>
                  </TouchableOpacity>
                </>
              )}
              <TouchableOpacity style={styles.ymLinkBtn} onPress={() => { setShowForgotPassword(false); setForgotStep("email"); setForgotMsg(""); }}>
                <Text style={styles.ymLinkText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      </ScreenContainer>
    );
  }

const styles = StyleSheet.create({
  // Auth screen
  authScroll: { flexGrow: 1, backgroundColor: YM.offWhite, paddingBottom: 32 },

  // YM Header (purple gradient)
  ymHeader: { alignItems: "center", paddingTop: 40, paddingBottom: 32, gap: 6 },
  ymHeaderLogo: { width: 90, height: 90 },
  ymHeaderTitle: { color: YM.white, fontSize: 32, fontWeight: "bold", letterSpacing: 1, textShadowColor: "rgba(0,0,0,0.3)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
  ymHeaderSub: { color: "rgba(255,255,255,0.8)", fontSize: 13 },

  // Form area
  ymFormArea: { backgroundColor: YM.white, marginHorizontal: 0, paddingBottom: 8 },
  ymTabs: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: YM.border },
  ymTab: { flex: 1, paddingVertical: 12, alignItems: "center", borderBottomWidth: 2, borderBottomColor: "transparent" },
  ymTabActive: { borderBottomColor: YM.purple },
  ymTabText: { color: YM.darkGray, fontSize: 14, fontWeight: "500" },
  ymTabTextActive: { color: YM.purple, fontWeight: "700" },

  ymForm: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12, gap: 14 },
  ymFormTitle: { color: YM.text, fontSize: 17, fontWeight: "700" },
  ymFormSubtitle: { color: YM.textLight, fontSize: 13, lineHeight: 18 },

  // YM grouped input (like the classic YM ID/Password box)
  ymInputGroup: { backgroundColor: YM.lightGray, borderRadius: 8, borderWidth: 1, borderColor: YM.border, overflow: "hidden" },
  ymInputRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 11, backgroundColor: YM.white },
  ymInputDivider: { height: 1, backgroundColor: YM.border, marginLeft: 14 },
  ymInputLabel: { color: YM.text, fontSize: 14, fontWeight: "600", width: 76, flexShrink: 0 },
  ymInputField: { flex: 1, color: YM.text, fontSize: 15, paddingVertical: 0 },

  // Standalone input (for modals)
  ymInput: { backgroundColor: YM.offWhite, borderWidth: 1, borderColor: YM.border, borderRadius: 6, paddingHorizontal: 14, paddingVertical: 11, color: YM.text, fontSize: 15 },

  // Buttons
  ymSignInBtn: { backgroundColor: YM.purple, paddingVertical: 13, borderRadius: 8, alignItems: "center" },
  ymSignInBtnText: { color: YM.white, fontWeight: "700", fontSize: 16 },
  ymSecondaryBtn: { backgroundColor: YM.lightGray, paddingVertical: 12, borderRadius: 8, alignItems: "center", borderWidth: 1, borderColor: YM.border },
  ymSecondaryBtnText: { color: YM.text, fontWeight: "600", fontSize: 14 },
  ymLinkBtn: { alignItems: "center", paddingVertical: 6 },
  ymLinkText: { color: YM.purple, fontSize: 14 },

  ymFooter: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 },
  ymFooterText: { color: YM.midGray, fontSize: 11, textAlign: "center" },

  // Share & room preview
  ymShareBtn: { marginHorizontal: 16, marginTop: 16, backgroundColor: YM.white, borderWidth: 1, borderColor: YM.border, borderRadius: 8, paddingVertical: 13, alignItems: "center" },
  ymShareBtnText: { color: YM.purple, fontSize: 14, fontWeight: "600" },
  ymRoomPreview: { marginHorizontal: 16, marginTop: 12, backgroundColor: YM.white, borderRadius: 8, borderWidth: 1, borderColor: YM.border, padding: 14, gap: 10 },
  ymRoomPreviewTitle: { color: YM.text, fontWeight: "700", fontSize: 13, textAlign: "center" },
  ymRoomPills: { flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center" },
  ymRoomPill: { backgroundColor: YM.offWhite, borderWidth: 1, borderColor: YM.purpleLight, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
  ymRoomPillText: { color: YM.purple, fontSize: 11, fontWeight: "500" },

  // Error
  errorText: { color: YM.error, fontSize: 12 },

  // Room selection screen
  roomsTopBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 14 },
  roomsTopBarTitle: { color: YM.white, fontSize: 18, fontWeight: "700" },
  roomsTopBarSub: { color: "rgba(255,255,255,0.8)", fontSize: 12 },
  roomsTopBarLogo: { width: 36, height: 36 },
  roomsBackBtn: { paddingRight: 8 },
  roomsBackBtnText: { color: YM.white, fontSize: 28, lineHeight: 32 },

  roomInfoBar: { backgroundColor: "#F3E5F5", paddingHorizontal: 14, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#E1BEE7" },
  roomInfoBarText: { color: "#4A148C", fontSize: 11, lineHeight: 16 },
  roomSearchBar: { flexDirection: "row", alignItems: "center", backgroundColor: YM.white, borderBottomWidth: 1, borderBottomColor: YM.border, paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  roomSearchIcon: { fontSize: 16 },
  roomSearchPlaceholder: { color: YM.midGray, fontSize: 14 },

  roomsList: { paddingBottom: 32 },
  roomSeparator: { height: 1, backgroundColor: YM.border, marginLeft: 72 },

  // Room card — Yahoo Chat folder style
  roomCard: { flexDirection: "row", alignItems: "center", backgroundColor: YM.white, paddingHorizontal: 14, paddingVertical: 11, gap: 10 },
  roomFolderIcon: { fontSize: 22, width: 30, textAlign: "center" },
  roomAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: YM.purple, alignItems: "center", justifyContent: "center" },
  roomAvatarText: { color: YM.white, fontSize: 18, fontWeight: "700" },
  roomCardContent: { flex: 1, gap: 2 },
  roomCardName: { color: YM.purple, fontWeight: "700", fontSize: 14 },
  roomCardCount: { color: YM.darkGray, fontSize: 13, fontWeight: "400" },
  roomCardDesc: { color: YM.textLight, fontSize: 11 },
  roomOnlineBadge: { flexDirection: "row", alignItems: "center", gap: 3 },
  onlineDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: YM.online },
  roomOnlineText: { color: YM.online, fontSize: 11, fontWeight: "600" },
  roomCardArrow: { color: YM.midGray, fontSize: 22 },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: 24 },
  modalBox: { width: "100%", maxWidth: 360, backgroundColor: YM.white, borderRadius: 10, overflow: "hidden" },
  modalHeader: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 20, paddingVertical: 16 },
  modalCrown: { fontSize: 22 },
  modalTitle: { color: YM.white, fontWeight: "700", fontSize: 17, flex: 1 },
  modalBody: { padding: 20, gap: 12 },
  modalSubtitle: { color: YM.textLight, fontSize: 13, lineHeight: 18 },

  // Primary button (reuse ymSignInBtn above)
  ymPrimaryBtn: { backgroundColor: YM.purple, paddingVertical: 13, borderRadius: 8, alignItems: "center" },
  ymPrimaryBtnText: { color: YM.white, fontWeight: "700", fontSize: 16 },

  // Copyright
  ymCopyright: { alignItems: "center", paddingHorizontal: 24, paddingTop: 24, paddingBottom: 32, gap: 4 },
  ymCopyrightTitle: { color: YM.purple, fontWeight: "800", fontSize: 16, letterSpacing: 0.5 },
  ymCopyrightText: { color: YM.darkGray, fontSize: 12, fontWeight: "600" },
  ymCopyrightSub: { color: YM.midGray, fontSize: 10, textAlign: "center", lineHeight: 15 },
});
