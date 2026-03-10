import { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Share,
  Alert,
  ScrollView,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { trpc } from "@/lib/trpc";
import { useChat } from "@/lib/chat-context";
import * as Clipboard from "expo-clipboard";

const APP_SCHEME = "manus";

function getInviteUrl(token: string): string {
  // Deep link URL for the app
  if (Platform.OS === "web") {
    return `${window.location.origin}/?token=${token}`;
  }
  return `exp://later/?token=${token}`;
}

function formatExpiry(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function timeUntilExpiry(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const diff = d.getTime() - Date.now();
  if (diff <= 0) return "Expired";
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 0) return `${hours}h ${mins}m remaining`;
  return `${mins}m remaining`;
}

export default function AdminScreen() {
  const router = useRouter();
  const { users, nickname, roomName, myRole, clearAllMessages } = useChat();
  const [generatedToken, setGeneratedToken] = useState<string | null>(null);
  const [generatedExpiry, setGeneratedExpiry] = useState<Date | null>(null);
  const [copied, setCopied] = useState(false);

  const generateMutation = trpc.chat.generateInvite.useMutation({
    onSuccess: (data) => {
      setGeneratedToken(data.token);
      setGeneratedExpiry(new Date(data.expiresAt));
    },
    onError: (err) => {
      Alert.alert("Error", err.message || "Failed to generate invite link. You may need to be logged in as admin.");
    },
  });

  const latestInviteQuery = trpc.chat.getLatestInvite.useQuery(undefined, {
    retry: false,
  });

  const handleGenerate = () => {
    if (myRole !== "super_admin" && myRole !== "moderator") {
      Alert.alert("Access Denied", "Only admins can generate invite links.");
      return;
    }
    generateMutation.mutate({ adminPin: "later2024" });
  };

  const handleCopy = async (token: string) => {
    const url = getInviteUrl(token);
    await Clipboard.setStringAsync(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = async (token: string) => {
    const url = getInviteUrl(token);
    try {
      await Share.share({
        message: `Come to chat now, not later.\n${url}`,
        url,
        title: "Come to chat now, not later.",
      });
    } catch (err) {
      console.error(err);
    }
  };

  const currentToken = generatedToken || latestInviteQuery.data?.token;
  const currentExpiry = generatedExpiry || (latestInviteQuery.data?.expiresAt ? new Date(latestInviteQuery.data.expiresAt) : null);

  return (
    <ScreenContainer containerClassName="bg-black" className="bg-black" edges={["top", "left", "right"]}>
      <ScrollView style={{ flex: 1 }}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backBtnText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Admin Panel</Text>
          <View style={styles.headerRight} />
        </View>

        <View style={styles.content}>
          {/* Room Status */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Room Status</Text>
            <View style={styles.statusRow}>
              <View style={styles.statusDot} />
              <Text style={styles.statusText}>{roomName ?? "Now"} — Active</Text>
            </View>
            <Text style={styles.statusSub}>{users.length} user{users.length !== 1 ? "s" : ""} currently in room</Text>
            {users.length > 0 && (
              <View style={styles.usersList}>
                {users.map((u) => (
                  <Text key={u.nickname} style={styles.userItem}>
                    {u.isVoiceActive ? "🎤" : "💬"} {u.nickname}
                    {u.nickname === nickname ? " (you)" : ""}
                  </Text>
                ))}
              </View>
            )}
          </View>

          {/* Clear Chat */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Moderation</Text>
            <Text style={styles.sectionDesc}>
              Clear all messages from the room. This will wipe the chat history for everyone currently in the room.
            </Text>
            <TouchableOpacity
              style={styles.clearBtn}
              onPress={() =>
                Alert.alert(
                  "Clear Chat",
                  "This will delete all messages in the room for everyone. Are you sure?",
                  [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "Clear",
                      style: "destructive",
                      onPress: () => {
                        clearAllMessages();
                        Alert.alert("Done", "Chat room has been cleared.");
                      },
                    },
                  ]
                )
              }
            >
              <Text style={styles.clearBtnText}>🗑️ Clear Chat Room</Text>
            </TouchableOpacity>
          </View>

          {/* Invite Link Generator */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Invite Link</Text>
            <Text style={styles.sectionDesc}>
              Generate a new invite link. Links expire after 6 hours. Share it with anyone you want to invite.
            </Text>

            <TouchableOpacity
              style={[styles.generateBtn, generateMutation.isPending && styles.generateBtnDisabled]}
              onPress={handleGenerate}
              disabled={generateMutation.isPending}
            >
              <Text style={styles.generateBtnText}>
                {generateMutation.isPending ? "Generating..." : "🔗 Generate New Invite Link"}
              </Text>
            </TouchableOpacity>

            {currentToken && currentExpiry && (
              <View style={styles.tokenBox}>
                <View style={styles.tokenHeader}>
                  <Text style={styles.tokenLabel}>Invite Link</Text>
                  <Text style={styles.tokenExpiry}>{timeUntilExpiry(currentExpiry)}</Text>
                </View>
                <Text style={styles.tokenUrl} numberOfLines={2}>
                  {getInviteUrl(currentToken)}
                </Text>
                <Text style={styles.tokenExpiryFull}>
                  Expires: {formatExpiry(currentExpiry)}
                </Text>
                <View style={styles.tokenActions}>
                  <TouchableOpacity
                    style={styles.copyBtn}
                    onPress={() => handleCopy(currentToken)}
                  >
                    <Text style={styles.copyBtnText}>
                      {copied ? "✓ Copied!" : "📋 Copy Link"}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.shareBtn}
                    onPress={() => handleShare(currentToken)}
                  >
                    <Text style={styles.shareBtnText}>📤 Share</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {latestInviteQuery.isLoading && (
              <Text style={styles.loadingText}>Loading latest invite...</Text>
            )}
          </View>

          {/* Instructions */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>How It Works</Text>
            <Text style={styles.instructionText}>
              1. Tap "Generate New Invite Link" to create a fresh link.{"\n"}
              2. Share the link with the person you want to invite.{"\n"}
              3. They tap the link to open the app and join the room.{"\n"}
              4. Links expire after 6 hours for security.{"\n"}
              5. Generate a new link whenever you need to invite someone.
            </Text>
          </View>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: "#7B0099",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 2,
    borderBottomColor: "#FFD700",
  },
  backBtn: {
    paddingRight: 10,
  },
  backBtnText: {
    color: "#FFD700",
    fontSize: 14,
    fontWeight: "600",
  },
  headerTitle: {
    flex: 1,
    color: "#fff",
    fontWeight: "bold",
    fontSize: 16,
    textAlign: "center",
  },
  headerRight: {
    width: 60,
  },
  content: {
    padding: 16,
    gap: 16,
  },
  section: {
    backgroundColor: "#111",
    borderRadius: 8,
    padding: 14,
    borderWidth: 1,
    borderColor: "#333",
    gap: 10,
  },
  sectionTitle: {
    color: "#FFD700",
    fontWeight: "bold",
    fontSize: 14,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  sectionDesc: {
    color: "#888",
    fontSize: 13,
    lineHeight: 18,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#00AA00",
  },
  statusText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  statusSub: {
    color: "#888",
    fontSize: 12,
  },
  usersList: {
    gap: 4,
  },
  userItem: {
    color: "#aaa",
    fontSize: 13,
    paddingLeft: 8,
  },
  generateBtn: {
    backgroundColor: "#7B0099",
    paddingVertical: 12,
    borderRadius: 6,
    alignItems: "center",
  },
  generateBtnDisabled: {
    opacity: 0.6,
  },
  generateBtnText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 15,
  },
  tokenBox: {
    backgroundColor: "#1a1a1a",
    borderRadius: 6,
    padding: 12,
    borderWidth: 1,
    borderColor: "#7B0099",
    gap: 8,
  },
  tokenHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  tokenLabel: {
    color: "#FFD700",
    fontWeight: "bold",
    fontSize: 12,
    textTransform: "uppercase",
  },
  tokenExpiry: {
    color: "#00AA00",
    fontSize: 12,
    fontWeight: "600",
  },
  tokenUrl: {
    color: "#aaa",
    fontSize: 11,
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
    backgroundColor: "#0a0a0a",
    padding: 8,
    borderRadius: 4,
    lineHeight: 16,
  },
  tokenExpiryFull: {
    color: "#666",
    fontSize: 11,
  },
  tokenActions: {
    flexDirection: "row",
    gap: 8,
  },
  copyBtn: {
    flex: 1,
    backgroundColor: "#333",
    paddingVertical: 9,
    borderRadius: 5,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#555",
  },
  copyBtnText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
  shareBtn: {
    flex: 1,
    backgroundColor: "#7B0099",
    paddingVertical: 9,
    borderRadius: 5,
    alignItems: "center",
  },
  shareBtnText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
  loadingText: {
    color: "#666",
    fontSize: 13,
    textAlign: "center",
  },
  instructionText: {
    color: "#888",
    fontSize: 13,
    lineHeight: 22,
  },
  clearBtn: {
    backgroundColor: "#8B0000",
    paddingVertical: 12,
    borderRadius: 6,
    alignItems: "center" as const,
    borderWidth: 1,
    borderColor: "#CC0000",
  },
  clearBtnText: {
    color: "#fff",
    fontWeight: "bold" as const,
    fontSize: 15,
  },
});
