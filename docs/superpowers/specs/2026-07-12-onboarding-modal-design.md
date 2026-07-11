# Onboarding Modal — Design Spec

## Goal

Show new users a one-time modal after signup listing all existing users. Clicking a user opens a DM immediately and closes the modal.

## Trigger Condition

`localStorage` key `onboarding_seen` absent → show modal.

Set to `'1'` on:
- User clicks any user in the list (after DM opens)
- User clicks Skip/close button

Flag is per-device/browser (known limitation; Option B with backend field deferred to later).

## Where It Lives

`ChatView.vue` — checks `onboarding_seen` on `onMount`. If absent, sets `showOnboarding = true`.

## New Component: `OnboardingModal.vue`

Single-purpose component, dropped into `src/components/`.

**Props:** none (reads dm store internally)

**Emits:** `close`

**Behaviour:**
1. On mount → calls `dmStore.fetchUsers()` if users list empty
2. Renders scrollable list of users (name + avatar initial)
3. Click user → `dmStore.openConversation(user)` → emit `close`
4. Skip button → emit `close`
5. Parent (`ChatView`) handles `close`: sets `localStorage.onboarding_seen = '1'`, sets `showOnboarding = false`

## Data Flow

```
ChatView mounts
  → check localStorage.onboarding_seen
  → absent: showOnboarding = true
  → OnboardingModal mounts, fetchUsers()
  → user clicks someone
  → openConversation(user) [dm store]
  → emit close
  → ChatView sets flag + hides modal
```

## Styling

Follows existing glass-morphism pattern (backdrop blur, semi-transparent card). Entrance animation uses existing spring-eased transition classes. Backdrop click = skip (same as close button).

## What Is NOT in Scope

- Searching/filtering users in modal
- Showing online status
- Backend `is_new` field (deferred)
- Re-showing modal under any condition after first dismiss
