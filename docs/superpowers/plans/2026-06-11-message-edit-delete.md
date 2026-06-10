# Message Editing & Deletion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users edit (within 15 minutes) and soft-delete (anytime) their own messages in rooms and DMs, with tombstones and real-time sync.

**Architecture:** Plain nullable `edited_at`/`deleted_at` columns (no SoftDeletes trait — tombstones must stay in query results). Four new PATCH/DELETE endpoints following existing route nesting, four new broadcast events on the existing Pusher channels, all `->toOthers()`. Frontend stores gain edit/delete actions and channel listeners; ChatView gains hover/tap action icons, composer edit mode, and tombstone rendering.

**Tech Stack:** Laravel 13 + PHPUnit (in-memory SQLite), Vue 3 + TypeScript + Pinia, Pusher via laravel-echo, Iconify (`lucide` set).

**Spec:** `docs/superpowers/specs/2026-06-11-message-edit-delete-design.md`

**Repos (NOT yet git-initialized — Task 1 fixes that):**
- Backend: `/Users/sakshamjamwal/Desktop/work/ChatApp/chatApp-Backend`
- Frontend: `/Users/sakshamjamwal/Desktop/work/ChatApp-Frontend`

**Conventions you must follow:**
- Run backend commands from the backend repo root; frontend from frontend root.
- After modifying any backend PHP file: `vendor/bin/pint <changed files>`.
- Backend tests run on in-memory SQLite (`phpunit.xml` already configured); broadcasting is `null` in tests so events are safe.
- Frontend has no unit test runner; `npm run build` (vue-tsc + vite) is the verification gate.

---

## File Structure

**Backend — create:**
- `database/migrations/<ts>_add_edit_delete_columns_to_message_tables.php` — both columns, both tables
- `app/Events/MessageUpdated.php`, `app/Events/MessageDeleted.php` — room events (public channel)
- `app/Events/DirectMessageUpdated.php`, `app/Events/DirectMessageDeleted.php` — DM events (private channel)
- `tests/Feature/MessageEditDeleteTest.php` — room endpoint tests
- `tests/Feature/DirectMessageEditDeleteTest.php` — DM endpoint tests

**Backend — modify:**
- `app/Models/ChatMessage.php`, `app/Models/DirectMessage.php` — fillable, casts, `EDIT_WINDOW_MINUTES`
- `app/Http/Controllers/ChatController.php` — `updateMessage()`, `destroyMessage()`
- `app/Http/Controllers/DirectMessageController.php` — `update()`, `destroy()`
- `app/Http/Resources/ChatMessageResource.php`, `DirectMessageResource.php` — new fields
- `app/Http/Resources/ConversationResource.php` — `last_message` gains `id` + `deleted_at` (needed so the sidebar can render "Message deleted" on fresh load and match previews by id)
- `routes/api.php` — four routes

**Frontend — modify:**
- `src/lib/api.ts` — add `patch` and `del` helpers
- `src/stores/chat.ts` — types, `editMessage`/`deleteMessage`, channel listeners
- `src/stores/dm.ts` — same + sidebar preview refresh
- `src/views/ChatView.vue` — action icons, edit mode, two-tap delete, tombstone, "(edited)"
- `src/components/Sidebar.vue` — "Message deleted" preview

---

### Task 1: Initialize git in both repos

The superpowers workflow commits after every task; neither repo is a git repository yet.

**Files:** none (repo setup)

- [ ] **Step 1: Init backend repo**

```bash
cd /Users/sakshamjamwal/Desktop/work/ChatApp/chatApp-Backend
git init && git add -A && git commit -m "chore: initial commit (pre message-edit-delete feature)"
```

Expected: commit created (Laravel `.gitignore` already excludes `vendor/`, `.env`).

- [ ] **Step 2: Init frontend repo**

```bash
cd /Users/sakshamjamwal/Desktop/work/ChatApp-Frontend
git init && git add -A && git commit -m "chore: initial commit (pre message-edit-delete feature)"
```

Expected: commit created (`node_modules/`, `dist/` ignored by existing `.gitignore`).

---

### Task 2: Migration + model columns

**Files:**
- Create: `database/migrations/<ts>_add_edit_delete_columns_to_message_tables.php`
- Modify: `app/Models/ChatMessage.php`, `app/Models/DirectMessage.php`

- [ ] **Step 1: Generate the migration**

```bash
php artisan make:migration add_edit_delete_columns_to_message_tables
```

- [ ] **Step 2: Fill the migration**

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('chat_messages', function (Blueprint $table) {
            $table->timestamp('edited_at')->nullable()->after('message');
            $table->timestamp('deleted_at')->nullable()->after('edited_at');
        });

        Schema::table('direct_messages', function (Blueprint $table) {
            $table->timestamp('edited_at')->nullable()->after('message');
            $table->timestamp('deleted_at')->nullable()->after('edited_at');
        });
    }

    public function down(): void
    {
        Schema::table('chat_messages', function (Blueprint $table) {
            $table->dropColumn(['edited_at', 'deleted_at']);
        });

        Schema::table('direct_messages', function (Blueprint $table) {
            $table->dropColumn(['edited_at', 'deleted_at']);
        });
    }
};
```

- [ ] **Step 3: Migrate and verify**

```bash
php artisan migrate
php artisan migrate:status | tail -3
```

Expected: new migration shows `Ran`.

- [ ] **Step 4: Update both models**

`app/Models/ChatMessage.php` — replace the class body's constants/properties:

```php
class ChatMessage extends Model
{
    public const EDIT_WINDOW_MINUTES = 15;

