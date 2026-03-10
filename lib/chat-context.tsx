import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import { getApiBaseUrl } from "@/constants/oauth";
import AsyncStorage from "@react-native-async-storage/async-storage";

export interface ChatUser {
  nickname: string;
  isMuted: boolean;
  isVoiceActive: boolean;
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
  roomId: number | null;
  roomName: string;
  users: ChatUser[];
  messages: ChatMessage[];
  privateMessages: Record<string, ChatMessage[]>; // keyed by other user's nickname
  isMuted: boolean;
  joinRoom: (nickname: string, roomId: number, token?: string) => void;
  leaveRoom: () => void;
  sendMessage: (content: string) => void;
  sendPrivateMessage: (recipientNickname: string, content: string) => void;
  toggleMute: () => void;
  setNickname: (n: string) => void;
  clearMessages: () => void;
}

const ChatContext = createContext<ChatContextType | null>(null);

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [nickname, setNicknameState] = useState<string | null>(null);
  const [roomId, setRoomId] = useState<number | null>(null);
  const [roomName, setRoomName] = useState("Now");
  const [users, setUsers] = useState<ChatUser[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [privateMessages, setPrivateMessages] = useState<Record<string, ChatMessage[]>>({});
  const [isMuted, setIsMuted] = useState(true);
  const socketRef = useRef<Socket | null>(null);

  // Load saved nickname
  useEffect(() => {
    AsyncStorage.getItem("later_nickname").then((n) => {
      if (n) setNicknameState(n);
    });
  }, []);

  const setNickname = useCallback((n: string) => {
    setNicknameState(n);
    AsyncStorage.setItem("later_nickname", n);
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

    newSocket.on("connect", () => {
      console.log("[Socket] Connected:", newSocket.id);
      setIsConnected(true);
    });

    newSocket.on("disconnect", () => {
      console.log("[Socket] Disconnected");
      setIsConnected(false);
    });

    newSocket.on("room_joined", ({ roomId: rId, users: roomUsers }: { roomId: number; nickname: string; users: ChatUser[] }) => {
      setRoomId(rId);
      setUsers(roomUsers);
    });

    newSocket.on("message_history", (history: ChatMessage[]) => {
      setMessages(history.map((m) => ({ ...m, createdAt: new Date(m.createdAt) })));
    });

    newSocket.on("new_message", (msg: ChatMessage) => {
      setMessages((prev) => [...prev, { ...msg, createdAt: new Date(msg.createdAt) }]);
    });

    newSocket.on("system_message", (msg: ChatMessage) => {
      setMessages((prev) => [...prev, { ...msg, createdAt: new Date(msg.createdAt) }]);
    });

    newSocket.on("private_message", (msg: ChatMessage) => {
      const otherNickname = msg.senderNickname === nickname ? msg.recipientNickname! : msg.senderNickname;
      setPrivateMessages((prev) => ({
        ...prev,
        [otherNickname]: [...(prev[otherNickname] || []), { ...msg, createdAt: new Date(msg.createdAt) }],
      }));
    });

    newSocket.on("users_updated", (updatedUsers: ChatUser[]) => {
      setUsers(updatedUsers);
    });

    newSocket.on("error", ({ message }: { message: string }) => {
      console.error("[Socket] Error:", message);
    });

    socketRef.current = newSocket;
    setSocket(newSocket);
    return newSocket;
  }, [nickname]);

  const joinRoom = useCallback((nick: string, rId: number, token?: string) => {
    const s = initSocket();
    setNickname(nick);
    setRoomId(rId);

    if (s.connected) {
      s.emit("join_room", { nickname: nick, roomId: rId, token });
    } else {
      s.once("connect", () => {
        s.emit("join_room", { nickname: nick, roomId: rId, token });
      });
    }
  }, [initSocket, setNickname]);

  const leaveRoom = useCallback(() => {
    socketRef.current?.disconnect();
    socketRef.current = null;
    setSocket(null);
    setIsConnected(false);
    setRoomId(null);
    setUsers([]);
    setMessages([]);
    setIsMuted(true);
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

  const clearMessages = useCallback(() => {
    setMessages([]);
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
        roomId,
        roomName,
        users,
        messages,
        privateMessages,
        isMuted,
        joinRoom,
        leaveRoom,
        sendMessage,
        sendPrivateMessage,
        toggleMute,
        setNickname,
        clearMessages,
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
