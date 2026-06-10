# ChatApp — Frontend

A real-time chat SPA built with Vue 3, TypeScript, and Tailwind CSS v4, featuring an "Aurora Glass" design — frosted-glass panels floating over an animated gradient backdrop, with full light/dark theming.

Talks to the Laravel backend in the `chatApp-Backend` repository over REST (`/api`) and receives live messages through Pusher WebSockets (Laravel Echo).

## Features

- **Group rooms** — public channels anyone can join; create rooms from the sidebar
- **Direct messages** — private one-on-one conversations over authenticated private channels
- **Live everywhere** — subscribed to *all* your conversations, so closed chats still get unread badges, last-message previews, and reorder to the top in real time
- **Read receipts & unread counts** — conversations are marked read on open
- **Smart scrolling** — auto-scrolls only when you're near the bottom; otherwise shows a "N new messages" pill
- **Message UX** — date separators (Today/Yesterday), grouped consecutive messages, auto-growing composer (Enter sends, Shift+Enter for newline)
- **Session restore** — refresh-safe auth: token in localStorage, user re-fetched via `/api/me` behind a route guard
- **Light/dark mode** — toggle persisted to localStorage, defaults to OS preference, no flash on load
- **Responsive** — 3-pane layout on desktop (icon rail / list / thread), slide-over drawer on mobile
- **Search & filters** — filter the sidebar by All / DMs / Rooms and search by name
- **Connection indicator** — live Online / Connecting / Offline state from the Pusher socket

## Tech Stack

| | |
|---|---|
| Framework | Vue 3 (Composition API, `<script setup>`) + TypeScript |
| Build | Vite |
| State | Pinia |
| Routing | Vue Router (auth guards) |
| Styling | Tailwind CSS v4 (CSS-variable theme tokens) |
| Real-time | laravel-echo + pusher-js |
| Font | Sora (Google Fonts) |

## Getting Started

```bash
npm install
npm run dev        # serves on all interfaces (--host) at :5173
```

The backend must be running — see the backend README. Short version:

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

## Project Structure

```
src/
├── lib/
│   ├── config.ts    # API_ORIGIN — auto-detects the backend host
│   ├── api.ts       # fetch wrapper: bearer token, X-Socket-ID, 401 handling, pagination types
│   ├── echo.ts      # lazy Echo factory (private channel auth), connectionState ref
│   └── theme.ts     # light/dark mode: localStorage + .dark class on <html>
├── stores/
│   ├── auth.ts      # login/register/logout, cached init() session restore
│   ├── chat.ts      # rooms, room messages, public channel subscription
│   └── dm.ts        # users, conversations, DMs, per-conversation private channels,
│                    #   unread counts, mark-read, last-message previews
├── views/
│   ├── LoginView.vue  # glass auth card + theme toggle
│   └── ChatView.vue   # 3-pane layout: icon rail / conversation list / thread
├── router/index.ts    # guards await auth.init() before navigating
├── assets/main.css    # theme tokens (light/dark), aurora backdrop, glass utilities
└── App.vue            # aurora backdrop + session-restore loader
```

## Theming

All colors flow through semantic tokens defined in `src/assets/main.css` (`--ink-*`, `--glass-*`, `--field-bg`, `--edge`, ...) with light values on `:root` and dark values on `.dark`. They're exposed as Tailwind utilities via `@theme inline` — use `text-ink`, `text-ink-3`, `bg-field`, `border-edge`, `bg-hovered`, `bg-active` instead of raw palette colors so new UI stays theme-aware automatically.

## Recommended IDE Setup

[VS Code](https://code.visualstudio.com/) + [Vue (Official)](https://marketplace.visualstudio.com/items?itemName=Vue.volar).