    protected $fillable = ['chat_room_id', 'user_id', 'message', 'edited_at', 'deleted_at'];

    protected $casts = ['edited_at' => 'datetime', 'deleted_at' => 'datetime'];

    // existing room() and user() relations stay unchanged
```

`app/Models/DirectMessage.php`:

```php
class DirectMessage extends Model
{
    public const EDIT_WINDOW_MINUTES = 15;

    protected $fillable = ['conversation_id', 'sender_id', 'message', 'read_at', 'edited_at', 'deleted_at'];

    protected $casts = ['read_at' => 'datetime', 'edited_at' => 'datetime', 'deleted_at' => 'datetime'];

    // existing sender() and conversation() relations stay unchanged
```

- [ ] **Step 5: Run existing suite to confirm nothing broke, then commit**

```bash
php artisan test --compact          # Expected: 14 passed
vendor/bin/pint app/Models database/migrations --format agent
git add -A && git commit -m "feat: add edited_at/deleted_at columns to message tables"
```

---

### Task 3: Room message editing (TDD)

**Files:**
- Test: `tests/Feature/MessageEditDeleteTest.php` (create)
- Create: `app/Events/MessageUpdated.php`
- Modify: `app/Http/Resources/ChatMessageResource.php`, `app/Http/Controllers/ChatController.php`, `routes/api.php`

- [ ] **Step 1: Write the failing tests**

Create `tests/Feature/MessageEditDeleteTest.php`:

```php
<?php

namespace Tests\Feature;

use App\Models\ChatMessage;
use App\Models\ChatRoom;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class MessageEditDeleteTest extends TestCase
{
    use RefreshDatabase;

    private User $alice;

    private User $bob;

    private ChatRoom $room;

    private ChatMessage $message;

    protected function setUp(): void
    {
        parent::setUp();

        $this->alice = User::factory()->create();
        $this->bob = User::factory()->create();
        $this->room = ChatRoom::create(['name' => 'General']);
        $this->message = ChatMessage::create([
            'chat_room_id' => $this->room->id,
            'user_id' => $this->alice->id,
            'message' => 'Original text',
        ]);
    }

    public function test_sender_can_edit_message_within_window(): void
    {
        Sanctum::actingAs($this->alice);

        $this->patchJson("/api/chat/room/{$this->room->id}/messages/{$this->message->id}", [
            'message' => 'Updated text',
        ])->assertOk()
            ->assertJsonPath('message', 'Updated text');

        $this->assertNotNull($this->message->fresh()->edited_at);
    }

    public function test_edit_rejected_after_window_expires(): void
    {
        Sanctum::actingAs($this->alice);
        $this->travel(ChatMessage::EDIT_WINDOW_MINUTES + 1)->minutes();

        $this->patchJson("/api/chat/room/{$this->room->id}/messages/{$this->message->id}", [
            'message' => 'Too late',
        ])->assertStatus(403);
    }

    public function test_non_sender_cannot_edit(): void
    {
        Sanctum::actingAs($this->bob);

        $this->patchJson("/api/chat/room/{$this->room->id}/messages/{$this->message->id}", [
            'message' => 'Hijacked',
        ])->assertStatus(403);
    }

    public function test_editing_deleted_message_fails(): void
    {
        $this->message->update(['message' => '', 'deleted_at' => now()]);
        Sanctum::actingAs($this->alice);

        $this->patchJson("/api/chat/room/{$this->room->id}/messages/{$this->message->id}", [
            'message' => 'Resurrect',
        ])->assertStatus(409);
    }

    public function test_message_must_belong_to_room_in_url(): void
    {
        $otherRoom = ChatRoom::create(['name' => 'Other']);
        Sanctum::actingAs($this->alice);

        $this->patchJson("/api/chat/room/{$otherRoom->id}/messages/{$this->message->id}", [
            'message' => 'Wrong room',
        ])->assertStatus(404);
    }
}
```

- [ ] **Step 2: Run to verify failure**

```bash
php artisan test --compact tests/Feature/MessageEditDeleteTest.php
```

Expected: FAIL — 405/404s (route does not exist yet).

- [ ] **Step 3: Create the MessageUpdated event**

`app/Events/MessageUpdated.php`:

```php
<?php

namespace App\Events;

use App\Models\ChatMessage;
use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class MessageUpdated implements ShouldBroadcast
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(public ChatMessage $message) {}

    public function broadcastOn(): array
    {
        return [new Channel('chat-room.'.$this->message->chat_room_id)];
    }

