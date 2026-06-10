/**
 * Origin of the Laravel backend.
 *
 * If VITE_API_URL is set, it wins. Otherwise we assume the backend runs on
 * port 8000 of the same host that served this frontend — so opening the app
 * from another device on the LAN (e.g. your phone hitting http://192.168.x.x:5173)
 * automatically talks to http://192.168.x.x:8000 without any env changes.
 */
export const API_ORIGIN =
  (import.meta.env.VITE_API_URL as string | undefined)
  ?? `${window.location.protocol}//${window.location.hostname}:8000`
