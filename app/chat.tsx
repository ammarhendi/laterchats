import { useState, useRef, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Modal,
  Pressable,
  Platform,
  KeyboardAvoidingView,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useChat, ChatMessage, ChatUser } from "@/lib/chat-context";
import { useVoiceChat } from "@/lib/use-voice-chat";
import * as Haptics from "expo-haptics";

const EMOJIS = ["😊", "😂", "😍", "😎", "🤔", "😢", "😡", "👍", "👎", "❤️", "🔥", "💯", "🎉", "👋", "🤣"];

function formatTime(date: Date | string) {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function MessageItem({ msg, myNickname }: { msg: ChatMessage; myNickname: string }) {
  if (msg.type === "system") {
    return (
      <View style={styles.systemMsgRow}>
        <Text style={styles.systemMsgText}>{msg.content}</Text>
      </View>
    );
  }

  if (msg.type === "private") {
    const isMe = msg.senderNickname === myNickname;
    return (
      <View style={styles.privateMsgRow}>
        <Text style={styles.privateMsgText}>
          <Text style={styles.privateLabel}>[PM] </Text>
          <Text style={[styles.msgNickname, { color: "#FF6600" }]}>
            {isMe ? `To ${msg.recipientNickname}` : msg.senderNickname}
          </Text>
          <Text style={styles.msgSays}> whispers: </Text>
          <Text style={styles.privateMsgContent}>"{msg.content}"</Text>
        </Text>
      </View>
    );
  }

  const isMe = msg.senderNickname === myNickname;
  return (
    <View style={styles.msgRow}>
      <Text style={styles.msgText}>
        <Text style={[styles.msgNickname, isMe && styles.myNickname]}>
          {msg.senderNickname}
        </Text>
        <Text style={styles.msgSays}> says: </Text>
        <Text style={styles.msgContent}>"{msg.content}"</Text>
      </Text>
    </View>
  );
}

function UserItem({ user, onPress }: { user: ChatUser; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.userItem} onPress={onPress} activeOpacity={0.7}>
      <View style={[
        styles.userDot,
        user.isVoiceActive ? styles.userDotVoice : styles.userDotOnline
      ]} />
      <Text style={styles.userName} numberOfLines={1}>{user.nickname}</Text>
    </TouchableOpacity>
  );
}

