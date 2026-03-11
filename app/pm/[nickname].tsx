import { useState, useRef, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Animated,
  Alert,
  Image,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useChat, ChatMessage } from "@/lib/chat-context";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { VideoView, useVideoPlayer } from "expo-video";
import { getApiBaseUrl } from "@/constants/oauth";

// ── Video Message ─────────────────────────────────────────────────────────────

function VideoMessageItem({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (p) => { p.loop = true; });
  return (
    <VideoView player={player} style={styles.mediaVideo} allowsFullscreen contentFit="cover" />
  );
}

// ── Message Bubble ────────────────────────────────────────────────────────────

interface SecretMsg extends ChatMessage { burned?: boolean; }

function PMMessageItem({
  msg, myNickname, secretMode, burnSeconds, onBurned,
}: {
  msg: SecretMsg; myNickname: string; secretMode: boolean; burnSeconds: number; onBurned: (id: number) => void;
}) {
  const isMe = msg.senderNickname === myNickname;
  const [opacity] = useState(new Animated.Value(1));
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const burnTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasStartedBurn = useRef(false);

  const isMediaMsg = msg.content.startsWith("📷media:");
  const isSecretMsg = msg.content.startsWith("🔐secret:");
  const isSecretMedia = msg.content.startsWith("🔐secretmedia:");
  const shouldBurn = secretMode || isSecretMsg || isSecretMedia;

  useEffect(() => {
    if (!shouldBurn || hasStartedBurn.current || msg.burned) return;
    hasStartedBurn.current = true;
    let remaining = burnSeconds;
    setTimeLeft(remaining);
    burnTimerRef.current = setInterval(() => {
      remaining -= 1;
      setTimeLeft(remaining);
      if (remaining <= 0) {
        if (burnTimerRef.current) clearInterval(burnTimerRef.current);
        Animated.timing(opacity, { toValue: 0, duration: 600, useNativeDriver: true })
          .start(() => onBurned(msg.id));
      }
    }, 1000);
    return () => { if (burnTimerRef.current) clearInterval(burnTimerRef.current); };
  }, [shouldBurn]);

  if (msg.burned) return null;

  let displayText: string | null = null;
  let mediaUrl: string | null = null;
  let mediaType: "image" | "video" | null = null;

  if (isMediaMsg) {
    const parts = msg.content.slice("📷media:".length).split("|");
    mediaUrl = parts[0]; mediaType = (parts[1] as "image" | "video") || "image";
  } else if (isSecretMedia) {
    const parts = msg.content.slice("🔐secretmedia:".length).split("|");
    mediaUrl = parts[0]; mediaType = (parts[1] as "image" | "video") || "image";
  } else if (isSecretMsg) {
    displayText = msg.content.slice("🔐secret:".length);
  } else {
    displayText = msg.content;
  }

  return (
    <Animated.View style={[styles.msgRow, isMe ? styles.msgRowMe : styles.msgRowThem, { opacity }]}>
      {!isMe && (
        <View style={styles.avatarCircle}>
          <Text style={styles.avatarText}>{(msg.senderNickname || "?")[0].toUpperCase()}</Text>
        </View>
      )}
      <View style={[
        styles.msgBubble,
        isMe ? styles.msgBubbleMe : styles.msgBubbleThem,
        shouldBurn && styles.msgBubbleSecret,
        mediaUrl && styles.msgBubbleMedia,
      ]}>
        {mediaUrl && mediaType === "image" && (
          <Image source={{ uri: mediaUrl }} style={styles.mediaImage} resizeMode="cover" />
        )}
        {mediaUrl && mediaType === "video" && <VideoMessageItem uri={mediaUrl} />}
        {displayText && (
          <Text style={[styles.msgContent, isMe ? styles.msgContentMe : styles.msgContentThem]}>
            {displayText}
          </Text>
        )}
        <View style={styles.msgFooter}>
          <Text style={[styles.msgTime, isMe ? styles.msgTimeMe : styles.msgTimeThem]}>
            {new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </Text>
          {shouldBurn && timeLeft !== null && timeLeft > 0 && (
            <Text style={styles.burnTimer}>🔥 {timeLeft}s</Text>
          )}
          {shouldBurn && <Text style={styles.secretBadge}>🔐</Text>}
        </View>
      </View>
    </Animated.View>
  );
}

// ── PM Screen ─────────────────────────────────────────────────────────────────

export default function PrivateMessageScreen() {
  const { nickname: targetNickname } = useLocalSearchParams<{ nickname: string }>();
  const router = useRouter();
  const { nickname: myNickname, privateMessages, sendPrivateMessage, users } = useChat();
  const [inputText, setInputText] = useState("");
  const [secretMode, setSecretMode] = useState(false);
  const [burnSeconds, setBurnSeconds] = useState(10);
  const [showBurnPicker, setShowBurnPicker] = useState(false);
  const [showMediaMenu, setShowMediaMenu] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [burnedIds, setBurnedIds] = useState<Set<number>>(new Set());
  const flatListRef = useRef<FlatList>(null);

  const rawMessages: SecretMsg[] = (privateMessages[targetNickname] || []).map((m) => ({
    ...m, burned: burnedIds.has(m.id),
  }));

  const isTargetOnline = users.some((u) => u.nickname === targetNickname);

  useEffect(() => {
    if (rawMessages.length > 0) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [rawMessages.length]);

  const handleBurned = useCallback((id: number) => {
    setBurnedIds((prev) => new Set([...prev, id]));
  }, []);

  const handleSend = useCallback(() => {
    const text = inputText.trim();
    if (!text || !targetNickname) return;
    const payload = secretMode ? `🔐secret:${text}` : text;
    sendPrivateMessage(targetNickname, payload);
    setInputText("");
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [inputText, targetNickname, sendPrivateMessage, secretMode]);

  const uploadAndSend = useCallback(async (uri: string, mimeType: string, isSecret: boolean) => {
    if (!myNickname || !targetNickname) return;
    setUploading(true);
    setShowMediaMenu(false);
    try {
      const apiBase = getApiBaseUrl();
      const isVideo = mimeType.startsWith("video/");
      const ext = mimeType.split("/")[1]?.replace("quicktime", "mov") || (isVideo ? "mp4" : "jpg");
      const formData = new FormData();
      formData.append("file", { uri, name: `media_${Date.now()}.${ext}`, type: mimeType } as unknown as Blob);
      formData.append("sender", myNickname);
      formData.append("isSecret", isSecret ? "true" : "false");
      const response = await fetch(`${apiBase}/api/upload-media`, { method: "POST", body: formData });
      const data = await response.json();
      if (data.success && data.url) {
        const mediaType = isVideo ? "video" : "image";
        const prefix = isSecret ? "🔐secretmedia:" : "📷media:";
        sendPrivateMessage(targetNickname, `${prefix}${data.url}|${mediaType}`);
        if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        Alert.alert("Upload failed", data.error || "Could not upload media.");
      }
    } catch {
      Alert.alert("Upload error", "Could not upload media. Please try again.");
    } finally {
      setUploading(false);
    }
  }, [myNickname, targetNickname, sendPrivateMessage]);

  const pickFromGallery = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsEditing: false, quality: 0.8, videoMaxDuration: 120,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      await uploadAndSend(asset.uri, asset.mimeType || (asset.type === "video" ? "video/mp4" : "image/jpeg"), secretMode);
    }
  }, [secretMode, uploadAndSend]);

  const takePhoto = useCallback(async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") { Alert.alert("Permission needed", "Camera permission is required."); return; }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
    if (!result.canceled && result.assets[0]) {
      await uploadAndSend(result.assets[0].uri, result.assets[0].mimeType || "image/jpeg", secretMode);
    }
  }, [secretMode, uploadAndSend]);

  const toggleSecretMode = useCallback(() => {
    const next = !secretMode;
    setSecretMode(next);
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (next) Alert.alert("🔐 Secret Mode", `Messages disappear after ${burnSeconds}s.`, [{ text: "Got it" }]);
  }, [secretMode, burnSeconds]);

  const BURN_OPTIONS = [5, 10, 30, 60];

  return (
    <ScreenContainer
      containerClassName="bg-white"
      className="bg-white"
      edges={["top", "left", "right"]}
    >
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>

        {/* ── Header ── */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backArrow}>‹</Text>
            <Text style={styles.backLabel}>Back</Text>
          </TouchableOpacity>

          <View style={styles.headerCenter}>
            <View style={styles.headerAvatar}>
              <Text style={styles.headerAvatarText}>{(targetNickname || "?")[0].toUpperCase()}</Text>
            </View>
            <View>
              <Text style={styles.headerName}>{targetNickname}</Text>
              <View style={styles.headerStatusRow}>
                <View style={[styles.statusDot, isTargetOnline ? styles.dotOnline : styles.dotOffline]} />
                <Text style={styles.headerStatus}>{isTargetOnline ? "Online" : "Offline"}</Text>
              </View>
            </View>
          </View>

          <View style={styles.headerRight}>
            <Text style={styles.e2eeLabel}>🔒 E2EE</Text>
          </View>
        </View>

        {/* ── Secret Mode Bar ── */}
        <View style={[styles.secretBar, secretMode && styles.secretBarActive]}>
          <TouchableOpacity style={styles.secretToggle} onPress={toggleSecretMode}>
            <Text style={styles.secretIcon}>{secretMode ? "🔐" : "🔓"}</Text>
            <Text style={[styles.secretText, secretMode && styles.secretTextActive]}>
              {secretMode ? "Secret Mode ON" : "Secret Mode"}
            </Text>
          </TouchableOpacity>
          {secretMode && (
            <TouchableOpacity style={styles.burnBtn} onPress={() => setShowBurnPicker((v) => !v)}>
              <Text style={styles.burnBtnText}>🔥 {burnSeconds}s ▾</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ── Burn Timer Picker ── */}
        {showBurnPicker && (
          <View style={styles.burnRow}>
            {BURN_OPTIONS.map((sec) => (
              <TouchableOpacity
                key={sec}
                style={[styles.burnOption, burnSeconds === sec && styles.burnOptionActive]}
                onPress={() => { setBurnSeconds(sec); setShowBurnPicker(false); }}
              >
                <Text style={[styles.burnOptionText, burnSeconds === sec && styles.burnOptionTextActive]}>{sec}s</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* ── Media Menu ── */}
        {showMediaMenu && (
          <View style={styles.mediaMenu}>
            <TouchableOpacity style={styles.mediaMenuBtn} onPress={pickFromGallery}>
              <Text style={styles.mediaMenuIcon}>🖼️</Text>
              <Text style={styles.mediaMenuLabel}>Gallery</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.mediaMenuBtn} onPress={takePhoto}>
              <Text style={styles.mediaMenuIcon}>📷</Text>
              <Text style={styles.mediaMenuLabel}>Camera</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.mediaMenuClose} onPress={() => setShowMediaMenu(false)}>
              <Text style={styles.mediaMenuCloseText}>✕</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Upload Progress ── */}
        {uploading && (
          <View style={styles.uploadBar}>
            <ActivityIndicator size="small" color="#7B0099" />
            <Text style={styles.uploadText}>Uploading...</Text>
          </View>
        )}

        {/* ── Messages ── */}
        {rawMessages.filter((m) => !m.burned).length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>💬</Text>
            <Text style={styles.emptyTitle}>Start a conversation</Text>
            <Text style={styles.emptySubtitle}>Send a private message to {targetNickname}</Text>
            <Text style={styles.emptyE2ee}>🔒 End-to-end encrypted</Text>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={rawMessages}
            keyExtractor={(item, idx) => `${item.id}-${idx}`}
            renderItem={({ item }) => (
              <PMMessageItem
                msg={item}
                myNickname={myNickname || ""}
                secretMode={secretMode}
                burnSeconds={burnSeconds}
                onBurned={handleBurned}
              />
            )}
            style={styles.messageList}
            contentContainerStyle={styles.messageListContent}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
            showsVerticalScrollIndicator={false}
          />
        )}

        {/* ── Input Bar ── */}
        <View style={[styles.inputBar, secretMode && styles.inputBarSecret]}>
          <TouchableOpacity style={styles.attachBtn} onPress={() => setShowMediaMenu((v) => !v)}>
            <Text style={styles.attachIcon}>{secretMode ? "🔐" : "📎"}</Text>
          </TouchableOpacity>
          <TextInput
            style={[styles.input, secretMode && styles.inputSecret]}
            value={inputText}
            onChangeText={setInputText}
            placeholder={secretMode ? "Secret message..." : `Message ${targetNickname}...`}
            placeholderTextColor={secretMode ? "#AA7700" : "#999"}
            returnKeyType="send"
            onSubmitEditing={handleSend}
            multiline={false}
          />
          <TouchableOpacity
            style={[styles.sendBtn, !inputText.trim() && styles.sendBtnDisabled, secretMode && styles.sendBtnSecret]}
            onPress={handleSend}
            disabled={!inputText.trim()}
          >
            <Text style={styles.sendBtnText}>▶</Text>
          </TouchableOpacity>
        </View>

        {/* ── Footer ── */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>© Later. All rights reserved. | Secured with E2EE</Text>
        </View>

      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#7B0099",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 2,
    borderBottomColor: "#FFD700",
  },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingRight: 8,
    minWidth: 60,
  },
  backArrow: {
    color: "#FFD700",
    fontSize: 28,
    lineHeight: 28,
    fontWeight: "300",
    marginTop: -2,
  },
  backLabel: {
    color: "#FFD700",
    fontSize: 14,
    fontWeight: "600",
  },
  headerCenter: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  headerAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#FFD700",
    alignItems: "center",
    justifyContent: "center",
  },
  headerAvatarText: {
    color: "#7B0099",
    fontWeight: "900",
    fontSize: 16,
  },
  headerName: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 16,
    textAlign: "center",
  },
  headerStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    marginTop: 1,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  dotOnline: { backgroundColor: "#00E676" },
  dotOffline: { backgroundColor: "#888" },
  headerStatus: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 11,
  },
  headerRight: {
    minWidth: 60,
    alignItems: "flex-end",
  },
  e2eeLabel: {
    color: "#00E676",
    fontSize: 10,
    fontWeight: "700",
  },

  // Secret mode bar
  secretBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#F8F8F8",
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E5E5",
  },
  secretBarActive: {
    backgroundColor: "#FFF3E0",
    borderBottomColor: "#FF6600",
  },
  secretToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  secretIcon: { fontSize: 15 },
  secretText: { color: "#888", fontSize: 12, fontWeight: "600" },
  secretTextActive: { color: "#FF6600" },
  burnBtn: {
    backgroundColor: "#FF6600",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  burnBtnText: { color: "#fff", fontSize: 12, fontWeight: "700" },

  // Burn picker
  burnRow: {
    flexDirection: "row",
    backgroundColor: "#FFF3E0",
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#FFD0A0",
  },
  burnOption: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#DDD",
    backgroundColor: "#FFF",
  },
  burnOptionActive: { backgroundColor: "#FF6600", borderColor: "#FF6600" },
  burnOptionText: { color: "#666", fontSize: 13, fontWeight: "600" },
  burnOptionTextActive: { color: "#fff" },

  // Media menu
  mediaMenu: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F0F0F0",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#DDD",
    gap: 10,
  },
  mediaMenuBtn: {
    alignItems: "center",
    backgroundColor: "#FFF",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 4,
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },
  mediaMenuIcon: { fontSize: 22 },
  mediaMenuLabel: { color: "#555", fontSize: 11 },
  mediaMenuClose: { marginLeft: "auto", padding: 8 },
  mediaMenuCloseText: { color: "#999", fontSize: 18 },

  // Upload bar
  uploadBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F3E5F5",
    paddingVertical: 7,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#E1BEE7",
  },
  uploadText: { color: "#7B0099", fontSize: 12, fontWeight: "600" },

  // Empty state
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#FAFAFA",
    gap: 6,
  },
  emptyIcon: { fontSize: 48, marginBottom: 8 },
  emptyTitle: { color: "#333", fontSize: 17, fontWeight: "700" },
  emptySubtitle: { color: "#888", fontSize: 13 },
  emptyE2ee: { color: "#00A060", fontSize: 12, fontWeight: "600", marginTop: 8 },

  // Messages
  messageList: { flex: 1, backgroundColor: "#FAFAFA" },
  messageListContent: { padding: 14, paddingBottom: 20, gap: 6 },
  msgRow: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  msgRowMe: { justifyContent: "flex-end" },
  msgRowThem: { justifyContent: "flex-start" },
  avatarCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#7B0099",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  avatarText: { color: "#FFD700", fontWeight: "700", fontSize: 13 },
  msgBubble: {
    maxWidth: "72%",
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  msgBubbleMe: {
    backgroundColor: "#7B0099",
    borderBottomRightRadius: 4,
  },
  msgBubbleThem: {
    backgroundColor: "#FFFFFF",
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: "#E5E5E5",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  msgBubbleSecret: { borderWidth: 1.5, borderColor: "#FF6600" },
  msgBubbleMedia: { paddingHorizontal: 4, paddingVertical: 4 },
  mediaImage: { width: 200, height: 200, borderRadius: 14 },
  mediaVideo: { width: 200, height: 150, borderRadius: 14 },
  msgContent: { fontSize: 15, lineHeight: 21 },
  msgContentMe: { color: "#FFFFFF" },
  msgContentThem: { color: "#1A1A1A" },
  msgFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 5,
    marginTop: 3,
  },
  msgTime: { fontSize: 10 },
  msgTimeMe: { color: "rgba(255,255,255,0.55)" },
  msgTimeThem: { color: "#AAAAAA" },
  burnTimer: { fontSize: 10, color: "#FF6600", fontWeight: "700" },
  secretBadge: { fontSize: 10 },

  // Input bar
  inputBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: "#E5E5E5",
    gap: 8,
  },
  inputBarSecret: {
    backgroundColor: "#FFF8F0",
    borderTopColor: "#FF6600",
  },
  attachBtn: { padding: 6 },
  attachIcon: { fontSize: 22 },
  input: {
    flex: 1,
    backgroundColor: "#F5F5F5",
    color: "#1A1A1A",
    borderWidth: 1,
    borderColor: "#E0E0E0",
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 9,
    fontSize: 15,
  },
  inputSecret: {
    backgroundColor: "#FFF3E0",
    borderColor: "#FF9800",
    color: "#5D2600",
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#7B0099",
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnDisabled: { backgroundColor: "#DDD" },
  sendBtnSecret: { backgroundColor: "#FF6600" },
  sendBtnText: { color: "#FFF", fontSize: 16, fontWeight: "700", marginLeft: 2 },

  // Footer
  footer: {
    backgroundColor: "#FAFAFA",
    paddingVertical: 5,
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "#F0F0F0",
  },
  footerText: { color: "#CCCCCC", fontSize: 9 },
});
