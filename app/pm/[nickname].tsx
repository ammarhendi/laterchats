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

// ── Media Message Item ────────────────────────────────────────────────────────

function VideoMessageItem({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
  });
  return (
    <VideoView
      player={player}
      style={styles.mediaVideo}
      allowsFullscreen
      contentFit="cover"
    />
  );
}

// ── Secret Mode Message Item ──────────────────────────────────────────────────

interface SecretMsg extends ChatMessage {
  burned?: boolean;
}

function PMMessageItem({
  msg,
  myNickname,
  secretMode,
  burnSeconds,
  onBurned,
}: {
  msg: SecretMsg;
  myNickname: string;
  secretMode: boolean;
  burnSeconds: number;
  onBurned: (id: number) => void;
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
        Animated.timing(opacity, {
          toValue: 0,
          duration: 600,
          useNativeDriver: true,
        }).start(() => onBurned(msg.id));
      }
    }, 1000);
    return () => { if (burnTimerRef.current) clearInterval(burnTimerRef.current); };
  }, [shouldBurn]);

  if (msg.burned) return null;

  // Parse content
  let displayText: string | null = null;
  let mediaUrl: string | null = null;
  let mediaType: "image" | "video" | null = null;

  if (isMediaMsg) {
    const parts = msg.content.slice("📷media:".length).split("|");
    mediaUrl = parts[0];
    mediaType = (parts[1] as "image" | "video") || "image";
  } else if (isSecretMedia) {
    const parts = msg.content.slice("🔐secretmedia:".length).split("|");
    mediaUrl = parts[0];
    mediaType = (parts[1] as "image" | "video") || "image";
  } else if (isSecretMsg) {
    displayText = msg.content.slice("🔐secret:".length);
  } else {
    displayText = msg.content;
  }

  return (
    <Animated.View style={[styles.msgRow, isMe ? styles.msgRowMe : styles.msgRowThem, { opacity }]}>
      <View style={[
        styles.msgBubble,
        isMe ? styles.msgBubbleMe : styles.msgBubbleThem,
        shouldBurn && styles.msgBubbleSecret,
        mediaUrl && styles.msgBubbleMedia,
      ]}>
        {!isMe && <Text style={styles.msgSender}>{msg.senderNickname}</Text>}

        {mediaUrl && mediaType === "image" && (
          <Image source={{ uri: mediaUrl }} style={styles.mediaImage} resizeMode="cover" />
        )}
        {mediaUrl && mediaType === "video" && (
          <VideoMessageItem uri={mediaUrl} />
        )}

        {displayText && (
          <Text style={[styles.msgContent, isMe ? styles.msgContentMe : styles.msgContentThem]}>
            {displayText}
          </Text>
        )}

        <View style={styles.msgFooter}>
          <Text style={styles.msgTime}>
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
    ...m,
    burned: burnedIds.has(m.id),
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

  // Upload media to server and send as PM
  const uploadAndSend = useCallback(async (uri: string, mimeType: string, isSecret: boolean) => {
    if (!myNickname || !targetNickname) return;
    setUploading(true);
    setShowMediaMenu(false);
    try {
      const apiBase = getApiBaseUrl();
      const isVideo = mimeType.startsWith("video/");
      const ext = mimeType.split("/")[1]?.replace("quicktime", "mov") || (isVideo ? "mp4" : "jpg");
      const formData = new FormData();
      formData.append("file", {
        uri,
        name: `media_${Date.now()}.${ext}`,
        type: mimeType,
      } as unknown as Blob);
      formData.append("sender", myNickname);
      formData.append("isSecret", isSecret ? "true" : "false");

      const response = await fetch(`${apiBase}/api/upload-media`, {
        method: "POST",
        body: formData,
      });
      const data = await response.json();
      if (data.success && data.url) {
        const mediaType = isVideo ? "video" : "image";
        const prefix = isSecret ? "🔐secretmedia:" : "📷media:";
        sendPrivateMessage(targetNickname, `${prefix}${data.url}|${mediaType}`);
        if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        Alert.alert("Upload failed", data.error || "Could not upload media.");
      }
    } catch (err) {
      Alert.alert("Upload error", "Could not upload media. Please try again.");
    } finally {
      setUploading(false);
    }
  }, [myNickname, targetNickname, sendPrivateMessage]);

  const pickFromGallery = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsEditing: false,
      quality: 0.8,
      videoMaxDuration: 120,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      const mimeType = asset.mimeType || (asset.type === "video" ? "video/mp4" : "image/jpeg");
      await uploadAndSend(asset.uri, mimeType, secretMode);
    }
  }, [secretMode, uploadAndSend]);

  const takePhoto = useCallback(async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Camera permission is required to take photos.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      await uploadAndSend(asset.uri, asset.mimeType || "image/jpeg", secretMode);
    }
  }, [secretMode, uploadAndSend]);

  const recordSecretVideo = useCallback(async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Camera permission is required to record video.");
      return;
    }
    Alert.alert(
      "🔐 Secret Video",
      "Record a short video. It will auto-burn after viewing and is never stored permanently.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Record",
          onPress: async () => {
            const result = await ImagePicker.launchCameraAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Videos,
              allowsEditing: true,
              videoMaxDuration: 30,
              quality: ImagePicker.UIImagePickerControllerQualityType.Medium,
            });
            if (!result.canceled && result.assets[0]) {
              const asset = result.assets[0];
              await uploadAndSend(asset.uri, asset.mimeType || "video/mp4", true);
            }
          },
        },
      ]
    );
  }, [uploadAndSend]);

  const toggleSecretMode = useCallback(() => {
    const next = !secretMode;
    setSecretMode(next);
    if (Platform.OS !== "web") {
      Haptics.notificationAsync(
        next ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning
      );
    }
    if (next) {
      Alert.alert(
        "🔐 Secret Mode Activated",
        `Messages and media will disappear after ${burnSeconds} seconds. Nothing is stored on the server.`,
        [{ text: "Got it" }]
      );
    }
  }, [secretMode, burnSeconds]);

  const BURN_OPTIONS = [5, 10, 30, 60];

  return (
    <ScreenContainer containerClassName="bg-black" className="bg-black" edges={["top", "left", "right"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {/* Yahoo Messenger-style window header */}
        <View style={styles.ymHeader}>
          {/* Title bar */}
          <View style={styles.ymTitleBar}>
            <Text style={styles.ymTitleBarText}>💬 {targetNickname} - Instant Message</Text>
            <TouchableOpacity onPress={() => router.back()} style={styles.ymCloseBtn}>
              <Text style={styles.ymCloseBtnText}>✕</Text>
            </TouchableOpacity>
          </View>
          {/* Contact info bar */}
          <View style={styles.ymContactBar}>
            <View style={styles.ymContactLeft}>
              <View style={[styles.ymStatusDot, isTargetOnline ? styles.ymDotOnline : styles.ymDotOffline]} />
              <View>
                <Text style={styles.ymContactName}>{targetNickname}</Text>
                <Text style={styles.ymContactStatus}>{isTargetOnline ? "Online" : "Offline"}</Text>
              </View>
            </View>
            <View style={styles.ymContactRight}>
              <Text style={styles.ymE2eeLabel}>🔒 E2EE</Text>
              <Text style={styles.ymLaterLogo}>Later!</Text>
            </View>
          </View>
        </View>

        {/* Secret Mode Toggle Bar */}
        <View style={[styles.secretBar, secretMode && styles.secretBarActive]}>
          <TouchableOpacity style={styles.secretToggle} onPress={toggleSecretMode}>
            <Text style={styles.secretToggleIcon}>{secretMode ? "🔐" : "🔓"}</Text>
            <Text style={[styles.secretToggleText, secretMode && styles.secretToggleTextActive]}>
              {secretMode ? "Secret Mode ON" : "Secret Mode OFF"}
            </Text>
          </TouchableOpacity>
          {secretMode && (
            <TouchableOpacity style={styles.burnPickerBtn} onPress={() => setShowBurnPicker((v) => !v)}>
              <Text style={styles.burnPickerBtnText}>🔥 {burnSeconds}s ▾</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Burn Timer Picker */}
        {showBurnPicker && (
          <View style={styles.burnPickerRow}>
            {BURN_OPTIONS.map((sec) => (
              <TouchableOpacity
                key={sec}
                style={[styles.burnOption, burnSeconds === sec && styles.burnOptionSelected]}
                onPress={() => { setBurnSeconds(sec); setShowBurnPicker(false); }}
              >
                <Text style={[styles.burnOptionText, burnSeconds === sec && styles.burnOptionTextSelected]}>
                  {sec}s
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* PM Notice */}
        <View style={styles.pmNotice}>
          <Text style={styles.pmNoticeText}>
            🔒 End-to-end encrypted. Only you and{" "}
            <Text style={styles.pmNoticeNick}>{targetNickname}</Text> can read these messages.
          </Text>
        </View>

        {/* Media Menu */}
        {showMediaMenu && (
          <View style={styles.mediaMenu}>
            <TouchableOpacity style={styles.mediaMenuBtn} onPress={pickFromGallery}>
              <Text style={styles.mediaMenuIcon}>🖼️</Text>
              <Text style={styles.mediaMenuText}>Gallery</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.mediaMenuBtn} onPress={takePhoto}>
              <Text style={styles.mediaMenuIcon}>📷</Text>
              <Text style={styles.mediaMenuText}>Camera</Text>
            </TouchableOpacity>
            {secretMode && (
              <TouchableOpacity style={[styles.mediaMenuBtn, styles.mediaMenuBtnSecret]} onPress={recordSecretVideo}>
                <Text style={styles.mediaMenuIcon}>🎥</Text>
                <Text style={[styles.mediaMenuText, styles.mediaMenuTextSecret]}>Secret Video</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.mediaMenuCloseBtn} onPress={() => setShowMediaMenu(false)}>
              <Text style={styles.mediaMenuCloseText}>✕</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Upload indicator */}
        {uploading && (
          <View style={styles.uploadingBar}>
            <ActivityIndicator size="small" color="#FFD700" />
            <Text style={styles.uploadingText}>Uploading media...</Text>
          </View>
        )}

        {/* Messages */}
        {rawMessages.filter((m) => !m.burned).length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No messages yet.</Text>
            <Text style={styles.emptySubText}>Send a private message to {targetNickname}</Text>
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
            showsVerticalScrollIndicator={true}
          />
        )}

        {/* Input */}
        <View style={[styles.inputRow, secretMode && styles.inputRowSecret]}>
          <TouchableOpacity
            style={styles.mediaBtn}
            onPress={() => setShowMediaMenu((v) => !v)}
          >
            <Text style={styles.mediaBtnText}>{secretMode ? "🔐" : "📎"}</Text>
          </TouchableOpacity>
          <TextInput
            style={styles.chatInput}
            value={inputText}
            onChangeText={setInputText}
            placeholder={secretMode ? `Secret message to ${targetNickname}...` : `Message ${targetNickname}...`}
            placeholderTextColor="#666"
            returnKeyType="send"
            onSubmitEditing={handleSend}
            multiline={false}
          />
          <TouchableOpacity style={[styles.sendBtn, secretMode && styles.sendBtnSecret]} onPress={handleSend}>
            <Text style={styles.sendBtnText}>Send</Text>
          </TouchableOpacity>
        </View>

        {/* Copyright */}
        <View style={styles.copyrightBar}>
          <Text style={styles.copyrightText}>© Later. All rights reserved. | Secured with E2EE</Text>
        </View>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  // Yahoo Messenger-style header
  ymHeader: {
    backgroundColor: "#7B0099",
    borderBottomWidth: 2,
    borderBottomColor: "#FFD700",
  },
  ymTitleBar: {
    backgroundColor: "#5A0070",
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  ymTitleBarText: {
    color: "#FFD700",
    fontSize: 12,
    fontWeight: "700" as const,
    flex: 1,
  },
  ymCloseBtn: {
    backgroundColor: "#CC0000",
    width: 22,
    height: 22,
    borderRadius: 3,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    marginLeft: 8,
  },
  ymCloseBtnText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "900" as const,
    lineHeight: 16,
  },
  ymContactBar: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#7B0099",
  },
  ymContactLeft: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 10,
  },
  ymStatusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.3)",
  },
  ymDotOnline: { backgroundColor: "#00FF00" },
  ymDotOffline: { backgroundColor: "#888888" },
  ymContactName: {
    color: "#FFFFFF",
    fontWeight: "bold" as const,
    fontSize: 15,
  },
  ymContactStatus: {
    color: "rgba(255,255,255,0.65)",
    fontSize: 11,
  },
  ymContactRight: {
    alignItems: "flex-end" as const,
    gap: 2,
  },
  ymE2eeLabel: {
    color: "#00FF88",
    fontSize: 10,
    fontWeight: "700" as const,
  },
  ymLaterLogo: {
    color: "#FFD700",
    fontWeight: "900" as const,
    fontSize: 13,
    letterSpacing: -0.3,
  },
  // Legacy (unused but kept for reference)
  header: {
    backgroundColor: "#7B0099",
    flexDirection: "row" as const,
    alignItems: "center" as const,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 2,
    borderBottomColor: "#FFD700",
  },
  backBtn: { paddingRight: 10 },
  backBtnText: { color: "#FFD700", fontSize: 14, fontWeight: "600" as const },
  headerCenter: { flex: 1, flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "center" as const, gap: 6 },
  onlineDot: { width: 8, height: 8, borderRadius: 4 },
  dotOnline: { backgroundColor: "#00FF00" },
  dotOffline: { backgroundColor: "#888" },
  headerTitle: { color: "#fff", fontWeight: "bold" as const, fontSize: 16 },
  headerRight: { paddingLeft: 10 },
  e2eeLabel: { color: "#00FF88", fontSize: 11, fontWeight: "700" as const },
  secretBar: {
    backgroundColor: "#1a0a1a",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#330033",
  },
  secretBarActive: { backgroundColor: "#1a0a00", borderBottomColor: "#FF6600" },
  secretToggle: { flexDirection: "row", alignItems: "center", gap: 6 },
  secretToggleIcon: { fontSize: 16 },
  secretToggleText: { color: "#888", fontSize: 12, fontWeight: "600" },
  secretToggleTextActive: { color: "#FF6600" },
  burnPickerBtn: { backgroundColor: "#FF6600", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  burnPickerBtnText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  burnPickerRow: {
    flexDirection: "row",
    backgroundColor: "#111",
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#333",
  },
  burnOption: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: "#555", backgroundColor: "#222" },
  burnOptionSelected: { backgroundColor: "#FF6600", borderColor: "#FF6600" },
  burnOptionText: { color: "#aaa", fontSize: 13, fontWeight: "600" },
  burnOptionTextSelected: { color: "#fff" },
  pmNotice: { backgroundColor: "#1a0a1a", paddingHorizontal: 12, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: "#330033" },
  pmNoticeText: { color: "#888", fontSize: 11, lineHeight: 16 },
  pmNoticeNick: { color: "#FFD700", fontWeight: "bold" },
  mediaMenu: {
    backgroundColor: "#1a1a1a",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#333",
    gap: 8,
  },
  mediaMenuBtn: {
    alignItems: "center",
    backgroundColor: "#2a2a2a",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 4,
  },
  mediaMenuBtnSecret: { backgroundColor: "#2a1500", borderWidth: 1, borderColor: "#FF6600" },
  mediaMenuIcon: { fontSize: 22 },
  mediaMenuText: { color: "#ccc", fontSize: 11 },
  mediaMenuTextSecret: { color: "#FF6600" },
  mediaMenuCloseBtn: { marginLeft: "auto", padding: 8 },
  mediaMenuCloseText: { color: "#888", fontSize: 16 },
  uploadingBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#111",
    paddingVertical: 6,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#333",
  },
  uploadingText: { color: "#FFD700", fontSize: 12 },
  messageList: { flex: 1, backgroundColor: "#0a0a0a" },
  messageListContent: { padding: 12, paddingBottom: 16, gap: 8 },
  emptyContainer: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#0a0a0a" },
  emptyText: { color: "#555", fontSize: 16, marginBottom: 6 },
  emptySubText: { color: "#444", fontSize: 13 },
  msgRow: { flexDirection: "row", marginBottom: 4 },
  msgRowMe: { justifyContent: "flex-end" },
  msgRowThem: { justifyContent: "flex-start" },
  msgBubble: { maxWidth: "75%", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  msgBubbleMe: { backgroundColor: "#7B0099", borderBottomRightRadius: 2 },
  msgBubbleThem: { backgroundColor: "#222", borderBottomLeftRadius: 2, borderWidth: 1, borderColor: "#333" },
  msgBubbleSecret: { borderWidth: 1, borderColor: "#FF6600" },
  msgBubbleMedia: { paddingHorizontal: 4, paddingVertical: 4 },
  mediaImage: { width: 200, height: 200, borderRadius: 8 },
  mediaVideo: { width: 200, height: 150, borderRadius: 8 },
  msgSender: { color: "#FFD700", fontSize: 11, fontWeight: "bold", marginBottom: 2 },
  msgContent: { fontSize: 14, lineHeight: 20 },
  msgContentMe: { color: "#fff" },
  msgContentThem: { color: "#eee" },
  msgFooter: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 6, marginTop: 3 },
  msgTime: { fontSize: 10, color: "rgba(255,255,255,0.4)" },
  burnTimer: { fontSize: 10, color: "#FF6600", fontWeight: "700" },
  secretBadge: { fontSize: 10 },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#111",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: "#333",
    gap: 8,
  },
  inputRowSecret: { borderTopColor: "#FF6600", backgroundColor: "#0d0800" },
  mediaBtn: { padding: 6 },
  mediaBtnText: { fontSize: 22 },
  chatInput: {
    flex: 1,
    backgroundColor: "#fff",
    color: "#000",
    borderWidth: 1,
    borderColor: "#555",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 14,
  },
  sendBtn: { backgroundColor: "#7B0099", paddingHorizontal: 16, paddingVertical: 9, borderRadius: 20 },
  sendBtnSecret: { backgroundColor: "#FF6600" },
  sendBtnText: { color: "#fff", fontWeight: "bold", fontSize: 13 },
  copyrightBar: { backgroundColor: "#0a0a0a", paddingVertical: 4, alignItems: "center", borderTopWidth: 1, borderTopColor: "#1a1a1a" },
  copyrightText: { color: "#333", fontSize: 9 },
});