export default function ChatScreen() {
  const router = useRouter();
  const {
    nickname,
    roomName,
    users,
    messages,
    isMuted,
    sendMessage,
    sendPrivateMessage,
    toggleMute,
    leaveRoom,
    isConnected,
  } = useChat();

  const { isVoiceEnabled, startVoice, stopVoice, error: voiceError } = useVoiceChat();

  const [inputText, setInputText] = useState("");
  const [showEmoji, setShowEmoji] = useState(false);
  const [selectedUser, setSelectedUser] = useState<ChatUser | null>(null);
  const [showUserModal, setShowUserModal] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  // Redirect to home if no nickname
  useEffect(() => {
    if (!nickname) {
      router.replace("/" as any);
    }
  }, [nickname]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages.length]);

  const handleSend = useCallback(() => {
    const text = inputText.trim();
    if (!text) return;
    sendMessage(text);
    setInputText("");
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, [inputText, sendMessage]);

  const handleEmojiSelect = (emoji: string) => {
    setInputText((prev) => prev + emoji);
    setShowEmoji(false);
  };

  const handleUserPress = (user: ChatUser) => {
    if (user.nickname === nickname) return;
    setSelectedUser(user);
    setShowUserModal(true);
  };

  const handlePM = () => {
    setShowUserModal(false);
    if (selectedUser) {
      router.push(`/pm/${selectedUser.nickname}` as any);
    }
  };

  const handleIgnore = () => {
    setShowUserModal(false);
    Alert.alert("Ignored", `${selectedUser?.nickname} has been ignored.`);
  };

  const handleToggleVoice = async () => {
    if (!isVoiceEnabled) {
      await startVoice();
    } else {
      stopVoice();
    }
    toggleMute();
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
  };

  const handleLeave = () => {
    Alert.alert("Leave Room", "Are you sure you want to leave the chat room?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Leave", style: "destructive", onPress: () => {
          leaveRoom();
          router.replace("/" as any);
        }
      },
    ]);
  };

  return (
    <ScreenContainer containerClassName="bg-black" className="bg-black" edges={["top", "left", "right"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={0}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.headerLogo}>Later</Text>
            <Text style={styles.headerChat}>Chat</Text>
          </View>
          <View style={styles.headerRight}>
            <View style={[styles.connDot, isConnected ? styles.connDotOn : styles.connDotOff]} />
            <Text style={styles.headerRoom}>{roomName}</Text>
            <Text style={styles.headerCount}>[{users.length}]</Text>
            <TouchableOpacity onPress={handleLeave} style={styles.exitBtn}>
              <Text style={styles.exitBtnText}>EXIT</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Welcome banner */}
        <View style={styles.welcomeBanner}>
          <Text style={styles.welcomeText}>
            Welcome to Later Chat, <Text style={styles.welcomeNick}>{nickname}</Text>
          </Text>
          <Text style={styles.welcomeSubText}>
            You are in <Text style={styles.boldText}>{roomName}</Text> (Pull up a chair and have a chat, mate!)
          </Text>
        </View>

        {/* Main content: chat + users */}
        <View style={styles.mainContent}>
          {/* Chat messages */}
          <View style={styles.chatArea}>
            <FlatList
              ref={flatListRef}
              data={messages}
              keyExtractor={(item, idx) => `${item.id}-${idx}`}
              renderItem={({ item }) => (
                <MessageItem msg={item} myNickname={nickname || ""} />
              )}
              style={styles.messageList}
              contentContainerStyle={styles.messageListContent}
              onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
              showsVerticalScrollIndicator={true}
            />
          </View>

          {/* Users panel */}
          <View style={styles.usersPanel}>
            <View style={styles.usersPanelHeader}>
              <Text style={styles.usersPanelTitle}>Chatters</Text>
            </View>
            <FlatList
              data={users}
              keyExtractor={(u) => u.nickname}
              renderItem={({ item }) => (
                <UserItem user={item} onPress={() => handleUserPress(item)} />
              )}
              style={styles.usersList}
              showsVerticalScrollIndicator={false}
            />
          </View>
        </View>

        {/* Toolbar */}
        <View style={styles.toolbar}>
          <TouchableOpacity style={styles.toolbarBtn} onPress={() => setInputText((t) => `**${t}**`)}>
            <Text style={styles.toolbarBtnText}>B</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.toolbarBtn} onPress={() => setInputText((t) => `_${t}_`)}>
            <Text style={[styles.toolbarBtnText, { fontStyle: "italic" }]}>I</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.toolbarBtn} onPress={() => setShowEmoji(!showEmoji)}>
            <Text style={styles.toolbarBtnText}>😊</Text>
          </TouchableOpacity>
          <Text style={styles.toolbarSep}>|</Text>
          <TouchableOpacity style={styles.toolbarBtn} onPress={() => router.push("/admin" as any)}>
            <Text style={styles.toolbarBtnText}>⚙️</Text>
          </TouchableOpacity>
        </View>

        {/* Emoji picker */}
        {showEmoji && (
          <View style={styles.emojiPicker}>
            {EMOJIS.map((e) => (
              <TouchableOpacity key={e} onPress={() => handleEmojiSelect(e)} style={styles.emojiBtn}>
                <Text style={styles.emojiText}>{e}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Chat input */}
        <View style={styles.inputRow}>
          <Text style={styles.inputLabel}>Chat:</Text>
          <TextInput
            style={styles.chatInput}
            value={inputText}
            onChangeText={setInputText}
            placeholder="Type a message..."
            placeholderTextColor="#666"
            returnKeyType="send"
            onSubmitEditing={handleSend}
            multiline={false}
          />
          <TouchableOpacity style={styles.sendBtn} onPress={handleSend}>
            <Text style={styles.sendBtnText}>Send</Text>
          </TouchableOpacity>
        </View>

        {/* Voice bar */}
        <View style={styles.voiceBar}>
          <Text style={styles.voiceLabel}>Voice:</Text>
          <TouchableOpacity
            style={[styles.voiceBtn, !isMuted && styles.voiceBtnActive]}
            onPress={handleToggleVoice}
          >
            <Text style={styles.voiceBtnText}>
              {isMuted ? "🎤 Unmute" : "🔇 Mute"}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.talkBtn} onPress={handleToggleVoice}>
            <Text style={styles.talkBtnText}>Talk</Text>
          </TouchableOpacity>
          <View style={[styles.voiceStatus, !isMuted && styles.voiceStatusActive]}>
            <Text style={styles.voiceStatusText}>
              {!isMuted ? "● Active" : "○ Ready"}
            </Text>
          </View>
          {voiceError ? (
            <Text style={styles.voiceError}>{voiceError}</Text>
          ) : null}
        </View>
      </KeyboardAvoidingView>

      {/* User action modal */}
      <Modal
        visible={showUserModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowUserModal(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowUserModal(false)}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>{selectedUser?.nickname}</Text>
            <View style={styles.modalDivider} />
            <TouchableOpacity style={styles.modalOption} onPress={handlePM}>
              <Text style={styles.modalOptionText}>💬 Send Private Message</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalOption} onPress={handleIgnore}>
              <Text style={[styles.modalOptionText, { color: "#FF4444" }]}>🚫 Ignore</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalCancel} onPress={() => setShowUserModal(false)}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: "#7B0099",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 2,
    borderBottomColor: "#FFD700",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  headerLogo: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 20,
    letterSpacing: -0.5,
  },
  headerChat: {
    color: "#FFD700",
    fontWeight: "900",
    fontSize: 20,
    marginLeft: 2,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  connDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  connDotOn: { backgroundColor: "#00FF00" },
  connDotOff: { backgroundColor: "#FF0000" },
  headerRoom: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
  headerCount: {
    color: "#FFD700",
    fontSize: 12,
    fontWeight: "bold",
  },
  exitBtn: {
    backgroundColor: "#5A0070",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: "#FFD700",
  },
  exitBtnText: {
    color: "#FFD700",
    fontSize: 11,
    fontWeight: "bold",
  },
  welcomeBanner: {
    backgroundColor: "#111",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: "#333",
  },
  welcomeText: {
    color: "#00AA00",
    fontSize: 12,
  },
  welcomeNick: {
    color: "#FFD700",
    fontWeight: "bold",
  },
  welcomeSubText: {
    color: "#888",
    fontSize: 11,
    marginTop: 1,
  },
  boldText: {
    fontWeight: "bold",
    color: "#aaa",
  },
  mainContent: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: "#000",
  },
  chatArea: {
    flex: 1,
    borderRightWidth: 1,
    borderRightColor: "#333",
  },
  messageList: {
    flex: 1,
    backgroundColor: "#fff",
  },
  messageListContent: {
    padding: 6,
    paddingBottom: 10,
  },
  msgRow: {
    paddingVertical: 2,
    paddingHorizontal: 2,
  },
  msgText: {
    fontSize: 13,
    lineHeight: 18,
    color: "#000",
  },
  msgNickname: {
    fontWeight: "bold",
    color: "#7B0099",
  },
  myNickname: {
    color: "#0000CC",
  },
  msgSays: {
    color: "#333",
    fontStyle: "italic",
  },
  msgContent: {
    color: "#000",
  },
  systemMsgRow: {
    paddingVertical: 2,
    paddingHorizontal: 2,
  },
  systemMsgText: {
    color: "#008000",
    fontSize: 12,
    fontStyle: "italic",
  },
  privateMsgRow: {
    paddingVertical: 2,
    paddingHorizontal: 2,
    backgroundColor: "#FFF8E1",
    borderLeftWidth: 2,
    borderLeftColor: "#FF6600",
    marginVertical: 1,
    borderRadius: 2,
  },
  privateMsgText: {
    fontSize: 13,
    lineHeight: 18,
  },
  privateLabel: {
    color: "#FF6600",
    fontWeight: "bold",
  },
  privateMsgContent: {
    color: "#333",
    fontStyle: "italic",
  },
  usersPanel: {
    width: 110,
    backgroundColor: "#f0f0f0",
  },
  usersPanelHeader: {
    backgroundColor: "#7B0099",
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  usersPanelTitle: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "bold",
  },
  usersList: {
    flex: 1,
  },
  userItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: "#ddd",
  },
  userDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 5,
  },
  userDotOnline: { backgroundColor: "#00AA00" },
  userDotVoice: { backgroundColor: "#FF6600" },
  userName: {
    fontSize: 12,
    color: "#000",
    flex: 1,
  },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1a1a1a",
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderTopWidth: 1,
    borderTopColor: "#333",
    gap: 4,
  },
  toolbarBtn: {
    backgroundColor: "#333",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: "#555",
  },
  toolbarBtnText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "bold",
  },
  toolbarSep: {
    color: "#555",
    marginHorizontal: 4,
  },
  emojiPicker: {
    flexDirection: "row",
    flexWrap: "wrap",
    backgroundColor: "#222",
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: "#444",
  },
  emojiBtn: {
    padding: 5,
  },
  emojiText: {
    fontSize: 22,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#111",
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: "#333",
    gap: 6,
  },
  inputLabel: {
    color: "#aaa",
    fontSize: 12,
    fontWeight: "600",
    minWidth: 36,
  },
  chatInput: {
    flex: 1,
    backgroundColor: "#fff",
    color: "#000",
    borderWidth: 1,
    borderColor: "#555",
    borderRadius: 3,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 14,
  },
  sendBtn: {
    backgroundColor: "#7B0099",
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 3,
  },
  sendBtnText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 13,
  },
  voiceBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0a0a0a",
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: "#222",
    gap: 6,
  },
  voiceLabel: {
    color: "#aaa",
    fontSize: 12,
    fontWeight: "600",
    minWidth: 40,
  },
  voiceBtn: {
    backgroundColor: "#333",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: "#555",
  },
  voiceBtnActive: {
    backgroundColor: "#FF6600",
    borderColor: "#FF8833",
  },
  voiceBtnText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  talkBtn: {
    backgroundColor: "#7B0099",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 3,
  },
  talkBtnText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "bold",
  },
  voiceStatus: {
    flex: 1,
    alignItems: "flex-end",
  },
  voiceStatusActive: {},
  voiceStatusText: {
    color: "#888",
    fontSize: 11,
  },
  voiceError: {
    color: "#FF4444",
    fontSize: 10,
    flex: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalBox: {
    backgroundColor: "#1a1a1a",
    borderRadius: 8,
    width: 260,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#7B0099",
  },
  modalTitle: {
    color: "#FFD700",
    fontWeight: "bold",
    fontSize: 16,
    textAlign: "center",
    paddingVertical: 12,
    backgroundColor: "#7B0099",
  },
  modalDivider: {
    height: 1,
    backgroundColor: "#333",
  },
  modalOption: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#333",
  },
  modalOptionText: {
    color: "#fff",
    fontSize: 15,
  },
  modalCancel: {
    paddingVertical: 12,
    alignItems: "center",
  },
  modalCancelText: {
    color: "#888",
    fontSize: 14,
  },
});
