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
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useChat, ChatMessage } from "@/lib/chat-context";
import * as Haptics from "expo-haptics";

// ── Secret Mode Message Item ──────────────────────────────────────────────────

interface SecretMsg extends ChatMessage {
  burnAt?: number; // timestamp when message should disappear
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

  // Start burn countdown when message is rendered in secret mode
  useEffect(() => {
    if (!secretMode || hasStartedBurn.current || msg.burned) return;
    hasStartedBurn.current = true;

    let remaining = burnSeconds;
    setTimeLeft(remaining);

    burnTimerRef.current = setInterval(() => {
      remaining -= 1;
      setTimeLeft(remaining);
      if (remaining <= 0) {
        if (burnTimerRef.current) clearInterval(burnTimerRef.current);
        // Fade out animation
        Animated.timing(opacity, {
          toValue: 0,
          duration: 600,
          useNativeDriver: true,
        }).start(() => {
          onBurned(msg.id);
        });
      }
    }, 1000);

    return () => {
      if (burnTimerRef.current) clearInterval(burnTimerRef.current);
    };
  }, [secretMode]);

  if (msg.burned) return null;

  return (
    <Animated.View style={[styles.msgRow, isMe ? styles.msgRowMe : styles.msgRowThem, { opacity }]}>
      <View style={[styles.msgBubble, isMe ? styles.msgBubbleMe : styles.msgBubbleThem, secretMode && styles.msgBubbleSecret]}>
        {!isMe && (
          <Text style={styles.msgSender}>{msg.senderNickname}</Text>
        )}
        <Text style={[styles.msgContent, isMe ? styles.msgContentMe : styles.msgContentThem]}>
          {msg.content}
        </Text>
        <View style={styles.msgFooter}>
          <Text style={styles.msgTime}>
            {new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </Text>
          {secretMode && timeLeft !== null && timeLeft > 0 && (
            <Text style={styles.burnTimer}>🔥 {timeLeft}s</Text>
          )}
          {secretMode && (
            <Text style={styles.secretBadge}>🔐</Text>
          )}
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
  const [burnedIds, setBurnedIds] = useState<Set<number>>(new Set());
  const flatListRef = useRef<FlatList>(null);

  const rawMessages: SecretMsg[] = (privateMessages[targetNickname] || []).map((m) => ({
    ...m,
    burned: burnedIds.has(m.id),
  }));

  const isTargetOnline = users.some((u) => u.nickname === targetNickname);

  useEffect(() => {
    if (rawMessages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [rawMessages.length]);

  const handleBurned = useCallback((id: number) => {
    setBurnedIds((prev) => new Set([...prev, id]));
  }, []);

  const handleSend = useCallback(() => {
    const text = inputText.trim();
    if (!text || !targetNickname) return;

    // In secret mode, prefix message with secret marker
    const payload = secretMode ? `🔐secret:${text}` : text;
    sendPrivateMessage(targetNickname, payload);
    setInputText("");
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, [inputText, targetNickname, sendPrivateMessage, secretMode]);

  const toggleSecretMode = useCallback(() => {
    const next = !secretMode;
    setSecretMode(next);
    if (Platform.OS !== "web") {
      Haptics.notificationAsync(
        next
          ? Haptics.NotificationFeedbackType.Success
          : Haptics.NotificationFeedbackType.Warning
      );
    }
    if (next) {
      Alert.alert(
        "🔐 Secret Mode Activated",
        `Messages will disappear after ${burnSeconds} seconds of being viewed. No messages are stored on the server in Secret Mode.`,
        [{ text: "Got it" }]
      );
    }
  }, [secretMode, burnSeconds]);

  const BURN_OPTIONS = [5, 10, 30, 60];

  // Strip the secret prefix from display
  const getDisplayContent = (content: string) => {
    if (content.startsWith("🔐secret:")) return content.slice(9);
    return content;
  };

  const isSecretMessage = (content: string) => content.startsWith("🔐secret:");

  return (
    <ScreenContainer containerClassName="bg-black" className="bg-black" edges={["top", "left", "right"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backBtnText}>← Back</Text>
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <View style={[styles.onlineDot, isTargetOnline ? styles.dotOnline : styles.dotOffline]} />
            <Text style={styles.headerTitle}>{targetNickname}</Text>
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.e2eeLabel}>🔒 E2EE</Text>
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
            <TouchableOpacity
              style={styles.burnPickerBtn}
              onPress={() => setShowBurnPicker((v) => !v)}
            >
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
                onPress={() => {
                  setBurnSeconds(sec);
                  setShowBurnPicker(false);
                }}
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

        {/* Messages */}
        {rawMessages.filter((m) => !m.burned).length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No messages yet.</Text>
            <Text style={styles.emptySubText}>
              Send a private message to {targetNickname}
            </Text>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={rawMessages}
            keyExtractor={(item, idx) => `${item.id}-${idx}`}
            renderItem={({ item }) => {
              const isSecret = isSecretMessage(item.content);
              const displayContent = getDisplayContent(item.content);
              const displayMsg = { ...item, content: displayContent };
              return (
                <PMMessageItem
                  msg={displayMsg}
                  myNickname={myNickname || ""}
                  secretMode={secretMode || isSecret}
                  burnSeconds={burnSeconds}
                  onBurned={handleBurned}
                />
              );
            }}
            style={styles.messageList}
            contentContainerStyle={styles.messageListContent}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
            showsVerticalScrollIndicator={true}
          />
        )}

        {/* Input */}
        <View style={[styles.inputRow, secretMode && styles.inputRowSecret]}>
          {secretMode && (
            <Text style={styles.secretInputIcon}>🔐</Text>
          )}
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
  headerCenter: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  onlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotOnline: { backgroundColor: "#00FF00" },
  dotOffline: { backgroundColor: "#888" },
  headerTitle: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 16,
  },
  headerRight: {
    paddingLeft: 10,
  },
  e2eeLabel: {
    color: "#00FF88",
    fontSize: 11,
    fontWeight: "700",
  },
  // Secret Mode Bar
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
  secretBarActive: {
    backgroundColor: "#1a0a00",
    borderBottomColor: "#FF6600",
  },
  secretToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  secretToggleIcon: {
    fontSize: 16,
  },
  secretToggleText: {
    color: "#888",
    fontSize: 12,
    fontWeight: "600",
  },
  secretToggleTextActive: {
    color: "#FF6600",
  },
  burnPickerBtn: {
    backgroundColor: "#FF6600",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  burnPickerBtnText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  burnPickerRow: {
    flexDirection: "row",
    backgroundColor: "#111",
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#333",
  },
  burnOption: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#555",
    backgroundColor: "#222",
  },
  burnOptionSelected: {
    backgroundColor: "#FF6600",
    borderColor: "#FF6600",
  },
  burnOptionText: {
    color: "#aaa",
    fontSize: 13,
    fontWeight: "600",
  },
  burnOptionTextSelected: {
    color: "#fff",
  },
  pmNotice: {
    backgroundColor: "#1a0a1a",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#330033",
  },
  pmNoticeText: {
    color: "#888",
    fontSize: 11,
    lineHeight: 16,
  },
  pmNoticeNick: {
    color: "#FFD700",
    fontWeight: "bold",
  },
  messageList: {
    flex: 1,
    backgroundColor: "#0a0a0a",
  },
  messageListContent: {
    padding: 12,
    paddingBottom: 16,
    gap: 8,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#0a0a0a",
  },
  emptyText: {
    color: "#555",
    fontSize: 16,
    marginBottom: 6,
  },
  emptySubText: {
    color: "#444",
    fontSize: 13,
  },
  msgRow: {
    flexDirection: "row",
    marginBottom: 4,
  },
  msgRowMe: {
    justifyContent: "flex-end",
  },
  msgRowThem: {
    justifyContent: "flex-start",
  },
  msgBubble: {
    maxWidth: "75%",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  msgBubbleMe: {
    backgroundColor: "#7B0099",
    borderBottomRightRadius: 2,
  },
  msgBubbleThem: {
    backgroundColor: "#222",
    borderBottomLeftRadius: 2,
    borderWidth: 1,
    borderColor: "#333",
  },
  msgBubbleSecret: {
    borderWidth: 1,
    borderColor: "#FF6600",
  },
  msgSender: {
    color: "#FFD700",
    fontSize: 11,
    fontWeight: "bold",
    marginBottom: 2,
  },
  msgContent: {
    fontSize: 14,
    lineHeight: 20,
  },
  msgContentMe: {
    color: "#fff",
  },
  msgContentThem: {
    color: "#eee",
  },
  msgFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 6,
    marginTop: 3,
  },
  msgTime: {
    fontSize: 10,
    color: "rgba(255,255,255,0.4)",
  },
  burnTimer: {
    fontSize: 10,
    color: "#FF6600",
    fontWeight: "700",
  },
  secretBadge: {
    fontSize: 10,
  },
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
  inputRowSecret: {
    borderTopColor: "#FF6600",
    backgroundColor: "#0d0800",
  },
  secretInputIcon: {
    fontSize: 18,
  },
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
  sendBtn: {
    backgroundColor: "#7B0099",
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 20,
  },
  sendBtnSecret: {
    backgroundColor: "#FF6600",
  },
  sendBtnText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 13,
  },
  copyrightBar: {
    backgroundColor: "#0a0a0a",
    paddingVertical: 4,
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "#1a1a1a",
  },
  copyrightText: {
    color: "#333",
    fontSize: 9,
  },
});
