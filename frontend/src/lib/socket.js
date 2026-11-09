import { io } from 'socket.io-client';
import { getApiBaseUrl } from './api';

let socket = null;

export function getSocket() {
  if (!socket) {
    let backendUrl = process.env.NEXT_PUBLIC_SOCKET_URL;
    if (!backendUrl && typeof window !== 'undefined') {
      const apiBase = getApiBaseUrl();
      backendUrl = apiBase.replace(/\/api\/v1\/?$/, '');
    }
    if (!backendUrl) {
      backendUrl = 'http://localhost:3000';
    }

    socket = io(backendUrl, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 15,
      reconnectionDelay: 1500,
      timeout: 20000,
      autoConnect: true,
      withCredentials: true,
      auth: (cb) => {
        const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
        cb({ token });
      },
    });

    socket.on('connect', () => {
      console.log('🟢 [Domestic Socket] Connected successfully:', socket.id);
    });

    socket.on('connect_error', (err) => {
      console.warn('⚠️ [Domestic Socket] Connect error, falling back to polling transport:', err.message);
    });
  }

  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
