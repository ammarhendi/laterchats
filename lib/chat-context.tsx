import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import { getApiBaseUrl } from "@/constants/oauth";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Alert } from "react-native";

export type UserRole = "super_admin" | "moderator" | "user";

export interface ChatUser {
  nickname: string;
  isMuted: boolean;
  isVoiceActive: boolean;
  isVoiceBanned?: boolean;
  isTextMuted?: boolean;
  role: UserRole;
}

export interface ChatMessage {
  id: number;
  roomId: number;
  senderNickname: string;
  content: string;
  type: "public" | "private" | "system";
  recipientNickname?: string | null;
  createdAt: Date | string;
}

interface ChatContextType {
  socket: Socket | null;
  isConnected: boolean;
  nickname: string | null;
  myRole: UserRole;
  roomId: number | null;
  roomName: string;
  users: ChatUser[];
  messages: ChatMessage[];
  privateMessages: Record<string, ChatMessage[]>;
  unreadPMs: Record<string, number>;
  incomingPM: { from: string; preview: string } | null;
  dismissIncomingPM: () => void;
  isMuted: boolean;
  isVoiceBanned: boolean;
  isTextMuted: boolean;
  // Auth
  requireSuperAdminAuth: boolean;
  superAdminPasswordSet: boolean;
  joinRoom: (nickname: string, roomId: number, token?: string) => void;
  switchRoom: (roomId: number) => void;
  authenticateSuperAdmin: (password: string, isSetup: boolean) => void;
  leaveRoom: () => void;
  // Messaging
  sendMessage: (content: string) => void;
  sendPrivateMessage: (recipientNickname: string, content: string) => void;
  toggleMute: () => void;
  setNickname: (n: string) => void;
  clearMessages: () => void;
  clearAllMessages: () => void;
  markPMRead: (fromNickname: string) => void;
  // Admin actions
  kickUser: (targetNickname: string) => void;
  banUser: (targetNickname: string, reason?: string, voiceBanOnly?: boolean) => void;
  unbanUser: (targetNickname: string) => void;
  promoteUser: (targetNickname: string) => void;
  demoteUser: (targetNickname: string) => void;
  muteUserText: (targetNickname: string) => void;
  unmuteUserText: (targetNickname: string) => void;
  requestBannedList: () => void;
  bannedList: Array<{ id: number; nickname?: string | null; ipAddress?: string | null; reason?: string | null; voiceBanOnly: boolean }>;
}

