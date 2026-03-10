# Later – Design Plan
## Yahoo Chat Room Mobile App

---

## Brand & Color Palette

Inspired by classic Yahoo! Chat — purple/violet primary, warm white backgrounds, bold yellow accents.

| Token | Light | Dark | Usage |
|-------|-------|------|-------|
| primary | #7B0099 (Yahoo purple) | #9B30C0 | Header, buttons, accents |
| accent | #FFD700 (Yahoo gold/yellow) | #FFD700 | Logo text, highlights |
| background | #F0F0F0 | #1A1A2E | Screen background |
| surface | #FFFFFF | #252540 | Chat bubbles, cards |
| foreground | #111111 | #EEEEEE | Primary text |
| muted | #666666 | #999999 | Secondary text, timestamps |
| border | #CCCCCC | #444466 | Dividers, input borders |
| online | #00AA00 | #33CC33 | Online user indicator |
| voice | #FF6600 | #FF8833 | Voice active indicator |

---

## Screen List

### 1. Welcome / Nickname Screen
- App logo (Yahoo!Chat style with "Later" branding)
- "Enter your nickname" text input
- "Join Room" button
- Invite link auto-detected from deep link (if joining via invite)
- Error state: nickname taken or invalid link

### 2. Chat Room Screen (Main Screen)
Split layout mimicking Yahoo Chat Room:
- **Header**: Room name, user count, voice status indicator
- **Chat area** (left ~65% width): Scrollable message list
  - Messages formatted as: `Username says: "message text"`
  - System messages (user joined/left) in italic gray
  - Private message indicator (different color/style)
- **Users panel** (right ~35% width): List of online users
  - Each user: colored dot (online/voice-active), nickname
  - Tap user → options: Send Private Message, Ignore
- **Bottom toolbar**:
  - Text input field
  - Send button
  - Mic button (toggle mute/unmute) with voice indicator
  - Emotions/emoji button

### 3. Private Message Screen
- Header: "PM: [Username]"
- Chat history between two users
- Text input + send button
- Back button to return to room

### 4. Admin Panel Screen (accessible only to admin)
- Generate Invite Link button
- Shows current active invite link with expiry countdown
- Copy link button
- Share link button

---

## Key User Flows

### Flow 1: Join via Invite Link
1. User receives invite link (e.g., `later://join?token=abc123`)
2. App opens → detects invite token
3. Nickname entry screen shown (token pre-filled)
4. User enters nickname → taps "Join Room"
5. Enters main Chat Room screen

### Flow 2: Send Text Message
1. User types in bottom input field
2. Taps Send or presses keyboard send
3. Message appears in chat as `Nickname says: "text"`
4. All users in room see the message in real-time

### Flow 3: Voice Chat
1. User taps mic button in toolbar
2. Mic activates — user's dot turns orange in user list
3. All users hear each other simultaneously (open mic)
4. Multiple users can speak at the same time
5. Tap mic again to mute

### Flow 4: Private Message
1. User taps another user's name in the user list
2. Options sheet appears: "Send Private Message" / "Ignore"
3. Taps "Send Private Message" → opens PM screen
4. Messages only visible to the two users involved

### Flow 5: Admin Generates Invite Link
1. Admin opens Admin Panel (via settings icon)
2. Taps "Generate New Invite Link"
3. Unique link generated with 6-hour expiry
4. Admin copies or shares the link

---

## Layout Details

### Chat Room Layout (Portrait 9:16)
```
┌─────────────────────────────────┐
│  LATER!Chat    [Room] [9 users] │  ← Header (purple)
├─────────────────┬───────────────┤
│                 │  Chatters     │
│  Chat Messages  │  ● user1      │
│                 │  ● user2      │
│  user1 says:    │  ◉ user3(mic) │
│  "hello all"    │  ● user4      │
│                 │  ● user5      │
│  user2 says:    │               │
│  "hey!"         │               │
│                 │               │
│  [system msg]   │               │
│  user3 joined   │               │
│                 │               │
├─────────────────┴───────────────┤
│ [B][I] Preferences Emotions     │  ← Toolbar
├─────────────────────────────────┤
│ Chat: [_________________][Send] │  ← Input
├─────────────────────────────────┤
│ Voice: [🎤 Mute] [Talk] (Ready) │  ← Voice bar
└─────────────────────────────────┘
```

---

## Typography
- **Header/Logo**: Bold, slightly condensed — mimicking Yahoo! branding
- **Chat messages**: Monospace-friendly, 14px, colored usernames
- **System messages**: Italic, gray, 13px
- **User list**: 13px, with colored status dots
- **Input**: 15px, clean sans-serif

---

## Interaction Design
- Tap username in user list → action sheet (PM / Ignore)
- Long press message → copy text
- Mic button: toggle with haptic feedback
- New message: subtle scroll-to-bottom animation
- User joins/leaves: system message in chat
- Voice active: orange pulsing dot on user in list
