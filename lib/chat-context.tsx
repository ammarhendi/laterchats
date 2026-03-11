import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import { getApiBaseUrl } from "@/constants/oauth";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getOrCreateKeyPair, registerPublicKey, getPublicKey, encryptMessage, decryptMessage, clearPublicKeyRegistry } from "@/lib/e2ee";
import { crossAlert, crossInfo } from "@/lib/cross-alert";

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
  rawContent?: string; // original encrypted content for retry decryption
  type: "public" | "private" | "system";
  recipientNickname?: string | null;
  createdAt: Date | string;
  isOffline?: boolean;
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
  pendingFriendRequests: number;
  incomingFriendRequest: { from: string } | null;
  dismissFriendRequest: () => void;
  isMuted: boolean;
  isVoiceBanned: boolean;
  isTextMuted: boolean;
  // Auth
  joinRoom: (nickname: string, roomId: number, token?: string) => void;
  switchRoom: (roomId: number) => void;
  leaveRoom: () => void;
  // Messaging
  sendMessage: (content: string) => void;
  sendPrivateMessage: (recipientNickname: string, content: string) => void;
  toggleMute: () => void;
  setNickname: (n: string) => void;
  clearMessages: () => void;
  clearAllMessages: () => void;
  markPMRead: (fromNickname: string) => void;
  // Socket management
  ensureSocket: () => void;
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
  const [bannedList, setBannedList] = useState<ChatContextType["bannedList"]>([]);
  const [pendingFriendRequests, setPendingFriendRequests] = useState(0);
  const [incomingFriendRequest, setIncomingFriendRequest] = useState<{ from: string } | null>(null);
  const pendingRoomIdRef = useRef<number | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const nicknameRef = useRef<string | null>(null);
  // Persist the "cleared at" timestamp so messages cleared by the user don't come back after sign-out/in
  const clearedAtRef = useRef<number>(0);

  useEffect(() => {
    // IMPORTANT: Load cleared-at timestamp FIRST, then create socket.
    // This prevents the race condition where message_history arrives before
    // the cleared timestamp is restored, causing cleared messages to reappear.
    (async () => {
      // Step 1: Restore nickname first (needed for per-user cleared_at key)
      const n = await AsyncStorage.getItem("later_nickname");
      console.log('[ChatContext] Init: nickname from storage =', n);

      // Step 2: Restore cleared-at timestamp (per-user key)
      if (n) {
        const ts = await AsyncStorage.getItem(`later_cleared_at_${n.toLowerCase()}`);
        if (ts) clearedAtRef.current = parseInt(ts, 10);
      }
      if (n) {
        setNicknameState(n);
        nicknameRef.current = n;
        // Auto-connect socket so user appears online immediately on app open
        const apiBase = getApiBaseUrl();
        console.log('[ChatContext] Init: apiBase =', apiBase, '| socketRef.current?.connected =', socketRef.current?.connected);
        if (!socketRef.current?.connected) {
          console.log('[ChatContext] Init: calling io() with', apiBase);
          const s = io(apiBase, {
            path: "/api/socket",
            transports: ["websocket", "polling"],
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000,
          });
          s.on("connect", () => {
            s.emit("register_presence", { nickname: n });
            setIsConnected(true);
          });
          s.on("reconnect", () => {
            s.emit("register_presence", { nickname: nicknameRef.current || n });
          });
          setupSocketListeners(s);
          socketRef.current = s;
          setSocket(s);
        }
      }
    })();
  }, []);

  const setNickname = useCallback((n: string) => {
    setNicknameState(n);
    nicknameRef.current = n;
    AsyncStorage.setItem("later_nickname", n);
  }, []);

  const dismissIncomingPM = useCallback(() => setIncomingPM(null), []);
  const dismissFriendRequest = useCallback(() => {
    setIncomingFriendRequest(null);
    setPendingFriendRequests(0);
  }, []);

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

    // When socket reconnects after server restart, rejoin the room
    sock.io.on("reconnect", () => {
      const nick = nicknameRef.current;
      const rId = pendingRoomIdRef.current;
      if (nick && rId) {
        // Use rejoin_room so super admin doesn't need to re-enter password
        // The server will resolve the correct role based on nickname
        sock.emit("rejoin_room", { nickname: nick, roomId: rId, role: "user" });
      }
    });
    sock.on("disconnect", () => {
      setIsConnected(false);
    });

    sock.on("room_joined", ({ roomId: rId, roomName: rName, users: roomUsers }: { roomId: number; roomName?: string; nickname: string; users: ChatUser[] }) => {
      setRoomId(rId);
      if (rName) setRoomName(rName);
      setUsers(roomUsers);
      // Broadcast our public key to the room for E2EE
      getOrCreateKeyPair().then((pubKeyJwk) => {
        sock.emit("publish_public_key", { publicKeyJwk: pubKeyJwk });
      }).catch(() => {});
    });

    // Receive other users' public keys for E2EE
    sock.on("public_key_broadcast", async ({ nickname: keyOwner, publicKeyJwk }: { nickname: string; publicKeyJwk: string }) => {
      registerPublicKey(keyOwner, publicKeyJwk);
      // Retry decryption for messages that couldn't be decrypted earlier (key wasn't available)
      setPrivateMessages((prev) => {
        const conv = prev[keyOwner];
        if (!conv) return prev;
        const needsRetry = conv.some((m) => m.content === "[Encrypted message]" && m.rawContent?.startsWith("e2ee:"));
        if (!needsRetry) return prev;
        // Schedule async retry outside setState
        const pubKey = getPublicKey(keyOwner);
        if (!pubKey) return prev;
        Promise.all(
          conv.map(async (m) => {
            if (m.content !== "[Encrypted message]" || !m.rawContent?.startsWith("e2ee:")) return m;
            const encrypted = m.rawContent.slice(5);
            const decrypted = await decryptMessage(encrypted, pubKey);
            return decrypted ? { ...m, content: decrypted } : m;
          })
        ).then((updated) => {
          setPrivateMessages((p) => ({ ...p, [keyOwner]: updated }));
        });
        return prev; // return unchanged for now; async update will follow
      });
    });

    sock.on("message_history", (history: ChatMessage[]) => {
      const cutoff = clearedAtRef.current;
      const filtered = history
        .map((m) => ({ ...m, createdAt: new Date(m.createdAt) }))
        .filter((m) => cutoff === 0 || new Date(m.createdAt).getTime() > cutoff);
      setMessages(filtered);
    });

    sock.on("new_message", (msg: ChatMessage) => {
      setMessages((prev) => [...prev, { ...msg, createdAt: new Date(msg.createdAt) }]);
    });

    sock.on("system_message", (msg: ChatMessage) => {
      setMessages((prev) => [...prev, { ...msg, createdAt: new Date(msg.createdAt) }]);
    });

    sock.on("private_message", async (msg: ChatMessage) => {
      const myNick = nicknameRef.current;
      const otherNickname =
        msg.senderNickname === myNick
          ? (msg.recipientNickname ?? msg.senderNickname)
          : msg.senderNickname;

      // Deduplicate: skip if we already have this message id in this conversation
      setPrivateMessages((prev) => {
        const existing = prev[otherNickname] || [];
        if (existing.some((m) => m.id === msg.id)) return prev; // already have it
        return prev; // will be set after decryption below
      });

      // Attempt E2EE decryption if message starts with the encrypted prefix
      let displayContent = msg.content;
      if (msg.content.startsWith("e2ee:")) {
        const encryptedPart = msg.content.slice(5);
        const senderKey = getPublicKey(msg.senderNickname);
        if (senderKey) {
          const decrypted = await decryptMessage(encryptedPart, senderKey);
          if (decrypted) displayContent = decrypted;
          else displayContent = "[Encrypted message]"; // graceful fallback
        } else {
          displayContent = "[Encrypted message]"; // key not yet available
        }
      }

      // Store rawContent so we can retry decryption later if key wasn't available
      const displayMsg = {
        ...msg,
        content: displayContent,
        rawContent: msg.content, // preserve original for retry
        createdAt: new Date(msg.createdAt),
      };

      setPrivateMessages((prev) => {
        const existing = prev[otherNickname] || [];
        // Deduplicate by message id
        if (existing.some((m) => m.id === msg.id)) return prev;
        return {
          ...prev,
          [otherNickname]: [...existing, displayMsg],
        };
      });

      if (msg.senderNickname !== myNick) {
        setUnreadPMs((prev) => ({
          ...prev,
          [msg.senderNickname]: (prev[msg.senderNickname] || 0) + 1,
        }));
        // Show a clean preview (no e2ee: prefix)
        const previewText = displayContent.startsWith("e2ee:") ? "[Encrypted message]" : displayContent;
        setIncomingPM({
          from: msg.senderNickname,
          preview: previewText.length > 40 ? previewText.slice(0, 40) + "..." : previewText,
        });
        setTimeout(() => setIncomingPM(null), 5000);
      }
    });

    sock.on("users_updated", (updatedUsers: ChatUser[]) => {
      setUsers(updatedUsers);
      // Update my own role from the users list
      const myNick = nicknameRef.current;
      if (myNick) {
        const me = updatedUsers.find((u) => u.nickname.toLowerCase() === myNick.toLowerCase());
        if (me) {
          setMyRole(me.role);
        }
        // If not found in list but nickname is a super admin name, keep super_admin role
        // This handles the case where users_updated fires before the super admin appears in the list
      }
    });

    sock.on("room_cleared", () => {
      setMessages([]);
    });

    sock.on("offline_pms_delivered", ({ count }: { count: number }) => {
      crossInfo(
        "📬 Missed Messages",
        `You have ${count} private message${count === 1 ? "" : "s"} that arrived while you were offline.`
      );
    });

    // Admin events
    sock.on("kicked", ({ reason }: { reason: string }) => {
      crossInfo("Kicked", reason);
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
      crossInfo("Voice Banned", message);
    });

    sock.on("text_muted", ({ message }: { message: string }) => {
      setIsTextMuted(true);
      crossInfo("Muted", message);
    });

    sock.on("text_unmuted", ({ message }: { message: string }) => {
      setIsTextMuted(false);
      crossInfo("Unmuted", message);
    });

    sock.on("role_updated", ({ role, message }: { role: UserRole; message: string }) => {
      setMyRole(role);
      crossInfo("Role Updated", message);
    });

    sock.on("admin_action_result", ({ success, message }: { success: boolean; message: string }) => {
      crossInfo(success ? "✓ Success" : "Error", message);
    });

    sock.on("admin_banned_list", (list: ChatContextType["bannedList"]) => {
      setBannedList(list);
    });

    sock.on("error", ({ message }: { message: string }) => {
      console.error("[Socket] Error:", message);
    });
    // ── Room Invite ────────────────────────────────────────────────────────────
    sock.on("room_invite", ({ fromNickname, roomId: inviteRoomId, roomName: inviteRoomName }: { fromNickname: string; roomId: number; roomName: string }) => {
      crossAlert(
        "📨 Room Invitation",
        `${fromNickname} has invited you to join "${inviteRoomName}". Would you like to join?`,
        [
          {
            text: "Decline",
            style: "cancel",
            onPress: () => sock.emit("invite_response", { fromNickname, accepted: false }),
          },
          {
            text: "Join Room",
            onPress: () => {
              sock.emit("invite_response", { fromNickname, accepted: true });
              sock.emit("switch_room", { newRoomId: inviteRoomId });
            },
          },
        ]
      );
    });
    sock.on("invite_sent", ({ targetNickname, roomName: inviteRoomName }: { targetNickname: string; roomName: string }) => {
      crossInfo("Invitation Sent", `Invitation sent to ${targetNickname} to join "${inviteRoomName}"!`);
    });
    sock.on("invite_response_result", ({ fromNickname, accepted }: { fromNickname: string; accepted: boolean }) => {
      if (accepted) {
        crossInfo("Invitation Accepted", `${fromNickname} accepted your invitation and joined the room!`);
      } else {
        crossInfo("Invitation Declined", `${fromNickname} declined your invitation.`);
      }
    });

    // Friend request notification
    sock.on("friend_request_received", ({ fromNickname }: { fromNickname: string }) => {
      setPendingFriendRequests((prev) => prev + 1);
      setIncomingFriendRequest({ from: fromNickname });
      setTimeout(() => setIncomingFriendRequest(null), 6000);
    });
  }, []);

  const initSocket = useCallback(() => {
    if (socketRef.current?.connected) {
      // Re-register presence in case it was lost (e.g. server restart)
      const nick = nicknameRef.current;
      if (nick) socketRef.current.emit("register_presence", { nickname: nick });
      return socketRef.current;
    }

    const apiBase = getApiBaseUrl();
    const newSocket = io(apiBase, {
      path: "/api/socket",
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    // Register presence as soon as socket connects (before joining any room)
    newSocket.on("connect", () => {
      const nick = nicknameRef.current;
      if (nick) {
        newSocket.emit("register_presence", { nickname: nick });
        console.log(`[Chat] Presence registered for ${nick}`);
      }
    });

    // Re-register presence on reconnect
    newSocket.on("reconnect", () => {
      const nick = nicknameRef.current;
      if (nick) newSocket.emit("register_presence", { nickname: nick });
    });

    setupSocketListeners(newSocket);
    socketRef.current = newSocket;
    setSocket(newSocket);
    return newSocket;
  }, [setupSocketListeners]);

  // Periodically request a fresh users list to keep online status accurate
  useEffect(() => {
    if (!roomId || !socketRef.current?.connected) return;
    const interval = setInterval(() => {
      if (socketRef.current?.connected) {
        socketRef.current.emit("request_users");
      }
    }, 30000); // every 30 seconds
    return () => clearInterval(interval);
  }, [roomId]);

  const joinRoom = useCallback((nick: string, rId: number, token?: string) => {
    setMessages([]);
    setPrivateMessages({});
    setUnreadPMs({});
    setIncomingPM(null);
    setUsers([]);
    setIsVoiceBanned(false);
    setIsTextMuted(false);
    setMyRole("user");
    setNickname(nick);
    pendingRoomIdRef.current = rId;

    // Load per-user cleared-at timestamp BEFORE joining room (async IIFE)
    // The socket join is deferred until after the timestamp is loaded
    (async () => {
      const ts = await AsyncStorage.getItem(`later_cleared_at_${nick.toLowerCase()}`);
      clearedAtRef.current = ts ? parseInt(ts, 10) : 0;

      const s = initSocket();
      const doJoin = () => {
        s.emit("join_room", { nickname: nick, roomId: rId, token });
      };
      if (s.connected) {
        doJoin();
      } else {
        s.once("connect", doJoin);
      }
    })();
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
    setMyRole("user");
    clearPublicKeyRegistry();
    // Clear nickname so chat screen redirects back to home
    setNicknameState(null);
    nicknameRef.current = null;
    AsyncStorage.removeItem("later_nickname").catch(() => {});
    // Reset cleared-at ref so next login loads fresh from AsyncStorage
    clearedAtRef.current = 0;
  }, []);

  const sendMessage = useCallback((content: string) => {
    socketRef.current?.emit("send_message", { content });
  }, []);

  const sendPrivateMessage = useCallback(async (recipientNickname: string, content: string) => {
    const sock = socketRef.current;
    if (!sock) return;
    // Attempt E2EE encryption if we have recipient's public key
    const recipientPubKey = getPublicKey(recipientNickname);
    if (recipientPubKey) {
      const encrypted = await encryptMessage(content, recipientPubKey);
      if (encrypted) {
        sock.emit("send_private_message", { recipientNickname, content: "e2ee:" + encrypted });
        return;
      }
    }
    // Fallback: send unencrypted (recipient not yet published their key)
    sock.emit("send_private_message", { recipientNickname, content });
  }, []);

  const toggleMute = useCallback(() => {
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    socketRef.current?.emit("toggle_mute", { isMuted: newMuted });
  }, [isMuted]);

  const clearMessages = useCallback(() => {
    const now = Date.now();
    clearedAtRef.current = now;
    // Store per-user so different users on same device don't share cleared state
    const nick = nicknameRef.current;
    if (nick) {
      AsyncStorage.setItem(`later_cleared_at_${nick.toLowerCase()}`, String(now)).catch(() => {});
    }
    setMessages([]);
  }, []);

  const clearAllMessages = useCallback(() => {
    const sock = socketRef.current;
    if (!sock || !sock.connected) {
      crossInfo("Error", "Not connected to server. Please wait for reconnection.");
      return;
    }
    // Optimistically clear local messages immediately
    setMessages([]);
    // Emit clear_room WITHOUT ack callback — ack callbacks are unreliable on mobile.
    // The server will broadcast room_cleared to all users in the room (including sender),
    // which triggers setMessages([]) for everyone. The optimistic clear above handles the sender.
    sock.emit("clear_room");
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
        joinRoom,
        switchRoom,
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
        pendingFriendRequests,
        incomingFriendRequest,
        dismissFriendRequest,
        ensureSocket: initSocket,
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
