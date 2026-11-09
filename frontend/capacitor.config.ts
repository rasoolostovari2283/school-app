import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.educonnect.schoolapp',
  appName: 'EduConnect',
  webDir: 'out',
  server: {
    androidScheme: 'https',
    cleartext: false,
    allowNavigation: ['localhost', '127.0.0.1'],
  },
};

export default config;
