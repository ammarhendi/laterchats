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
  ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useChat, ChatMessage, ChatUser, UserRole } from "@/lib/chat-context";
import { useVoiceChat } from "@/lib/use-voice-chat";
import { trpc } from "@/lib/trpc";
import * as Haptics from "expo-haptics";

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

const FALLBACK_ROOMS = [
  { id: 1, name: "Now" },
  { id: 2, name: "Arab World" },
  { id: 3, name: "Issues" },
  { id: 4, name: "Social Media" },
  { id: 5, name: "Chilling Out" },
  { id: 6, name: "Dancing" },
  { id: 7, name: "Blah Blah" },
  { id: 8, name: "Nothing Hidden" },
  { id: 9, name: "For All" },
  { id: 10, name: "Random" },
];

const EMOJIS = ["😊", "😂", "😍", "😎", "🤔", "😢", "😡", "👍", "👎", "❤️", "🔥", "💯", "🎉", "👋", "🤣"];

function formatTime(date: Date | string) {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function getRoleBadge(role: UserRole): string {
  if (role === "super_admin") return "👑 ";
  if (role === "moderator") return "🛡️ ";
  return "";
}

function getRoleColor(role: UserRole): string {
  if (role === "super_admin") return "#FFD700";
  if (role === "moderator") return "#00AAFF";
  return "#7B0099";
}

// Parse text with **bold** and _italic_ markers into React Native Text spans
function RichText({ text, baseStyle }: { text: string; baseStyle?: object }) {
  const parts: { text: string; bold?: boolean; italic?: boolean }[] = [];
  const regex = /\*\*(.+?)\*\*|_(.+?)_/g;
  let lastIndex = 0;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ text: text.slice(lastIndex, match.index) });
    }
    if (match[1] !== undefined) {
      parts.push({ text: match[1], bold: true });
    } else if (match[2] !== undefined) {
      parts.push({ text: match[2], italic: true });
    }
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) {
    parts.push({ text: text.slice(lastIndex) });
  }
  if (parts.length === 0) parts.push({ text });
  return (
    <Text style={baseStyle}>
      {parts.map((p, i) => (
        <Text
          key={i}
          style={[
            baseStyle,
            p.bold ? { fontWeight: "bold" } : undefined,
            p.italic ? { fontStyle: "italic" } : undefined,
          ]}
        >
          {p.text}
        </Text>
      ))}
    </Text>
  );
}

const SUPER_ADMIN_NICKNAME = "Ammar";

function getNicknameColor(nickname: string, isMe: boolean): string {
  if (nickname.toLowerCase() === SUPER_ADMIN_NICKNAME.toLowerCase()) return "#FFD700";
  if (isMe) return "#CC00CC";
  return "#7B0099";
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
    const senderColor = getNicknameColor(msg.senderNickname, isMe);
    return (
      <View style={styles.privateMsgRow}>
        <Text style={styles.privateMsgText}>
          <Text style={styles.privateLabel}>[PM] </Text>
          <Text style={[styles.msgNickname, { color: senderColor }]}>
            {isMe ? `To ${msg.recipientNickname}` : msg.senderNickname}
          </Text>
          <Text style={styles.msgSays}> whispers: </Text>
        </Text>
        <RichText text={`"${msg.content}"`} baseStyle={styles.privateMsgContent} />
      </View>
    );
  }

  const isMe = msg.senderNickname === myNickname;
  const nicknameColor = getNicknameColor(msg.senderNickname, isMe);
  const isSuperAdmin = msg.senderNickname.toLowerCase() === SUPER_ADMIN_NICKNAME.toLowerCase();
  return (
    <View style={styles.msgRow}>
      <Text style={styles.msgText}>
        {isSuperAdmin && <Text style={{ color: "#FFD700" }}>👑 </Text>}
        <Text style={[styles.msgNickname, { color: nicknameColor }]}>
          {msg.senderNickname}
        </Text>
        <Text style={styles.msgSays}> says: </Text>
      </Text>
      <RichText text={`"${msg.content}"`} baseStyle={styles.msgContent} />
    </View>
  );
}

