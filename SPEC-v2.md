# Mirmi Messenger v2 Spec
*Full messenger experience - Chrome Extension*

## Vision
Mirmi as a floating unified messenger embedded in Chrome. Every tab, every page - Mirmi is there. Talk to people, send images, switch conversations, all without leaving what you're doing.

## Core Features to Build

### 1. Identity / Auth
- Simple profile selector on first launch (name + avatar letter)
- Store in chrome.storage.local (persist across pages)
- Names: Hammad, Tiago, Aamir (hardcoded for now, OAuth later)
- Each user gets a color + initial avatar

### 2. Messenger UI (full redesign)
Current: single chat panel floating bottom-right
New: expandable messenger panel with:
- **Sidebar** (left): conversation list
  - Mirmi Group (main Telegram group = current)
  - Direct: Hammad ↔ Mirmi
  - Direct: Tiago ↔ Mirmi
  - Each shows last message + unread badge
- **Main chat area** (right): active conversation
  - Message bubbles (Telegram-style)
  - Sender name + avatar on each message
  - Timestamps
  - Image preview in bubbles
- **Input bar**:
  - Text input
  - 📎 Image attach button → file picker → sends to Telegram
  - 🎙️ Voice button (existing ElevenLabs TTS)
  - Send button

### 3. Multi-Conversation Support
- Bridge server stores messages per-conversation (keyed by chatId)
- "Mirmi Group" = existing Telegram group (topic 5148)
- "Mirmi" DM = direct chat with OpenClaw Mirmi brain (routes through me, not Groq)
- Future: more groups as xix3D scales

### 4. Image Upload
- User clicks attach → file picker (images only)
- Extension uploads to bridge → bridge sends to Telegram via Bot API
- Bridge stores image URL in message object
- Extension renders image thumbnails in chat bubbles
- Max 10MB, jpg/png/gif

### 5. OpenClaw Routing (the "real brain")
- When user sends a message in the "Mirmi" DM conversation:
  - Bridge POSTs to Telegram as the user (via bot)
  - OpenClaw picks it up, I respond in Telegram
  - Relay pushes my response to bridge
  - Extension shows it
- "Mirmi Group" chat = full group sync (current behavior)
- This makes ME the brain, not Groq

### 6. Three-State UI (NEW)
Three states, cycle through them:

**State 1: Orb only** (default/collapsed)
- Just the floating Mirmi avatar (current orb with all animations)
- Click once → goes to State 2
- Draggable in this state

**State 2: Mini window** (compact messenger)
- 380x580px panel attached to orb
- Sidebar + chat area (messenger layout)
- Expand button (⤢) in top-right corner → goes to State 3
- Close button (×) → back to State 1
- Draggable orb still visible/attached

**State 3: Full screen**
- Full viewport overlay (like opening an app)
- Same messenger UI but spacious - sidebar 240px, chat fills rest
- Keyboard shortcut: Escape → back to State 2
- Collapse button → back to State 2
- NOT draggable (it's full screen)

### 7. Draggable Orb (NEW - techs request)
- User can click and DRAG the orb to reposition it anywhere on screen
- Distinguish between click (open chat) and drag (move): if mouse moves >5px during mousedown, treat as drag not click
- Position persists via chrome.storage.local (survives page navigation)
- Default position: bottom-right (existing)
- Orb stays within viewport bounds (clamp to edges)
- Messenger panel opens relative to orb position (smart positioning: if orb is on left half of screen, panel opens to the right; if right half, panel opens to the left)

## Architecture

### Bridge (Render.com - server.js)
New endpoints needed:
- `GET /api/conversations` → list of conversation threads
- `GET /api/messages/:chatId` → messages for a specific chat
- `POST /api/message` → push a message (existing, add chatId)
- `POST /api/send-telegram` → send message TO Telegram (for extension → Telegram routing)
- `POST /api/upload-image` → receive image, forward to Telegram Bot API, return URL

### Extension (Chrome MV3)
- `manifest.json` - add file permissions for image upload
- `orb.js` - new messenger UI, sidebar, conversations
- `orb.css` - full messenger styles
- `background.js` - handle file upload relay
- `content_script.js` - unchanged

### Relay (VPS Python)
- Add: push images to bridge (when Telegram image received, store URL reference)
- Strip [[reply_to_current]] from Mirmi messages before push
- Add: support for more conversation topics/chats

## UI Design
- Dark theme (existing aesthetic - deep navy, white text)
- Sidebar: 120px, conversation cards with unread dots
- Chat area: scrollable, messages from bottom
- Bubbles: user = dark blue right-aligned, others = dark gray left-aligned
- Mirmi messages: green orb avatar (current brand color)
- Image bubbles: thumbnail with expand on click
- Status bar: "Mirmi · typing..." during response generation

## Build Order
1. New UI shell (sidebar + chat area layout) - no functionality yet
2. Wire existing Telegram sync into new UI
3. Identity / profile setup
4. Image upload
5. Multi-conversation routing
6. OpenClaw (real Mirmi brain) for DM conversation

## Files to Create/Modify
- `extension/orb.js` - full rewrite
- `extension/orb.css` - full rewrite  
- `bridge/server.js` - new endpoints
- `extension/manifest.json` - minor update (file access)
- `extension/background.js` - image upload handler