    public function broadcastWith(): array
    {
        return [
            'id' => $this->message->id,
            'chat_room_id' => $this->message->chat_room_id,
            'user_id' => $this->message->user_id,
            'message' => $this->message->message,
            'edited_at' => $this->message->edited_at,
            'deleted_at' => $this->message->deleted_at,
            'created_at' => $this->message->created_at,
            'user' => $this->message->user,
        ];
    }
}
```

- [ ] **Step 4: Expose new fields in ChatMessageResource**

In `app/Http/Resources/ChatMessageResource.php`, add to the returned array (after `'message'`):

```php
'edited_at' => $this->edited_at,
'deleted_at' => $this->deleted_at,
```

- [ ] **Step 5: Add controller method + route**

In `app/Http/Controllers/ChatController.php`, add imports `use App\Events\MessageUpdated;` and the method:

```php
public function updateMessage(Request $request, $roomId, ChatMessage $message)
{
    abort_unless((int) $message->chat_room_id === (int) $roomId, 404);
    abort_unless($message->user_id === $request->user()->id, 403);
    abort_if($message->deleted_at !== null, 409, 'Message was deleted.');
    abort_if(
        $message->created_at->lt(now()->subMinutes(ChatMessage::EDIT_WINDOW_MINUTES)),
        403,
        'Edit window expired.'
    );

    $request->validate(['message' => 'required|string|max:2000']);

    $message->update(['message' => $request->message, 'edited_at' => now()]);
    $message->load('user');

    broadcast(new MessageUpdated($message))->toOthers();

    return new ChatMessageResource($message);
}
```

In `routes/api.php`, after the existing room message POST route:

```php
Route::patch('/chat/room/{roomId}/messages/{message}', [ChatController::class, 'updateMessage'])
    ->middleware('throttle:60,1');
```

- [ ] **Step 6: Run tests, pint, commit**

```bash
php artisan test --compact tests/Feature/MessageEditDeleteTest.php   # Expected: 5 passed
vendor/bin/pint app routes tests --format agent
git add -A && git commit -m "feat: room message editing with 15-minute window"
```

---

### Task 4: Room message deletion (TDD)

**Files:**
- Test: `tests/Feature/MessageEditDeleteTest.php` (extend)
- Create: `app/Events/MessageDeleted.php`
- Modify: `app/Http/Controllers/ChatController.php`, `routes/api.php`

- [ ] **Step 1: Add failing tests to MessageEditDeleteTest**

```php
public function test_sender_can_delete_anytime_and_content_is_blanked(): void
{
    Sanctum::actingAs($this->alice);
    $this->travel(2)->days();

    $this->deleteJson("/api/chat/room/{$this->room->id}/messages/{$this->message->id}")
        ->assertStatus(204);

    $fresh = $this->message->fresh();
    $this->assertNotNull($fresh->deleted_at);
    $this->assertSame('', $fresh->message);
}

public function test_delete_is_idempotent(): void
{
    Sanctum::actingAs($this->alice);

    $this->deleteJson("/api/chat/room/{$this->room->id}/messages/{$this->message->id}")
        ->assertStatus(204);
    $this->deleteJson("/api/chat/room/{$this->room->id}/messages/{$this->message->id}")
        ->assertStatus(204);
}

public function test_non_sender_cannot_delete(): void
{
    Sanctum::actingAs($this->bob);

    $this->deleteJson("/api/chat/room/{$this->room->id}/messages/{$this->message->id}")
        ->assertStatus(403);
}
```

- [ ] **Step 2: Run to verify failure**

```bash
php artisan test --compact tests/Feature/MessageEditDeleteTest.php
```

Expected: 3 new tests FAIL (405 Method Not Allowed).

- [ ] **Step 3: Create MessageDeleted event**

`app/Events/MessageDeleted.php`:

```php
<?php

namespace App\Events;

use App\Models\ChatMessage;
use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class MessageDeleted implements ShouldBroadcast
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(public ChatMessage $message) {}

    public function broadcastOn(): array
    {
        return [new Channel('chat-room.'.$this->message->chat_room_id)];
    }

