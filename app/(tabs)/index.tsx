import { useState, useEffect, useRef } from "react";
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

const SAVED_NICKNAME_KEY = "@later_saved_nickname";
const SAVED_REGISTERED_USER_KEY = "@later_registered_user";
const SUPER_ADMIN_NICKNAMES = ["Ammar", "Later"];
const SUPER_ADMIN_NICKNAME = SUPER_ADMIN_NICKNAMES[0];

type Tab = "guest" | "login" | "register";
type Screen = "auth" | "rooms";

// Fallback rooms if server is unavailable
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
    <TouchableOpacity style={styles.roomCard} onPress={onPress} activeOpacity={0.75}>
      <View style={styles.roomCardContent}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text style={styles.roomCardName}>{room.name}</Text>
          {count > 0 && (
            <View style={styles.roomUserBadge}>
              <Text style={styles.roomUserBadgeText}>{count} online</Text>
            </View>
          )}
        </View>
        <Text style={styles.roomCardDesc} numberOfLines={1}>{room.description}</Text>
      </View>
      <Text style={styles.roomCardArrow}>›</Text>
    </TouchableOpacity>
  );
}

const ROOM_ICONS: Record<string, string> = {
  "Now": "⚡",
  "Arab World": "🌍",
  "Issues": "🔥",
  "Social Media": "📱",
  "Chilling Out": "😎",
  "Dancing": "💃",
  "Blah Blah": "💬",
  "Nothing Hidden": "🔓",
  "For All": "🌐",
  "Random": "🎲",
};

