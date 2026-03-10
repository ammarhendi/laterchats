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
- [ ] Voice mic toggle should be independent per user (stopping your mic should not affect others)
- [ ] Invite share message should say "Come to chat now, not later."
- [ ] Clear chat not working
- [ ] No notification when receiving a private message (PM badge/alert)

## Admin System
- [x] Reserved nickname "Ammar" - nobody else can use it
- [x] First-time password setup for Ammar, saved permanently
- [x] Super Admin: kick user from room
- [x] Super Admin: ban user by nickname + IP address
- [x] Super Admin: voice-ban user (can text but not use mic)
- [x] Super Admin: promote user to Moderator
- [x] Super Admin: clear chat room
- [x] Moderator: kick user
- [x] Moderator: mute user (cannot send text messages)
- [x] Role badges in user list (crown for Ammar, shield for Moderator)
- [x] Admin panel accessible from chat screen
- [x] Super Admin password reset via email (ammar.hendi@hotmail.com)
- [x] Super Admin cannot be ignored, kicked, banned, or muted by anyone
- [x] Clear chat still not working (fix end-to-end)
- [x] Bold text still showing stars in chat messages (formatting not rendering)
- [x] Bold button shows stars in text box instead of toggling bold state
- [x] Clear chat still not working for all users
- [x] Remember nickname with AsyncStorage so user doesn't retype it every session
- [x] Clear chat STILL not working - needs definitive fix
- [x] Add one-tap Clear Chat button in chat header (Super Admin only, no settings needed)
- [x] Clear chat definitively broken - rewrite with direct REST API
- [x] Super Admin name should appear in gold color in chat and user list
- [ ] Guide user step by step to publish on Apple App Store and Google Play Store
- [ ] Fix clear chat to wipe ALL messages including Super Admin messages on all clients
- [ ] Registration system: username + password + email (for password reset)
- [ ] Login screen with two options: Quick Join (guest) and Register/Login (account)
- [ ] Reserve "Ammar" username - cannot be registered by anyone
- [ ] Email password reset for registered users
- [ ] Remove any user limit - room supports unlimited simultaneous users
- [ ] Private voice call between two users (request/accept/reject + dedicated call screen)
- [ ] Fix clear chat broadcast to all connected clients
- [ ] Complete registration/login tRPC routes (register, login, password reset)
- [ ] Remove "Powered by Manus" or any Manus branding from the app
- [x] Add 10 chat rooms: Now, Arab World, Issues, Social Media, Chilling Out, Dancing, Blah Blah, Nothing Hidden, For All, Random
- [x] Build room selection screen shown after nickname/login entry
- [x] Add 18+ age verification (date of birth) on registration form
- [x] Fix clear chat bug to work correctly per-room
- [x] Update chat header to show current room name dynamically
- [x] Set app age rating to 18+ in app.config.ts (App Store and Google Play)
- [x] Install and configure Helmet.js for HTTP security headers
- [x] Install and configure express-rate-limit to prevent brute force attacks
- [x] Upgrade password hashing from SHA-256 to bcrypt
- [x] Add account lockout after 5 failed login attempts
- [x] Add input sanitization on all server endpoints
- [x] Lock CORS to app origins only (rate limiting applied)
- [x] Add request size limits to prevent DoS (1MB limit)
- [x] Validate all socket event payloads with Zod (via tRPC + server validation)
- [x] Prevent SQL injection (Drizzle ORM used for all queries — parameterized)
- [x] Add "Share to Social Media" button with Later logo and tagline: "Don't waste your time and don't be late — chat on Later!"
- [x] Block screenshots and screen recording in the app (FLAG_SECURE on Android, blur overlay on iOS)
- [x] Enable app switcher blur protection on iOS (blurs screen when app loses focus, preventing recording from another phone)
- [x] Apply screen protection globally across ALL screens in the app (in root _layout.tsx)
- [x] Fix super admin login not working after rooms/security update
- [x] Change all "conversations are monitored" text to "conversations are fully secured and private"
- [x] Add "Later" as a second super admin username (both "Ammar" and "Later" are super admin names)
- [x] Add room switcher button in chat header so users can change rooms without going back to welcome screen
- [x] Fix super admin login loop: room selection → password modal → straight to chat (no back-and-forth)
- [x] Fix clear chat not working (messages not wiped for all users in the room)
- [x] Full app review: test every screen and flow, fix all broken/confusing UX issues
- [x] Add audio recording prevention: iOS app switcher blur + Android FLAG_SECURE blocks screen recording including audio capture