const ChatContext = createContext<ChatContextType | null>(null);

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [nickname, setNicknameState] = useState<string | null>(null);
  const [myRole, setMyRole] = useState<UserRole>("user");
  const [roomId, setRoomId] = useState<number | null>(null);
  const [roomName, setRoomName] = useState("Now");
  const [users, setUsers] = useState<ChatUser[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [privateMessages, setPrivateMessages] = useState<Record<string, ChatMessage[]>>({});
  const [unreadPMs, setUnreadPMs] = useState<Record<string, number>>({});
  const [incomingPM, setIncomingPM] = useState<{ from: string; preview: string } | null>(null);
  const [isMuted, setIsMuted] = useState(true);
  const [isVoiceBanned, setIsVoiceBanned] = useState(false);
  const [isTextMuted, setIsTextMuted] = useState(false);
  const [requireSuperAdminAuth, setRequireSuperAdminAuth] = useState(false);
  const [superAdminPasswordSet, setSuperAdminPasswordSet] = useState(false);
  const [bannedList, setBannedList] = useState<ChatContextType["bannedList"]>([]);
  // Pending join info for super admin (stored while waiting for auth)
  const pendingRoomIdRef = useRef<number | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const nicknameRef = useRef<string | null>(null);

  useEffect(() => {
    AsyncStorage.getItem("later_nickname").then((n) => {
      if (n) {
        setNicknameState(n);
        nicknameRef.current = n;
      }
    });
  }, []);

  const setNickname = useCallback((n: string) => {
    setNicknameState(n);
    nicknameRef.current = n;
    AsyncStorage.setItem("later_nickname", n);
  }, []);

  const dismissIncomingPM = useCallback(() => setIncomingPM(null), []);

  const markPMRead = useCallback((fromNickname: string) => {
    setUnreadPMs((prev) => {
      const next = { ...prev };
      delete next[fromNickname];
      return next;
    });
  }, []);

  const setupSocketListeners = useCallback((sock: Socket) => {
    sock.on("connect", () => {
      setIsConnected(true);
    });

    sock.on("disconnect", () => {
      setIsConnected(false);
    });

    sock.on("room_joined", ({ roomId: rId, roomName: rName, users: roomUsers }: { roomId: number; roomName?: string; nickname: string; users: ChatUser[] }) => {
      setRoomId(rId);
      if (rName) setRoomName(rName);
      setUsers(roomUsers);
      setRequireSuperAdminAuth(false);
    });

    sock.on("message_history", (history: ChatMessage[]) => {
      setMessages(history.map((m) => ({ ...m, createdAt: new Date(m.createdAt) })));
    });

    sock.on("new_message", (msg: ChatMessage) => {
      setMessages((prev) => [...prev, { ...msg, createdAt: new Date(msg.createdAt) }]);
    });

    sock.on("system_message", (msg: ChatMessage) => {
      setMessages((prev) => [...prev, { ...msg, createdAt: new Date(msg.createdAt) }]);
    });

    sock.on("private_message", (msg: ChatMessage) => {
      const myNick = nicknameRef.current;
      const otherNickname =
        msg.senderNickname === myNick
          ? (msg.recipientNickname ?? msg.senderNickname)
          : msg.senderNickname;

      setPrivateMessages((prev) => ({
        ...prev,
        [otherNickname]: [
          ...(prev[otherNickname] || []),
          { ...msg, createdAt: new Date(msg.createdAt) },
        ],
      }));

      if (msg.senderNickname !== myNick) {
        setUnreadPMs((prev) => ({
          ...prev,
          [msg.senderNickname]: (prev[msg.senderNickname] || 0) + 1,
        }));
        setIncomingPM({
          from: msg.senderNickname,
          preview: msg.content.length > 40 ? msg.content.slice(0, 40) + "..." : msg.content,
        });
        setTimeout(() => setIncomingPM(null), 5000);
      }
    });

    sock.on("users_updated", (updatedUsers: ChatUser[]) => {
      setUsers(updatedUsers);
      // Update my own role from the users list
      const me = updatedUsers.find((u) => u.nickname === nicknameRef.current);
      if (me) setMyRole(me.role);
    });

    sock.on("room_cleared", () => {
      setMessages([]);
    });

    // Super admin auth flow
    sock.on("require_super_admin_auth", ({ isPasswordSet }: { isPasswordSet: boolean }) => {
      setRequireSuperAdminAuth(true);
      setSuperAdminPasswordSet(isPasswordSet);
    });

    sock.on("super_admin_auth_result", ({ success, message }: { success: boolean; message: string }) => {
      if (!success) {
        Alert.alert("Authentication Failed", message);
      }
      // On success, room_joined will fire automatically
    });

    // Admin events
    sock.on("kicked", ({ reason }: { reason: string }) => {
      Alert.alert("Kicked", reason);
      socketRef.current?.disconnect();
      socketRef.current = null;
      setSocket(null);
      setIsConnected(false);
      setRoomId(null);
      setUsers([]);
      setMessages([]);
      setNicknameState(null);
      nicknameRef.current = null;
    });

    sock.on("voice_banned", ({ message }: { message: string }) => {
      setIsVoiceBanned(true);
      setIsMuted(true);
      Alert.alert("Voice Banned", message);
    });

    sock.on("text_muted", ({ message }: { message: string }) => {
      setIsTextMuted(true);
      Alert.alert("Muted", message);
    });

    sock.on("text_unmuted", ({ message }: { message: string }) => {
      setIsTextMuted(false);
      Alert.alert("Unmuted", message);
    });

    sock.on("role_updated", ({ role, message }: { role: UserRole; message: string }) => {
      setMyRole(role);
      Alert.alert("Role Updated", message);
    });

    sock.on("admin_action_result", ({ success, message }: { success: boolean; message: string }) => {
      Alert.alert(success ? "Success" : "Error", message);
    });

    sock.on("admin_banned_list", (list: ChatContextType["bannedList"]) => {
      setBannedList(list);
    });

    sock.on("error", ({ message }: { message: string }) => {
      console.error("[Socket] Error:", message);
    });
  }, []);

  const initSocket = useCallback(() => {
    if (socketRef.current?.connected) return socketRef.current;

    const apiBase = getApiBaseUrl();
    const newSocket = io(apiBase, {
      path: "/api/socket",
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    setupSocketListeners(newSocket);
    socketRef.current = newSocket;
    setSocket(newSocket);
    return newSocket;
  }, [setupSocketListeners]);

  const joinRoom = useCallback((nick: string, rId: number, token?: string) => {
    setMessages([]);
    setPrivateMessages({});
    setUnreadPMs({});
    setIncomingPM(null);
    setUsers([]);
    setIsVoiceBanned(false);
    setIsTextMuted(false);
    setMyRole("user");

    const s = initSocket();
    setNickname(nick);
    pendingRoomIdRef.current = rId;

    const doJoin = () => {
      s.emit("join_room", { nickname: nick, roomId: rId, token });
    };

    if (s.connected) {
      doJoin();
    } else {
      s.once("connect", doJoin);
    }
  }, [initSocket, setNickname]);

  const switchRoom = useCallback((newRoomId: number) => {
    const sock = socketRef.current;
    if (!sock || !sock.connected) return;
    // Clear messages and users for the new room immediately
    setMessages([]);
    setPrivateMessages({});
    setUnreadPMs({});
    setIncomingPM(null);
    setUsers([]);
    // Use the dedicated switch_room event (no reconnect needed)
    sock.emit("switch_room", { roomId: newRoomId });
  }, []);

  const authenticateSuperAdmin = useCallback((password: string, isSetup: boolean) => {
    const rId = pendingRoomIdRef.current ?? 1;
    socketRef.current?.emit("super_admin_auth", { password, isSetup, roomId: rId });
    setMyRole("super_admin");
  }, []);

  const leaveRoom = useCallback(() => {
    socketRef.current?.disconnect();
    socketRef.current = null;
    setSocket(null);
    setIsConnected(false);
    setRoomId(null);
    setUsers([]);
    setMessages([]);
    setPrivateMessages({});
    setUnreadPMs({});
    setIncomingPM(null);
    setIsMuted(true);
    setIsVoiceBanned(false);
    setIsTextMuted(false);
    setRequireSuperAdminAuth(false);
    setMyRole("user");
  }, []);

  const sendMessage = useCallback((content: string) => {
    socketRef.current?.emit("send_message", { content });
  }, []);

  const sendPrivateMessage = useCallback((recipientNickname: string, content: string) => {
    socketRef.current?.emit("send_private_message", { recipientNickname, content });
  }, []);

  const toggleMute = useCallback(() => {
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    socketRef.current?.emit("toggle_mute", { isMuted: newMuted });
  }, [isMuted]);

  const clearMessages = useCallback(() => setMessages([]), []);

  const clearAllMessages = useCallback(() => {
    const sock = socketRef.current;
    if (!sock || !sock.connected) {
      Alert.alert("Error", "Not connected to server");
      return;
    }
    // Use socket clear_room — server deletes from DB and broadcasts room_cleared to ALL users in the room
    sock.emit("clear_room", (result: { success: boolean; message?: string }) => {
      if (!result?.success) {
        Alert.alert("Error", result?.message || "Failed to clear chat");
      }
    });
  }, []);

  // Admin actions
  const kickUser = useCallback((targetNickname: string) => {
    socketRef.current?.emit("admin_kick", { targetNickname });
  }, []);

  const banUser = useCallback((targetNickname: string, reason?: string, voiceBanOnly?: boolean) => {
    socketRef.current?.emit("admin_ban", { targetNickname, reason, voiceBanOnly });
  }, []);

  const unbanUser = useCallback((targetNickname: string) => {
    socketRef.current?.emit("admin_unban", { targetNickname });
  }, []);

  const promoteUser = useCallback((targetNickname: string) => {
    socketRef.current?.emit("admin_promote", { targetNickname });
  }, []);

  const demoteUser = useCallback((targetNickname: string) => {
    socketRef.current?.emit("admin_demote", { targetNickname });
  }, []);

  const muteUserText = useCallback((targetNickname: string) => {
    socketRef.current?.emit("mod_mute_text", { targetNickname });
  }, []);

  const unmuteUserText = useCallback((targetNickname: string) => {
    socketRef.current?.emit("mod_unmute_text", { targetNickname });
  }, []);

  const requestBannedList = useCallback(() => {
    socketRef.current?.emit("admin_get_banned");
  }, []);

  useEffect(() => {
    return () => {
      socketRef.current?.disconnect();
    };
  }, []);

  return (
    <ChatContext.Provider
      value={{
        socket,
        isConnected,
        nickname,
        myRole,
        roomId,
        roomName,
        users,
        messages,
        privateMessages,
        unreadPMs,
        incomingPM,
        dismissIncomingPM,
        isMuted,
        isVoiceBanned,
        isTextMuted,
        requireSuperAdminAuth,
        superAdminPasswordSet,
        joinRoom,
        switchRoom,
        authenticateSuperAdmin,
        leaveRoom,
        sendMessage,
        sendPrivateMessage,
        toggleMute,
        setNickname,
        clearMessages,
        clearAllMessages,
        markPMRead,
        kickUser,
        banUser,
        unbanUser,
        promoteUser,
        demoteUser,
        muteUserText,
        unmuteUserText,
        requestBannedList,
        bannedList,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}

export function useChat() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChat must be used within ChatProvider");
  return ctx;
}