    public function broadcastWith(): array
    {
        return [
            'id' => $this->message->id,
            'chat_room_id' => $this->message->chat_room_id,
            'deleted_at' => $this->message->deleted_at,
        ];
    }
}
```

- [ ] **Step 4: Add controller method + route**

In `ChatController` (import `use App\Events\MessageDeleted;`):

```php
public function destroyMessage(Request $request, $roomId, ChatMessage $message)
{
    abort_unless((int) $message->chat_room_id === (int) $roomId, 404);
    abort_unless($message->user_id === $request->user()->id, 403);

    if ($message->deleted_at === null) {
        $message->update(['message' => '', 'deleted_at' => now()]);
        broadcast(new MessageDeleted($message))->toOthers();
    }

    return response()->noContent();
}
```

In `routes/api.php`, after the PATCH route:

```php
Route::delete('/chat/room/{roomId}/messages/{message}', [ChatController::class, 'destroyMessage']);
```

- [ ] **Step 5: Run tests, pint, commit**

```bash
php artisan test --compact tests/Feature/MessageEditDeleteTest.php   # Expected: 8 passed
vendor/bin/pint app routes tests --format agent
git add -A && git commit -m "feat: room message soft deletion with tombstone"
```

---

### Task 5: DM editing + deletion (TDD)

**Files:**
- Test: `tests/Feature/DirectMessageEditDeleteTest.php` (create)
- Create: `app/Events/DirectMessageUpdated.php`, `app/Events/DirectMessageDeleted.php`
- Modify: `app/Http/Resources/DirectMessageResource.php` (add `edited_at` — `deleted_at` already present), `app/Http/Controllers/DirectMessageController.php`, `routes/api.php`

- [ ] **Step 1: Write the failing tests**

Create `tests/Feature/DirectMessageEditDeleteTest.php`:

```php
<?php

namespace Tests\Feature;

use App\Models\Conversation;
use App\Models\DirectMessage;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class DirectMessageEditDeleteTest extends TestCase
{
    use RefreshDatabase;

    private User $alice;

    private User $bob;

    private User $eve;

    private Conversation $conversation;

    private DirectMessage $dm;

    protected function setUp(): void
    {
        parent::setUp();

        $this->alice = User::factory()->create();
        $this->bob = User::factory()->create();
        $this->eve = User::factory()->create();

        [$a, $b] = $this->alice->id < $this->bob->id
            ? [$this->alice->id, $this->bob->id]
            : [$this->bob->id, $this->alice->id];

        $this->conversation = Conversation::create([
            'user_one_id' => $a,
            'user_two_id' => $b,
        ]);

        $this->dm = DirectMessage::create([
            'conversation_id' => $this->conversation->id,
            'sender_id' => $this->alice->id,
            'message' => 'Original DM',
        ]);
    }

    public function test_sender_can_edit_dm_within_window(): void
    {
        Sanctum::actingAs($this->alice);

        $this->patchJson("/api/conversations/{$this->conversation->id}/messages/{$this->dm->id}", [
            'message' => 'Edited DM',
        ])->assertOk()
            ->assertJsonPath('message', 'Edited DM');

        $this->assertNotNull($this->dm->fresh()->edited_at);
    }

    public function test_edit_rejected_after_window(): void
    {
        Sanctum::actingAs($this->alice);
        $this->travel(DirectMessage::EDIT_WINDOW_MINUTES + 1)->minutes();

        $this->patchJson("/api/conversations/{$this->conversation->id}/messages/{$this->dm->id}", [
            'message' => 'Too late',
        ])->assertStatus(403);
    }

    public function test_recipient_cannot_edit_or_delete(): void
    {
        Sanctum::actingAs($this->bob);

        $this->patchJson("/api/conversations/{$this->conversation->id}/messages/{$this->dm->id}", [
            'message' => 'Not mine',
        ])->assertStatus(403);

        $this->deleteJson("/api/conversations/{$this->conversation->id}/messages/{$this->dm->id}")
            ->assertStatus(403);
    }

    public function test_non_participant_cannot_edit_or_delete(): void
    {
        Sanctum::actingAs($this->eve);

        $this->patchJson("/api/conversations/{$this->conversation->id}/messages/{$this->dm->id}", [
            'message' => 'Intruder',
        ])->assertStatus(403);

        $this->deleteJson("/api/conversations/{$this->conversation->id}/messages/{$this->dm->id}")
            ->assertStatus(403);
    }

    public function test_sender_can_delete_and_content_is_blanked(): void
    {
        Sanctum::actingAs($this->alice);
        $this->travel(3)->days();

        $this->deleteJson("/api/conversations/{$this->conversation->id}/messages/{$this->dm->id}")
            ->assertStatus(204);

        $fresh = $this->dm->fresh();
        $this->assertNotNull($fresh->deleted_at);
        $this->assertSame('', $fresh->message);
    }

    public function test_deleted_latest_message_blanks_conversation_preview(): void
    {
        Sanctum::actingAs($this->alice);
        $this->deleteJson("/api/conversations/{$this->conversation->id}/messages/{$this->dm->id}")
            ->assertStatus(204);

        Sanctum::actingAs($this->bob);
        $this->getJson('/api/conversations')
            ->assertOk()
            ->assertJsonPath('0.last_message.message', '')
            ->assertJsonPath('0.last_message.id', $this->dm->id);
    }
}
```

- [ ] **Step 2: Run to verify failure**

```bash
php artisan test --compact tests/Feature/DirectMessageEditDeleteTest.php
```

Expected: FAIL (routes missing; preview test fails on missing `last_message.id`).

- [ ] **Step 3: Create the two DM events**

`app/Events/DirectMessageUpdated.php`:

```php
<?php

namespace App\Events;

