# Yahoo Chat Room UI Analysis

## Layout (top to bottom)

### 1. Header Bar
- YAHOO! Chat logo (top right, purple/yellow)
- Room name: "You are in The Local2" (italic, blue link text)
- Description in parentheses: "(Pull up a chair and have a chat, mate!)"
- No generic back/home icons — just the room name as a title

### 2. Main Content Area (split horizontally)
- LEFT (70%): Chat messages area
  - White background
  - Messages: "Username says, message text" format
  - Usernames in BOLD colored text (blue, red, green, etc.)
  - System messages in italic (e.g., "zelda3022 joined the room")
  - Scrollable
- RIGHT (30%): "Chatters" panel
  - Header: "Chatters" (plain text)
  - List of usernames, one per line, small font
  - Scrollable

### 3. Toolbar Row (below messages, above input)
- B (Bold) button
- I (Italic) button  
- Color selector (shows "Black" as dropdown)
- Preferences button
- Friends button
- Emotions button
- Stop Voice button
- All in a compact horizontal row with small buttons

### 4. Input Row
- Label: "Chat:" 
- Text input field (wide)
- "Send" button (right of input)
- "PM" button
- "Ignore" button
- "More" button

### 5. Voice Bar
- "Voice:" label
- "Hands Free" checkbox/button
- "Talk" button (push-to-talk)
- Status indicator: "(Ready)"
- Volume slider

### 6. Bottom Panel (left sidebar)
- WHO'S CHATTING (with arrow)
- CHAT ROOM (with arrow)
- CREATE ROOM (with arrow)
- SURF THE WEB (with arrow)
- HELP | EXIT

### 7. Bottom Right: Status
- "I'm Available" dropdown

## Color Scheme
- Background: Light gray (#f0f0f0) for chrome areas
- Chat area: White
- Header: White with Yahoo! Chat logo
- Toolbar: Gray buttons, flat style
- Username colors: Various (blue, red, green, purple)
- System messages: Italic, dark gray

## Key Differences from Current App
1. Header shows room name + description, NOT generic back button
2. Toolbar is BELOW the chat area, not above
3. "Chatters" panel is to the RIGHT of messages (not a separate panel)
4. Voice bar is separate row below toolbar
5. Bottom sidebar has navigation items
6. Status dropdown bottom right
7. No "Clear Chat" button visible in main UI
