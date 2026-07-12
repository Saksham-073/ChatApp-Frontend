<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { useFriendsStore } from '../stores/friends'
import { initials, hue } from '../lib/ui'

const friends = useFriendsStore()
</script>

<template>
  <div class="flex-1 overflow-y-auto px-4 md:px-6 py-5 flex flex-col gap-6 max-w-xl">
    <section v-if="friends.incoming.length">
      <p class="text-ink-4 text-[10px] font-semibold mb-2">Incoming Requests</p>
      <ul class="flex flex-col gap-2">
        <li
          v-for="req in friends.incoming"
          :key="req.id"
          class="flex items-center gap-3.5 px-4 py-3 rounded-2xl glass"
        >
          <div
            class="w-9 h-9 rounded-xl bg-linear-to-br from-violet-500 to-violet-700 flex items-center justify-center text-white text-xs font-bold shrink-0"
            :style="{ filter: hue(req.sender.id) }"
          >
            {{ initials(req.sender.name) }}
          </div>
          <span class="text-sm text-ink font-medium flex-1 min-w-0 truncate">{{
            req.sender.name
          }}</span>
          <button
            class="text-xs font-semibold rounded-lg px-3 py-1.5 bg-linear-to-r from-violet-500 to-violet-700 text-white cursor-pointer active:scale-95 transition-transform ease-(--ease-spring)"
            @click="friends.acceptRequest(req.id)"
          >
            Accept
          </button>
          <button
            class="text-xs font-semibold rounded-lg px-3 py-1.5 bg-field text-ink-3 hover:bg-hovered cursor-pointer active:scale-95 transition-transform ease-(--ease-spring)"
            @click="friends.cancelOrDecline(req.id)"
          >
            Decline
          </button>
        </li>
      </ul>
    </section>

    <section v-if="friends.outgoing.length">
      <p class="text-ink-4 text-[10px] font-semibold mb-2">Sent Requests</p>
      <ul class="flex flex-col gap-2">
        <li
          v-for="req in friends.outgoing"
          :key="req.id"
          class="flex items-center gap-3.5 px-4 py-3 rounded-2xl glass"
        >
          <div
            class="w-9 h-9 rounded-xl bg-linear-to-br from-violet-500 to-violet-700 flex items-center justify-center text-white text-xs font-bold shrink-0"
            :style="{ filter: hue(req.recipient.id) }"
          >
            {{ initials(req.recipient.name) }}
          </div>
          <span class="text-sm text-ink font-medium flex-1 min-w-0 truncate">{{
            req.recipient.name
          }}</span>
          <button
            class="text-xs font-semibold rounded-lg px-3 py-1.5 bg-field text-ink-3 hover:bg-hovered cursor-pointer active:scale-95 transition-transform ease-(--ease-spring)"
            @click="friends.cancelOrDecline(req.id)"
          >
            Cancel
          </button>
        </li>
      </ul>
    </section>

    <section>
      <p class="text-ink-4 text-[10px] font-semibold mb-2">Friends</p>
      <ul v-if="friends.friends.length" class="flex flex-col gap-2">
        <li
          v-for="f in friends.friends"
          :key="f.id"
          class="flex items-center gap-3.5 px-4 py-3 rounded-2xl glass"
        >
          <div
            class="w-9 h-9 rounded-xl bg-linear-to-br from-violet-500 to-violet-700 flex items-center justify-center text-white text-xs font-bold shrink-0"
            :style="{ filter: hue(f.id) }"
          >
            {{ initials(f.name) }}
          </div>
          <span class="text-sm text-ink font-medium flex-1 min-w-0 truncate">{{ f.name }}</span>
          <button
            class="text-xs font-semibold rounded-lg px-3 py-1.5 bg-field text-ink-3 hover:bg-hovered hover:text-rose-500 cursor-pointer active:scale-95 transition-transform ease-(--ease-spring)"
            @click="friends.unfriend(f.id)"
          >
            Unfriend
          </button>
        </li>
      </ul>
      <p v-else class="text-ink-4 text-sm flex items-center gap-2 py-4">
        <Icon icon="lucide:users" class="w-4 h-4" />
        No friends yet — add some from the New DM list
      </p>
    </section>
  </div>
</template>