use App\Models\DirectMessage;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class DirectMessageUpdated implements ShouldBroadcast
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(public DirectMessage $dm) {}

    public function broadcastOn(): array
    {
        return [new PrivateChannel('conversation.'.$this->dm->conversation_id)];
    }

    public function broadcastWith(): array
    {
        return [
            'id' => $this->dm->id,
            'conversation_id' => $this->dm->conversation_id,
            'sender_id' => $this->dm->sender_id,
            'message' => $this->dm->message,
            'edited_at' => $this->dm->edited_at,
            'deleted_at' => $this->dm->deleted_at,
            'created_at' => $this->dm->created_at,
            'sender' => $this->dm->sender,
        ];
    }
}
```

`app/Events/DirectMessageDeleted.php`:

```php
<?php

namespace App\Events;

use App\Models\DirectMessage;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class DirectMessageDeleted implements ShouldBroadcast
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(public DirectMessage $dm) {}

    public function broadcastOn(): array
    {
        return [new PrivateChannel('conversation.'.$this->dm->conversation_id)];
    }

    public function broadcastWith(): array
    {
        return [
            'id' => $this->dm->id,
            'conversation_id' => $this->dm->conversation_id,
            'deleted_at' => $this->dm->deleted_at,
        ];
    }
}
```

- [ ] **Step 4: Update resources**

`DirectMessageResource.php` — add after `'message'`:

```php
'edited_at' => $this->edited_at,
```

(`'read_at'` and `'deleted_at'`? — `read_at` exists; ensure `'deleted_at' => $this->deleted_at,` is present too.)

`ConversationResource.php` — replace the `last_message` closure body:

```php
'last_message' => $this->whenLoaded('latestMessage', fn () => [
    'id' => $this->latestMessage->id,
    'message' => $this->latestMessage->message,
    'sender_id' => $this->latestMessage->sender_id,
    'created_at' => $this->latestMessage->created_at,
    'deleted_at' => $this->latestMessage->deleted_at,
]),
```

- [ ] **Step 5: Add controller methods + routes**

In `DirectMessageController` (imports: `use App\Events\DirectMessageUpdated;`, `use App\Events\DirectMessageDeleted;`):

```php
public function update(Request $request, Conversation $conversation, DirectMessage $message)
{
    Gate::authorize('participate', $conversation);
    abort_unless($message->conversation_id === $conversation->id, 404);
    abort_unless($message->sender_id === $request->user()->id, 403);
    abort_if($message->deleted_at !== null, 409, 'Message was deleted.');
    abort_if(
        $message->created_at->lt(now()->subMinutes(DirectMessage::EDIT_WINDOW_MINUTES)),
        403,
        'Edit window expired.'
    );

    $request->validate(['message' => 'required|string|max:2000']);

    $message->update(['message' => $request->message, 'edited_at' => now()]);
    $message->load('sender');

    broadcast(new DirectMessageUpdated($message))->toOthers();

    return new DirectMessageResource($message);
}

public function destroy(Request $request, Conversation $conversation, DirectMessage $message)
{
    Gate::authorize('participate', $conversation);
    abort_unless($message->conversation_id === $conversation->id, 404);
    abort_unless($message->sender_id === $request->user()->id, 403);

    if ($message->deleted_at === null) {
        $message->update(['message' => '', 'deleted_at' => now()]);
        broadcast(new DirectMessageDeleted($message))->toOthers();
    }

    return response()->noContent();
}
```

In `routes/api.php`, after the conversations message POST route:

```php
Route::patch('/conversations/{conversation}/messages/{message}', [DirectMessageController::class, 'update'])
    ->middleware('throttle:60,1');
Route::delete('/conversations/{conversation}/messages/{message}', [DirectMessageController::class, 'destroy']);
```

- [ ] **Step 6: Run full backend suite, pint, commit**

```bash
php artisan test --compact            # Expected: all pass (14 old + 8 room + 6 DM = 28)
vendor/bin/pint app routes tests --format agent
git add -A && git commit -m "feat: DM message editing and soft deletion"
```

---

### Task 6: Frontend API helpers + chat store

**Files:**
- Modify: `src/lib/api.ts`, `src/stores/chat.ts`

- [ ] **Step 1: Add patch/del to the api helper**

In `src/lib/api.ts`, extend the exported `api` object (keep existing `get`/`post`):

```ts
export const api = {
  get: <T>(path: string) => apiFetch<T>(path),
  post: <T>(path: string, body: unknown) =>
    apiFetch<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    apiFetch<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  del: (path: string) => apiFetch<void>(path, { method: 'DELETE' }),
}
```

Verify `apiFetch` already returns early on 204 (`if (res.status === 204) return undefined as T`) — if not, add that guard before the `res.json()` call.

- [ ] **Step 2: Update chat store types, actions, listeners**

In `src/stores/chat.ts`:

Extend the interface:

```ts
export interface ChatMessage {
  id: number
  chat_room_id: number
  user_id: number
  message: string
  edited_at?: string | null
  deleted_at?: string | null
  created_at: string
  user: { id: number; name: string }
}
```

Add inside the store (near `sendMessage`):

```ts
function applyUpdate(updated: Partial<ChatMessage> & { id: number }) {
  const idx = messages.value.findIndex(m => m.id === updated.id)
  if (idx !== -1) {
    messages.value[idx] = { ...messages.value[idx], ...updated } as ChatMessage
  }
}