export default function WelcomeScreen() {
  const router = useRouter();
  const {
    joinRoom,
    authenticateSuperAdmin,
    requireSuperAdminAuth,
    superAdminPasswordSet,
    nickname: currentNickname,
    roomId,
  } = useChat();

  const [screen, setScreen] = useState<Screen>("auth");
  const [activeTab, setActiveTab] = useState<Tab>("guest");
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
  const [regDob, setRegDob] = useState(""); // YYYY-MM-DD

  // Admin auth
  const [adminPassword, setAdminPassword] = useState("");
  const [adminConfirmPassword, setAdminConfirmPassword] = useState("");
  const [showAdminAuth, setShowAdminAuth] = useState(false);
  const [isSetup, setIsSetup] = useState(false);

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const registerMutation = trpc.user.register.useMutation();
  const loginMutation = trpc.user.login.useMutation();
  const { data: roomsData, isLoading: roomsLoading } = trpc.chat.getAllRooms.useQuery(undefined, {
    retry: 2,
  });

  const rooms = roomsData && roomsData.length > 0 ? roomsData : FALLBACK_ROOMS;

  // ── Screen capture prevention ─────────────────────────────────────────────
  useEffect(() => {
    let sub: { remove: () => void } | null = null;
    if (Platform.OS !== "web") {
      // Prevent screenshots and screen recording
      ScreenCapture.preventScreenCaptureAsync().catch(() => {});
      // Listen for screenshot attempts and warn
      sub = ScreenCapture.addScreenshotListener(() => {
        Alert.alert(
          "Screenshot Blocked",
          "Screenshots are not allowed in Later to protect user privacy.",
        );
      });
    }
    return () => {
      if (sub) sub.remove();
      if (Platform.OS !== "web") {
        ScreenCapture.allowScreenCaptureAsync().catch(() => {});
      }
    };
  }, []);

  // Load saved nickname on mount
  useEffect(() => {
    AsyncStorage.getItem(SAVED_NICKNAME_KEY).then((saved) => {
      if (saved) setNicknameInput(saved);
    }).catch(() => {});
    AsyncStorage.getItem(SAVED_REGISTERED_USER_KEY).then((saved) => {
      if (saved) {
        setLoginUsername(saved);
        setActiveTab("login");
      }
    }).catch(() => {});
  }, []);

  // If already in room, go to chat
  // Guard: only navigate after mount to avoid "attempted to navigate before mounting the root layout"
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => { setIsMounted(true); }, []);
  useEffect(() => {
    if (!isMounted) return;
    if (currentNickname && roomId) {
      router.replace("/chat" as any);
    }
  }, [currentNickname, roomId, isMounted]);

  // When server asks for super admin auth
  useEffect(() => {
    if (requireSuperAdminAuth) {
      setIsSetup(!superAdminPasswordSet);
      setShowAdminAuth(true);
    }
  }, [requireSuperAdminAuth, superAdminPasswordSet]);

  // ── Auth handlers ─────────────────────────────────────────────────────────
  const handleGuestJoin = () => {
    const nick = nicknameInput.trim();
    if (!nick) { setError("Please enter a nickname"); return; }
    if (nick.length < 2) { setError("Nickname must be at least 2 characters"); return; }
    if (SUPER_ADMIN_NICKNAMES.some(n => n.toLowerCase() === nick.toLowerCase())) {
      setError("This nickname is reserved.");
      return;
    }
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
        AsyncStorage.setItem(SAVED_NICKNAME_KEY, username).catch(() => {});
        setPendingNickname(username);
        setScreen("rooms");
      } else {
        setError(result.error || "Login failed");
      }
    } catch (e: any) {
      setError(e?.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    const username = regUsername.trim();
    const email = regEmail.trim();
    if (!username || !email || !regPassword || !regConfirmPassword) {
      setError("Please fill in all fields"); return;
    }
    if (!regDob) {
      setError("Please enter your date of birth"); return;
    }
    // Validate 18+
    const dob = new Date(regDob);
    if (isNaN(dob.getTime())) {
      setError("Invalid date of birth (use YYYY-MM-DD format)"); return;
    }
    const today = new Date();
    const age = today.getFullYear() - dob.getFullYear() -
      (today < new Date(today.getFullYear(), dob.getMonth(), dob.getDate()) ? 1 : 0);
    if (age < 18) {
      setError("You must be 18 or older to register."); return;
    }
    if (SUPER_ADMIN_NICKNAMES.some(n => n.toLowerCase() === username.toLowerCase())) {
      setError("This username is reserved."); return;
    }
    if (username.length < 3) { setError("Username must be at least 3 characters"); return; }
    if (regPassword.length < 6) { setError("Password must be at least 6 characters"); return; }
    if (regPassword !== regConfirmPassword) { setError("Passwords do not match"); return; }
    setError("");
    setLoading(true);
    try {
      const result = await registerMutation.mutateAsync({
        username,
        password: regPassword,
        email,
        dateOfBirth: regDob,
      });
      if (result.success) {
        Alert.alert("Registered!", "Your account has been created. Choose a room to join.");
        AsyncStorage.setItem(SAVED_REGISTERED_USER_KEY, username).catch(() => {});
        AsyncStorage.setItem(SAVED_NICKNAME_KEY, username).catch(() => {});
        setPendingNickname(username);
        setScreen("rooms");
      } else {
        setError(result.error || "Registration failed");
      }
    } catch (e: any) {
      setError(e?.message || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  const handleRoomSelect = (selectedRoomId: number) => {
    // For super admin: server will emit require_super_admin_auth, modal shows via useEffect
    // For regular users: server emits room_joined, navigation happens via useEffect
    joinRoom(pendingNickname, selectedRoomId);
  };

  const handleAdminAuth = () => {
    if (!adminPassword) { setError("Please enter a password"); return; }
    if (isSetup) {
      if (adminPassword.length < 6) { setError("Password must be at least 6 characters"); return; }
      if (adminPassword !== adminConfirmPassword) { setError("Passwords do not match"); return; }
    }
    setError("");
    authenticateSuperAdmin(adminPassword, isSetup);
    setShowAdminAuth(false);
    setAdminPassword("");
    setAdminConfirmPassword("");
    // Navigation happens automatically via useEffect when room_joined fires and sets roomId
  };

  const handleSuperAdminJoin = () => {
    setError("");
    // Use the typed nickname if it's a super admin name, otherwise default to "Ammar"
    const superNick = SUPER_ADMIN_NICKNAMES.some(n => n.toLowerCase() === nicknameInput.trim().toLowerCase())
      ? nicknameInput.trim()
      : SUPER_ADMIN_NICKNAME;
    setPendingNickname(superNick);
    setScreen("rooms");
  };

  const handleShare = async () => {
    try {
      await Share.share({
        title: "Join Later Chat",
        message: "Join Later Chat — later.chat",
      });
    } catch {}
  };

  // ── Room Selection Screen ─────────────────────────────────────────────────
  if (screen === "rooms") {
    return (
      <ScreenContainer containerClassName="bg-black" className="bg-black">
        <View style={styles.roomsHeader}>
          {/* Only show back button for non-super-admin users */}
          {!SUPER_ADMIN_NICKNAMES.some(n => n.toLowerCase() === pendingNickname.toLowerCase()) && (
            <TouchableOpacity style={styles.backBtn} onPress={() => setScreen("auth")}>
              <Text style={styles.backBtnText}>← Back</Text>
            </TouchableOpacity>
          )}
          <Text style={styles.roomsTitle}>Choose a Room</Text>
          <Text style={styles.roomsSubtitle}>Welcome, {pendingNickname}! Pick a room to join.</Text>
        </View>
        <FlatList
          data={rooms}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.roomsList}
          renderItem={({ item }) => (
            <RoomCard
              room={item}
              onPress={() => handleRoomSelect(item.id)}
            />
          )}
          ListHeaderComponent={
            roomsLoading ? (
              <ActivityIndicator color="#FFD700" style={{ marginVertical: 16 }} />
            ) : null
          }
        />

        {/* Super Admin Auth Modal — must be here so it shows on the rooms screen */}
        <Modal visible={showAdminAuth} transparent animationType="fade" onRequestClose={() => { setShowAdminAuth(false); setAdminPassword(""); setAdminConfirmPassword(""); setError(""); }}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalBox}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalCrown}>👑</Text>
                <Text style={styles.modalTitle}>
                  {isSetup ? "Set Super Admin Password" : "Super Admin Login"}
                </Text>
              </View>
              <Text style={styles.modalSubtitle}>
                {isSetup
                  ? `Welcome, ${pendingNickname}! Set your password to secure your Super Admin account.`
                  : "Enter your Super Admin password to continue."}
              </Text>
              <TextInput
                style={styles.modalInput}
                value={adminPassword}
                onChangeText={setAdminPassword}
                placeholder="Password"
                placeholderTextColor="#666"
                secureTextEntry
                autoCapitalize="none"
                returnKeyType={isSetup ? "next" : "done"}
                onSubmitEditing={isSetup ? undefined : handleAdminAuth}
              />
              {isSetup && (
                <TextInput
                  style={styles.modalInput}
                  value={adminConfirmPassword}
                  onChangeText={setAdminConfirmPassword}
                  placeholder="Confirm Password"
                  placeholderTextColor="#666"
                  secureTextEntry
                  autoCapitalize="none"
                  returnKeyType="done"
                  onSubmitEditing={handleAdminAuth}
                />
              )}
              {error ? <Text style={styles.errorText}>{error}</Text> : null}
              <TouchableOpacity style={styles.modalBtn} onPress={handleAdminAuth} activeOpacity={0.8}>
                <Text style={styles.modalBtnText}>{isSetup ? "Set Password & Enter" : "Login"}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalCancel} onPress={() => { setShowAdminAuth(false); setAdminPassword(""); setAdminConfirmPassword(""); setError(""); setScreen("auth"); setPendingNickname(""); }}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </ScreenContainer>
    );
  }

  // ── Auth Screen ───────────────────────────────────────────────────────────
  return (
    <ScreenContainer containerClassName="bg-black" className="bg-black">
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {/* Logo */}
          <View style={styles.logoArea}>
            <Image
              source={{ uri: "https://d2xsxph8kpxj0f.cloudfront.net/310519663401644709/NzGynwH9ginkrkq4LKn7H4/icon-39CEi9zvX3FBgh8hCwF9w9.png" }}
              style={styles.logo}
              resizeMode="contain"
            />
            <Text style={styles.appName}>Later</Text>
            <Text style={styles.tagline}>Voice &amp; Text Chat Rooms</Text>
            <Text style={styles.tagline2}>Don't waste your time and don't be late — chat on Later!</Text>
          </View>

          {/* Card */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardHeaderText}>Join Later</Text>
              <Text style={styles.cardSubText}>18+ only · All conversations are fully secured &amp; private</Text>
            </View>

            {/* Tabs */}
            <View style={styles.tabs}>
              <TouchableOpacity
                style={[styles.tab, activeTab === "guest" && styles.tabActive]}
                onPress={() => { setActiveTab("guest"); setError(""); }}
              >
                <Text style={[styles.tabText, activeTab === "guest" && styles.tabTextActive]}>Guest</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tab, activeTab === "login" && styles.tabActive]}
                onPress={() => { setActiveTab("login"); setError(""); }}
              >
                <Text style={[styles.tabText, activeTab === "login" && styles.tabTextActive]}>Login</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tab, activeTab === "register" && styles.tabActive]}
                onPress={() => { setActiveTab("register"); setError(""); }}
              >
                <Text style={[styles.tabText, activeTab === "register" && styles.tabTextActive]}>Register</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.cardBody}>
              {/* GUEST TAB */}
              {activeTab === "guest" && (
                <>
                  <Text style={styles.label}>Enter a nickname to join as guest:</Text>
                  <TextInput
                    style={styles.input}
                    value={nicknameInput}
                    onChangeText={setNicknameInput}
                    placeholder="Your nickname"
                    placeholderTextColor="#666"
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="done"
                    onSubmitEditing={handleGuestJoin}
                    maxLength={32}
                  />
                  {error ? <Text style={styles.errorText}>{error}</Text> : null}
                  <TouchableOpacity style={styles.joinBtn} onPress={handleGuestJoin} activeOpacity={0.8}>
                    <Text style={styles.joinBtnText}>Choose a Room →</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.adminLink} onPress={handleSuperAdminJoin}>
                    <Text style={styles.adminLinkText}>👑 Super Admin Login</Text>
                  </TouchableOpacity>
                </>
              )}

              {/* LOGIN TAB */}
              {activeTab === "login" && (
                <>
                  <Text style={styles.label}>Login with your account:</Text>
                  <TextInput
                    style={styles.input}
                    value={loginUsername}
                    onChangeText={setLoginUsername}
                    placeholder="Username"
                    placeholderTextColor="#666"
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="next"
                    maxLength={32}
                  />
                  <TextInput
                    style={styles.input}
                    value={loginPassword}
                    onChangeText={setLoginPassword}
                    placeholder="Password"
                    placeholderTextColor="#666"
                    secureTextEntry
                    autoCapitalize="none"
                    returnKeyType="done"
                    onSubmitEditing={handleLogin}
                  />
                  {error ? <Text style={styles.errorText}>{error}</Text> : null}
                  <TouchableOpacity style={styles.joinBtn} onPress={handleLogin} activeOpacity={0.8} disabled={loading}>
                    {loading ? <ActivityIndicator color="#FFD700" /> : <Text style={styles.joinBtnText}>Login &amp; Choose Room →</Text>}
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => { setActiveTab("register"); setError(""); }}>
                    <Text style={styles.switchText}>Don't have an account? Register</Text>
                  </TouchableOpacity>
                </>
              )}

              {/* REGISTER TAB */}
              {activeTab === "register" && (
                <>
                  <Text style={styles.label}>Create your account (18+ only):</Text>
                  <TextInput
                    style={styles.input}
                    value={regUsername}
                    onChangeText={setRegUsername}
                    placeholder="Username (min 3 chars)"
                    placeholderTextColor="#666"
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="next"
                    maxLength={32}
                  />
                  <TextInput
                    style={styles.input}
                    value={regEmail}
                    onChangeText={setRegEmail}
                    placeholder="Email address"
                    placeholderTextColor="#666"
                    autoCapitalize="none"
                    keyboardType="email-address"
                    returnKeyType="next"
                  />
                  <Text style={styles.dobLabel}>Date of Birth (must be 18+)</Text>
                  <TextInput
                    style={styles.input}
                    value={regDob}
                    onChangeText={setRegDob}
                    placeholder="YYYY-MM-DD  e.g. 1995-06-15"
                    placeholderTextColor="#666"
                    autoCapitalize="none"
                    keyboardType="numbers-and-punctuation"
                    returnKeyType="next"
                    maxLength={10}
                  />
                  <TextInput
                    style={styles.input}
                    value={regPassword}
                    onChangeText={setRegPassword}
                    placeholder="Password (min 6 chars)"
                    placeholderTextColor="#666"
                    secureTextEntry
                    autoCapitalize="none"
                    returnKeyType="next"
                  />
                  <TextInput
                    style={styles.input}
                    value={regConfirmPassword}
                    onChangeText={setRegConfirmPassword}
                    placeholder="Confirm password"
                    placeholderTextColor="#666"
                    secureTextEntry
                    autoCapitalize="none"
                    returnKeyType="done"
                    onSubmitEditing={handleRegister}
                  />
                  {error ? <Text style={styles.errorText}>{error}</Text> : null}
                  <TouchableOpacity style={styles.joinBtn} onPress={handleRegister} activeOpacity={0.8} disabled={loading}>
                    {loading ? <ActivityIndicator color="#FFD700" /> : <Text style={styles.joinBtnText}>Register &amp; Choose Room →</Text>}
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => { setActiveTab("login"); setError(""); }}>
                    <Text style={styles.switchText}>Already have an account? Login</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>

            <View style={styles.cardFooter}>
              <Text style={styles.footerText}>By joining, you agree to be respectful to all users.</Text>
              <Text style={styles.footerText}>This app is for users 18 years and older only.</Text>
            </View>
          </View>

          {/* Share Button */}
          <TouchableOpacity style={styles.shareBtn} onPress={handleShare} activeOpacity={0.8}>
            <Text style={styles.shareBtnText}>📤  Share Later with Friends</Text>
          </TouchableOpacity>

          {/* Room preview list */}
          <View style={styles.roomPreview}>
            <Text style={styles.roomPreviewTitle}>10 Chat Rooms Available</Text>
            <View style={styles.roomPreviewGrid}>
              {FALLBACK_ROOMS.map((r) => (
                <View key={r.id} style={styles.roomPill}>
                  <Text style={styles.roomPillText}>{r.name}</Text>
                </View>
              ))}
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, alignItems: "center", paddingVertical: 24, paddingHorizontal: 16, gap: 20 },
  logoArea: { alignItems: "center", gap: 4, marginTop: 16 },
  logo: { width: 80, height: 80, borderRadius: 16 },
  appName: { color: "#FFD700", fontSize: 28, fontWeight: "bold", letterSpacing: 2 },
  tagline: { color: "#888", fontSize: 13, fontStyle: "italic" },
  tagline2: { color: "#7B0099", fontSize: 12, textAlign: "center", paddingHorizontal: 20, marginTop: 2 },
  card: { width: "100%", maxWidth: 400, backgroundColor: "#1a1a1a", borderRadius: 8, borderWidth: 1, borderColor: "#7B0099", overflow: "hidden" },
  cardHeader: { backgroundColor: "#7B0099", paddingHorizontal: 16, paddingVertical: 10 },
  cardHeaderText: { color: "#FFD700", fontWeight: "bold", fontSize: 15 },
  cardSubText: { color: "#ddd", fontSize: 12, marginTop: 2 },
  tabs: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#333" },
  tab: { flex: 1, paddingVertical: 10, alignItems: "center", borderBottomWidth: 2, borderBottomColor: "transparent" },
  tabActive: { borderBottomColor: "#FFD700" },
  tabText: { color: "#666", fontSize: 13, fontWeight: "600" },
  tabTextActive: { color: "#FFD700" },
  cardBody: { padding: 16, gap: 10 },
  label: { color: "#aaa", fontSize: 13, fontWeight: "600" },
  dobLabel: { color: "#FFD700", fontSize: 12, fontWeight: "600", marginTop: 2 },
  input: { backgroundColor: "#000", borderWidth: 1, borderColor: "#444", borderRadius: 4, paddingHorizontal: 12, paddingVertical: 10, color: "#fff", fontSize: 15 },
  errorText: { color: "#FF4444", fontSize: 12 },
  joinBtn: { backgroundColor: "#7B0099", paddingVertical: 12, borderRadius: 4, alignItems: "center", marginTop: 4 },
  joinBtnText: { color: "#FFD700", fontWeight: "bold", fontSize: 15 },
  adminLink: { alignItems: "center", paddingVertical: 6 },
  adminLinkText: { color: "#FFD700", fontSize: 12, opacity: 0.6 },
  switchText: { color: "#7B0099", fontSize: 12, textAlign: "center", paddingVertical: 4 },
  cardFooter: { paddingHorizontal: 16, paddingBottom: 12, gap: 3 },
  footerText: { color: "#555", fontSize: 11, textAlign: "center" },
  shareBtn: { width: "100%", maxWidth: 400, backgroundColor: "#111", borderWidth: 1, borderColor: "#7B0099", borderRadius: 8, paddingVertical: 14, alignItems: "center" },
  shareBtnText: { color: "#FFD700", fontSize: 14, fontWeight: "600" },
  roomPreview: { width: "100%", maxWidth: 400, backgroundColor: "#111", borderRadius: 8, borderWidth: 1, borderColor: "#333", padding: 14, gap: 10 },
  roomPreviewTitle: { color: "#FFD700", fontWeight: "bold", fontSize: 13, textAlign: "center" },
  roomPreviewGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center" },
  roomPill: { backgroundColor: "#1a1a1a", borderWidth: 1, borderColor: "#7B0099", borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
  roomUserBadge: { backgroundColor: "#004400", borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 },
  roomUserBadgeText: { color: "#00FF88", fontSize: 11, fontWeight: "600" as const },
  roomPillText: { color: "#ccc", fontSize: 11 },
  // Room selection screen
  roomsHeader: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8, gap: 4 },
  backBtn: { paddingVertical: 6 },
  backBtnText: { color: "#7B0099", fontSize: 14, fontWeight: "600" },
  roomsTitle: { color: "#FFD700", fontSize: 22, fontWeight: "bold" },
  roomsSubtitle: { color: "#888", fontSize: 13 },
  roomsList: { paddingHorizontal: 16, paddingBottom: 32, gap: 10 },
  roomCard: { flexDirection: "row", alignItems: "center", backgroundColor: "#1a1a1a", borderRadius: 10, borderWidth: 1, borderColor: "#333", padding: 14, gap: 12 },
  roomCardLeft: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#111", alignItems: "center", justifyContent: "center" },
  roomIcon: { fontSize: 20 },
  roomCardContent: { flex: 1, gap: 2 },
  roomCardName: { color: "#FFD700", fontWeight: "bold", fontSize: 15 },
  roomCardDesc: { color: "#666", fontSize: 12 },
  roomCardArrow: { color: "#7B0099", fontSize: 22, fontWeight: "bold" },
  // Modal
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.8)", justifyContent: "center", alignItems: "center", padding: 24 },
  modalBox: { width: "100%", maxWidth: 360, backgroundColor: "#1a1a1a", borderRadius: 10, borderWidth: 2, borderColor: "#FFD700", padding: 24, gap: 12 },
  modalHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  modalCrown: { fontSize: 24 },
  modalTitle: { color: "#FFD700", fontWeight: "bold", fontSize: 17, flex: 1 },
  modalSubtitle: { color: "#aaa", fontSize: 13, lineHeight: 18 },
  modalInput: { backgroundColor: "#000", borderWidth: 1, borderColor: "#444", borderRadius: 4, paddingHorizontal: 12, paddingVertical: 10, color: "#fff", fontSize: 15 },
  modalBtn: { backgroundColor: "#7B0099", paddingVertical: 12, borderRadius: 4, alignItems: "center", marginTop: 4 },
  modalBtnText: { color: "#FFD700", fontWeight: "bold", fontSize: 15 },
  modalCancel: { alignItems: "center", paddingVertical: 8 },
  modalCancelText: { color: "#666", fontSize: 14 },
});
