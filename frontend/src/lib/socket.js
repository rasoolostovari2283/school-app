import { io } from 'socket.io-client';

let socket = null;

export function getSocket() {
  if (!socket) {
    // Domestic resilient: connects to local host/port or NEXT_PUBLIC_API_URL without external DNS dependency
    const backendUrl = process.env.NEXT_PUBLIC_SOCKET_URL || 
      (typeof window !== 'undefined' 
        ? `${window.location.protocol}//${window.location.hostname}:5000`
        : 'http://localhost:5000');

    socket = io(backendUrl, {
      transports: ['websocket', 'polling'], // Fallback to polling on restrictive mobile networks
      reconnectionAttempts: 10,
      reconnectionDelay: 1500,
      timeout: 20000,
      autoConnect: true,
      withCredentials: true,
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