async function editMessage(id: number, content: string) {
  if (!currentRoom.value || !content.trim()) return
  try {
    const updated = await api.patch<ChatMessage>(
      `/chat/room/${currentRoom.value.id}/messages/${id}`,
      { message: content },
    )
    applyUpdate(updated)
  } catch (e) {
    error.value = (e as Error).message
  }
}

async function deleteMessage(id: number) {
  if (!currentRoom.value) return
  try {
    await api.del(`/chat/room/${currentRoom.value.id}/messages/${id}`)
    applyUpdate({ id, message: '', deleted_at: new Date().toISOString() })
  } catch (e) {
    error.value = (e as Error).message
  }
}
```

Replace `joinChannel` with:

```ts
function joinChannel(roomId: number) {
  const channel = getEcho().channel(`chat-room.${roomId}`)
  channel.listen('MessageSent', (e: ChatMessage) => {
    if (!messages.value.find(m => m.id === e.id)) {
      messages.value.push(e)
    }
  })
  channel.listen('MessageUpdated', (e: ChatMessage) => applyUpdate(e))
  channel.listen('MessageDeleted', (e: { id: number; deleted_at: string }) =>
    applyUpdate({ id: e.id, message: '', deleted_at: e.deleted_at }),
  )
}
```

Add `editMessage, deleteMessage` to the store's return object.

- [ ] **Step 3: Build + commit**

```bash
npm run build        # Expected: type-check + build pass
git add -A && git commit -m "feat: chat store edit/delete actions and listeners"
```

---

### Task 7: DM store

**Files:**
- Modify: `src/stores/dm.ts`

- [ ] **Step 1: Update types**

```ts
export interface LastMessage {
  id: number
  message: string
  sender_id: number
  created_at: string
  deleted_at?: string | null
}
export interface DirectMessage {
  id: number
  conversation_id: number
  sender_id: number
  message: string
  read_at?: string | null
  edited_at?: string | null
  deleted_at?: string | null
  created_at: string
  sender: DMUser
}
```

- [ ] **Step 2: Add actions + preview refresh**

```ts
function applyUpdate(updated: Partial<DirectMessage> & { id: number }) {
  const idx = messages.value.findIndex(m => m.id === updated.id)
  if (idx !== -1) {
    messages.value[idx] = { ...messages.value[idx], ...updated } as DirectMessage
  }
}

/** If the changed message is a conversation's latest, sync the sidebar preview. */
function refreshPreview(msg: { id: number; conversation_id: number; message: string; deleted_at?: string | null }) {
  const conv = conversations.value.find(c => c.id === msg.conversation_id)
  if (conv?.last_message && conv.last_message.id === msg.id) {
    conv.last_message = {
      ...conv.last_message,
      message: msg.message,
      deleted_at: msg.deleted_at ?? null,
    }
  }
}

async function editMessage(id: number, content: string) {
  if (!currentConv.value || !content.trim()) return
  try {
    const updated = await api.patch<DirectMessage>(
      `/conversations/${currentConv.value.id}/messages/${id}`,
      { message: content },
    )
    applyUpdate(updated)
    refreshPreview(updated)
  } catch (e) {
    error.value = (e as Error).message
  }
}

async function deleteMessage(id: number) {
  if (!currentConv.value) return
  try {
    await api.del(`/conversations/${currentConv.value.id}/messages/${id}`)
    const change = {
      id,
      conversation_id: currentConv.value.id,
      message: '',
      deleted_at: new Date().toISOString(),
    }
    applyUpdate(change)
    refreshPreview(change)
  } catch (e) {
    error.value = (e as Error).message
  }
}
```

- [ ] **Step 3: Extend the private-channel subscription**

In `subscribe(convId)`, after the existing `.listen('DirectMessageSent', …)` chain, add:

```ts
getEcho()
  .private(`conversation.${convId}`)
  .listen('DirectMessageUpdated', (e: DirectMessage) => {
    applyUpdate(e)
    refreshPreview(e)
  })
  .listen('DirectMessageDeleted', (e: { id: number; conversation_id: number; deleted_at: string }) => {
    applyUpdate({ id: e.id, message: '', deleted_at: e.deleted_at })
    refreshPreview({ ...e, message: '' })
  })
