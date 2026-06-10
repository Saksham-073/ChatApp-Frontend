# Message Editing & Deletion — Design Spec

**Date:** 2026-06-11
**Scope:** Both group rooms and direct messages
**Repos:** `ChatApp/chatApp-Backend` (Laravel 13) and `ChatApp-Frontend` (Vue 3)

## Requirements (agreed)

- Users can edit and delete **their own messages only**, in both rooms and DMs.
- **Editing** is allowed only within **15 minutes** of sending; **deletion** is allowed anytime.
- Deletion is a **soft delete with tombstone**: the message row remains, everyone sees
  "This message was deleted" in place. Deleted content is blanked in the database.
- Edited messages show an **"(edited)"** label.
- All changes sync in **real time** to other participants via the existing Pusher channels.
- UI: hover icons on desktop, tap-to-toggle action bar on mobile.

## 1. Data Model

One migration adds to **both** `chat_messages` and `direct_messages`:

| Column | Type | Meaning |
|---|---|---|
| `edited_at` | nullable timestamp | set on every successful edit |
| `deleted_at` | nullable timestamp | set on delete (tombstone marker) |

- The Laravel `SoftDeletes` trait is **not** used — its global scope hides trashed rows,
  but tombstones must remain in query results.
- On delete the server sets `deleted_at = now()` **and** `message = ''` so deleted
  content is not retained.
- `ChatMessageResource` and `DirectMessageResource` expose both new fields.

## 2. API

Four new routes inside the existing `auth:sanctum` group (route-model-bound `{message}`):

| Method | Path | Rules |
|---|---|---|
| PATCH | `/api/chat/room/{roomId}/messages/{message}` | sender only; `created_at` ≤ 15 min ago; not deleted |
| DELETE | `/api/chat/room/{roomId}/messages/{message}` | sender only; anytime |
| PATCH | `/api/conversations/{conversation}/messages/{message}` | participant policy + sender only; ≤ 15 min; not deleted |
| DELETE | `/api/conversations/{conversation}/messages/{message}` | participant policy + sender only; anytime |

Behavior:

- Edit body: `{ "message": string }`, validated `required|string|max:2000`.
- Edit responses: 200 with the updated resource. Window expired → 403
  `"Edit window expired."`. Editing a deleted message → 409.
- Non-sender attempting either action → 403. The `{message}` must belong to the
  room/conversation in the URL (404 otherwise).
- Delete responses: 204. Deleting an already-deleted message → 204 (idempotent).
- The 15-minute window is a named constant (`DirectMessage::EDIT_WINDOW_MINUTES`,
  `ChatMessage::EDIT_WINDOW_MINUTES`) enforced server-side only.

## 3. Broadcasting

Four new queued events mirroring the existing `MessageSent` / `DirectMessageSent` pattern:

| Event | Channel | Payload |
|---|---|---|
| `MessageUpdated` | `chat-room.{roomId}` (public) | full updated message fields |
| `MessageDeleted` | `chat-room.{roomId}` (public) | `id`, `chat_room_id`, `deleted_at` |
| `DirectMessageUpdated` | `private-conversation.{id}` | full updated message fields |
| `DirectMessageDeleted` | `private-conversation.{id}` | `id`, `conversation_id`, `deleted_at` |

- All broadcast with `->toOthers()`; the actor applies the HTTP response locally.
- No `user.{id}` channel needed: edits/deletes only concern users who already have the
  conversation and are therefore subscribed to its channel.
- Same queue-worker requirement as existing events.

## 4. Frontend Stores

`src/stores/chat.ts` and `src/stores/dm.ts`:

- New actions: `editMessage(id, text)` (PATCH, replace in `messages` on success) and
  `deleteMessage(id)` (DELETE, mark deleted locally).
- Channel subscriptions gain `.listen('…Updated')` / `.listen('…Deleted')` handlers that
  replace the matching message by `id`.
- `dm.ts`: when the affected message is the conversation's `last_message`, refresh the
  sidebar preview (deleted → "Message deleted"; edited → new text).
- Types `ChatMessage` / `DirectMessage` gain `edited_at?: string | null` and
  `deleted_at?: string | null`.
- Non-optimistic updates: UI changes apply after server confirmation (consistent with
  existing send behavior).

## 5. UI (ChatView)

- **Action affordance (own messages only):** desktop — pencil + trash icons fade in on
  hover beside the bubble; mobile — tapping your own bubble toggles the same action bar.
  Icons: `lucide:pencil`, `lucide:trash-2`.
- The pencil is hidden when the message is older than 15 minutes or deleted (server
  still enforces — UI is cosmetic).
- **Edit mode:** composer pre-fills with the message text; a slim bar above it reads
  "Editing message — Esc to cancel"; Enter saves (PATCH), Esc cancels and restores any
  draft the user had typed.
- **Delete confirm:** two-tap — trash icon turns into a confirm check for ~3 s; second
  tap deletes. No modal.
- **Tombstone:** italic, muted, `lucide:ban` icon + "This message was deleted"; no
  action icons; same bubble position to preserve flow.
- **Edited label:** small "(edited)" beside the timestamp when `edited_at` is set.
- Sidebar DM preview shows "Message deleted" when the latest message is a tombstone.

## 6. Error Handling

- API failures (expired window, 403, network) surface via the existing toast system.
- Race tolerance: a `…Deleted` event for a message not in the local list is ignored;
  an edit landing after a delete renders as tombstone (deleted wins).

## 7. Testing

Backend feature tests (in-memory SQLite, mirroring existing test style):

1. Sender edits own message within window → 200, `edited_at` set, content updated.
2. Edit after 15 minutes (`$this->travel(16)->minutes()`) → 403.
3. Non-sender edit/delete → 403 (room and DM variants).
4. Edit a deleted message → 409.
5. Delete → 204, `deleted_at` set, `message` blanked in DB.
6. Delete twice → 204 (idempotent).
7. DM: non-participant → 403 via policy.
8. Conversations list: deleted latest message yields blanked preview content.

Frontend: `npm run build` type-check; manual two-browser real-time verification.

## Out of Scope (YAGNI)

- "Delete for me" (per-user hiding), edit history, admin/moderator deletion,
  bulk deletion, undo.
