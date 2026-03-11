# Later App — Full Audit Findings

## CRITICAL BUGS

### 1. Clear Chat — Still Broken
**Root cause (definitive):**
The `super_admin_auth` handler on the server checks for an existing super admin in the room:
```
if (existingUser) { socket.emit("error", "Super admin is already in the room"); return; }
```
This means if the super admin is already in the room (normal case), the `super_admin_auth` flow **exits early** and the user is added correctly. BUT the `rejoin_room` handler we added bypasses this check — good.

The REAL remaining issue: **the `clearAllMessages` function uses a socket acknowledgment callback**. On mobile (React Native), Socket.IO acknowledgment callbacks sometimes do not fire reliably, especially over WebSocket transport. The server sends `ack({ success: true })` but the client callback may never be called.

**Fix needed:** Remove the ack callback from `clear_room` emit. Instead, rely purely on the `room_cleared` broadcast event which is already working. The optimistic local clear + `room_cleared` broadcast is sufficient.

### 2. Private Voice Calls — NOT IMPLEMENTED
**Root cause:** There is no private voice call feature in the codebase at all.
- The user modal only has "Send Private Message" and admin actions
- No voice call request/accept/reject flow exists
- No private WebRTC signaling (separate from room voice)
- The server has no `voice_call_request`, `voice_call_accept`, `voice_call_reject` events

**Fix needed:** Implement full private voice call flow:
1. User A taps user B → "📞 Voice Call" button in modal
2. Server sends `voice_call_request` to user B
3. User B sees incoming call alert with Accept/Reject
4. On accept: private WebRTC peer connection established (bypasses room voice)
5. On reject/hangup: connection closed

### 3. Bold/Italic Formatting Markers Showing in Messages
**Root cause:** When user sends with bold/italic, the raw `**text**` or `_text_` markers are stored in DB and shown to others. The `RichText` component parses them on render, but only in the chat screen — not in PM screen or notifications.

**Fix needed:** Either strip markers before sending OR ensure RichText is used everywhere.

### 4. Reconnect After Server Restart — Super Admin Role Lost
**Root cause:** The `rejoin_room` handler was added, but it only fires on `sock.io.on("reconnect")`. If the server restarts and the socket reconnects, the `reconnect` event fires on the manager, not the socket. This may not fire reliably in all cases.

**Fix needed:** Also handle the `connect` event to detect reconnection (when socket was previously in a room).

## MEDIUM BUGS

### 5. Message Formatting — Bold/Italic Toolbar
The bold (B) and italic (I) buttons in the toolbar add `**` and `_` markers to the message. These markers are visible in the raw text if the recipient's client doesn't parse them. The toolbar should be removed or the formatting should be applied visually only (not sent as markers).

### 6. Voice Chat — react-native-webrtc Not Available on Web
The voice chat uses `react-native-webrtc` for native and browser WebRTC for web. On web, `RTCPeerConnection` is available natively. But the `onaddstream` handler (line 114) is only for native — this is fine. However, the `request_peers` flow only connects to users already in the room. If user joins after others, they won't get connected.

**Fix needed:** Server should broadcast `new_peer_joined` when a voice-active user joins, so existing peers can initiate connections to the new user.

### 7. Exit Button — Navigates But Socket May Still Be Connected
The `leaveRoom()` function disconnects the socket. But if the socket is in the middle of reconnecting, `disconnect()` may not fully clean up. The user appears to leave but the server still has their entry in `activeUsers` until the disconnect event fires.

### 8. Room Switcher — Doesn't Reload Messages Properly
When switching rooms via the room switcher modal, `setMessages([])` is called optimistically, then `message_history` arrives. But if the switch is fast, there's a flash of empty messages.

### 9. Invite Link — Deep Link Not Working
The invite link generated in the admin screen uses a custom scheme URL. When opened on a device without the app installed, it shows an error. There's no fallback web URL.

## MINOR ISSUES

### 10. Timestamp Not Shown in Main Chat
Messages in the main chat room don't show timestamps. The PM screen shows timestamps but the main chat doesn't.

### 11. User Count Not Shown on Room List
The room selection screen shows room names but no user count, so users don't know which rooms are active.

### 12. No Loading State on Join
When tapping "Choose a Room →" there's no loading indicator while connecting to the server.

### 13. Emoji Picker Covers Input on Small Screens
The emoji picker appears above the input but may overlap content on small screens.

### 14. Admin Panel Has Duplicate Clear Chat
Clear Chat appears both in the header AND inside the Admin Panel modal — confusing.
