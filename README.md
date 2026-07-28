# ChatApp Frontend

Real-time chat SPA built with Vue 3, TypeScript, and Tailwind CSS v4. The UI is an "Aurora Glass" look: frosted panels floating over an animated gradient backdrop, in both light and dark themes.

Talks to the Laravel backend in the `chatApp-Backend` repository over REST (`/api`) and receives live messages through Pusher WebSockets (Laravel Echo).

## Features

- Group rooms: public channels anyone can join. Create rooms from the sidebar.
- Direct messages: private one-on-one conversations over authenticated private channels.
- 1:1 audio/video calling. Native WebRTC calls over DMs with ring, accept/decline, mute, camera toggle, screen share, and picture-in-picture. Signaling runs over Pusher whispers with a perfect-negotiation peer connection. Missed-call badges and a merged call/message history timeline. TURN relay via Cloudflare Realtime covers NAT and AP-isolated networks (see the backend README for setup).
- End-to-end encrypted DMs. Messages are encrypted client-side with libsodium, using a passphrase-derived key hierarchy that is independent of your login password. Keys auto-lock after 15 minutes idle. Peer key resets are detected (re-wrap plus a TOFU banner), and a downgrade guard blocks silent fallback to plaintext.
- Typing indicators: live "user is typing…" in both rooms and DMs.
- Subscribed to all your conversations at once, so closed chats still get unread badges, last-message previews, and reorder to the top in real time.
- Read receipts and unread counts. Conversations are marked read on open.
- Edit and delete. You can edit your own messages within 15 minutes (hover/tap actions, composer edit mode, "(edited)" label) and soft-delete anytime with a two-tap confirm, which leaves a "this message was deleted" tombstone. Both sync live to the other side.
- Scrolling that stays out of the way: auto-scrolls only when you're near the bottom, otherwise shows a "N new messages" pill.
- Date separators (Today/Yesterday), grouped consecutive messages, and an auto-growing composer (Enter sends, Shift+Enter for a newline).
- Session restore. Refresh-safe auth: the token lives in localStorage and the user is re-fetched via `/api/me` behind a route guard.
- Light/dark mode toggle, persisted to localStorage. Defaults to the OS preference with no flash on load.
- Responsive: a 3-pane layout on desktop (icon rail / list / thread), slide-over drawer on mobile.
- Sidebar search and filters (All / DMs / Rooms, search by name).
- Connection indicator with live Online / Connecting / Offline state from the Pusher socket.

## Tech stack

| | |
|---|---|
| Framework | Vue 3 (Composition API, `<script setup>`) + TypeScript |
| Build | Vite |
| State | Pinia |
| Routing | Vue Router (auth guards) |
| Styling | Tailwind CSS v4 (CSS-variable theme tokens) |
| Icons | Iconify (`@iconify/vue`, `lucide` set + `mdi` for calling) |
| Real-time | laravel-echo + pusher-js |
| Calling | native WebRTC (`RTCPeerConnection`), signaled over Pusher whispers |
| Encryption | libsodium-wrappers-sumo (client-side E2E for DMs) |
| Testing | Vitest + happy-dom |
| Font | Sora (Google Fonts) |

## Getting started

```bash
npm install
npm run dev        # serves on all interfaces (--host) at :5173
```

The backend must be running. See the backend README, but the short version is:

```bash
php artisan serve --host=0.0.0.0   # terminal 1
php artisan queue:work             # terminal 2 (required for real-time)
```

### Environment (`.env`)

```env
# Auto-detected by default: the app calls port 8000 on whatever host served it,
# so phones on the same Wi-Fi work without config. Uncomment only to override.
# VITE_API_URL=http://localhost:8000

VITE_PUSHER_APP_KEY=<your-pusher-key>
```

### Testing on a phone

1. Both devices on the same Wi-Fi.
2. Backend running with `--host=0.0.0.0`, frontend with `npm run dev`.
3. Open `http://<your-computer-ip>:5173` on the phone. API and WebSocket auth resolve automatically via `src/lib/config.ts`.

## Scripts

```bash
npm run dev       # dev server with HMR
npm run build     # type-check + production build
npm run lint      # oxlint + eslint
npm run format    # prettier
```

## Project structure

```
src/
├── lib/
│   ├── config.ts    # API_ORIGIN - auto-detects the backend host
│   ├── api.ts       # fetch wrapper: bearer token, X-Socket-ID, 401, 204, pagination types
│   ├── echo.ts      # lazy Echo factory (private channel auth), connectionState ref
│   ├── theme.ts     # light/dark mode: localStorage + .dark class on <html>
│   └── ui.ts        # shared view helpers: initials, avatar hue, relative time, connStatus
├── composables/
│   └── useWebRTC.ts # perfect-negotiation RTCPeerConnection wrapper (Echo/Pinia-free)
├── stores/
│   ├── auth.ts      # login/register/logout, cached init() session restore
│   ├── chat.ts      # rooms, room messages, send/edit/delete, public channel subscription
│   ├── dm.ts        # users, conversations, DMs, send/edit/delete, per-conversation private
│   │                #   channels, unread counts, mark-read, last-message previews
│   ├── keys.ts      # E2E key hierarchy: enroll/unlock/lock, idle auto-lock, peer resets
│   └── call.ts      # call lifecycle state machine, WebRTC signaling, ICE server fetch/cache
├── components/
│   ├── Navbar.vue     # desktop icon rail (filters, theme toggle, avatar, logout)
│   ├── Sidebar.vue    # conversation list drawer (search, rooms + DMs, create room)
│   ├── Header.vue     # thread header (title, connection status, call buttons, mobile menu)
│   ├── TypingIndicator.vue
│   └── call/          # CallLayer, IncomingCallModal, CallOverlay, CallPiP, CallTimelineRow
├── views/
│   ├── LoginView.vue  # glass auth card + theme toggle
│   └── ChatView.vue   # thread pane orchestrator: messages, edit/delete, composer, toasts
├── router/index.ts    # guards await auth.init() before navigating
├── assets/main.css    # theme tokens (light/dark), aurora backdrop, glass utilities
└── App.vue            # aurora backdrop + session-restore loader
```

## Theming

All colors flow through semantic tokens defined in `src/assets/main.css` (`--ink-*`, `--glass-*`, `--field-bg`, `--edge`, ...) with light values on `:root` and dark values on `.dark`. They're exposed as Tailwind utilities via `@theme inline`. Use `text-ink`, `text-ink-3`, `bg-field`, `border-edge`, `bg-hovered`, `bg-active` instead of raw palette colors so new UI stays theme-aware without extra work.

## Recommended IDE setup

[VS Code](https://code.visualstudio.com/) + [Vue (Official)](https://marketplace.visualstudio.com/items?itemName=Vue.volar).
