# Later App - TODO

## Phase 1: Setup & Design
- [x] Generate app logo (Yahoo!Chat style with "Later" branding)
- [x] Update theme colors (Yahoo purple, gold, white)
- [x] Update app.config.ts with app name and logo

## Phase 2: Backend & Database
- [x] Create database schema: rooms, messages, invite_tokens, sessions
- [x] Set up Socket.io for real-time messaging and presence
- [x] Set up WebRTC signaling server (via Socket.io)
- [x] API: validate invite token (check expiry)
- [x] API: join room with nickname
- [x] API: send/receive messages
- [x] API: generate invite link (admin only, 6-hour expiry)
- [x] API: get room users list

## Phase 3: Nickname & Join Flow
- [x] Welcome/Nickname entry screen
- [x] Deep link handling for invite tokens
- [x] Nickname validation (no duplicates in room)
- [x] Join room flow

## Phase 4: Chat Room Screen
- [x] Yahoo Chat Room-style layout (chat area + user list panel)
- [x] Real-time text messages via Socket.io
- [x] Message format: "Username says: message"
- [x] System messages (user joined/left)
- [x] Scrollable chat with auto-scroll to bottom
- [x] Online users list with status dots
- [x] Tap user → action sheet (PM / Ignore)

## Phase 5: Voice Chat
- [x] Open-mic voice chat using WebRTC
- [x] Multiple users can speak simultaneously
- [x] Mic toggle button (mute/unmute)
- [x] Voice active indicator (orange dot) in user list
- [x] Voice status bar (Ready / Active)

## Phase 6: Private Messaging & Admin
- [x] Private message screen (PM between two users)
- [x] PM notification in chat room
- [x] Admin panel screen (generate invite link)
- [x] Invite link with 6-hour expiry countdown
- [x] Copy/share invite link

## Phase 7: Polish & Finalize
- [x] Yahoo Chat Room aesthetic (colors, fonts, layout)
- [x] Emoji/emotions button
- [x] Text formatting toolbar (Bold, Italic)
- [x] Error states (expired link, nickname taken)
- [ ] All flows tested end-to-end

## Bugs (reported after testing)
- [x] Invite link generation button throws an error
- [x] Bold text formatting shows **stars** instead of rendering bold visually
- [x] Verify and fix voice/audio chat WebRTC functionality
- [x] Rename chat room from "The Local2" to "Now"
- [x] Voice chat not working between two browser users (no audio heard)
- [x] Private messages not delivering to recipient
- [x] Clear chat messages on logout/rejoin (fresh start each session)
- [x] Add Clear Chat button (admin only) to wipe the room history