```

(Echo returns the same channel object for repeated `.private()` calls, so chaining listeners this way is safe.)

Note: when sending a new message, `touchConversation` must now produce a `LastMessage` with `id` — update it:

```ts
function touchConversation(dm: DirectMessage) {
  const idx = conversations.value.findIndex(c => c.id === dm.conversation_id)
  const conv = conversations.value[idx]
  if (!conv) return
  conv.last_message = {
    id: dm.id,
    message: dm.message,
    sender_id: dm.sender_id,
    created_at: dm.created_at,
    deleted_at: dm.deleted_at ?? null,
  }
  if (idx > 0) {
    conversations.value.splice(idx, 1)
    conversations.value.unshift(conv)
  }
}
```

Add `editMessage, deleteMessage` to the return object.

- [ ] **Step 4: Build + commit**

```bash
npm run build
git add -A && git commit -m "feat: dm store edit/delete actions, listeners, preview sync"
```

---

### Task 8: ChatView UI + Sidebar preview

**Files:**
- Modify: `src/views/ChatView.vue`, `src/components/Sidebar.vue`

- [ ] **Step 1: Script changes in ChatView.vue**

Extend `UnifiedMsg` and the two mappers:

```ts
interface UnifiedMsg {
  id: number
  senderId: number
  senderName: string
  text: string
  at: string
  editedAt?: string | null
  deletedAt?: string | null
}
// in both map() calls add:
//   editedAt: m.edited_at, deletedAt: m.deleted_at,
```

Add edit/delete interaction state (after the composer refs):

```ts
const editingId = ref<number | null>(null)
let draftBeforeEdit = ''
const confirmDeleteId = ref<number | null>(null)
let confirmTimer: number | undefined
const actionBarId = ref<number | null>(null) // tap-toggled action bar (mobile)

const EDIT_WINDOW_MS = 15 * 60 * 1000

function canEdit(m: UnifiedMsg) {
  return !m.deletedAt && Date.now() - new Date(m.at).getTime() < EDIT_WINDOW_MS
}

function isMine(m: UnifiedMsg) {
  return m.senderId === auth.user?.id
}

function toggleActions(m: UnifiedMsg) {
  if (!isMine(m) || m.deletedAt) return
  actionBarId.value = actionBarId.value === m.id ? null : m.id
}

function startEdit(m: UnifiedMsg) {
  editingId.value = m.id
  draftBeforeEdit = messageInput.value
  messageInput.value = m.text
  nextTick(() => {
    autoGrow()
    inputEl.value?.focus()
  })
}

function cancelEdit() {
  editingId.value = null
  messageInput.value = draftBeforeEdit
  draftBeforeEdit = ''
  nextTick(autoGrow)
}

function requestDelete(m: UnifiedMsg) {
  if (confirmDeleteId.value === m.id) {
    confirmDeleteId.value = null
    window.clearTimeout(confirmTimer)
    if (activeView.value === 'room') chat.deleteMessage(m.id)
    else dm.deleteMessage(m.id)
    if (editingId.value === m.id) cancelEdit()
  } else {
    confirmDeleteId.value = m.id
    window.clearTimeout(confirmTimer)
    confirmTimer = window.setTimeout(() => (confirmDeleteId.value = null), 3000)
  }
}
```

Update `send()` to branch on edit mode:

```ts
async function send() {
  const content = messageInput.value.trim()
  if (!content || isSending.value) return

  if (editingId.value !== null) {
    const id = editingId.value
    editingId.value = null
    messageInput.value = draftBeforeEdit
    draftBeforeEdit = ''
    nextTick(autoGrow)
    if (activeView.value === 'room') await chat.editMessage(id, content)
    else await dm.editMessage(id, content)
  } else {
    messageInput.value = ''
    nextTick(autoGrow)
    if (activeView.value === 'room') await chat.sendMessage(content)
    else if (activeView.value === 'dm') await dm.sendMessage(content)
  }
  inputEl.value?.focus()
}
```

Update `onKeydown` to handle Escape:

```ts
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    send()
  } else if (e.key === 'Escape' && editingId.value !== null) {
    cancelEdit()
  }
}
```

Also reset edit state when switching views — add `editingId.value = null` (via `cancelEdit()` if active) at the top of `selectRoom` and `selectConv`.

- [ ] **Step 2: Template changes in ChatView.vue**

Replace the message bubble block (inside the `v-else` message branch) with:

```vue
<div
  :class="[
    'flex flex-col min-w-0',
    isMine(item.msg) ? 'items-end' : 'items-start',
  ]"
