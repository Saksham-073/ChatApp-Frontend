import { ref } from 'vue'
import Echo from 'laravel-echo'
import Pusher from 'pusher-js'
import { API_ORIGIN } from './config'

declare global {
  interface Window { Pusher: typeof Pusher }
}
window.Pusher = Pusher

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let echoInstance: Echo<any> | null = null

/** Live websocket connection state: 'connected' | 'connecting' | 'disconnected' | ... */
export const connectionState = ref<string>('disconnected')

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getEcho(): Echo<any> {
  if (!echoInstance) {
    echoInstance = new Echo({
      broadcaster: 'pusher',
      key: import.meta.env.VITE_PUSHER_APP_KEY,
      cluster: 'ap2',
      forceTLS: true,
      authEndpoint: `${API_ORIGIN}/broadcasting/auth`,
      auth: {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('auth_token') ?? ''}`,
        },
      },
    })

    const pusher = echoInstance.connector.pusher as Pusher
    connectionState.value = pusher.connection.state
    pusher.connection.bind('state_change', (states: { current: string }) => {
      connectionState.value = states.current
    })
  }
  return echoInstance
}

export function resetEcho(): void {
  if (echoInstance) {
    echoInstance.disconnect()
    echoInstance = null
  }
  connectionState.value = 'disconnected'
}

/** Current Pusher socket id, without creating a connection if none exists yet. */
export function socketId(): string | undefined {
  return echoInstance?.socketId()
}
