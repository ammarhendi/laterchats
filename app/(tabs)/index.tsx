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
} from "react-native";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ScreenContainer } from "@/components/screen-container";
import { useChat } from "@/lib/chat-context";

const SAVED_NICKNAME_KEY = "@later_saved_nickname";

const SUPER_ADMIN_NICKNAME = "Ammar";
const DEFAULT_ROOM_ID = 1;

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

  const [nicknameInput, setNicknameInput] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showAdminAuth, setShowAdminAuth] = useState(false);
  const [isSetup, setIsSetup] = useState(false);
  const [error, setError] = useState("");

  // Load saved nickname on mount
  useEffect(() => {
    AsyncStorage.getItem(SAVED_NICKNAME_KEY).then((saved) => {
      if (saved) setNicknameInput(saved);
    }).catch(() => {});
  }, []);

  // If already in room, go to chat
  useEffect(() => {
    if (currentNickname && roomId) {
      router.replace("/chat" as any);
    }
  }, [currentNickname, roomId]);

  // When server asks for super admin auth
  useEffect(() => {
    if (requireSuperAdminAuth) {
      setIsSetup(!superAdminPasswordSet);
      setShowAdminAuth(true);
    }
  }, [requireSuperAdminAuth, superAdminPasswordSet]);

  const handleJoin = () => {
    const nick = nicknameInput.trim();
    if (!nick) {
      setError("Please enter a nickname");
      return;
    }
    if (nick.length < 2) {
      setError("Nickname must be at least 2 characters");
      return;
    }
    setError("");
    // Save nickname for next time
    AsyncStorage.setItem(SAVED_NICKNAME_KEY, nick).catch(() => {});
    joinRoom(nick, DEFAULT_ROOM_ID);

    // If it's Ammar, the server will respond with require_super_admin_auth
    // and the modal will open via the useEffect above
    // For regular users, room_joined fires and we navigate to chat
    if (nick.toLowerCase() !== SUPER_ADMIN_NICKNAME.toLowerCase()) {
      setTimeout(() => {
        router.replace("/chat" as any);
      }, 500);
    }
  };

  const handleAdminAuth = () => {
    if (!password) {
      setError("Please enter a password");
      return;
    }
    if (isSetup) {
      if (password.length < 6) {
        setError("Password must be at least 6 characters");
        return;
      }
      if (password !== confirmPassword) {
        setError("Passwords do not match");
        return;
      }
    }
    setError("");
    authenticateSuperAdmin(password, isSetup);
    setShowAdminAuth(false);
    setPassword("");
    setConfirmPassword("");
    setTimeout(() => {
      router.replace("/chat" as any);
    }, 600);
  };

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
            <Text style={styles.tagline}>Voice &amp; Text Chat Rooms</Text>
          </View>

          {/* Welcome card */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardHeaderText}>Welcome to Later Chat</Text>
              <Text style={styles.cardSubText}>Pull up a chair and have a chat, mate!</Text>
            </View>

            <View style={styles.cardBody}>
              <Text style={styles.label}>Enter Chat room as:</Text>
              <TextInput
                style={styles.input}
                value={nicknameInput}
                onChangeText={setNicknameInput}
                placeholder="Your nickname"
                placeholderTextColor="#666"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={handleJoin}
                maxLength={32}
              />
              {error ? <Text style={styles.errorText}>{error}</Text> : null}

              <TouchableOpacity style={styles.joinBtn} onPress={handleJoin} activeOpacity={0.8}>
                <Text style={styles.joinBtnText}>Go to Room</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.cardFooter}>
              <Text style={styles.footerText}>
                By joining, you agree to be respectful to all users.
              </Text>
              <Text style={styles.footerText}>
                Numbers next to chatters tell you how many are in the room.
              </Text>
            </View>
          </View>

          {/* Room info */}
          <View style={styles.roomInfo}>
            <Text style={styles.roomInfoTitle}>📢 Now</Text>
            <Text style={styles.roomInfoDesc}>The one and only chat room. Join and say hi!</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Super Admin Auth Modal */}
      <Modal
        visible={showAdminAuth}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAdminAuth(false)}
      >
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
                ? "Welcome, Ammar! Set your password to secure your Super Admin account."
                : "Enter your Super Admin password to continue."}
            </Text>

            <TextInput
              style={styles.modalInput}
              value={password}
              onChangeText={setPassword}
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
                value={confirmPassword}
                onChangeText={setConfirmPassword}
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
              <Text style={styles.modalBtnText}>
                {isSetup ? "Set Password & Enter" : "Login"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.modalCancel}
              onPress={() => {
                setShowAdminAuth(false);
                setPassword("");
                setConfirmPassword("");
                setError("");
              }}
            >
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 1,
    alignItems: "center",
    paddingVertical: 24,
    paddingHorizontal: 16,
    gap: 20,
  },
  logoArea: {
    alignItems: "center",
    gap: 6,
    marginTop: 16,
  },
  logo: {
    width: 80,
    height: 80,
    borderRadius: 16,
  },
  tagline: {
    color: "#888",
    fontSize: 13,
    fontStyle: "italic",
  },
  card: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: "#1a1a1a",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#7B0099",
    overflow: "hidden",
  },
  cardHeader: {
    backgroundColor: "#7B0099",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  cardHeaderText: {
    color: "#FFD700",
    fontWeight: "bold",
    fontSize: 15,
  },
  cardSubText: {
    color: "#ddd",
    fontSize: 12,
    marginTop: 2,
  },
  cardBody: {
    padding: 16,
    gap: 10,
  },
  label: {
    color: "#aaa",
    fontSize: 13,
    fontWeight: "600",
  },
  input: {
    backgroundColor: "#000",
    borderWidth: 1,
    borderColor: "#444",
    borderRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#fff",
    fontSize: 15,
  },
  errorText: {
    color: "#FF4444",
    fontSize: 12,
  },
  joinBtn: {
    backgroundColor: "#7B0099",
    paddingVertical: 12,
    borderRadius: 4,
    alignItems: "center",
    marginTop: 4,
  },
  joinBtnText: {
    color: "#FFD700",
    fontWeight: "bold",
    fontSize: 15,
  },
  cardFooter: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 3,
  },
  footerText: {
    color: "#555",
    fontSize: 11,
    textAlign: "center",
  },
  roomInfo: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: "#111",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#333",
    padding: 12,
    gap: 4,
  },
  roomInfoTitle: {
    color: "#FFD700",
    fontWeight: "bold",
    fontSize: 14,
  },
  roomInfoDesc: {
    color: "#888",
    fontSize: 12,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.8)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalBox: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: "#1a1a1a",
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#FFD700",
    padding: 24,
    gap: 12,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  modalCrown: {
    fontSize: 24,
  },
  modalTitle: {
    color: "#FFD700",
    fontWeight: "bold",
    fontSize: 17,
    flex: 1,
  },
  modalSubtitle: {
    color: "#aaa",
    fontSize: 13,
    lineHeight: 18,
  },
  modalInput: {
    backgroundColor: "#000",
    borderWidth: 1,
    borderColor: "#444",
    borderRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#fff",
    fontSize: 15,
  },
  modalBtn: {
    backgroundColor: "#7B0099",
    paddingVertical: 12,
    borderRadius: 4,
    alignItems: "center",
    marginTop: 4,
  },
  modalBtnText: {
    color: "#FFD700",
    fontWeight: "bold",
    fontSize: 15,
  },
  modalCancel: {
    alignItems: "center",
    paddingVertical: 8,
  },
  modalCancelText: {
    color: "#666",
    fontSize: 14,
  },
});
