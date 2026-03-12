import { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Image,
  ActivityIndicator,
  Modal,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { crossInfo, crossConfirm } from "@/lib/cross-alert";
import { trpc } from "@/lib/trpc";
import { useChat } from "@/lib/chat-context";
import { usePrivateCall } from "@/lib/use-private-call";
import { router, useFocusEffect } from "expo-router";
import * as Haptics from "expo-haptics";
import { ScrollView } from "react-native";

const YM_PURPLE = "#7B0099";
const YM_PURPLE_DARK = "#5A0070";
const YM_GOLD = "#FFD700";
const YM_GREEN = "#2E7D32";
const YM_BLUE = "#1565C0";
const YM_RED = "#C62828";

type FriendEntry = {
  username: string;
  status: string;
  direction: string;
  isOnline?: boolean;
};

function FriendAvatar({ username, avatarUrl, size = 44 }: { username: string; avatarUrl?: string | null; size?: number }) {
  if (avatarUrl) {
    return <Image source={{ uri: avatarUrl }} style={{ width: size, height: size, borderRadius: size / 2 }} />;
  }
  const initials = username.slice(0, 2).toUpperCase();
  const colors = ["#7B0099", "#0077CC", "#CC4400", "#007744", "#AA0044"];
  const bg = colors[username.charCodeAt(0) % colors.length];
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: "#fff", fontWeight: "bold", fontSize: size * 0.36 }}>{initials}</Text>
    </View>
  );
}

const FALLBACK_ROOMS = [
  { id: 1, name: "Later! Lobby", description: "Main public chat room" },
  { id: 2, name: "Music & Vibes", description: "Talk about music" },
  { id: 3, name: "Sports Talk", description: "Sports discussion" },
  { id: 4, name: "Night Owls", description: "Late night chat" },
  { id: 5, name: "Chill Zone", description: "Relax and chat" },
];

