import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.educonnect.schoolapp',
  appName: 'EduConnect',
  webDir: 'out',
  server: {
    androidScheme: 'https',
    cleartext: true,
    allowNavigation: ['localhost', '127.0.0.1', '*.trycloudflare.com', 'suffered-dec-furnished-guarantees.trycloudflare.com'],
  },
};

export default config;
