import { Tabs } from "expo-router";
import { Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { HapticTab } from "@/components/haptic-tab";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useChat } from "@/lib/chat-context";

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const bottomPadding = Platform.OS === "web" ? 12 : Math.max(insets.bottom, 8);
  const tabBarHeight = 56 + bottomPadding;

  // Get unread counts for badges
  const { unreadPMs, pendingFriendRequests } = useChat();
  const totalUnreadPMs = Object.values(unreadPMs).reduce((sum, n) => sum + n, 0);

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: "#FFD700",
        tabBarInactiveTintColor: "#aaa",
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarStyle: {
          paddingTop: 8,
          paddingBottom: bottomPadding,
          height: tabBarHeight,
          backgroundColor: "#7B0099",
          borderTopColor: "#5A0070",
          borderTopWidth: 1,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "600",
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Chat Rooms",
          tabBarIcon: ({ color }) => (
            <IconSymbol size={26} name="message.fill" color={color} />
          ),
          tabBarBadge: totalUnreadPMs > 0 ? totalUnreadPMs : undefined,
        }}
      />
      <Tabs.Screen
        name="friends"
        options={{
          title: "Friends",
          tabBarIcon: ({ color }) => (
            <IconSymbol size={26} name="person.2.fill" color={color} />
          ),
          tabBarBadge: pendingFriendRequests > 0 ? pendingFriendRequests : undefined,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color }) => (
            <IconSymbol size={26} name="person.crop.circle" color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