function UserItem({ user, onPress, unreadCount }: { user: ChatUser; onPress: () => void; unreadCount?: number }) {
  const badge = getRoleBadge(user.role);
  const nameColor = getRoleColor(user.role);
  return (
    <TouchableOpacity style={styles.userItem} onPress={onPress} activeOpacity={0.7}>
      <View style={[
        styles.userDot,
        user.isVoiceActive ? styles.userDotVoice : styles.userDotOnline
      ]} />
      <Text style={[styles.userName, { color: nameColor }]} numberOfLines={1}>
        {badge}{user.nickname}
      </Text>
      {user.isTextMuted && <Text style={styles.mutedIcon}>🔇</Text>}
      {user.isVoiceBanned && <Text style={styles.mutedIcon}>🚫</Text>}
      {unreadCount ? (
        <View style={styles.userItemBadge}>
          <Text style={styles.userItemBadgeText}>{unreadCount > 9 ? "9+" : unreadCount}</Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

export default function ChatScreen() {
  const router = useRouter();
  const {
    nickname,
    myRole,
    roomName,
    users,
    messages,
    isMuted,
    isVoiceBanned,
    isTextMuted,
    sendMessage,
    sendPrivateMessage,
    toggleMute,
    leaveRoom,
    isConnected,
    unreadPMs,
    incomingPM,
    dismissIncomingPM,
    markPMRead,
    clearAllMessages,
    kickUser,
    banUser,
    unbanUser,
    promoteUser,
    demoteUser,
    muteUserText,
    unmuteUserText,
    requestBannedList,
    bannedList,
  } = useChat();

  const { isVoiceEnabled, startVoice, stopVoice, error: voiceError } = useVoiceChat();

  const [inputText, setInputText] = useState("");
  const [isBold, setIsBold] = useState(false);
  const [isItalic, setIsItalic] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [selectedUser, setSelectedUser] = useState<ChatUser | null>(null);
  const [showUserModal, setShowUserModal] = useState(false);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [showBannedList, setShowBannedList] = useState(false);
  const [banReason, setBanReason] = useState("");
  const [showBanInput, setShowBanInput] = useState(false);
  const [banVoiceOnly, setBanVoiceOnly] = useState(false);
  const [showRoomSwitcher, setShowRoomSwitcher] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  const { joinRoom, roomId } = useChat();
  const { data: roomsData } = trpc.chat.getAllRooms.useQuery(undefined, { retry: 1 });
  const availableRooms = roomsData && roomsData.length > 0 ? roomsData : FALLBACK_ROOMS;

  const isAdmin = myRole === "super_admin";
  const isMod = myRole === "moderator" || myRole === "super_admin";

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
    let text = inputText.trim();
    if (!text) return;
    if (isTextMuted) {
      Alert.alert("Muted", "You have been muted and cannot send messages.");
      return;
    }
    // Apply formatting without showing markers in input box
    if (isBold && isItalic) text = `***${text}***`;
    else if (isBold) text = `**${text}**`;
    else if (isItalic) text = `_${text}_`;
    sendMessage(text);
    setInputText("");
    setIsBold(false);
    setIsItalic(false);
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, [inputText, sendMessage, isTextMuted, isBold, isItalic]);

  const handleEmojiSelect = (emoji: string) => {
    setInputText((prev) => prev + emoji);
    setShowEmoji(false);
  };

  const handleUserPress = (user: ChatUser) => {
    if (user.nickname === nickname) return;
    setSelectedUser(user);
    setShowUserModal(true);
    setShowBanInput(false);
    setBanReason("");
  };

  const handlePM = () => {
    setShowUserModal(false);
    if (selectedUser) {
      markPMRead(selectedUser.nickname);
      router.push(`/pm/${selectedUser.nickname}` as any);
    }
  };

  const handleOpenPMFromBanner = (fromNickname: string) => {
    dismissIncomingPM();
    markPMRead(fromNickname);
    router.push(`/pm/${fromNickname}` as any);
  };

  const handleIgnore = () => {
    if (selectedUser?.role === "super_admin") return;
    setShowUserModal(false);
    Alert.alert("Ignored", `${selectedUser?.nickname} has been ignored.`);
  };

  const handleKick = () => {
    if (!selectedUser) return;
    Alert.alert(
      "Kick User",
      `Kick ${selectedUser.nickname} from the room?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Kick", style: "destructive", onPress: () => {
            kickUser(selectedUser.nickname);
            setShowUserModal(false);
          }
        },
      ]
    );
  };

  const handleBan = (voiceOnly: boolean) => {
    if (!selectedUser) return;
    setBanVoiceOnly(voiceOnly);
    setShowBanInput(true);
  };

  const confirmBan = () => {
    if (!selectedUser) return;
    banUser(selectedUser.nickname, banReason || undefined, banVoiceOnly);
    setShowUserModal(false);
    setShowBanInput(false);
    setBanReason("");
  };

  const handlePromote = () => {
    if (!selectedUser) return;
    Alert.alert(
      "Promote to Moderator",
      `Promote ${selectedUser.nickname} to Moderator?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Promote", onPress: () => {
            promoteUser(selectedUser.nickname);
            setShowUserModal(false);
          }
        },
      ]
    );
  };

  const handleDemote = () => {
    if (!selectedUser) return;
    Alert.alert(
      "Remove Moderator",
      `Remove moderator role from ${selectedUser.nickname}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove", style: "destructive", onPress: () => {
            demoteUser(selectedUser.nickname);
            setShowUserModal(false);
          }
        },
      ]
    );
  };

  const handleMuteText = () => {
    if (!selectedUser) return;
    if (selectedUser.isTextMuted) {
      unmuteUserText(selectedUser.nickname);
    } else {
      muteUserText(selectedUser.nickname);
    }
    setShowUserModal(false);
  };

  const handleToggleVoice = async () => {
    if (isVoiceBanned) {
      Alert.alert("Voice Banned", "You have been voice-banned by the admin.");
      return;
    }
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

  const handleClearChat = () => {
    Alert.alert("Clear Chat", "Clear all messages for everyone in the room?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Clear", style: "destructive", onPress: () => {
          if (!isConnected) {
            Alert.alert("Error", "Not connected to server. Please wait and try again.");
            return;
          }
          clearAllMessages();
          setShowAdminPanel(false);
        }
      },
    ]);
  };

  const handleShowBanned = () => {
    requestBannedList();
    setShowBannedList(true);
    setShowAdminPanel(false);
  };

  const handleUnban = (targetNickname: string) => {
    Alert.alert("Unban", `Unban ${targetNickname}?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Unban", onPress: () => unbanUser(targetNickname) },
    ]);
  };

  return (
    <ScreenContainer containerClassName="bg-black" className="bg-black" edges={["top", "left", "right"]}>
      {/* Incoming PM notification banner */}
      {incomingPM && (
        <View style={styles.pmBanner}>
          <View style={styles.pmBannerContent}>
            <Text style={styles.pmBannerTitle}>💬 Private Message</Text>
            <Text style={styles.pmBannerFrom}>{incomingPM.from} whispers:</Text>
            <Text style={styles.pmBannerPreview} numberOfLines={1}>{incomingPM.preview}</Text>
          </View>
          <View style={styles.pmBannerActions}>
            <TouchableOpacity
              style={styles.pmBannerReply}
              onPress={() => handleOpenPMFromBanner(incomingPM.from)}
            >
              <Text style={styles.pmBannerReplyText}>Reply</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.pmBannerDismiss} onPress={dismissIncomingPM}>
              <Text style={styles.pmBannerDismissText}>✕</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

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
            {isAdmin && (
              <>
                <TouchableOpacity
                  onPress={() => {
                    Alert.alert(
                      "Clear Chat",
                      "Clear ALL messages for everyone in the room?",
                      [
                        { text: "Cancel", style: "cancel" },
                        {
                          text: "Clear", style: "destructive", onPress: () => {
                            clearAllMessages();
                          }
                        },
                      ]
                    );
                  }}
                  style={styles.clearBtn}
                >
                  <Text style={styles.clearBtnText}>🗑️</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setShowAdminPanel(true)} style={styles.adminBtn}>
                  <Text style={styles.adminBtnText}>👑</Text>
                </TouchableOpacity>
              </>
            )}
            <TouchableOpacity onPress={() => setShowRoomSwitcher(true)} style={styles.roomSwitchBtn}>
              <Text style={styles.roomSwitchBtnText}>🔀</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleLeave} style={styles.exitBtn}>
              <Text style={styles.exitBtnText}>EXIT</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Welcome banner */}
        <View style={styles.welcomeBanner}>
          <Text style={styles.welcomeText}>
            Welcome to Later Chat, <Text style={styles.welcomeNick}>{getRoleBadge(myRole)}{nickname}</Text>
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
              <Text style={styles.usersPanelTitle}>Users ({users.length})</Text>
            </View>
            <FlatList
              data={users}
              keyExtractor={(u) => u.nickname}
              renderItem={({ item }) => (
                <UserItem
                  user={item}
                  onPress={() => handleUserPress(item)}
                  unreadCount={unreadPMs[item.nickname]}
                />
              )}
              style={styles.usersList}
              showsVerticalScrollIndicator={false}
            />
          </View>
        </View>

        {/* Toolbar */}
        <View style={styles.toolbar}>
          <TouchableOpacity
            style={[styles.toolbarBtn, isBold && styles.toolbarBtnActive]}
            onPress={() => setIsBold((v) => !v)}
          >
            <Text style={[styles.toolbarBtnText, { fontWeight: "bold" }, isBold && { color: "#FFD700" }]}>B</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toolbarBtn, isItalic && styles.toolbarBtnActive]}
            onPress={() => setIsItalic((v) => !v)}
          >
            <Text style={[styles.toolbarBtnText, { fontStyle: "italic" }, isItalic && { color: "#FFD700" }]}>I</Text>
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
            style={[styles.chatInput, isTextMuted && styles.chatInputMuted]}
            value={inputText}
            onChangeText={setInputText}
            placeholder={isTextMuted ? "You are muted..." : "Type a message..."}
            placeholderTextColor="#666"
            returnKeyType="send"
            onSubmitEditing={handleSend}
            multiline={false}
            editable={!isTextMuted}
          />
          <TouchableOpacity
            style={[styles.sendBtn, isTextMuted && styles.sendBtnDisabled]}
            onPress={handleSend}
            disabled={isTextMuted}
          >
            <Text style={styles.sendBtnText}>Send</Text>
          </TouchableOpacity>
        </View>

        {/* Voice bar */}
        <View style={styles.voiceBar}>
          <Text style={styles.voiceLabel}>Voice:</Text>
          {isVoiceBanned ? (
            <Text style={styles.voiceBannedText}>🚫 Voice banned</Text>
          ) : (
            <>
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
            </>
          )}
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
            <Text style={styles.modalTitle}>
              {getRoleBadge(selectedUser?.role || "user")}{selectedUser?.nickname}
            </Text>
            <View style={styles.modalDivider} />

            {/* Always available */}
            <TouchableOpacity style={styles.modalOption} onPress={handlePM}>
              <Text style={styles.modalOptionText}>💬 Send Private Message</Text>
            </TouchableOpacity>
            {selectedUser?.role !== "super_admin" && (
              <TouchableOpacity style={styles.modalOption} onPress={handleIgnore}>
                <Text style={[styles.modalOptionText, { color: "#FF8800" }]}>🚫 Ignore</Text>
              </TouchableOpacity>
            )}

            {/* Moderator actions */}
            {isMod && selectedUser?.role !== "super_admin" && (
              <>
                <View style={styles.modalSectionLabel}>
                  <Text style={styles.modalSectionLabelText}>— Moderator Actions —</Text>
                </View>
                <TouchableOpacity style={styles.modalOption} onPress={handleKick}>
                  <Text style={[styles.modalOptionText, { color: "#FF4444" }]}>👢 Kick</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.modalOption} onPress={handleMuteText}>
                  <Text style={[styles.modalOptionText, { color: "#FF8800" }]}>
                    {selectedUser?.isTextMuted ? "🔊 Unmute Text" : "🔇 Mute Text"}
                  </Text>
                </TouchableOpacity>
              </>
            )}

            {/* Super Admin only actions */}
            {isAdmin && selectedUser?.role !== "super_admin" && (
              <>
                <View style={styles.modalSectionLabel}>
                  <Text style={styles.modalSectionLabelText}>— Super Admin Actions —</Text>
                </View>
                {!showBanInput ? (
                  <>
                    <TouchableOpacity style={styles.modalOption} onPress={() => handleBan(false)}>
                      <Text style={[styles.modalOptionText, { color: "#CC0000" }]}>🔨 Ban (Full)</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.modalOption} onPress={() => handleBan(true)}>
                      <Text style={[styles.modalOptionText, { color: "#CC6600" }]}>🎙️ Voice Ban</Text>
                    </TouchableOpacity>
                    {selectedUser?.role === "moderator" ? (
                      <TouchableOpacity style={styles.modalOption} onPress={handleDemote}>
                        <Text style={[styles.modalOptionText, { color: "#888" }]}>⬇️ Remove Moderator</Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity style={styles.modalOption} onPress={handlePromote}>
                        <Text style={[styles.modalOptionText, { color: "#00AAFF" }]}>🛡️ Promote to Moderator</Text>
                      </TouchableOpacity>
                    )}
                  </>
                ) : (
                  <View style={styles.banInputArea}>
                    <Text style={styles.banInputLabel}>
                      {banVoiceOnly ? "Voice ban" : "Ban"} reason (optional):
                    </Text>
                    <TextInput
                      style={styles.banInput}
                      value={banReason}
                      onChangeText={setBanReason}
                      placeholder="Enter reason..."
                      placeholderTextColor="#666"
                      autoFocus
                    />
                    <View style={styles.banInputBtns}>
                      <TouchableOpacity style={styles.banCancelBtn} onPress={() => setShowBanInput(false)}>
                        <Text style={styles.banCancelBtnText}>Cancel</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.banConfirmBtn} onPress={confirmBan}>
                        <Text style={styles.banConfirmBtnText}>Confirm</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </>
            )}

            <TouchableOpacity style={styles.modalCancel} onPress={() => setShowUserModal(false)}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      {/* Admin Panel Modal */}
      <Modal
        visible={showAdminPanel}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAdminPanel(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowAdminPanel(false)}>
          <View style={[styles.modalBox, { width: 300 }]}>
            <Text style={[styles.modalTitle, { backgroundColor: "#5A0070" }]}>
              👑 Super Admin Panel
            </Text>
            <View style={styles.modalDivider} />
            <TouchableOpacity style={styles.modalOption} onPress={handleClearChat}>
              <Text style={[styles.modalOptionText, { color: "#FF4444" }]}>🗑️ Clear Chat Room</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalOption} onPress={handleShowBanned}>
              <Text style={styles.modalOptionText}>🚫 View Banned Users</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalOption} onPress={() => {
              setShowAdminPanel(false);
              router.push("/admin" as any);
            }}>
              <Text style={styles.modalOptionText}>🔗 Generate Invite Link</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalCancel} onPress={() => setShowAdminPanel(false)}>
              <Text style={styles.modalCancelText}>Close</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      {/* Banned Users List Modal */}
      <Modal
        visible={showBannedList}
        transparent
        animationType="slide"
        onRequestClose={() => setShowBannedList(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { width: 320, maxHeight: "70%" }]}>
            <Text style={[styles.modalTitle, { backgroundColor: "#5A0070" }]}>
              🚫 Banned Users
            </Text>
            <ScrollView style={{ maxHeight: 300 }}>
              {bannedList.length === 0 ? (
                <Text style={styles.emptyBannedText}>No banned users.</Text>
              ) : (
                bannedList.map((b) => (
                  <View key={b.id} style={styles.bannedItem}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.bannedNick}>{b.nickname || "(no nickname)"}</Text>
                      {b.ipAddress && <Text style={styles.bannedIp}>IP: {b.ipAddress}</Text>}
                      <Text style={styles.bannedType}>
                        {b.voiceBanOnly ? "Voice ban only" : "Full ban"}
                        {b.reason ? ` — ${b.reason}` : ""}
                      </Text>
                    </View>
                    {b.nickname && (
                      <TouchableOpacity
                        style={styles.unbanBtn}
                        onPress={() => handleUnban(b.nickname!)}
                      >
                        <Text style={styles.unbanBtnText}>Unban</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ))
              )}
            </ScrollView>
            <TouchableOpacity style={styles.modalCancel} onPress={() => setShowBannedList(false)}>
              <Text style={styles.modalCancelText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Room Switcher Modal */}
      <Modal
        visible={showRoomSwitcher}
        transparent
        animationType="slide"
        onRequestClose={() => setShowRoomSwitcher(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { width: 320, maxHeight: "75%" }]}>
            <Text style={[styles.modalTitle, { backgroundColor: "#7B0099" }]}>
              🔀 Switch Room
            </Text>
            <ScrollView style={{ maxHeight: 380 }}>
              {availableRooms.map((room) => (
                <TouchableOpacity
                  key={room.id}
                  style={[
                    styles.roomSwitchItem,
                    roomId === room.id && styles.roomSwitchItemActive,
                  ]}
                  onPress={() => {
                    if (roomId !== room.id) {
                      joinRoom(nickname!, room.id);
                    }
                    setShowRoomSwitcher(false);
                  }}
                >
                  <Text style={styles.roomSwitchIcon}>{ROOM_ICONS[room.name] ?? "💬"}</Text>
                  <Text style={[
                    styles.roomSwitchName,
                    roomId === room.id && styles.roomSwitchNameActive,
                  ]}>{room.name}</Text>
                  {roomId === room.id && (
                    <Text style={styles.roomSwitchCurrent}>✓ Current</Text>
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.modalCancel} onPress={() => setShowRoomSwitcher(false)}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
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
  adminBtn: {
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  adminBtnText: {
    fontSize: 18,
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
    fontSize: 11,
    flex: 1,
  },
  mutedIcon: {
    fontSize: 10,
    marginLeft: 2,
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
  },
  toolbarBtnActive: {
    backgroundColor: "#5A0070",
    borderColor: "#FFD700",
  },
  clearBtn: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginRight: 2,
  },
  clearBtnText: {
    fontSize: 18,
  },
  roomSwitchBtn: {
    backgroundColor: "#5A0070",
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: "#FFD700",
    marginRight: 2,
  },
  roomSwitchBtnText: {
    fontSize: 14,
  },
  roomSwitchItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#222",
    gap: 10,
  },
  roomSwitchItemActive: {
    backgroundColor: "#1a0022",
  },
  roomSwitchIcon: {
    fontSize: 22,
    width: 30,
    textAlign: "center",
  },
  roomSwitchName: {
    flex: 1,
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
  roomSwitchNameActive: {
    color: "#FFD700",
  },
  roomSwitchCurrent: {
    color: "#00CC00",
    fontSize: 12,
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
  chatInputMuted: {
    backgroundColor: "#f0f0f0",
    color: "#999",
  },
  sendBtn: {
    backgroundColor: "#7B0099",
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 3,
  },
  sendBtnDisabled: {
    backgroundColor: "#444",
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
  voiceBannedText: {
    color: "#FF4444",
    fontSize: 12,
    flex: 1,
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
    width: 280,
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
  modalSectionLabel: {
    paddingVertical: 6,
    paddingHorizontal: 20,
    backgroundColor: "#111",
  },
  modalSectionLabelText: {
    color: "#666",
    fontSize: 11,
    textAlign: "center",
  },
  modalOption: {
    paddingVertical: 13,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#333",
  },
  modalOptionText: {
    color: "#fff",
    fontSize: 14,
  },
  modalCancel: {
    paddingVertical: 12,
    alignItems: "center",
  },
  modalCancelText: {
    color: "#888",
    fontSize: 14,
  },
  banInputArea: {
    padding: 12,
    gap: 8,
  },
  banInputLabel: {
    color: "#aaa",
    fontSize: 12,
  },
  banInput: {
    backgroundColor: "#000",
    borderWidth: 1,
    borderColor: "#555",
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: "#fff",
    fontSize: 14,
  },
  banInputBtns: {
    flexDirection: "row",
    gap: 8,
    justifyContent: "flex-end",
  },
  banCancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 4,
    backgroundColor: "#333",
  },
  banCancelBtnText: {
    color: "#aaa",
    fontSize: 13,
  },
  banConfirmBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 4,
    backgroundColor: "#CC0000",
  },
  banConfirmBtnText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "bold",
  },
  // Banned list
  emptyBannedText: {
    color: "#888",
    textAlign: "center",
    padding: 20,
    fontSize: 13,
  },
  bannedItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#333",
    gap: 8,
  },
  bannedNick: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 13,
  },
  bannedIp: {
    color: "#888",
    fontSize: 11,
  },
  bannedType: {
    color: "#FF8800",
    fontSize: 11,
  },
  unbanBtn: {
    backgroundColor: "#006600",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 4,
  },
  unbanBtnText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "bold",
  },
  // PM notification banner
  pmBanner: {
    position: "absolute" as const,
    top: 0,
    left: 0,
    right: 0,
    zIndex: 999,
    backgroundColor: "#3D0050",
    borderBottomWidth: 2,
    borderBottomColor: "#FFD700",
    flexDirection: "row" as const,
    alignItems: "center" as const,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  pmBannerContent: {
    flex: 1,
  },
  pmBannerTitle: {
    color: "#FFD700",
    fontWeight: "bold" as const,
    fontSize: 12,
    marginBottom: 1,
  },
  pmBannerFrom: {
    color: "#FF9900",
    fontSize: 12,
    fontWeight: "600" as const,
  },
  pmBannerPreview: {
    color: "#ddd",
    fontSize: 12,
    marginTop: 1,
  },
  pmBannerActions: {
    flexDirection: "row" as const,
    gap: 6,
    alignItems: "center" as const,
  },
  pmBannerReply: {
    backgroundColor: "#7B0099",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
  },
  pmBannerReplyText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "bold" as const,
  },
  pmBannerDismiss: {
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  pmBannerDismissText: {
    color: "#aaa",
    fontSize: 16,
    fontWeight: "bold" as const,
  },
  // Unread PM badge
  userItemBadge: {
    backgroundColor: "#FF4444",
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    paddingHorizontal: 3,
    marginLeft: 4,
  },
  userItemBadgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "bold" as const,
  },
});