export default function FriendsScreen() {
  const {
    nickname,
    pendingFriendRequests,
    dismissFriendRequest,
    joinRoom,
    unreadPMs,
    markPMRead,
    ensureSocket,
    socket,
  } = useChat();

  const {
    callState,
    callPartner,
    incomingFrom,
    callDuration,
    startCall,
    startVideoCall,
    acceptCall,
    acceptVideoCall,
    rejectCall,
    endCall,
  } = usePrivateCall();

  // Reset the badge when the user views the Friends screen
  useEffect(() => {
    if (pendingFriendRequests > 0) {
      dismissFriendRequest();
    }
  }, []);

  // Ensure socket is connected so calls/PMs work from Friends screen
  useEffect(() => {
    if (nickname) {
      ensureSocket();
    }
  }, [nickname]);

  const [addModalVisible, setAddModalVisible] = useState(false);
  const [addUsername, setAddUsername] = useState("");
  const [addLoading, setAddLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [roomsModalVisible, setRoomsModalVisible] = useState(false);
  const [joiningRoomId, setJoiningRoomId] = useState<number | null>(null);

  const { data: roomsData, isLoading: roomsLoading } = trpc.chat.getAllRooms.useQuery(undefined, { retry: 2 });
  const rooms = roomsData && roomsData.length > 0 ? roomsData : FALLBACK_ROOMS;

  const handleJoinRoom = (roomId: number) => {
    if (!nickname) return;
    setJoiningRoomId(roomId);
    joinRoom(nickname, roomId);
    setRoomsModalVisible(false);
    setTimeout(() => {
      router.push("/chat" as any);
      setJoiningRoomId(null);
    }, 800);
  };

  const username = nickname || "";

  const { data: friends, refetch, isLoading } = trpc.friends.list.useQuery(
    { username },
    { enabled: !!username, refetchInterval: 5000 }
  );

  // Refetch immediately every time the Friends screen comes into focus
  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch])
  );

  // Real-time online status: refetch when a friend's status changes or room updates fire
  useEffect(() => {
    if (!socket) return;
    const handleRefetch = () => { refetch(); };
    socket.on("friend_status_changed", handleRefetch);
    socket.on("users_updated", handleRefetch);
    return () => {
      socket.off("friend_status_changed", handleRefetch);
      socket.off("users_updated", handleRefetch);
    };
  }, [socket, refetch]);

  const sendRequestMutation = trpc.friends.sendRequest.useMutation();
  const respondMutation = trpc.friends.respond.useMutation();
  const removeMutation = trpc.friends.remove.useMutation();

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const handleAddFriend = async () => {
    if (!addUsername.trim()) return;
    setAddLoading(true);
    try {
      const result = await sendRequestMutation.mutateAsync({
        requesterUsername: username,
        recipientUsername: addUsername.trim(),
      });
      if (result.success) {
        crossInfo("Friend Request Sent", `A friend request has been sent to ${addUsername.trim()}.`);
        setAddUsername("");
        setAddModalVisible(false);
        refetch();
      } else {
        crossInfo("Error", result.error || "Could not send friend request.");
      }
    } catch {
      crossInfo("Error", "Could not send friend request.");
    }
    setAddLoading(false);
  };

  const handleAccept = async (requesterUsername: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await respondMutation.mutateAsync({ recipientUsername: username, requesterUsername, accept: true });
    refetch();
  };

  const handleDecline = async (requesterUsername: string) => {
    await respondMutation.mutateAsync({ recipientUsername: username, requesterUsername, accept: false });
    refetch();
  };

  const handleRemove = async (friendUsername: string) => {
    const ok = await crossConfirm("Remove Friend", `Remove ${friendUsername} from your friends?`, "Remove", "Cancel");
    if (ok) {
      await removeMutation.mutateAsync({ username, friendUsername });
      refetch();
    }
  };

  const handleAudioCall = (friendUsername: string) => {
    if (callState !== "idle") {
      crossInfo("Already in a call", "Please end your current call first.");
      return;
    }
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    startCall(friendUsername);
  };

  const handleVideoCall = (friendUsername: string) => {
    if (callState !== "idle") {
      crossInfo("Already in a call", "Please end your current call first.");
      return;
    }
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    startVideoCall(friendUsername);
  };

  const handleOpenPM = (friendUsername: string) => {
    markPMRead(friendUsername);
    router.push(`/pm/${friendUsername}` as any);
  };

  if (!username) {
    return (
      <ScreenContainer>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyTitle}>Sign in to see your friends</Text>
          <TouchableOpacity style={styles.signInBtn} onPress={() => router.replace("/(tabs)/index" as any)}>
            <Text style={styles.signInBtnText}>Sign In</Text>
          </TouchableOpacity>
        </View>
      </ScreenContainer>
    );
  }

  const accepted = (friends || []).filter((f: FriendEntry) => f.status === "accepted");
  const pending = (friends || []).filter((f: FriendEntry) => f.status === "pending");
  const incoming = pending.filter((f: FriendEntry) => f.direction === "received");
  const outgoing = pending.filter((f: FriendEntry) => f.direction === "sent");

  // Unread PM notifications — only from friends
  const friendNames = new Set(accepted.map((f: FriendEntry) => f.username));
  const unreadPMEntries = Object.entries(unreadPMs).filter(([from]) => friendNames.has(from) && (unreadPMs[from] || 0) > 0);
  const totalUnread = unreadPMEntries.reduce((sum, [, count]) => sum + count, 0);

  return (
    <ScreenContainer containerClassName="bg-white">
      <View style={Platform.OS === "web" ? styles.desktopWrapper : { flex: 1 }}>
      {/* Friends header */}
      <View style={styles.header}>
        {/* Logo bar */}
        <View style={styles.headerLogoBar}>
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: 1 }}>
            <Text style={styles.headerLogoText}>Later</Text>
            <Text style={[styles.headerLogoText, { color: YM_GOLD }]}>!</Text>
            <Text style={[styles.headerLogoText, { color: "rgba(255,255,255,0.7)", fontSize: 13, fontWeight: "400" }]}> Friends</Text>
          </View>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <TouchableOpacity
              style={[styles.addBtn, { backgroundColor: "rgba(255,255,255,0.2)" }]}
              onPress={() => setRoomsModalVisible(true)}
            >
              <Text style={[styles.addBtnText, { color: "#fff" }]}>💬 Rooms</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.addBtn}
              onPress={() => setAddModalVisible(true)}
            >
              <Text style={styles.addBtnText}>+ Add</Text>
            </TouchableOpacity>
          </View>
        </View>
        {/* My status row */}
        <View style={styles.headerMyStatus}>
          <FriendAvatar username={username} size={34} />
          <View style={{ marginLeft: 10, flex: 1 }}>
            <Text style={styles.headerUsername}>{username}</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <View style={styles.onlineDotCircle} />
              <Text style={styles.onlineText}>I'm Available</Text>
            </View>
          </View>
        </View>
      </View>

      {/* ── Incoming Call Banner ── */}
      {callState === "incoming" && incomingFrom && (
        <View style={styles.callBanner}>
          <Text style={styles.callBannerTitle}>📞 Incoming Call</Text>
          <Text style={styles.callBannerFrom}>{incomingFrom} is calling you...</Text>
          <View style={styles.callBannerActions}>
            <TouchableOpacity style={styles.callAcceptBtn} onPress={acceptCall}>
              <Text style={styles.callAcceptText}>✅ Answer</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.callRejectBtn} onPress={rejectCall}>
              <Text style={styles.callRejectText}>❌ Decline</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ── Incoming Video Call Banner ── */}
      {callState === "incoming_video" && incomingFrom && (
        <View style={[styles.callBanner, { backgroundColor: "#1565C0" }]}>
          <Text style={styles.callBannerTitle}>📹 Incoming Video Call</Text>
          <Text style={styles.callBannerFrom}>{incomingFrom} wants to video call...</Text>
          <View style={styles.callBannerActions}>
            <TouchableOpacity style={styles.callAcceptBtn} onPress={acceptVideoCall}>
              <Text style={styles.callAcceptText}>✅ Answer</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.callRejectBtn} onPress={rejectCall}>
              <Text style={styles.callRejectText}>❌ Decline</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ── Active Call Bar ── */}
      {(callState === "calling" || callState === "connected") && callPartner && (
        <View style={[styles.activeCallBar, callState === "connected" && styles.activeCallBarConnected]}>
          <Text style={styles.activeCallText}>
            {callState === "calling" ? `📞 Calling ${callPartner}...` : `🟢 In call with ${callPartner} • ${callDuration}`}
          </Text>
          <TouchableOpacity style={styles.endCallBtn} onPress={endCall}>
            <Text style={styles.endCallText}>End</Text>
          </TouchableOpacity>
        </View>
      )}

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={YM_PURPLE} />
        </View>
      ) : (
        <FlatList
          data={[]}
          renderItem={null}
          ListHeaderComponent={
            <View>
              {/* ── PM Notification Cards ── */}
              {unreadPMEntries.length > 0 && (
                <View>
                  <View style={[styles.sectionHeader, { backgroundColor: "#FFF3E0" }]}>
                    <Text style={[styles.sectionHeaderText, { color: "#E65100" }]}>
                      💬 New Messages ({totalUnread})
                    </Text>
                  </View>
                  {unreadPMEntries.map(([from, count]) => (
                    <TouchableOpacity
                      key={from}
                      style={styles.pmNotifCard}
                      onPress={() => handleOpenPM(from)}
                      activeOpacity={0.75}
                    >
                      <View style={styles.pmNotifAvatar}>
                        <FriendAvatar username={from} size={42} />
                        <View style={styles.pmNotifBadge}>
                          <Text style={styles.pmNotifBadgeText}>{count > 9 ? "9+" : count}</Text>
                        </View>
                      </View>
                      <View style={styles.pmNotifInfo}>
                        <Text style={styles.pmNotifName}>{from}</Text>
                        <Text style={styles.pmNotifSub}>
                          {count === 1 ? "1 new private message" : `${count} new private messages`}
                        </Text>
                      </View>
                      <Text style={styles.pmNotifArrow}>›</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* Incoming friend requests */}
              {incoming.length > 0 && (
                <View>
                  <View style={styles.sectionHeader}>
                    <Text style={styles.sectionHeaderText}>🔔 Friend Requests ({incoming.length})</Text>
                  </View>
                  {incoming.map((f: FriendEntry) => (
                    <View key={f.username} style={styles.requestCard}>
                      <FriendAvatar username={f.username} size={42} />
                      <View style={styles.requestInfo}>
                        <Text style={styles.requestUsername}>{f.username}</Text>
                        <Text style={styles.requestSubtext}>wants to be your friend</Text>
                      </View>
                      <View style={styles.requestActions}>
                        <TouchableOpacity style={styles.acceptBtn} onPress={() => handleAccept(f.username)}>
                          <Text style={styles.acceptBtnText}>Accept</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.declineBtn} onPress={() => handleDecline(f.username)}>
                          <Text style={styles.declineBtnText}>Decline</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                </View>
              )}

              {/* Online friends */}
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionHeaderText}>🟡 Online ({accepted.filter((f: FriendEntry) => f.isOnline).length})</Text>
              </View>

              {accepted.filter((f: FriendEntry) => f.isOnline).length > 0 && (
                <View style={styles.offlineSectionHeader}>
                  <Text style={styles.offlineSectionHeaderText}>⚪ Offline ({accepted.filter((f: FriendEntry) => !f.isOnline).length})</Text>
                </View>
              )}

              {/* All friends placeholder header for empty state */}
              {accepted.length === 0 && (
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionHeaderText}>👥 Friends (0)</Text>
                </View>
              )}

              {accepted.length === 0 ? (
                <View style={styles.noFriendsContainer}>
                  <Text style={styles.noFriendsText}>No friends yet.</Text>
                  <Text style={styles.noFriendsSubtext}>Tap "+ Add Friend" to find people.</Text>
                </View>
              ) : (
                accepted.map((f: FriendEntry) => {
                  const pmCount = unreadPMs[f.username] || 0;
                  return (
                    <View key={f.username} style={styles.friendRow}>
                      <TouchableOpacity
                        style={styles.friendAvatarWrap}
                        onLongPress={() => handleRemove(f.username)}
                      >
                        <FriendAvatar username={f.username} size={44} />
                        <View style={[styles.statusDot, f.isOnline ? styles.statusOnline : styles.statusOffline]} />
                      </TouchableOpacity>
                      <View style={styles.friendInfo}>
                        <Text style={styles.friendUsername}>{f.username}</Text>
                        <Text style={[styles.friendStatus, f.isOnline ? styles.friendStatusOnline : styles.friendStatusOffline]}>
                          {f.isOnline ? "● Online" : "○ Offline"}
                        </Text>
                      </View>
                      {/* Action buttons */}
                      <View style={styles.friendActions}>
                        {/* Message button with unread badge */}
                        <TouchableOpacity
                          style={styles.actionBtn}
                          onPress={() => handleOpenPM(f.username)}
                        >
                          <Text style={styles.actionBtnIcon}>💬</Text>
                          {pmCount > 0 && (
                            <View style={styles.actionBadge}>
                              <Text style={styles.actionBadgeText}>{pmCount > 9 ? "9+" : pmCount}</Text>
                            </View>
                          )}
                        </TouchableOpacity>
                        {/* Audio call button */}
                        <TouchableOpacity
                          style={[styles.actionBtn, !f.isOnline && styles.actionBtnDisabled]}
                          onPress={() => f.isOnline && handleAudioCall(f.username)}
                        >
                          <Text style={[styles.actionBtnIcon, !f.isOnline && styles.actionBtnIconDisabled]}>📞</Text>
                        </TouchableOpacity>
                        {/* Video call button */}
                        <TouchableOpacity
                          style={[styles.actionBtn, !f.isOnline && styles.actionBtnDisabled]}
                          onPress={() => f.isOnline && handleVideoCall(f.username)}
                        >
                          <Text style={[styles.actionBtnIcon, !f.isOnline && styles.actionBtnIconDisabled]}>📹</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })
              )}

              {/* Outgoing pending requests */}
              {outgoing.length > 0 && (
                <View>
                  <View style={styles.sectionHeader}>
                    <Text style={styles.sectionHeaderText}>⏳ Pending Sent ({outgoing.length})</Text>
                  </View>
                  {outgoing.map((f: FriendEntry) => (
                    <View key={f.username} style={styles.friendRow}>
                      <FriendAvatar username={f.username} size={44} />
                      <View style={[styles.friendInfo, { marginLeft: 12 }]}>
                        <Text style={styles.friendUsername}>{f.username}</Text>
                        <Text style={styles.pendingText}>Request pending...</Text>
                      </View>
                      <TouchableOpacity
                        style={styles.cancelBtn}
                        onPress={() => handleRemove(f.username)}
                      >
                        <Text style={styles.cancelBtnText}>Cancel</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}
            </View>
          }
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={YM_PURPLE} />}
          keyExtractor={(_, i) => String(i)}
          contentContainerStyle={{ paddingBottom: 32 }}
        />
      )}

      {/* Chat Rooms Modal */}
      <Modal visible={roomsModalVisible} transparent animationType="slide" onRequestClose={() => setRoomsModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { maxHeight: "80%", padding: 0, overflow: "hidden" }]}>
            <View style={[styles.roomsModalHeader, { backgroundColor: YM_PURPLE, padding: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }]}>
              <Text style={{ color: "#fff", fontWeight: "800", fontSize: 17 }}>Chat Rooms</Text>
              <TouchableOpacity onPress={() => setRoomsModalVisible(false)}>
                <Text style={{ color: "#FFD700", fontWeight: "bold", fontSize: 16 }}>✕ Close</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 16 }}>
              {roomsLoading ? (
                <ActivityIndicator color={YM_PURPLE} style={{ marginTop: 24 }} />
              ) : (
                rooms.map((room: any) => (
                  <TouchableOpacity
                    key={room.id}
                    style={styles.roomRow}
                    onPress={() => handleJoinRoom(room.id)}
                    activeOpacity={0.75}
                  >
                    <View style={styles.roomRowIcon}>
                      <Text style={{ fontSize: 20 }}>💬</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.roomRowName}>{room.name}</Text>
                      {room.description ? <Text style={styles.roomRowDesc}>{room.description}</Text> : null}
                    </View>
                    {joiningRoomId === room.id ? (
                      <ActivityIndicator color={YM_PURPLE} size="small" />
                    ) : (
                      <Text style={styles.roomRowArrow}>›</Text>
                    )}
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Add Friend Modal */}
      <Modal visible={addModalVisible} transparent animationType="slide">
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Add a Friend</Text>
            <Text style={styles.modalSubtitle}>Enter their Later! ID (username)</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Username"
              placeholderTextColor="#aaa"
              value={addUsername}
              onChangeText={setAddUsername}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="send"
              onSubmitEditing={handleAddFriend}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => { setAddModalVisible(false); setAddUsername(""); }}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSendBtn, addLoading && { opacity: 0.6 }]}
                onPress={handleAddFriend}
                disabled={addLoading}
              >
                {addLoading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.modalSendText}>Send Request</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Copyright */}
      <View style={styles.copyrightBar}>
        <Text style={styles.copyrightText}>© {new Date().getFullYear()} Later. All rights reserved.</Text>
      </View>
      </View>{/* end desktopWrapper */}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  desktopWrapper: {
    flex: 1,
    maxWidth: 900,
    width: "100%",
    alignSelf: "center",
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: "#E0E0E0",
  },
  header: {
    backgroundColor: YM_PURPLE,
    borderBottomWidth: 1,
    borderBottomColor: YM_PURPLE_DARK,
  },
  headerLogoBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: "rgba(255,255,255,0.2)",
  },
  headerLogoText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 17,
    letterSpacing: -0.3,
  },
  headerMyStatus: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  headerTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  headerUsername: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 16,
  },
  onlineDot: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 2,
  },
  onlineDotCircle: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#4CAF50",
    marginRight: 4,
  },
  onlineText: {
    color: "#ccc",
    fontSize: 12,
  },
  addBtn: {
    backgroundColor: YM_GOLD,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
  },
  addBtnText: {
    color: "#333",
    fontWeight: "bold",
    fontSize: 13,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  // ── Call banners ──
  callBanner: {
    backgroundColor: "#1B5E20",
    padding: 14,
    borderBottomWidth: 2,
    borderBottomColor: "#4CAF50",
  },
  callBannerTitle: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 16,
    marginBottom: 2,
  },
  callBannerFrom: {
    color: "#A5D6A7",
    fontSize: 13,
    marginBottom: 10,
  },
  callBannerActions: {
    flexDirection: "row",
    gap: 12,
  },
  callAcceptBtn: {
    backgroundColor: "#4CAF50",
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
  },
  callAcceptText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 14,
  },
  callRejectBtn: {
    backgroundColor: "#C62828",
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
  },
  callRejectText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 14,
  },
  activeCallBar: {
    backgroundColor: "#E65100",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  activeCallBarConnected: {
    backgroundColor: "#1B5E20",
  },
  activeCallText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 14,
    flex: 1,
  },
  endCallBtn: {
    backgroundColor: "#C62828",
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 14,
  },
  endCallText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 13,
  },
  // ── PM Notification cards ──
  pmNotifCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF8E1",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#FFE082",
  },
  pmNotifAvatar: {
    position: "relative",
  },
  pmNotifBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    backgroundColor: "#E65100",
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  pmNotifBadgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "bold",
  },
  pmNotifInfo: {
    flex: 1,
    marginLeft: 12,
  },
  pmNotifName: {
    fontWeight: "bold",
    fontSize: 15,
    color: "#222",
  },
  pmNotifSub: {
    color: "#E65100",
    fontSize: 12,
    marginTop: 2,
  },
  pmNotifArrow: {
    color: "#E65100",
    fontSize: 22,
    fontWeight: "bold",
  },
  // ── Section headers ──
  sectionHeader: {
    backgroundColor: "#EDE7F6",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#D1C4E9",
  },
  sectionHeaderText: {
    color: YM_PURPLE_DARK,
    fontWeight: "700",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  offlineSectionHeader: {
    backgroundColor: "#F5F5F5",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#E0E0E0",
  },
  offlineSectionHeaderText: {
    color: "#757575",
    fontWeight: "700",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  requestCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
    backgroundColor: "#fff",
  },
  requestInfo: {
    flex: 1,
    marginLeft: 12,
  },
  requestUsername: {
    fontWeight: "bold",
    fontSize: 15,
    color: "#222",
  },
  requestSubtext: {
    color: "#888",
    fontSize: 12,
    marginTop: 2,
  },
  requestActions: {
    flexDirection: "row",
    gap: 8,
  },
  acceptBtn: {
    backgroundColor: "#4CAF50",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
  },
  acceptBtnText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 12,
  },
  declineBtn: {
    backgroundColor: "#ddd",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
  },
  declineBtnText: {
    color: "#555",
    fontWeight: "bold",
    fontSize: 12,
  },
  noFriendsContainer: {
    alignItems: "center",
    paddingVertical: 40,
  },
  noFriendsText: {
    color: "#888",
    fontSize: 16,
    fontWeight: "600",
  },
  noFriendsSubtext: {
    color: "#aaa",
    fontSize: 13,
    marginTop: 6,
  },
  // ── Friend row ──
  friendRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
    backgroundColor: "#fff",
  },
  friendAvatarWrap: {
    position: "relative",
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#fff",
    position: "absolute",
    bottom: 0,
    right: 0,
  },
  statusOnline: {
    backgroundColor: "#4CAF50",
  },
  statusOffline: {
    backgroundColor: "#aaa",
  },
  friendInfo: {
    flex: 1,
    marginLeft: 10,
  },
  friendUsername: {
    fontWeight: "bold",
    fontSize: 14,
    color: "#222",
  },
  friendStatus: {
    fontSize: 11,
    marginTop: 2,
  },
  friendStatusOnline: {
    color: "#4CAF50",
  },
  friendStatusOffline: {
    color: "#aaa",
  },
  // ── Action buttons (Message, Audio, Video) ──
  friendActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  actionBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#F3E5F5",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  actionBtnDisabled: {
    backgroundColor: "#F5F5F5",
    opacity: 0.5,
  },
  actionBtnIcon: {
    fontSize: 18,
  },
  actionBtnIconDisabled: {
    opacity: 0.4,
  },
  actionBadge: {
    position: "absolute",
    top: -3,
    right: -3,
    backgroundColor: "#E65100",
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 2,
  },
  actionBadgeText: {
    color: "#fff",
    fontSize: 9,
    fontWeight: "bold",
  },
  pendingText: {
    color: "#F59E0B",
    fontSize: 12,
    marginTop: 2,
  },
  cancelBtn: {
    backgroundColor: "#ddd",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
  },
  cancelBtnText: {
    color: "#555",
    fontWeight: "bold",
    fontSize: 12,
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  emptyTitle: {
    fontSize: 18,
    color: "#555",
    fontWeight: "600",
    marginBottom: 20,
    textAlign: "center",
  },
  signInBtn: {
    backgroundColor: YM_PURPLE,
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 24,
  },
  signInBtnText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 16,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalBox: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 40,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: YM_PURPLE,
    marginBottom: 6,
  },
  modalSubtitle: {
    color: "#888",
    fontSize: 14,
    marginBottom: 16,
  },
  modalInput: {
    borderWidth: 1.5,
    borderColor: "#ddd",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: "#222",
    marginBottom: 16,
  },
  modalActions: {
    flexDirection: "row",
    gap: 12,
  },
  modalCancelBtn: {
    flex: 1,
    backgroundColor: "#eee",
    paddingVertical: 13,
    borderRadius: 10,
    alignItems: "center",
  },
  modalCancelText: {
    color: "#555",
    fontWeight: "bold",
    fontSize: 15,
  },
  modalSendBtn: {
    flex: 2,
    backgroundColor: YM_PURPLE,
    paddingVertical: 13,
    borderRadius: 10,
    alignItems: "center",
  },
  modalSendText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 15,
  },
  copyrightBar: {
    backgroundColor: "#4A0072",
    paddingVertical: 5,
    alignItems: "center",
  },
  copyrightText: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 10,
    letterSpacing: 0.3,
  },
  roomsModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  roomRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  roomRowIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#EDE7F6",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  roomRowName: {
    fontWeight: "700",
    fontSize: 15,
    color: "#222",
  },
  roomRowDesc: {
    color: "#888",
    fontSize: 12,
    marginTop: 2,
  },
  roomRowArrow: {
    color: YM_PURPLE,
    fontSize: 22,
    fontWeight: "bold",
  },
});
