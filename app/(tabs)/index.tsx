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
  ActivityIndicator,
  Alert,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useChat } from "@/lib/chat-context";
import { trpc } from "@/lib/trpc";

export default function WelcomeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ token?: string }>();
  const { nickname: savedNickname, setNickname, joinRoom } = useChat();

  const [nickname, setLocalNickname] = useState(savedNickname || "");
  const [token, setToken] = useState(params.token || "");
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState("");

  const roomQuery = trpc.chat.getRoom.useQuery();

  useEffect(() => {
    if (params.token) {
      setToken(params.token);
    }
  }, [params.token]);

  const handleJoin = async () => {
    const trimmed = nickname.trim();
    if (!trimmed) {
      setError("Please enter a nickname to join.");
      return;
    }
    if (trimmed.length < 2) {
      setError("Nickname must be at least 2 characters.");
      return;
    }
    if (trimmed.length > 20) {
      setError("Nickname must be 20 characters or less.");
      return;
    }
    if (!/^[a-zA-Z0-9_\-]+$/.test(trimmed)) {
      setError("Nickname can only contain letters, numbers, _ and -");
      return;
    }

    setError("");
    setIsJoining(true);

    try {
      const roomId = roomQuery.data?.id || 1;
      setNickname(trimmed);
      joinRoom(trimmed, roomId, token || undefined);
      router.replace("/chat" as any);
    } catch (err) {
      setError("Failed to join room. Please try again.");
    } finally {
      setIsJoining(false);
    }
  };

  return (
    <ScreenContainer containerClassName="bg-black" className="bg-black">
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        {/* Logo */}
        <View style={styles.logoContainer}>
          <Image
            source={{ uri: "https://d2xsxph8kpxj0f.cloudfront.net/310519663401644709/NzGynwH9ginkrkq4LKn7H4/icon_7a96bea8.png" }}
            style={styles.logo}
            resizeMode="contain"
          />
          <Text style={styles.tagline}>Voice & Text Chat Rooms</Text>
        </View>

        {/* Room Info */}
        <View style={styles.roomInfoBox}>
          <Text style={styles.roomInfoTitle}>
            Welcome to Later Chat
          </Text>
          <Text style={styles.roomInfoDesc}>
            {roomQuery.data?.description || "Pull up a chair and have a chat, mate!"}
          </Text>
          {token ? (
            <View style={styles.inviteBadge}>
              <Text style={styles.inviteText}>🔗 Joining via invite link</Text>
            </View>
          ) : null}
        </View>

        {/* Nickname Input */}
        <View style={styles.formContainer}>
          <Text style={styles.label}>Enter Chat room as:</Text>
          <TextInput
            style={styles.input}
            value={nickname}
            onChangeText={(t) => { setLocalNickname(t); setError(""); }}
            placeholder="Your nickname"
            placeholderTextColor="#888"
            maxLength={20}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={handleJoin}
          />
          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[styles.joinButton, isJoining && styles.joinButtonDisabled]}
              onPress={handleJoin}
              disabled={isJoining}
            >
              {isJoining ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.joinButtonText}>Go to Room</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Chat Rules */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            By joining, you agree to be respectful to all users.
          </Text>
          <Text style={styles.footerNote}>
            Numbers next to chatters tell you how many are in the room.
          </Text>
        </View>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 20,
  },
  logoContainer: {
    alignItems: "center",
    marginBottom: 24,
  },
  logo: {
    width: 180,
    height: 80,
  },
  tagline: {
    color: "#aaa",
    fontSize: 13,
    marginTop: 4,
    fontStyle: "italic",
  },
  roomInfoBox: {
    backgroundColor: "#1a1a1a",
    borderWidth: 1,
    borderColor: "#333",
    borderRadius: 6,
    padding: 14,
    marginBottom: 20,
  },
  roomInfoTitle: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 15,
    marginBottom: 4,
  },
  roomInfoDesc: {
    color: "#aaa",
    fontSize: 13,
    lineHeight: 18,
  },
  inviteBadge: {
    marginTop: 8,
    backgroundColor: "#7B0099",
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: "flex-start",
  },
  inviteText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  formContainer: {
    backgroundColor: "#111",
    borderWidth: 1,
    borderColor: "#333",
    borderRadius: 6,
    padding: 16,
    marginBottom: 16,
  },
  label: {
    color: "#ccc",
    fontSize: 13,
    marginBottom: 8,
    fontWeight: "600",
  },
  input: {
    backgroundColor: "#fff",
    color: "#000",
    borderWidth: 1,
    borderColor: "#555",
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 15,
    marginBottom: 10,
  },
  errorText: {
    color: "#FF4444",
    fontSize: 12,
    marginBottom: 8,
  },
  buttonRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
  },
  joinButton: {
    backgroundColor: "#7B0099",
    paddingHorizontal: 20,
    paddingVertical: 9,
    borderRadius: 4,
    minWidth: 110,
    alignItems: "center",
  },
  joinButtonDisabled: {
    opacity: 0.6,
  },
  joinButtonText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 14,
  },
  footer: {
    alignItems: "center",
    paddingHorizontal: 10,
  },
  footerText: {
    color: "#666",
    fontSize: 11,
    textAlign: "center",
    marginBottom: 4,
  },
  footerNote: {
    color: "#555",
    fontSize: 11,
    textAlign: "center",
    lineHeight: 16,
  },
});
