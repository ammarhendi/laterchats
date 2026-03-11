import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Alert,
  Image,
  ActivityIndicator,
  Modal,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { trpc } from "@/lib/trpc";
import { useChat } from "@/lib/chat-context";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";

const YM_PURPLE = "#7B0099";
const YM_PURPLE_DARK = "#5A0070";
const YM_GOLD = "#FFD700";

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

export default function FriendsScreen() {
  const { nickname } = useChat();
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [addUsername, setAddUsername] = useState("");
  const [addLoading, setAddLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const username = nickname || "";

  const { data: friends, refetch, isLoading } = trpc.friends.list.useQuery(
    { username },
    { enabled: !!username, refetchInterval: 15000 }
  );

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
        Alert.alert("Friend Request Sent", `A friend request has been sent to ${addUsername.trim()}.`);
        setAddUsername("");
        setAddModalVisible(false);
        refetch();
      } else {
        Alert.alert("Error", result.error || "Could not send friend request.");
      }
    } catch {
      Alert.alert("Error", "Could not send friend request.");
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

  const handleRemove = (friendUsername: string) => {
    Alert.alert("Remove Friend", `Remove ${friendUsername} from your friends?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove", style: "destructive", onPress: async () => {
          await removeMutation.mutateAsync({ username, friendUsername });
          refetch();
        }
      },
    ]);
  };

  if (!username) {
    return (
      <ScreenContainer>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyTitle}>Sign in to see your friends</Text>
          <TouchableOpacity style={styles.signInBtn} onPress={() => router.replace("/")}>
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

  return (
    <ScreenContainer containerClassName="bg-white">
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={styles.headerLeft}>
            <FriendAvatar username={username} size={38} />
            <View style={{ marginLeft: 10 }}>
              <Text style={styles.headerUsername}>{username}</Text>
              <View style={styles.onlineDot}>
                <View style={styles.onlineDotCircle} />
                <Text style={styles.onlineText}>Online</Text>
              </View>
            </View>
          </View>
          <TouchableOpacity
            style={styles.addBtn}
            onPress={() => setAddModalVisible(true)}
          >
            <Text style={styles.addBtnText}>+ Add Friend</Text>
          </TouchableOpacity>
        </View>
      </View>

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

              {/* Friends list */}
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionHeaderText}>
                  👥 Friends ({accepted.length})
                </Text>
              </View>
              {accepted.length === 0 ? (
                <View style={styles.noFriendsContainer}>
                  <Text style={styles.noFriendsText}>No friends yet.</Text>
                  <Text style={styles.noFriendsSubtext}>Tap "+ Add Friend" to find people.</Text>
                </View>
              ) : (
                accepted.map((f: FriendEntry) => (
                  <TouchableOpacity
                    key={f.username}
                    style={styles.friendRow}
                    onLongPress={() => handleRemove(f.username)}
                  >
                    <View style={styles.friendAvatarWrap}>
                      <FriendAvatar username={f.username} size={44} />
                      <View style={[styles.statusDot, f.isOnline ? styles.statusOnline : styles.statusOffline]} />
                    </View>
                    <View style={styles.friendInfo}>
                      <Text style={styles.friendUsername}>{f.username}</Text>
                      <Text style={[styles.friendStatus, f.isOnline ? styles.friendStatusOnline : styles.friendStatusOffline]}>
                        {f.isOnline ? "● Online" : "○ Offline"}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.pmBtn}
                      onPress={() => router.push(`/pm/${f.username}`)}
                    >
                      <Text style={styles.pmBtnText}>Message</Text>
                    </TouchableOpacity>
                  </TouchableOpacity>
                ))
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
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: YM_PURPLE,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: YM_PURPLE_DARK,
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
  sectionHeader: {
    backgroundColor: "#f0e6f6",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#ddd",
  },
  sectionHeaderText: {
    color: YM_PURPLE_DARK,
    fontWeight: "700",
    fontSize: 13,
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
  friendRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
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
    marginLeft: 12,
  },
  friendUsername: {
    fontWeight: "bold",
    fontSize: 15,
    color: "#222",
  },
  friendStatus: {
    fontSize: 12,
    marginTop: 2,
  },
  friendStatusOnline: {
    color: "#4CAF50",
  },
  friendStatusOffline: {
    color: "#aaa",
  },
  pendingText: {
    color: "#F59E0B",
    fontSize: 12,
    marginTop: 2,
  },
  pmBtn: {
    backgroundColor: YM_PURPLE,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
  },
  pmBtnText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 12,
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
});
