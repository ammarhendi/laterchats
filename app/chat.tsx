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
import { usePrivateCall } from "@/lib/use-private-call";
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
  if (role === "super_admin") return "#6A1B9A";
  if (role === "moderator") return "#1565C0";
  return "#7B1FA2";
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

const SUPER_ADMIN_NICKNAMES = ["Ammar", "Later"];
const isSuperAdminName = (nick: string) => SUPER_ADMIN_NICKNAMES.some(n => n.toLowerCase() === nick.toLowerCase());

function getNicknameColor(nickname: string, isMe: boolean): string {
  if (isSuperAdminName(nickname)) return "#4A148C";
  if (isMe) return "#1565C0";
  return "#7B1FA2";
}

function MessageItem({ msg, myNickname, fontSize, fontFamily }: { msg: ChatMessage; myNickname: string; fontSize?: number; fontFamily?: string }) {
  if (msg.type === "system") {
    return (
      <View style={styles.systemMsgRow}>
        <Text style={styles.systemMsgText}>— {msg.content}</Text>
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
          <Text style={styles.msgSays}>: </Text>
          <Text style={styles.privateMsgContent}>{msg.content}</Text>
        </Text>
      </View>
    );
  }

  const isMe = msg.senderNickname === myNickname;
  const nicknameColor = getNicknameColor(msg.senderNickname, isMe);
  const isSuperAdminMsg = isSuperAdminName(msg.senderNickname);
  return (
    <View style={styles.msgRow}>
      <View style={styles.msgRowInner}>
        <Text style={styles.msgText}>
          {isSuperAdminMsg && <Text style={{ color: "#4A148C" }}>👑 </Text>}
          <Text style={[styles.msgNickname, { color: nicknameColor, fontSize: fontSize ?? 13, fontFamily: fontFamily }]}>
            {msg.senderNickname}
          </Text>
          <Text style={styles.msgSays}>: </Text>
          <RichText text={msg.content} baseStyle={[styles.msgContent, { fontSize: fontSize ?? 13, fontFamily: fontFamily }]} />
        </Text>
        <Text style={styles.msgTimestamp}>{formatTime(msg.createdAt)}</Text>
      </View>
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
    clearMessages,
  } = useChat();
  const { isVoiceEnabled, startVoice, stopVoice, error: voiceError } = useVoiceChat();
  const {
    callState,
    callPartner,
    incomingFrom,
    callDuration,
    startCall,
    acceptCall,
    rejectCall,
    endCall,
  } = usePrivateCall();

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
  const [showChatTools, setShowChatTools] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showFavoriteRooms, setShowFavoriteRooms] = useState(false);
  const [showIgnoreList, setShowIgnoreList] = useState(false);
  const [ignoredUsers, setIgnoredUsers] = useState<string[]>([]);
  const [fontSize, setFontSize] = useState(13);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [showTimestamps, setShowTimestamps] = useState(true);
  const [userStatus, setUserStatus] = useState("I'm Available");
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [fontName, setFontName] = useState("System");
  const flatListRef = useRef<FlatList>(null);

  // Map font display names to actual font families
  const FONT_MAP: Record<string, string | undefined> = {
    "System": undefined,
    "Arial": "Arial",
    "Times New Roman": "Times New Roman",
    "Courier": Platform.OS === "ios" ? "Courier" : "monospace",
    "Georgia": "Georgia",
    "Verdana": "Verdana",
  };

  const { switchRoom, roomId } = useChat();
  const { data: roomsData } = trpc.chat.getAllRooms.useQuery(undefined, { retry: 1 });
  const availableRooms = roomsData && roomsData.length > 0 ? roomsData : FALLBACK_ROOMS;

  // isAdmin: check both myRole AND nickname — nickname is the ground truth for super admin
  const isAdmin = myRole === "super_admin" || (nickname ? isSuperAdminName(nickname) : false);
  const isMod = myRole === "moderator" || myRole === "super_admin" || (nickname ? isSuperAdminName(nickname) : false);

  // Redirect to home if no nickname
  // Guard: only navigate after the component has mounted to avoid
  // "attempted to navigate before mounting the root layout" error
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => { setIsMounted(true); }, []);
  useEffect(() => {
    if (!isMounted) return;
    if (!nickname) {
      router.replace("/" as any);
    }
  }, [nickname, isMounted]);

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
    if (isTextMuted) {
      Alert.alert("Muted", "You have been muted and cannot send messages.");
      return;
    }
    // Send plain text exactly as typed — no formatting markers
    sendMessage(text);
    setInputText("");
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, [inputText, sendMessage, isTextMuted]);

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
      // Start voice: unmute socket so others can hear
      await startVoice();
      if (isMuted) toggleMute(); // ensure unmuted
    } else {
      // Stop voice: mute socket
      stopVoice();
      if (!isMuted) toggleMute(); // ensure muted
    }
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
          // Navigate immediately — don't rely on nickname useEffect
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
    <ScreenContainer containerClassName="bg-white" className="bg-white" edges={["top", "left", "right"]}>
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
        {/* Row 1: YAHOO! Chat logo bar — "You are in [Room]" | Help - Exit */}
        <View style={styles.ymTopBar}>
          <View style={styles.ymTopBarLeft}>
            <Text style={styles.ymLogoLater}>Later!</Text>
            <Text style={styles.ymLogoChat}>Chat</Text>
            <View style={[styles.connDot, isConnected ? styles.connDotOn : styles.connDotOff]} />
          </View>
          <Text style={styles.ymRoomTitle} numberOfLines={1}>
            You are in <Text style={styles.ymRoomTitleBold}>{roomName}</Text>
          </Text>
          <View style={styles.ymTopBarRight}>
            <TouchableOpacity onPress={() => Alert.alert("Help", "Later! Chat Help\n\n• Click a username to PM, ignore, or report.\n• Use Voice: Talk to speak in the room.\n• Change Room to browse other rooms.\n• Exit to leave the chat.")}>
              <Text style={styles.ymHelpLink}>Help</Text>
            </TouchableOpacity>
            <Text style={styles.ymTopBarSep}> - </Text>
            <TouchableOpacity onPress={handleLeave}>
              <Text style={styles.ymExitLink}>Exit</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Row 2: Chat Tools | Settings | Favorite Rooms | Change Room */}
        <View style={styles.ymNavBar}>
          <TouchableOpacity
            style={styles.ymNavBtn}
            onPress={() => setShowChatTools(true)}
          >
            <Text style={styles.ymNavBtnText}>Chat Tools ▾</Text>
          </TouchableOpacity>
          <View style={styles.ymNavSep} />
          <TouchableOpacity
            style={styles.ymNavBtn}
            onPress={() => setShowSettings(true)}
          >
            <Text style={styles.ymNavBtnText}>Settings ▾</Text>
          </TouchableOpacity>
          <View style={styles.ymNavSep} />
          <TouchableOpacity
            style={styles.ymNavBtn}
            onPress={() => setShowFavoriteRooms(true)}
          >
            <Text style={styles.ymNavBtnText}>Favorite Rooms ▾</Text>
          </TouchableOpacity>
          <View style={styles.ymNavSep} />
          <TouchableOpacity
            style={[styles.ymNavBtn, styles.ymNavBtnHighlight]}
            onPress={() => setShowRoomSwitcher(true)}
          >
            <Text style={[styles.ymNavBtnText, styles.ymNavBtnHighlightText]}>⊕ Change Room</Text>
          </TouchableOpacity>
          {isAdmin && (
            <>
              <View style={styles.ymNavSep} />
              <TouchableOpacity
                style={[styles.ymNavBtn, { backgroundColor: "#C62828" }]}
                onPress={handleClearChat}
              >
                <Text style={[styles.ymNavBtnText, { color: "#fff" }]}>Clear Chat</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* Welcome system message */}
        <View style={styles.welcomeBanner}>
          <Text style={styles.welcomeText}>
            Welcome to Later! Chat, <Text style={styles.welcomeNick}>{getRoleBadge(myRole)}{nickname}</Text>
          </Text>
          <Text style={styles.welcomeSubText}>
            You are in <Text style={styles.boldText}>{roomName}</Text> · All conversations are fully secured &amp; private 🔒
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
                <MessageItem msg={item} myNickname={nickname || ""} fontSize={fontSize} fontFamily={FONT_MAP[fontName]} />
              )}
              style={styles.messageList}
              contentContainerStyle={styles.messageListContent}
              onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
              showsVerticalScrollIndicator={true}
            />
          </View>

          {/* Chatters panel — Latest Yahoo Chat style */}
          <View style={styles.usersPanel}>
            {/* "Chatters" header with Menu and Emotions dropdowns */}
            <View style={styles.usersPanelHeader}>
              <Text style={styles.usersPanelTitle}>Chatters</Text>
            </View>
            <View style={styles.usersPanelSubBar}>
              <TouchableOpacity style={styles.usersPanelDropBtn}
                onPress={() => Alert.alert("Menu", "Options:\n• View Profile\n• Add to Friends\n• Ignore User")}
              >
                <Text style={styles.usersPanelDropText}>Menu ▾</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.usersPanelDropBtn}
                onPress={() => setShowEmoji(!showEmoji)}
              >
                <Text style={styles.usersPanelDropText}>Emotions ▾</Text>
              </TouchableOpacity>
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

        {/* Toolbar — Latest Yahoo Chat style: B/I/U/😊 | Arial | 10 | Report Abuse | Send */}
        <View style={styles.toolbar}>
          {/* B button */}
          <TouchableOpacity
            style={[styles.ymToolBtn, isBold && styles.ymToolBtnActive]}
            onPress={() => setIsBold(!isBold)}
          >
            <Text style={[styles.ymToolBtnText, { fontWeight: "900" }]}>B</Text>
          </TouchableOpacity>
          {/* I button */}
          <TouchableOpacity
            style={[styles.ymToolBtn, isItalic && styles.ymToolBtnActive]}
            onPress={() => setIsItalic(!isItalic)}
          >
            <Text style={[styles.ymToolBtnText, { fontStyle: "italic" }]}>I</Text>
          </TouchableOpacity>
          {/* U button */}
          <TouchableOpacity style={styles.ymToolBtn}>
            <Text style={[styles.ymToolBtnText, { textDecorationLine: "underline" }]}>U</Text>
          </TouchableOpacity>
          {/* Emoji / Emotions */}
          <TouchableOpacity style={[styles.ymToolBtn, showEmoji && styles.ymToolBtnActive]} onPress={() => setShowEmoji(!showEmoji)}>
            <Text style={styles.ymToolBtnText}>😊</Text>
          </TouchableOpacity>
          <View style={styles.toolbarDivider} />
          {/* Font selector — opens Settings modal */}
          <TouchableOpacity style={styles.ymFontSelect} onPress={() => setShowSettings(true)}>
            <Text style={styles.ymFontSelectText}>{fontName === "System" ? "Font ▾" : fontName.split(" ")[0] + " ▾"}</Text>
          </TouchableOpacity>
          {/* Font size selector — opens Settings modal */}
          <TouchableOpacity style={styles.ymSizeSelect} onPress={() => setShowSettings(true)}>
            <Text style={styles.ymSizeSelectText}>{fontSize} ▾</Text>
          </TouchableOpacity>
          <View style={styles.toolbarDivider} />
          {/* Color picker (decorative, like YM) */}
          <TouchableOpacity
            style={styles.ymToolBtn}
            onPress={() => Alert.alert("Text Color", "Text color selection coming soon!")}
          >
            <Text style={[styles.ymToolBtnText, { color: "#CC0000" }]}>A</Text>
          </TouchableOpacity>
          <View style={{ flex: 1 }} />
          {/* Mod panel */}
          {isMod && (
            <TouchableOpacity style={styles.ymToolBtn} onPress={() => router.push("/admin" as any)}>
              <Text style={[styles.ymToolBtnText, { fontSize: 10 }]}>⚙️ Mod</Text>
            </TouchableOpacity>
          )}
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

        {/* Chat input row — Latest Yahoo Chat: Chat: [input] [Send] | IM | Ignore */}
        <View style={styles.inputRow}>
          <Text style={styles.inputLabel}>Chat:</Text>
          <TextInput
            style={[styles.chatInput, isTextMuted && styles.chatInputMuted]}
            value={inputText}
            onChangeText={setInputText}
            placeholder={isTextMuted ? "You are muted..." : ""}
            placeholderTextColor="#999"
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

        {/* Voice bar + IM/Ignore + Status — Latest Yahoo Chat bottom row */}
        <View style={styles.voiceBar}>
          {/* Voice section */}
          <Text style={styles.voiceLabel}>Voice:</Text>
          {isVoiceBanned ? (
            <Text style={styles.voiceBannedText}>🚫 Banned</Text>
          ) : (
            <>
              <TouchableOpacity
                style={styles.handsFreeBtn}
                onPress={handleToggleVoice}
              >
                <Text style={styles.handsFreeText}>
                  {isVoiceEnabled ? "☑" : "☐"} Hands-free
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.talkBtn, !isMuted && styles.talkBtnActive]}
                onPress={handleToggleVoice}
              >
                <Text style={styles.talkBtnText}>Talk</Text>
              </TouchableOpacity>
              <View style={styles.voiceStatus}>
                <Text style={styles.voiceStatusText}>
                  {!isMuted ? "(● Active)" : "(Ready)"}
                </Text>
              </View>
            </>
          )}
          {voiceError ? <Text style={styles.voiceError}>{voiceError}</Text> : null}
          <View style={{ flex: 1 }} />
          {/* IM and Ignore buttons — right side of voice bar */}
          <TouchableOpacity
            style={styles.ymInputActionBtn}
            onPress={() => {
              if (selectedUser) {
                markPMRead(selectedUser.nickname);
                router.push(`/pm/${selectedUser.nickname}` as any);
              } else if (users.length > 0) {
                const other = users.find(u => u.nickname !== nickname);
                if (other) router.push(`/pm/${other.nickname}` as any);
                else Alert.alert("IM", "Tap a user in the Chatters list first.");
              }
            }}
          >
            <Text style={styles.ymInputActionBtnText}>IM</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.ymInputActionBtn}
            onPress={() => {
              if (selectedUser && selectedUser.role !== "super_admin") {
                Alert.alert("Ignored", `${selectedUser.nickname} has been ignored.`);
              } else {
                Alert.alert("Ignore", "Tap a user in the Chatters list first.");
              }
            }}
          >
            <Text style={styles.ymInputActionBtnText}>Ignore</Text>
          </TouchableOpacity>
        </View>

        {/* Status bar — Latest Yahoo Chat: "Status: I'm Available" */}
        <View style={styles.statusBar}>
          <Text style={styles.statusBarLabel}>Status:</Text>
          <TouchableOpacity
            style={styles.statusDropdown}
            onPress={() => setShowStatusPicker(true)}
          >
            <Text style={styles.statusDropdownText}>{userStatus} ▾</Text>
          </TouchableOpacity>
          <View style={{ flex: 1 }} />
          <Text style={styles.copyrightBarText}>© {new Date().getFullYear()} Later. All rights reserved.</Text>
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
            <TouchableOpacity
              style={styles.modalOption}
              onPress={() => {
                setShowUserModal(false);
                if (selectedUser) startCall(selectedUser.nickname);
              }}
            >
              <Text style={[styles.modalOptionText, { color: "#00CC88" }]}>📞 Private Voice Call</Text>
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
                      switchRoom(room.id);
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
      {/* Incoming Call Overlay */}
      {callState === "incoming" && incomingFrom && (
        <View style={styles.callOverlay}>
          <View style={styles.callBox}>
            <Text style={styles.callIcon}>📞</Text>
            <Text style={styles.callTitle}>Incoming Voice Call</Text>
            <Text style={styles.callFrom}>{incomingFrom}</Text>
            <View style={styles.callBtns}>
              <TouchableOpacity style={styles.callRejectBtn} onPress={rejectCall}>
                <Text style={styles.callRejectText}>🔴 Decline</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.callAcceptBtn} onPress={acceptCall}>
                <Text style={styles.callAcceptText}>🟢 Accept</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* Outgoing Call Banner */}
      {callState === "calling" && callPartner && (
        <View style={styles.callBanner}>
          <Text style={styles.callBannerText}>📞 Calling {callPartner}...</Text>
          <TouchableOpacity style={styles.callEndBannerBtn} onPress={endCall}>
            <Text style={styles.callEndBannerText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Active Call Banner */}
      {callState === "connected" && callPartner && (
        <View style={[styles.callBanner, { backgroundColor: "#004400" }]}>
          <Text style={styles.callBannerText}>🟢 In call with {callPartner} • {callDuration}</Text>
          <TouchableOpacity style={styles.callEndBannerBtn} onPress={endCall}>
            <Text style={styles.callEndBannerText}>End</Text>
          </TouchableOpacity>
        </View>
      )}
      {/* ── Chat Tools Modal ─────────────────────────────────────────── */}
      <Modal visible={showChatTools} transparent animationType="fade" onRequestClose={() => setShowChatTools(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowChatTools(false)}>
          <View style={[styles.modalBox, { width: 280 }]}>
            <Text style={[styles.modalTitle, { backgroundColor: "#5A0070" }]}>Chat Tools</Text>
            <View style={styles.modalDivider} />
            <TouchableOpacity style={styles.modalOption} onPress={() => { setShowChatTools(false); router.push("/(tabs)/profile" as any); }}>
              <Text style={styles.modalOptionText}>👤 My Profile</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalOption} onPress={() => { setShowChatTools(false); router.push("/(tabs)/friends" as any); }}>
              <Text style={styles.modalOptionText}>👥 My Friends List</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalOption} onPress={() => { setShowChatTools(false); setShowEmoji(true); }}>
              <Text style={styles.modalOptionText}>😊 Emoticons</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalOption} onPress={() => { setShowChatTools(false); setShowIgnoreList(true); }}>
              <Text style={styles.modalOptionText}>🚫 Ignore List</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalOption} onPress={() => {
              setShowChatTools(false);
              Alert.alert("Chat Rules", "Later! Chat Rules:\n\n1. Be respectful to all users.\n2. No harassment or bullying.\n3. No spam or advertising.\n4. No sharing of personal information.\n5. Keep conversations appropriate.\n6. Moderators may remove users who violate these rules.");
            }}>
              <Text style={styles.modalOptionText}>📋 Chat Rules</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalOption} onPress={() => {
              setShowChatTools(false);
              Alert.alert("Help", "Later! Chat Help\n\n• Tap a username in Chatters to PM, call, or ignore.\n• Use Voice: Talk to speak in the room.\n• Use Change Room to switch rooms.\n• Use Favorite Rooms for quick access.\n• Use Settings to adjust font size and sounds.");
            }}>
              <Text style={styles.modalOptionText}>❓ Help</Text>
            </TouchableOpacity>
            {isAdmin && (
              <>
                <View style={styles.modalSectionLabel}>
                  <Text style={styles.modalSectionLabelText}>— Admin Tools —</Text>
                </View>
                <TouchableOpacity style={styles.modalOption} onPress={() => { setShowChatTools(false); setShowAdminPanel(true); }}>
                  <Text style={[styles.modalOptionText, { color: "#7B1FA2" }]}>👑 Admin Panel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.modalOption} onPress={() => { setShowChatTools(false); router.push("/admin" as any); }}>
                  <Text style={[styles.modalOptionText, { color: "#7B1FA2" }]}>🔗 Generate Invite Link</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.modalOption} onPress={() => { setShowChatTools(false); handleClearChat(); }}>
                  <Text style={[styles.modalOptionText, { color: "#CC0000" }]}>🗑️ Clear Chat</Text>
                </TouchableOpacity>
              </>
            )}
            <TouchableOpacity style={styles.modalCancel} onPress={() => setShowChatTools(false)}>
              <Text style={styles.modalCancelText}>Close</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      {/* ── Settings Modal ────────────────────────────────────────────────── */}
      <Modal visible={showSettings} transparent animationType="fade" onRequestClose={() => setShowSettings(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowSettings(false)}>
          <View style={[styles.modalBox, { width: 300 }]}>
            <Text style={[styles.modalTitle, { backgroundColor: "#5A0070" }]}>Settings</Text>
            <View style={styles.modalDivider} />
            <View style={styles.settingsRow}>
              <Text style={styles.settingsLabel}>Font Size</Text>
              <View style={styles.settingsStepper}>
                <TouchableOpacity style={styles.stepperBtn} onPress={() => setFontSize(f => Math.max(10, f - 1))}>
                  <Text style={styles.stepperBtnText}>−</Text>
                </TouchableOpacity>
                <Text style={styles.stepperValue}>{fontSize}px</Text>
                <TouchableOpacity style={styles.stepperBtn} onPress={() => setFontSize(f => Math.min(20, f + 1))}>
                  <Text style={styles.stepperBtnText}>+</Text>
                </TouchableOpacity>
              </View>
            </View>
            <View style={styles.settingsDivider} />
            <TouchableOpacity style={styles.settingsRow} onPress={() => setSoundEnabled(s => !s)}>
              <Text style={styles.settingsLabel}>Sound Alerts</Text>
              <Text style={styles.settingsToggle}>{soundEnabled ? "✅ On" : "⬜ Off"}</Text>
            </TouchableOpacity>
            <View style={styles.settingsDivider} />
            <TouchableOpacity style={styles.settingsRow} onPress={() => setShowTimestamps(s => !s)}>
              <Text style={styles.settingsLabel}>Show Timestamps</Text>
              <Text style={styles.settingsToggle}>{showTimestamps ? "✅ On" : "⬜ Off"}</Text>
            </TouchableOpacity>
            <View style={styles.settingsDivider} />
            <View style={styles.settingsRow}>
              <Text style={styles.settingsLabel}>My Status</Text>
              <TouchableOpacity onPress={() => { setShowSettings(false); setShowStatusPicker(true); }}>
                <Text style={styles.settingsValue}>{userStatus} ▾</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.settingsDivider} />
            <View style={styles.settingsRow}>
              <Text style={styles.settingsLabel}>Font Name</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxWidth: 160 }}>
                <View style={{ flexDirection: "row", gap: 6, paddingVertical: 2 }}>
                  {["System", "Arial", "Times New Roman", "Courier", "Georgia", "Verdana"].map((f) => (
                    <TouchableOpacity
                      key={f}
                      onPress={() => setFontName(f)}
                      style={[{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4, borderWidth: 1, borderColor: fontName === f ? "#7B1FA2" : "#E0E0E0", backgroundColor: fontName === f ? "#EDE7F6" : "#fff" }]}
                    >
                      <Text style={{ fontSize: 11, color: fontName === f ? "#7B1FA2" : "#555", fontWeight: fontName === f ? "700" : "400" }}>{f}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            </View>
            <View style={styles.settingsDivider} />
            <View style={styles.settingsRow}>
              <Text style={styles.settingsLabel}>Notification Sound</Text>
              <Text style={styles.settingsValue}>Default</Text>
            </View>
            <TouchableOpacity style={styles.modalCancel} onPress={() => setShowSettings(false)}>
              <Text style={styles.modalCancelText}>Done</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      {/* ── Favorite Rooms Modal ──────────────────────────────────────────── */}
      <Modal visible={showFavoriteRooms} transparent animationType="fade" onRequestClose={() => setShowFavoriteRooms(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowFavoriteRooms(false)}>
          <View style={[styles.modalBox, { width: 300, maxHeight: "75%" }]}>
            <Text style={[styles.modalTitle, { backgroundColor: "#5A0070" }]}>⭐ Favorite Rooms</Text>
            <ScrollView style={{ maxHeight: 380 }}>
              {availableRooms.map((room) => (
                <TouchableOpacity
                  key={room.id}
                  style={[styles.roomSwitchItem, roomId === room.id && styles.roomSwitchItemActive]}
                  onPress={() => {
                    if (roomId !== room.id) switchRoom(room.id);
                    setShowFavoriteRooms(false);
                  }}
                >
                  <Text style={styles.roomSwitchIcon}>{ROOM_ICONS[room.name] ?? "💬"}</Text>
                  <Text style={[styles.roomSwitchName, roomId === room.id && styles.roomSwitchNameActive]}>{room.name}</Text>
                  {roomId === room.id && <Text style={styles.roomSwitchCurrent}>✓ Current</Text>}
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.modalCancel} onPress={() => setShowFavoriteRooms(false)}>
              <Text style={styles.modalCancelText}>Close</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      {/* ── Status Picker Modal ───────────────────────────────────────────── */}
      <Modal visible={showStatusPicker} transparent animationType="fade" onRequestClose={() => setShowStatusPicker(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowStatusPicker(false)}>
          <View style={[styles.modalBox, { width: 260 }]}>
            <Text style={[styles.modalTitle, { backgroundColor: "#5A0070" }]}>Change Status</Text>
            <View style={styles.modalDivider} />
            {["I'm Available", "Busy", "Be Right Back", "Away", "On the Phone", "Out to Lunch", "Invisible"].map((s) => (
              <TouchableOpacity key={s} style={styles.modalOption} onPress={() => { setUserStatus(s); setShowStatusPicker(false); }}>
                <Text style={[styles.modalOptionText, userStatus === s && { fontWeight: "bold", color: "#7B1FA2" }]}>
                  {userStatus === s ? "✓ " : "   "}{s}
                </Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.modalCancel} onPress={() => setShowStatusPicker(false)}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      {/* ── Ignore List Modal ─────────────────────────────────────────────── */}
      <Modal visible={showIgnoreList} transparent animationType="fade" onRequestClose={() => setShowIgnoreList(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { width: 300, maxHeight: "70%" }]}>
            <Text style={[styles.modalTitle, { backgroundColor: "#5A0070" }]}>🚫 Ignore List</Text>
            <ScrollView style={{ maxHeight: 280 }}>
              {ignoredUsers.length === 0 ? (
                <Text style={[styles.emptyBannedText, { padding: 16 }]}>Your ignore list is empty.</Text>
              ) : (
                ignoredUsers.map((u) => (
                  <View key={u} style={styles.bannedItem}>
                    <Text style={styles.bannedNick}>{u}</Text>
                    <TouchableOpacity
                      style={styles.unbanBtn}
                      onPress={() => setIgnoredUsers(prev => prev.filter(x => x !== u))}
                    >
                      <Text style={styles.unbanBtnText}>Remove</Text>
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </ScrollView>
            <TouchableOpacity style={styles.modalCancel} onPress={() => setShowIgnoreList(false)}>
              <Text style={styles.modalCancelText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  // ── Yahoo Chat latest version header ────────────────────────────────────
  // Row 1: Logo | Room title | Help - Exit
  ymTopBar: {
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#CCCCCC",
    gap: 6,
  },
  ymTopBarLeft: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 2,
    flexShrink: 0,
  },
  ymLogoLater: {
    color: "#5C0080",
    fontWeight: "900",
    fontSize: 17,
    letterSpacing: -0.5,
  },
  ymLogoChat: {
    color: "#FF8C00",
    fontWeight: "900",
    fontSize: 17,
    marginLeft: 1,
  },
  ymRoomTitle: {
    flex: 1,
    color: "#333333",
    fontSize: 12,
    textAlign: "center",
  },
  ymRoomTitleBold: {
    fontWeight: "bold",
    color: "#5C0080",
  },
  ymTopBarRight: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 0,
  },
  ymHelpLink: {
    color: "#0066CC",
    fontSize: 12,
    textDecorationLine: "underline",
  },
  ymTopBarSep: {
    color: "#999999",
    fontSize: 12,
  },
  ymExitLink: {
    color: "#CC0000",
    fontSize: 12,
    fontWeight: "bold",
    textDecorationLine: "underline",
  },
  // Row 2: Chat Tools | Settings | Favorite Rooms | Change Room
  ymNavBar: {
    backgroundColor: "#E8E8E8",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 4,
    paddingVertical: 3,
    borderBottomWidth: 1,
    borderBottomColor: "#BBBBBB",
    flexWrap: "nowrap",
    overflow: "hidden",
  },
  ymNavBtn: {
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 3,
    backgroundColor: "#F5F5F5",
    borderWidth: 1,
    borderColor: "#CCCCCC",
    marginHorizontal: 1,
  },
  ymNavBtnHighlight: {
    backgroundColor: "#5C0080",
    borderColor: "#3D0060",
  },
  ymNavBtnHighlightText: {
    color: "#FFFFFF",
    fontWeight: "bold",
  },
  ymNavBtnText: {
    color: "#333333",
    fontSize: 10,
    fontWeight: "600",
  },
  ymNavSep: {
    width: 1,
    height: 14,
    backgroundColor: "#BBBBBB",
    marginHorizontal: 2,
  },
  // Legacy header refs (kept for modal title reuse)
  headerLeft: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 2,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  connDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  connDotOn: { backgroundColor: "#A5D6A7" },
  connDotOff: { backgroundColor: "#EF9A9A" },
  headerRoom: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 13,
    fontWeight: "700",
  },
  headerCount: {
    color: "rgba(255,255,255,0.65)",
    fontSize: 12,
  },
  adminBtn: {
    paddingHorizontal: 5,
    paddingVertical: 3,
  },
  adminBtnText: {
    fontSize: 17,
  },
  exitBtn: {
    backgroundColor: "rgba(0,0,0,0.25)",
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 4,
  },
  exitBtnText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
  },
  welcomeBanner: {
    backgroundColor: "#F3E5F5",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: "#E1BEE7",
  },
  welcomeText: {
    color: "#4A148C",
    fontSize: 12,
  },
  welcomeNick: {
    color: "#7B1FA2",
    fontWeight: "bold",
  },
  welcomeSubText: {
    color: "#9E9E9E",
    fontSize: 11,
    marginTop: 1,
  },
  boldText: {
    fontWeight: "bold",
    color: "#616161",
  },
  mainContent: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: "#FAFAFA",
  },
  chatArea: {
    flex: 1,
    borderRightWidth: 1,
    borderRightColor: "#E0E0E0",
  },
  messageList: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  messageListContent: {
    padding: 8,
    paddingBottom: 12,
  },
  msgRow: {
    paddingVertical: 2,
    paddingHorizontal: 2,
  },
  msgText: {
    fontSize: 13,
    lineHeight: 19,
    color: "#212121",
  },
  msgNickname: {
    fontWeight: "bold",
    color: "#7B1FA2",
  },
  myNickname: {
    color: "#1565C0",
  },
  msgSays: {
    color: "#757575",
  },
  msgContent: {
    color: "#212121",
  },
  systemMsgRow: {
    paddingVertical: 3,
    paddingHorizontal: 2,
  },
  systemMsgText: {
    color: "#43A047",
    fontSize: 12,
    fontStyle: "italic",
  },
  privateMsgRow: {
    paddingVertical: 3,
    paddingHorizontal: 6,
    backgroundColor: "#FFF8E1",
    borderLeftWidth: 3,
    borderLeftColor: "#FF6D00",
    marginVertical: 2,
    borderRadius: 3,
  },
  privateMsgText: {
    fontSize: 13,
    lineHeight: 18,
  },
  privateLabel: {
    color: "#FF6D00",
    fontWeight: "bold",
  },
  privateMsgContent: {
    color: "#424242",
    fontStyle: "italic",
  },
  // Users panel — Latest Yahoo Chat Chatters panel
  usersPanel: {
    width: 112,
    backgroundColor: "#F5F5F5",
    borderLeftWidth: 1,
    borderLeftColor: "#CCCCCC",
  },
  usersPanelHeader: {
    backgroundColor: "#D0D0D0",
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#BBBBBB",
  },
  usersPanelTitle: {
    color: "#333333",
    fontSize: 11,
    fontWeight: "700",
  },
  usersPanelSubBar: {
    flexDirection: "row",
    backgroundColor: "#E8E8E8",
    borderBottomWidth: 1,
    borderBottomColor: "#CCCCCC",
    paddingHorizontal: 2,
    paddingVertical: 2,
    gap: 2,
  },
  usersPanelDropBtn: {
    flex: 1,
    backgroundColor: "#F5F5F5",
    borderWidth: 1,
    borderColor: "#CCCCCC",
    borderRadius: 2,
    paddingVertical: 2,
    paddingHorizontal: 3,
    alignItems: "center",
  },
  usersPanelDropText: {
    fontSize: 9,
    color: "#333333",
    fontWeight: "600",
  },
  usersPanelCount: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 10,
    fontWeight: "600",
  },
  usersList: {
    flex: 1,
  },
  userItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 7,
    paddingVertical: 5,
    borderBottomWidth: 0.5,
    borderBottomColor: "#E0E0E0",
    backgroundColor: "#FFFFFF",
  },
  userDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 5,
    flexShrink: 0,
  },
  userDotOnline: { backgroundColor: "#43A047" },
  userDotVoice: { backgroundColor: "#FB8C00" },
  userName: {
    fontSize: 11,
    flex: 1,
    color: "#212121",
  },
  mutedIcon: {
    fontSize: 10,
    marginLeft: 2,
  },
  // Yahoo Chat toolbar extras
  ymFontSelect: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#BDBDBD",
    borderRadius: 3,
    paddingHorizontal: 6,
    paddingVertical: 4,
    minWidth: 52,
    justifyContent: "center",
  },
  ymFontSelectText: {
    fontSize: 11,
    color: "#333",
  },
  ymSizeSelect: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#BDBDBD",
    borderRadius: 3,
    paddingHorizontal: 5,
    paddingVertical: 4,
    minWidth: 34,
    alignItems: "center",
  },
  ymSizeSelectText: {
    fontSize: 11,
    color: "#333",
  },
  ymReportBtn: {
    backgroundColor: "#FFF3E0",
    borderWidth: 1,
    borderColor: "#FFCC80",
    borderRadius: 3,
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  ymReportBtnText: {
    fontSize: 10,
    color: "#E65100",
    fontWeight: "600",
  },
  // Yahoo Chat-style toolbar buttons
  ymToolBtn: {
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: "#BDBDBD",
    minWidth: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  ymToolBtnActive: {
    backgroundColor: "#EDE7F6",
    borderColor: "#7B1FA2",
  },
  ymToolBtnText: {
    fontSize: 12,
    color: "#333",
    fontWeight: "600",
  },
  toolbarDivider: {
    width: 1,
    height: 16,
    backgroundColor: "#BDBDBD",
    marginHorizontal: 3,
  },
  // Toolbar
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F5F5F5",
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderTopWidth: 1,
    borderTopColor: "#E0E0E0",
    gap: 4,
  },
  toolbarBtn: {
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#BDBDBD",
  },
  toolbarBtnText: {
    fontSize: 15,
  },
  toolbarBtnActive: {
    backgroundColor: "#EDE7F6",
    borderColor: "#7B1FA2",
  },
  clearBtn: {
    backgroundColor: "#C62828",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginRight: 2,
  },
  clearBtnText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
  },
  roomSwitchBtn: {
    backgroundColor: "#EDE7F6",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#CE93D8",
    marginRight: 2,
  },
  roomSwitchBtnText: {
    fontSize: 14,
  },
  roomSwitchItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#EEEEEE",
    gap: 10,
    backgroundColor: "#FFFFFF",
  },
  roomSwitchItemActive: {
    backgroundColor: "#F3E5F5",
  },
  roomSwitchIcon: {
    fontSize: 20,
    width: 28,
    textAlign: "center",
  },
  roomSwitchName: {
    flex: 1,
    color: "#212121",
    fontSize: 15,
    fontWeight: "600",
  },
  roomSwitchNameActive: {
    color: "#7B1FA2",
  },
  roomSwitchCurrent: {
    color: "#43A047",
    fontSize: 12,
    fontWeight: "bold",
  },
  toolbarSep: {
    color: "#BDBDBD",
    marginHorizontal: 4,
  },
  emojiPicker: {
    flexDirection: "row",
    flexWrap: "wrap",
    backgroundColor: "#FAFAFA",
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: "#E0E0E0",
  },
  emojiBtn: {
    padding: 5,
  },
  emojiText: {
    fontSize: 22,
  },
  // Input row — YM style
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FAFAFA",
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: "#E0E0E0",
    gap: 6,
  },
  inputLabel: {
    color: "#757575",
    fontSize: 12,
    fontWeight: "600",
    minWidth: 36,
  },
  chatInput: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    color: "#212121",
    borderWidth: 1,
    borderColor: "#BDBDBD",
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
    fontSize: 14,
  },
  chatInputMuted: {
    backgroundColor: "#F5F5F5",
    color: "#9E9E9E",
  },
  sendBtn: {
    backgroundColor: "#7B1FA2",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 4,
  },
  sendBtnDisabled: {
    backgroundColor: "#BDBDBD",
  },
  sendBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 13,
  },
  // PM / Ignore / More buttons (Yahoo Chat input row)
  ymInputActionBtn: {
    backgroundColor: "#EEEEEE",
    paddingHorizontal: 7,
    paddingVertical: 7,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: "#BDBDBD",
  },
  ymInputActionBtnText: {
    color: "#333",
    fontSize: 11,
    fontWeight: "600",
  },
  // Status bar — Latest Yahoo Chat bottom
  statusBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#EEEEEE",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderTopWidth: 1,
    borderTopColor: "#CCCCCC",
    gap: 6,
  },
  statusBarLabel: {
    color: "#555555",
    fontSize: 11,
    fontWeight: "600",
  },
  statusDropdown: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#CCCCCC",
    borderRadius: 3,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  statusDropdownText: {
    color: "#333333",
    fontSize: 11,
  },
  // Hands-free checkbox
  handsFreeBtn: {
    flexDirection: "row",
    alignItems: "center",
    marginRight: 4,
  },
  handsFreeText: {
    color: "#333333",
    fontSize: 11,
  },
  // Voice bar — Latest Yahoo Chat
  voiceBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#EDE7F6",
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: "#D1C4E9",
    gap: 6,
  },
  voiceLabel: {
    color: "#4A148C",
    fontSize: 12,
    fontWeight: "700",
    minWidth: 40,
  },
  voiceBtn: {
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#CE93D8",
  },
  voiceBtnActive: {
    backgroundColor: "#FB8C00",
    borderColor: "#F57C00",
  },
  voiceBtnText: {
    color: "#4A148C",
    fontSize: 12,
    fontWeight: "600",
  },
  talkBtn: {
    backgroundColor: "#DDDDDD",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: "#BBBBBB",
  },
  talkBtnActive: {
    backgroundColor: "#FB8C00",
    borderColor: "#E65100",
  },
  talkBtnText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  voiceStatus: {
    flex: 1,
    alignItems: "flex-end",
  },
  voiceStatusActive: {},
  voiceStatusText: {
    color: "#9E9E9E",
    fontSize: 11,
  },
  voiceBannedText: {
    color: "#C62828",
    fontSize: 12,
    flex: 1,
  },
  voiceError: {
    color: "#C62828",
    fontSize: 10,
    flex: 1,
  },
  // Modals — YM style (white/light)
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalBox: {
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    width: 280,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#CE93D8",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 8,
  },
  modalTitle: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 15,
    textAlign: "center",
    paddingVertical: 12,
    backgroundColor: "#7B1FA2",
  },
  modalDivider: {
    height: 1,
    backgroundColor: "#EEEEEE",
  },
  modalSectionLabel: {
    paddingVertical: 6,
    paddingHorizontal: 20,
    backgroundColor: "#F5F5F5",
  },
  modalSectionLabelText: {
    color: "#9E9E9E",
    fontSize: 11,
    textAlign: "center",
  },
  modalOption: {
    paddingVertical: 13,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#F5F5F5",
  },
  modalOptionText: {
    color: "#212121",
    fontSize: 14,
  },
  modalCancel: {
    paddingVertical: 12,
    alignItems: "center",
  },
  modalCancelText: {
    color: "#9E9E9E",
    fontSize: 14,
  },
  banInputArea: {
    padding: 12,
    gap: 8,
    backgroundColor: "#FFFFFF",
  },
  banInputLabel: {
    color: "#757575",
    fontSize: 12,
  },
  banInput: {
    backgroundColor: "#FAFAFA",
    borderWidth: 1,
    borderColor: "#BDBDBD",
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: "#212121",
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
    backgroundColor: "#F5F5F5",
    borderWidth: 1,
    borderColor: "#BDBDBD",
  },
  banCancelBtnText: {
    color: "#757575",
    fontSize: 13,
  },
  banConfirmBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 4,
    backgroundColor: "#C62828",
  },
  banConfirmBtnText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "bold",
  },
  // Banned list
  emptyBannedText: {
    color: "#9E9E9E",
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
    borderBottomColor: "#EEEEEE",
    gap: 8,
    backgroundColor: "#FFFFFF",
  },
  bannedNick: {
    color: "#212121",
    fontWeight: "bold",
    fontSize: 13,
  },
  bannedIp: {
    color: "#9E9E9E",
    fontSize: 11,
  },
  bannedType: {
    color: "#FB8C00",
    fontSize: 11,
  },
  unbanBtn: {
    backgroundColor: "#2E7D32",
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
    backgroundColor: "#7B1FA2",
    borderBottomWidth: 1,
    borderBottomColor: "#CE93D8",
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
    color: "#FFFFFF",
    fontWeight: "bold" as const,
    fontSize: 12,
    marginBottom: 1,
  },
  pmBannerFrom: {
    color: "#E1BEE7",
    fontSize: 12,
    fontWeight: "600" as const,
  },
  pmBannerPreview: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 12,
    marginTop: 1,
  },
  pmBannerActions: {
    flexDirection: "row" as const,
    gap: 6,
    alignItems: "center" as const,
  },
  pmBannerReply: {
    backgroundColor: "rgba(255,255,255,0.25)",
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
  // Private voice call styles
  callOverlay: {
    position: "absolute" as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.75)",
    justifyContent: "center" as const,
    alignItems: "center" as const,
    zIndex: 999,
  },
  callBox: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 28,
    alignItems: "center" as const,
    width: 280,
    borderWidth: 1,
    borderColor: "#CE93D8",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 10,
  },
  callIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  callTitle: {
    color: "#212121",
    fontSize: 18,
    fontWeight: "bold" as const,
    marginBottom: 6,
  },
  callFrom: {
    color: "#7B1FA2",
    fontSize: 22,
    fontWeight: "bold" as const,
    marginBottom: 24,
  },
  callBtns: {
    flexDirection: "row" as const,
    gap: 16,
  },
  callRejectBtn: {
    backgroundColor: "#CC0000",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 30,
  },
  callRejectText: {
    color: "#fff",
    fontWeight: "bold" as const,
    fontSize: 15,
  },
  callAcceptBtn: {
    backgroundColor: "#006600",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 30,
  },
  callAcceptText: {
    color: "#fff",
    fontWeight: "bold" as const,
    fontSize: 15,
  },
  callBanner: {
    position: "absolute" as const,
    top: 60,
    left: 10,
    right: 10,
    backgroundColor: "#7B1FA2",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    zIndex: 100,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 6,
  },
  callBannerText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600" as const,
    flex: 1,
  },
  callEndBannerBtn: {
    backgroundColor: "#CC0000",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    marginLeft: 10,
  },
  callEndBannerText: {
    color: "#fff",
    fontWeight: "bold" as const,
    fontSize: 12,
  },
  msgRowInner: {
    flex: 1,
    flexDirection: "row" as const,
    alignItems: "flex-end" as const,
    flexWrap: "wrap" as const,
    gap: 4,
  },
  msgTimestamp: {
    color: "#BDBDBD",
    fontSize: 10,
    marginLeft: 4,
    flexShrink: 0,
  },
  localClearBtn: {
    backgroundColor: "#EDE7F6",
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#CE93D8",
  },
  localClearBtnText: {
    color: "#7B1FA2",
    fontSize: 12,
    fontWeight: "600" as const,
  },
  copyrightBar: {
    backgroundColor: "#4A0072",
    paddingVertical: 5,
    paddingHorizontal: 12,
    alignItems: "center",
  },
  copyrightBarText: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 10,
    letterSpacing: 0.3,
  },
  // Settings modal styles
  settingsRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  settingsLabel: {
    color: "#212121",
    fontSize: 14,
    fontWeight: "500" as const,
  },
  settingsValue: {
    color: "#7B1FA2",
    fontSize: 13,
    fontWeight: "600" as const,
  },
  settingsToggle: {
    fontSize: 13,
    fontWeight: "600" as const,
    color: "#333",
  },
  settingsDivider: {
    height: 1,
    backgroundColor: "#F0F0F0",
    marginHorizontal: 16,
  },
  settingsStepper: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
  },
  stepperBtn: {
    backgroundColor: "#EDE7F6",
    borderRadius: 4,
    width: 28,
    height: 28,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    borderWidth: 1,
    borderColor: "#CE93D8",
  },
  stepperBtnText: {
    color: "#7B1FA2",
    fontSize: 16,
    fontWeight: "bold" as const,
    lineHeight: 18,
  },
  stepperValue: {
    color: "#212121",
    fontSize: 13,
    fontWeight: "600" as const,
    minWidth: 36,
    textAlign: "center" as const,
  },
});
