import React, { useState, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Image,
  Alert,
  ActivityIndicator,
  ScrollView,
  Platform,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { trpc } from "@/lib/trpc";
import { useChat } from "@/lib/chat-context";
import { router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import { getApiBaseUrl } from "@/constants/oauth";

const YM_PURPLE = "#7B1FA2";
const YM_PURPLE_DARK = "#4A0072";
const YM_GOLD = "#FFD700";

export default function ProfileScreen() {
  const { nickname, leaveRoom, roomId } = useChat();
  const username = nickname || "";

  const [displayName, setDisplayName] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Change password state
  const [showChangePwd, setShowChangePwd] = useState(false);
  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [pwdError, setPwdError] = useState("");
  const [pwdSaving, setPwdSaving] = useState(false);

  const { data: profile, refetch } = trpc.user.getProfile.useQuery(
    { username },
    { enabled: !!username }
  );
  const updateProfileMutation = trpc.user.updateProfile.useMutation();
  const changePasswordMutation = trpc.user.changePassword.useMutation();

  // Load cached avatar from AsyncStorage immediately (before DB query returns)
  useEffect(() => {
    if (!username) return;
    AsyncStorage.getItem(`later_avatar_${username.toLowerCase()}`).then((cached) => {
      if (cached && !avatarUrl) setAvatarUrl(cached);
    });
  }, [username]);

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.displayName || "");
      setStatusMessage(profile.statusMessage || "");
      if (profile.avatarUrl) {
        setAvatarUrl(profile.avatarUrl);
        // Keep AsyncStorage in sync with DB
        AsyncStorage.setItem(`later_avatar_${username.toLowerCase()}`, profile.avatarUrl);
      }
    }
  }, [profile]);

  const handlePickImage = async () => {
    if (!username) return;

    if (Platform.OS !== "web") {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission Required", "Please allow access to your photo library.");
        return;
      }
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    setUploading(true);
    try {
      // Upload via server API
      const formData = new FormData();
      const filename = `avatar_${username}_${Date.now()}.jpg`;

      if (Platform.OS === "web") {
        const response = await fetch(asset.uri);
        const blob = await response.blob();
        formData.append("file", blob, filename);
      } else {
        formData.append("file", {
          uri: asset.uri,
          name: filename,
          type: "image/jpeg",
        } as any);
      }
      formData.append("username", username);

      const apiBase = getApiBaseUrl();
      const uploadResponse = await fetch(`${apiBase}/api/upload-avatar`, {
        method: "POST",
        body: formData,
      });

      const data = await uploadResponse.json();
      if (data.success && data.url) {
        setAvatarUrl(data.url);
        await updateProfileMutation.mutateAsync({
          username,
          avatarUrl: data.url,
        });
        refetch();
        Alert.alert("Success", "Profile picture updated!");
      } else {
        Alert.alert("Upload Failed", data.error || "Could not upload image.");
      }
    } catch (err) {
      console.error("Upload error:", err);
      Alert.alert("Upload Failed", "Could not upload image. Please try again.");
    }
    setUploading(false);
  };

  const handleSave = async () => {
    if (!username) return;
    setSaving(true);
    try {
      await updateProfileMutation.mutateAsync({
        username,
        displayName: displayName.trim() || undefined,
        statusMessage: statusMessage.trim() || undefined,
      });
      refetch();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      Alert.alert("Error", "Could not save profile.");
    }
    setSaving(false);
  };

  const handleChangePassword = async () => {
    setPwdError("");
    if (!currentPwd || !newPwd || !confirmPwd) { setPwdError("Please fill in all fields."); return; }
    if (newPwd !== confirmPwd) { setPwdError("New passwords do not match."); return; }
    if (newPwd.length < 6) { setPwdError("New password must be at least 6 characters."); return; }
    if (newPwd === currentPwd) { setPwdError("New password must be different from current password."); return; }
    setPwdSaving(true);
    try {
      const result = await changePasswordMutation.mutateAsync({ username, currentPassword: currentPwd, newPassword: newPwd });
      if (result.success) {
        Alert.alert("Password Changed", "Your password has been updated successfully.");
        setCurrentPwd(""); setNewPwd(""); setConfirmPwd("");
        setShowChangePwd(false);
      } else {
        setPwdError(result.error || "Failed to change password.");
      }
    } catch (e: any) {
      setPwdError(e?.message || "Failed to change password.");
    }
    setPwdSaving(false);
  };

  const handleSignOut = () => {
    Alert.alert(
      "Sign Out",
      "Are you sure you want to sign out?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Sign Out",
          style: "destructive",
          onPress: () => {
            leaveRoom();
            router.replace("/" as any);
          },
        },
      ]
    );
  };

  if (!username) {
    return (
      <ScreenContainer>
        <View style={styles.notSignedIn}>
          <Text style={styles.notSignedInText}>Sign in to view your profile</Text>
          <TouchableOpacity style={styles.signInBtn} onPress={() => router.replace("/")}>
            <Text style={styles.signInBtnText}>Sign In</Text>
          </TouchableOpacity>
        </View>
      </ScreenContainer>
    );
  }

  const isSuperAdmin = ["ammar", "later"].includes(username.toLowerCase());

  return (
    <ScreenContainer containerClassName="bg-white">
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Header */}
        <LinearGradient
          colors={[YM_PURPLE_DARK, YM_PURPLE, "#9C27B0"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.header}
        >
          {/* Avatar */}
          <TouchableOpacity style={styles.avatarWrap} onPress={handlePickImage} disabled={uploading}>
            {uploading ? (
              <View style={styles.avatarPlaceholder}>
                <ActivityIndicator color="#fff" />
              </View>
            ) : avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarInitials}>{username.slice(0, 2).toUpperCase()}</Text>
              </View>
            )}
            <View style={styles.avatarEditBadge}>
              <Text style={styles.avatarEditIcon}>📷</Text>
            </View>
          </TouchableOpacity>

          <Text style={styles.headerUsername}>
            {isSuperAdmin ? `👑 ${username}` : username}
          </Text>
          {isSuperAdmin && (
            <View style={styles.adminBadge}>
              <Text style={styles.adminBadgeText}>Super Admin</Text>
            </View>
          )}
          <Text style={styles.headerStatus}>
            {statusMessage || "No status set"}
          </Text>
        </LinearGradient>

        {/* Profile form */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Profile Information</Text>

          <View style={styles.fieldGroup}>
            <View style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>Later! ID</Text>
              <Text style={styles.fieldValueFixed}>{username}</Text>
            </View>
            <View style={styles.fieldDivider} />
            <View style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>Display Name</Text>
              <TextInput
                style={styles.fieldInput}
                value={displayName}
                onChangeText={setDisplayName}
                placeholder="Optional name"
                placeholderTextColor="#bbb"
                maxLength={64}
                returnKeyType="next"
              />
            </View>
            <View style={styles.fieldDivider} />
            <View style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>Status</Text>
              <TextInput
                style={styles.fieldInput}
                value={statusMessage}
                onChangeText={setStatusMessage}
                placeholder="What's on your mind?"
                placeholderTextColor="#bbb"
                maxLength={128}
                returnKeyType="done"
                onSubmitEditing={handleSave}
              />
            </View>
          </View>

          <TouchableOpacity
            style={[styles.saveBtn, saved && styles.saveBtnSuccess]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.saveBtnText}>{saved ? "✓ Saved!" : "Save Changes"}</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Room status */}
        {roomId && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Current Session</Text>
            <View style={styles.sessionCard}>
              <View style={styles.sessionDot} />
              <Text style={styles.sessionText}>Connected to room</Text>
              <TouchableOpacity
                style={styles.leaveRoomBtn}
                onPress={() => {
                  leaveRoom();
                  router.replace("/" as any);
                }}
              >
                <Text style={styles.leaveRoomBtnText}>Leave Room</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Change Password — Yahoo Messenger style */}
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.changePwdToggle}
            onPress={() => { setShowChangePwd(!showChangePwd); setPwdError(""); }}
          >
            <Text style={styles.changePwdToggleText}>🔒  {showChangePwd ? "Cancel Password Change" : "Change Password"}</Text>
          </TouchableOpacity>

          {showChangePwd && (
            <View style={styles.changePwdBox}>
              <View style={styles.fieldGroup}>
                <View style={styles.fieldRow}>
                  <Text style={styles.fieldLabel}>Current</Text>
                  <TextInput
                    style={styles.fieldInput}
                    value={currentPwd}
                    onChangeText={setCurrentPwd}
                    placeholder="Current password"
                    placeholderTextColor="#bbb"
                    secureTextEntry
                    autoCapitalize="none"
                    returnKeyType="next"
                  />
                </View>
                <View style={styles.fieldDivider} />
                <View style={styles.fieldRow}>
                  <Text style={styles.fieldLabel}>New</Text>
                  <TextInput
                    style={styles.fieldInput}
                    value={newPwd}
                    onChangeText={setNewPwd}
                    placeholder="New password (min 6)"
                    placeholderTextColor="#bbb"
                    secureTextEntry
                    autoCapitalize="none"
                    returnKeyType="next"
                  />
                </View>
                <View style={styles.fieldDivider} />
                <View style={styles.fieldRow}>
                  <Text style={styles.fieldLabel}>Confirm</Text>
                  <TextInput
                    style={styles.fieldInput}
                    value={confirmPwd}
                    onChangeText={setConfirmPwd}
                    placeholder="Repeat new password"
                    placeholderTextColor="#bbb"
                    secureTextEntry
                    autoCapitalize="none"
                    returnKeyType="done"
                    onSubmitEditing={handleChangePassword}
                  />
                </View>
              </View>
              {pwdError ? <Text style={styles.pwdError}>{pwdError}</Text> : null}
              <TouchableOpacity
                style={styles.changePwdBtn}
                onPress={handleChangePassword}
                disabled={pwdSaving}
              >
                {pwdSaving ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.changePwdBtnText}>Update Password</Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Sign out */}
        <View style={styles.section}>
          <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
            <Text style={styles.signOutBtnText}>Sign Out</Text>
          </TouchableOpacity>
        </View>

        {/* App info & Copyright */}
        <View style={styles.appInfo}>
          <Text style={styles.appInfoBrand}>Later!</Text>
          <Text style={styles.appInfoText}>© {new Date().getFullYear()} Later. All rights reserved.</Text>
          <Text style={styles.appInfoSub}>Later is a registered trademark. Unauthorized reproduction or distribution of this application, or any portion of it, may result in severe civil and criminal penalties.</Text>
          <Text style={[styles.appInfoSub, { marginTop: 4 }]}>18+ only · All conversations are fully secured &amp; private</Text>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: "center",
    paddingTop: 32,
    paddingBottom: 28,
    paddingHorizontal: 20,
    gap: 8,
  },
  avatarWrap: {
    position: "relative",
    marginBottom: 4,
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 3,
    borderColor: "#fff",
  },
  avatarPlaceholder: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: "rgba(255,255,255,0.25)",
    borderWidth: 3,
    borderColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitials: {
    color: "#fff",
    fontSize: 32,
    fontWeight: "bold",
  },
  avatarEditBadge: {
    position: "absolute",
    bottom: 0,
    right: 0,
    backgroundColor: YM_GOLD,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
  avatarEditIcon: {
    fontSize: 14,
  },
  headerUsername: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "bold",
  },
  adminBadge: {
    backgroundColor: YM_GOLD,
    paddingHorizontal: 12,
    paddingVertical: 3,
    borderRadius: 12,
  },
  adminBadgeText: {
    color: "#333",
    fontWeight: "bold",
    fontSize: 12,
  },
  headerStatus: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 13,
    fontStyle: "italic",
    textAlign: "center",
  },
  section: {
    marginTop: 20,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    color: YM_PURPLE,
    fontWeight: "700",
    fontSize: 13,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  fieldGroup: {
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e5e5e5",
    overflow: "hidden",
  },
  fieldRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: "#fff",
  },
  fieldDivider: {
    height: 1,
    backgroundColor: "#f0f0f0",
    marginLeft: 14,
  },
  fieldLabel: {
    color: "#333",
    fontWeight: "600",
    fontSize: 14,
    width: 100,
    flexShrink: 0,
  },
  fieldValueFixed: {
    flex: 1,
    color: "#666",
    fontSize: 14,
  },
  fieldInput: {
    flex: 1,
    color: "#222",
    fontSize: 14,
    paddingVertical: 0,
  },
  saveBtn: {
    backgroundColor: YM_PURPLE,
    marginTop: 14,
    paddingVertical: 13,
    borderRadius: 10,
    alignItems: "center",
  },
  saveBtnSuccess: {
    backgroundColor: "#4CAF50",
  },
  saveBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 15,
  },
  sessionCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f0f9f0",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#c8e6c9",
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
  },
  sessionDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#4CAF50",
  },
  sessionText: {
    flex: 1,
    color: "#2e7d32",
    fontWeight: "600",
    fontSize: 14,
  },
  leaveRoomBtn: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#4CAF50",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
  },
  leaveRoomBtnText: {
    color: "#2e7d32",
    fontWeight: "600",
    fontSize: 12,
  },
  signOutBtn: {
    backgroundColor: "#fff",
    borderWidth: 1.5,
    borderColor: "#EF4444",
    paddingVertical: 13,
    borderRadius: 10,
    alignItems: "center",
  },
  signOutBtnText: {
    color: "#EF4444",
    fontWeight: "700",
    fontSize: 15,
  },
  appInfo: {
    alignItems: "center",
    marginTop: 32,
    paddingHorizontal: 20,
    paddingBottom: 8,
    gap: 4,
  },
  appInfoBrand: {
    color: "#7B1FA2",
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  appInfoText: {
    color: "#555",
    fontSize: 12,
    fontWeight: "600",
  },
  appInfoSub: {
    color: "#aaa",
    fontSize: 10,
    textAlign: "center",
    lineHeight: 15,
  },
  notSignedIn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 16,
  },
  notSignedInText: {
    color: "#666",
    fontSize: 16,
    fontWeight: "600",
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
  changePwdToggle: {
    backgroundColor: "#F3E5F5",
    borderWidth: 1,
    borderColor: "#CE93D8",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: "center",
  },
  changePwdToggleText: {
    color: YM_PURPLE,
    fontWeight: "700",
    fontSize: 14,
  },
  changePwdBox: {
    marginTop: 12,
    gap: 10,
  },
  pwdError: {
    color: "#EF4444",
    fontSize: 12,
    marginTop: 4,
    marginLeft: 4,
  },
  changePwdBtn: {
    backgroundColor: YM_PURPLE,
    paddingVertical: 13,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 4,
  },
  changePwdBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 15,
  },
});
