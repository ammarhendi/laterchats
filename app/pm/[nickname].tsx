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
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useChat, ChatMessage } from "@/lib/chat-context";
import * as Haptics from "expo-haptics";

function PMMessageItem({ msg, myNickname }: { msg: ChatMessage; myNickname: string }) {
  const isMe = msg.senderNickname === myNickname;
  return (
    <View style={[styles.msgRow, isMe ? styles.msgRowMe : styles.msgRowThem]}>
      <View style={[styles.msgBubble, isMe ? styles.msgBubbleMe : styles.msgBubbleThem]}>
        {!isMe && (
          <Text style={styles.msgSender}>{msg.senderNickname}</Text>
        )}
        <Text style={[styles.msgContent, isMe ? styles.msgContentMe : styles.msgContentThem]}>
          {msg.content}
        </Text>
        <Text style={styles.msgTime}>
          {new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </Text>
      </View>
    </View>
  );
}

export default function PrivateMessageScreen() {
  const { nickname: targetNickname } = useLocalSearchParams<{ nickname: string }>();
  const router = useRouter();
  const { nickname: myNickname, privateMessages, sendPrivateMessage, users } = useChat();
  const [inputText, setInputText] = useState("");
  const flatListRef = useRef<FlatList>(null);

  const messages = privateMessages[targetNickname] || [];

  const isTargetOnline = users.some((u) => u.nickname === targetNickname);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages.length]);

  const handleSend = useCallback(() => {
    const text = inputText.trim();
    if (!text || !targetNickname) return;
    sendPrivateMessage(targetNickname, text);
    setInputText("");
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, [inputText, targetNickname, sendPrivateMessage]);

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
            <Text style={styles.pmLabel}>Private Chat</Text>
          </View>
        </View>

        {/* PM Notice */}
        <View style={styles.pmNotice}>
          <Text style={styles.pmNoticeText}>
            🔒 This is a private conversation with <Text style={styles.pmNoticeNick}>{targetNickname}</Text>.
            Messages are only visible to you two.
          </Text>
        </View>

        {/* Messages */}
        {messages.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No messages yet.</Text>
            <Text style={styles.emptySubText}>
              Send a private message to {targetNickname}
            </Text>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(item, idx) => `${item.id}-${idx}`}
            renderItem={({ item }) => (
              <PMMessageItem msg={item} myNickname={myNickname || ""} />
            )}
            style={styles.messageList}
            contentContainerStyle={styles.messageListContent}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
            showsVerticalScrollIndicator={true}
          />
        )}

        {/* Input */}
        <View style={styles.inputRow}>
          <TextInput
            style={styles.chatInput}
            value={inputText}
            onChangeText={setInputText}
            placeholder={`Message ${targetNickname}...`}
            placeholderTextColor="#666"
            returnKeyType="send"
            onSubmitEditing={handleSend}
            multiline={false}
          />
          <TouchableOpacity style={styles.sendBtn} onPress={handleSend}>
            <Text style={styles.sendBtnText}>Send</Text>
          </TouchableOpacity>
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
  pmLabel: {
    color: "#FFD700",
    fontSize: 11,
    fontWeight: "600",
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
  msgTime: {
    fontSize: 10,
    color: "rgba(255,255,255,0.4)",
    marginTop: 3,
    textAlign: "right",
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
  sendBtnText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 13,
  },
});