>
  <div v-if="item.showHeader" class="flex items-baseline gap-2 mb-1 px-0.5">
    <span class="text-ink-3 text-xs font-semibold">
      {{ isMine(item.msg) ? 'You' : item.msg.senderName }}
    </span>
    <span class="text-ink-4 text-[10px]">{{ fmt(item.msg.at) }}</span>
    <span v-if="item.msg.editedAt && !item.msg.deletedAt" class="text-ink-4 text-[10px] italic">(edited)</span>
  </div>

  <div class="group flex items-center gap-1.5" :class="isMine(item.msg) ? 'flex-row-reverse' : ''">
    <!-- Tombstone -->
    <div
      v-if="item.msg.deletedAt"
      class="px-4 py-2.5 text-sm italic rounded-2xl glass text-ink-4 flex items-center gap-1.5"
    >
      <Icon icon="lucide:ban" class="w-3.5 h-3.5" />
      This message was deleted
    </div>

    <!-- Normal bubble -->
    <div
      v-else
      :class="[
        'px-4 py-2.5 text-sm leading-relaxed wrap-break-words whitespace-pre-wrap rounded-2xl',
        isMine(item.msg)
          ? 'bg-linear-to-br from-cyan-500 to-violet-600 text-white rounded-br-md shadow-[0_6px_24px_rgba(124,58,237,0.3)]'
          : 'glass text-ink-2 rounded-bl-md',
      ]"
      @click="toggleActions(item.msg)"
    >
      {{ item.msg.text }}
    </div>

    <!-- Edit/delete actions (own, non-deleted messages) -->
    <div
      v-if="isMine(item.msg) && !item.msg.deletedAt"
      :class="[
        'flex items-center gap-0.5 transition-opacity',
        actionBarId === item.msg.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
      ]"
    >
      <button
        v-if="canEdit(item.msg)"
        class="w-7 h-7 rounded-lg flex items-center justify-center text-ink-4 hover:text-cyan-600 dark:hover:text-cyan-300 hover:bg-hovered cursor-pointer"
        title="Edit message"
        @click="startEdit(item.msg)"
      >
        <Icon icon="lucide:pencil" class="w-3.5 h-3.5" />
      </button>
      <button
        :class="[
          'w-7 h-7 rounded-lg flex items-center justify-center cursor-pointer hover:bg-hovered',
          confirmDeleteId === item.msg.id ? 'text-rose-500' : 'text-ink-4 hover:text-rose-500',
        ]"
        :title="confirmDeleteId === item.msg.id ? 'Tap again to confirm' : 'Delete message'"
        @click="requestDelete(item.msg)"
      >
        <Icon :icon="confirmDeleteId === item.msg.id ? 'lucide:check' : 'lucide:trash-2'" class="w-3.5 h-3.5" />
      </button>
    </div>
  </div>
</div>
```

Add the editing bar just above the composer's `<div class="glass rounded-2xl …">`:

```vue
<div
  v-if="editingId !== null"
  class="flex items-center justify-between px-3 pb-1.5 text-xs text-ink-3"
>
  <span class="flex items-center gap-1.5">
    <Icon icon="lucide:pencil" class="w-3 h-3" />
    Editing message
  </span>
  <button class="hover:text-ink cursor-pointer" @click="cancelEdit">Cancel (Esc)</button>
</div>
```

- [ ] **Step 3: Sidebar preview tombstone**

In `src/components/Sidebar.vue`, replace the preview `<template v-if="conv.last_message">` content:

```vue
<template v-if="conv.last_message">
  <span v-if="conv.last_message.deleted_at" class="italic">Message deleted</span>
  <template v-else>
    {{ conv.last_message.sender_id === auth.user?.id ? 'You: ' : ''
    }}{{ conv.last_message.message }}
  </template>
</template>
<template v-else>No messages yet</template>
```

- [ ] **Step 4: Build + commit**

```bash
npm run build        # Expected: clean type-check + build
git add -A && git commit -m "feat: edit/delete UI with tombstones and edited labels"
```

---

### Task 9: Full verification

**Files:** none

- [ ] **Step 1: Backend suite + formatting**

```bash
cd /Users/sakshamjamwal/Desktop/work/ChatApp/chatApp-Backend
php artisan test --compact            # Expected: 28 passed
vendor/bin/pint app routes tests database --format agent
git add -A && git commit -m "style: pint" --allow-empty
```

- [ ] **Step 2: Restart queue worker (new event classes)**

```bash
php artisan queue:restart
# then in a dedicated terminal:
php artisan queue:work
```

- [ ] **Step 3: Manual two-browser check (real-time)**

With `php artisan serve --host=0.0.0.0`, `php artisan queue:work`, and `npm run dev` running, in two browsers as two users sharing a DM:

1. A edits a fresh message → B sees the text change + "(edited)" within ~1 s.
2. A deletes a message → B sees the tombstone; if it was the latest, B's sidebar preview says "Message deleted".
3. A's message older than 15 min (or after `travel`-style wait): pencil hidden; delete still works.
4. Repeat 1–2 in a room with a third user.
5. Esc during edit restores the previous draft text.

---

## Self-Review (done at write time)

- **Spec coverage:** data model → Task 2; API rules → Tasks 3–5; broadcasting → Tasks 3–5; stores → Tasks 6–7; UI/tombstone/edited/preview → Task 8; errors → store `error.value` feeds the existing toast watcher; testing → Tasks 3–5, 9. Out-of-scope list untouched.
- **Additions beyond spec (intentional, minimal):** `last_message` gains `id` (+ already-spec'd `deleted_at`) so previews can be matched by id instead of fragile timestamp comparison; `touchConversation` updated to match.
- **Type consistency:** `applyUpdate` signature identical in both stores; `LastMessage.id` used by `refreshPreview` and produced by `touchConversation` and `ConversationResource`; `EDIT_WINDOW_MINUTES` on both models mirrors `EDIT_WINDOW_MS` in the view (cosmetic only — server enforces).
- **No placeholders:** every step has full code or exact commands.
