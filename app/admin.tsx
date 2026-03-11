import { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Share,
  ScrollView,
  Platform,
  TextInput,
  FlatList,
} from "react-native";
import { crossAlert, crossInfo, crossConfirm } from "@/lib/cross-alert";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { trpc } from "@/lib/trpc";
import { useChat } from "@/lib/chat-context";
import * as Clipboard from "expo-clipboard";

function getInviteUrl(token: string): string {
  if (Platform.OS === "web") {
    return `${window.location.origin}/?token=${token}`;
  }
  return `exp://later/?token=${token}`;
}

function formatExpiry(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function timeUntilExpiry(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const diff = d.getTime() - Date.now();
  if (diff <= 0) return "Expired";
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 0) return `${hours}h ${mins}m remaining`;
  return `${mins}m remaining`;
}

type AdminTab = "overview" | "users" | "bans" | "invite" | "rooms" | "registrations";

export default function AdminScreen() {
  const router = useRouter();
  const {
    users,
    nickname,
    roomName,
    myRole,
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

  const [activeTab, setActiveTab] = useState<AdminTab>("overview");
  const [generatedToken, setGeneratedToken] = useState<string | null>(null);
  const [generatedExpiry, setGeneratedExpiry] = useState<Date | null>(null);
  const [copied, setCopied] = useState(false);
  const [banReason, setBanReason] = useState("");
  const [selectedUser, setSelectedUser] = useState<string | null>(null);

  const isAdmin = myRole === "super_admin";
  const isMod = myRole === "super_admin" || myRole === "moderator";

  useEffect(() => {
    if (activeTab === "bans") {
      requestBannedList();
    }
  }, [activeTab]);

  const generateMutation = trpc.chat.generateInvite.useMutation({
    onSuccess: (data) => {
      setGeneratedToken(data.token);
      setGeneratedExpiry(new Date(data.expiresAt));
    },
    onError: (err) => {
      crossInfo("Error", err.message || "Failed to generate invite link.");
    },
  });

  const latestInviteQuery = trpc.chat.getLatestInvite.useQuery(undefined, {
    retry: false,
  });

  const handleGenerate = () => {
    generateMutation.mutate({ adminPin: "later2024" });
  };

  const handleCopy = async (token: string) => {
    const url = getInviteUrl(token);
    await Clipboard.setStringAsync(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = async (token: string) => {
    const url = getInviteUrl(token);
    try {
      await Share.share({
        message: `Come to chat now, not later.\n${url}`,
        url,
        title: "Come to chat now, not later.",
      });
    } catch (err) {
      console.error(err);
    }
  };

  const handleKick = async (target: string) => {
    const ok = await crossConfirm("Kick User", `Kick ${target} from the room?`, "Kick", "Cancel");
    if (ok) kickUser(target);
  };

  const handleBan = async (target: string, voiceOnly = false) => {
    const msg = voiceOnly
      ? `Voice-ban ${target}? They can still text but cannot use the mic.`
      : `Permanently ban ${target}?`;
    const ok = await crossConfirm(voiceOnly ? "Voice Ban" : "Ban User", msg, voiceOnly ? "Voice Ban" : "Ban", "Cancel");
    if (ok) banUser(target, banReason || undefined, voiceOnly);
  };

  const handlePromote = async (target: string) => {
    const ok = await crossConfirm("Promote to Moderator", `Promote ${target} to Moderator?`, "Promote", "Cancel");
    if (ok) promoteUser(target);
  };

  const handleDemote = async (target: string) => {
    const ok = await crossConfirm("Demote Moderator", `Remove moderator role from ${target}?`, "Demote", "Cancel");
    if (ok) demoteUser(target);
  };

  const handleMuteText = (target: string, isMuted: boolean) => {
    if (isMuted) {
      unmuteUserText(target);
    } else {
      crossConfirm("Mute User", `Prevent ${target} from sending text messages?`, "Mute", "Cancel").then((ok) => { if (ok) muteUserText(target); });
    }
  };

  const handleUnban = async (target: string) => {
    const ok = await crossConfirm("Unban", `Remove ban for ${target}?`, "Unban", "Cancel");
    if (ok) unbanUser(target);
  };

  const currentToken = generatedToken || latestInviteQuery.data?.token;
  const currentExpiry = generatedExpiry || (latestInviteQuery.data?.expiresAt ? new Date(latestInviteQuery.data.expiresAt) : null);

  const SUPER_ADMIN_TOKEN = "ammar_clear_2024";
  const registrationsQuery = trpc.admin.getAllRegistrations.useQuery(
    { superAdminToken: SUPER_ADMIN_TOKEN },
    { enabled: activeTab === "registrations" && isAdmin }
  );

  const TABS: { id: AdminTab; label: string; icon: string }[] = [
    { id: "overview", label: "Overview", icon: "📊" },
    { id: "users", label: "Users", icon: "👥" },
    { id: "bans", label: "Bans", icon: "🚫" },
    { id: "invite", label: "Invite", icon: "🔗" },
    { id: "rooms", label: "Rooms", icon: "🏠" },
    { id: "registrations", label: "Members", icon: "📝" },
  ];

  return (
    <ScreenContainer containerClassName="bg-black" className="bg-black" edges={["top", "left", "right"]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>⚙️ Admin Panel</Text>
        <View style={styles.headerRight}>
          <Text style={styles.roleTag}>{myRole === "super_admin" ? "👑 SA" : "🛡️ Mod"}</Text>
        </View>
      </View>

      {/* Tab Bar */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabBar} contentContainerStyle={styles.tabBarContent}>
        {TABS.map((tab) => (
          <TouchableOpacity
            key={tab.id}
            style={[styles.tab, activeTab === tab.id && styles.tabActive]}
            onPress={() => setActiveTab(tab.id)}
          >
            <Text style={styles.tabIcon}>{tab.icon}</Text>
            <Text style={[styles.tabLabel, activeTab === tab.id && styles.tabLabelActive]}>{tab.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 14 }}>

        {/* ── OVERVIEW TAB ─────────────────────────────────────────────────── */}
        {activeTab === "overview" && (
          <>
            {/* Room Status Card */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>📡 Room Status</Text>
              <View style={styles.statusRow}>
                <View style={styles.statusDot} />
                <Text style={styles.statusText}>{roomName ?? "Now"} — Live</Text>
              </View>
              <Text style={styles.statusSub}>{users.length} user{users.length !== 1 ? "s" : ""} online</Text>
            </View>

            {/* Quick Actions */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>⚡ Quick Actions</Text>
              <View style={styles.quickActions}>
                <TouchableOpacity
                  style={[styles.quickBtn, styles.quickBtnDanger]}
                  onPress={() =>
                    crossConfirm("Clear Chat", "Wipe all messages for everyone?", "Clear", "Cancel").then((ok) => { if (ok) { clearAllMessages(); crossInfo("Done", "Chat cleared."); } })
                  }
                >
                  <Text style={styles.quickBtnText}>🗑️ Clear Chat</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.quickBtn, styles.quickBtnPrimary]}
                  onPress={() => setActiveTab("invite")}
                >
                  <Text style={styles.quickBtnText}>🔗 New Invite</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.quickBtn, styles.quickBtnWarning]}
                  onPress={() => setActiveTab("users")}
                >
                  <Text style={styles.quickBtnText}>👥 Manage Users</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.quickBtn, styles.quickBtnInfo]}
                  onPress={() => { setActiveTab("bans"); requestBannedList(); }}
                >
                  <Text style={styles.quickBtnText}>🚫 Ban List</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Stats */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>📈 Room Stats</Text>
              <View style={styles.statsGrid}>
                <View style={styles.statBox}>
                  <Text style={styles.statNum}>{users.length}</Text>
                  <Text style={styles.statLabel}>Online Now</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statNum}>{users.filter(u => u.isVoiceActive).length}</Text>
                  <Text style={styles.statLabel}>On Voice</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statNum}>{users.filter(u => u.role === "moderator").length}</Text>
                  <Text style={styles.statLabel}>Moderators</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statNum}>{bannedList.length}</Text>
                  <Text style={styles.statLabel}>Banned</Text>
                </View>
              </View>
            </View>
          </>
        )}

        {/* ── USERS TAB ────────────────────────────────────────────────────── */}
        {activeTab === "users" && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>👥 Users in Room ({users.length})</Text>
            {users.length === 0 && <Text style={styles.emptyText}>No users in room.</Text>}
            {users.map((u) => {
              const isMe = u.nickname === nickname;
              const isSA = u.role === "super_admin";
              return (
                <View key={u.nickname} style={styles.userRow}>
                  <View style={styles.userRowLeft}>
                    <View style={[styles.userDot, u.isVoiceActive ? styles.dotVoice : styles.dotOnline]} />
                    <View>
                      <Text style={[styles.userRowName, isSA && styles.saName]}>
                        {isSA ? "👑 " : u.role === "moderator" ? "🛡️ " : ""}
                        {u.nickname}{isMe ? " (you)" : ""}
                      </Text>
                      <Text style={styles.userRowSub}>
                        {u.isVoiceActive ? "🎤 Voice" : "💬 Text"}
                        {u.isTextMuted ? " · 🔇 Muted" : ""}
                        {u.isVoiceBanned ? " · 🚫 V-Banned" : ""}
                      </Text>
                    </View>
                  </View>
                  {!isMe && !isSA && (
                    <View style={styles.userRowActions}>
                      <TouchableOpacity style={styles.actionBtn} onPress={() => handleKick(u.nickname)}>
                        <Text style={styles.actionBtnText}>Kick</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.actionBtn, styles.actionBtnDanger]} onPress={() => handleBan(u.nickname)}>
                        <Text style={styles.actionBtnText}>Ban</Text>
                      </TouchableOpacity>
                      {isAdmin && (
                        <>
                          <TouchableOpacity style={[styles.actionBtn, styles.actionBtnWarning]} onPress={() => handleBan(u.nickname, true)}>
                            <Text style={styles.actionBtnText}>V-Ban</Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={[styles.actionBtn, styles.actionBtnMute]} onPress={() => handleMuteText(u.nickname, !!u.isTextMuted)}>
                            <Text style={styles.actionBtnText}>{u.isTextMuted ? "Unmute" : "Mute"}</Text>
                          </TouchableOpacity>
                          {u.role === "moderator" ? (
                            <TouchableOpacity style={[styles.actionBtn, styles.actionBtnInfo]} onPress={() => handleDemote(u.nickname)}>
                              <Text style={styles.actionBtnText}>Demote</Text>
                            </TouchableOpacity>
                          ) : (
                            <TouchableOpacity style={[styles.actionBtn, styles.actionBtnInfo]} onPress={() => handlePromote(u.nickname)}>
                              <Text style={styles.actionBtnText}>Promote</Text>
                            </TouchableOpacity>
                          )}
                        </>
                      )}
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {/* ── BANS TAB ─────────────────────────────────────────────────────── */}
        {activeTab === "bans" && (
          <View style={styles.card}>
            <View style={styles.cardTitleRow}>
              <Text style={styles.cardTitle}>🚫 Banned Users ({bannedList.length})</Text>
              <TouchableOpacity onPress={requestBannedList} style={styles.refreshBtn}>
                <Text style={styles.refreshBtnText}>↻ Refresh</Text>
              </TouchableOpacity>
            </View>
            {bannedList.length === 0 && <Text style={styles.emptyText}>No banned users.</Text>}
            {bannedList.map((ban) => (
              <View key={ban.id} style={styles.banRow}>
                <View style={styles.banInfo}>
                  <Text style={styles.banNick}>{ban.nickname ?? "Unknown"}</Text>
                  <Text style={styles.banSub}>
                    {ban.voiceBanOnly ? "🎤 Voice ban only" : "🚫 Full ban"}
                    {ban.reason ? ` · ${ban.reason}` : ""}
                  </Text>
                  {ban.ipAddress && <Text style={styles.banIp}>IP: {ban.ipAddress}</Text>}
                </View>
                <TouchableOpacity style={[styles.actionBtn, { backgroundColor: "#2E7D32" }]} onPress={() => handleUnban(ban.nickname ?? "")}>
                  <Text style={styles.actionBtnText}>Unban</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* ── INVITE TAB ───────────────────────────────────────────────────── */}
        {activeTab === "invite" && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>🔗 Invite Link Generator</Text>
            <Text style={styles.cardDesc}>Generate a link to invite new users. Links expire after 6 hours.</Text>
            <TouchableOpacity
              style={[styles.generateBtn, generateMutation.isPending && styles.generateBtnDisabled]}
              onPress={handleGenerate}
              disabled={generateMutation.isPending}
            >
              <Text style={styles.generateBtnText}>
                {generateMutation.isPending ? "Generating..." : "🔗 Generate New Invite Link"}
              </Text>
            </TouchableOpacity>
            {currentToken && currentExpiry && (
              <View style={styles.tokenBox}>
                <View style={styles.tokenHeader}>
                  <Text style={styles.tokenLabel}>Invite Link</Text>
                  <Text style={styles.tokenExpiry}>{timeUntilExpiry(currentExpiry)}</Text>
                </View>
                <Text style={styles.tokenUrl} numberOfLines={2}>{getInviteUrl(currentToken)}</Text>
                <Text style={styles.tokenExpiryFull}>Expires: {formatExpiry(currentExpiry)}</Text>
                <View style={styles.tokenActions}>
                  <TouchableOpacity style={styles.copyBtn} onPress={() => handleCopy(currentToken)}>
                    <Text style={styles.copyBtnText}>{copied ? "✓ Copied!" : "📋 Copy"}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.shareBtn} onPress={() => handleShare(currentToken)}>
                    <Text style={styles.shareBtnText}>📤 Share</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        )}

        {/* ── ROOMS TAB ────────────────────────────────────────────────────── */}
        {activeTab === "rooms" && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>🏠 Room Management</Text>
            <Text style={styles.cardDesc}>Current room: <Text style={{ color: "#FFD700" }}>{roomName}</Text></Text>
            <View style={styles.roomActionsList}>
              <TouchableOpacity
                style={[styles.quickBtn, styles.quickBtnDanger]}
                onPress={() =>
                  crossConfirm("Clear Chat", "Wipe all messages for everyone in this room?", "Clear", "Cancel").then((ok) => { if (ok) { clearAllMessages(); crossInfo("Done", "Chat cleared."); } })
                }
              >
                <Text style={styles.quickBtnText}>🗑️ Clear Chat Room</Text>
              </TouchableOpacity>
              <Text style={styles.cardDesc}>
                More room management options (create/delete rooms, set topic, set max users) coming soon.
              </Text>
            </View>
          </View>
        )}

      </ScrollView>
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
  backBtn: { paddingRight: 10 },
  backBtnText: { color: "#FFD700", fontSize: 14, fontWeight: "600" },
  headerTitle: { flex: 1, color: "#fff", fontWeight: "bold", fontSize: 16, textAlign: "center" },
  headerRight: { width: 60, alignItems: "flex-end" },
  roleTag: { color: "#FFD700", fontSize: 12, fontWeight: "700" },

  tabBar: { backgroundColor: "#1a0030", borderBottomWidth: 1, borderBottomColor: "#333" },
  tabBarContent: { flexDirection: "row", paddingHorizontal: 8, paddingVertical: 6, gap: 4 },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 6,
    backgroundColor: "#2a0045",
  },
  tabActive: { backgroundColor: "#7B0099" },
  tabIcon: { fontSize: 14 },
  tabLabel: { color: "#aaa", fontSize: 12, fontWeight: "500" },
  tabLabelActive: { color: "#fff", fontWeight: "700" },

  card: {
    backgroundColor: "#111",
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: "#2a0045",
    gap: 10,
  },
  cardTitle: { color: "#FFD700", fontWeight: "bold", fontSize: 14, textTransform: "uppercase", letterSpacing: 0.5 },
  cardTitleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cardDesc: { color: "#888", fontSize: 13, lineHeight: 18 },

  statusRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  statusDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#00AA00" },
  statusText: { color: "#fff", fontSize: 14, fontWeight: "600" },
  statusSub: { color: "#888", fontSize: 12 },

  quickActions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  quickBtn: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 6,
    alignItems: "center",
    minWidth: "45%",
  },
  quickBtnDanger: { backgroundColor: "#8B0000", borderWidth: 1, borderColor: "#CC0000" },
  quickBtnPrimary: { backgroundColor: "#7B0099", borderWidth: 1, borderColor: "#AA00CC" },
  quickBtnWarning: { backgroundColor: "#7B4000", borderWidth: 1, borderColor: "#CC6600" },
  quickBtnInfo: { backgroundColor: "#003366", borderWidth: 1, borderColor: "#0055AA" },
  quickBtnText: { color: "#fff", fontWeight: "bold", fontSize: 13 },

  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  statBox: {
    flex: 1,
    minWidth: "45%",
    backgroundColor: "#1a0030",
    borderRadius: 8,
    padding: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#2a0045",
  },
  statNum: { color: "#FFD700", fontSize: 24, fontWeight: "bold" },
  statLabel: { color: "#888", fontSize: 11, marginTop: 2 },

  userRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#1a1a1a",
    gap: 8,
  },
  userRowLeft: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1 },
  userDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  dotOnline: { backgroundColor: "#00AA00" },
  dotVoice: { backgroundColor: "#FF8800" },
  userRowName: { color: "#fff", fontSize: 13, fontWeight: "600" },
  saName: { color: "#FFD700" },
  userRowSub: { color: "#888", fontSize: 11, marginTop: 1 },
  userRowActions: { flexDirection: "row", flexWrap: "wrap", gap: 4, justifyContent: "flex-end", maxWidth: 180 },
  actionBtn: {
    backgroundColor: "#333",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#555",
  },
  actionBtnDanger: { backgroundColor: "#8B0000", borderColor: "#CC0000" },
  actionBtnWarning: { backgroundColor: "#7B4000", borderColor: "#CC6600" },
  actionBtnMute: { backgroundColor: "#003366", borderColor: "#0055AA" },
  actionBtnInfo: { backgroundColor: "#2E7D32", borderColor: "#4CAF50" },
  actionBtnText: { color: "#fff", fontSize: 11, fontWeight: "600" },

  banRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#1a1a1a",
    gap: 8,
  },
  banInfo: { flex: 1 },
  banNick: { color: "#fff", fontSize: 13, fontWeight: "600" },
  banSub: { color: "#888", fontSize: 11, marginTop: 1 },
  banIp: { color: "#666", fontSize: 10, marginTop: 1 },

  refreshBtn: { backgroundColor: "#1a0030", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 4, borderWidth: 1, borderColor: "#333" },
  refreshBtnText: { color: "#aaa", fontSize: 12 },

  generateBtn: { backgroundColor: "#7B0099", paddingVertical: 12, borderRadius: 6, alignItems: "center" },
  generateBtnDisabled: { opacity: 0.6 },
  generateBtnText: { color: "#fff", fontWeight: "bold", fontSize: 15 },
  tokenBox: { backgroundColor: "#1a1a1a", borderRadius: 6, padding: 12, borderWidth: 1, borderColor: "#7B0099", gap: 8 },
  tokenHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  tokenLabel: { color: "#FFD700", fontWeight: "bold", fontSize: 12, textTransform: "uppercase" },
  tokenExpiry: { color: "#00AA00", fontSize: 12, fontWeight: "600" },
  tokenUrl: { color: "#aaa", fontSize: 11, fontFamily: Platform.OS === "ios" ? "Courier" : "monospace", backgroundColor: "#0a0a0a", padding: 8, borderRadius: 4, lineHeight: 16 },
  tokenExpiryFull: { color: "#666", fontSize: 11 },
  tokenActions: { flexDirection: "row", gap: 8 },
  copyBtn: { flex: 1, backgroundColor: "#333", paddingVertical: 9, borderRadius: 5, alignItems: "center", borderWidth: 1, borderColor: "#555" },
  copyBtnText: { color: "#fff", fontSize: 13, fontWeight: "600" },
  shareBtn: { flex: 1, backgroundColor: "#7B0099", paddingVertical: 9, borderRadius: 5, alignItems: "center" },
  shareBtnText: { color: "#fff", fontSize: 13, fontWeight: "600" },

  roomActionsList: { gap: 10 },
  emptyText: { color: "#666", fontSize: 13, textAlign: "center", paddingVertical: 12 },
});
