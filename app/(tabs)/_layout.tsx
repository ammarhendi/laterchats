import { Tabs } from "expo-router";
import { Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { HapticTab } from "@/components/haptic-tab";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useChat } from "@/lib/chat-context";

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  // On devices with a home indicator (iPhone X+), add safe area at the bottom
  const safeBottom = Platform.OS === "ios" ? insets.bottom : 0;

  // Get unread counts for badges
  const { unreadPMs, pendingFriendRequests } = useChat();
  const totalUnreadPMs = Object.values(unreadPMs).reduce((sum, n) => sum + n, 0);

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: "#FFD700",
        tabBarInactiveTintColor: "#ccaaff",
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarStyle: {
          backgroundColor: "#7B0099",
          borderTopColor: "#5A0070",
          borderTopWidth: 1,
          paddingTop: 6,
          paddingBottom: safeBottom > 0 ? safeBottom : 8,
          // No fixed height — let the tab bar size itself based on content
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "600",
          marginTop: 2,
          marginBottom: 0,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Chat Rooms",
          tabBarIcon: ({ color }) => (
            <IconSymbol size={24} name="message.fill" color={color} />
          ),
          tabBarBadge: totalUnreadPMs > 0 ? totalUnreadPMs : undefined,
        }}
      />
      <Tabs.Screen
        name="friends"
        options={{
          title: "Friends",
          tabBarIcon: ({ color }) => (
            <IconSymbol size={24} name="person.2.fill" color={color} />
          ),
          tabBarBadge: pendingFriendRequests > 0 ? pendingFriendRequests : undefined,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color }) => (
            <IconSymbol size={24} name="person.crop.circle" color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
