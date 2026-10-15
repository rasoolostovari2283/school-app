import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.educonnect.schoolapp',
  appName: 'EduConnect',
  webDir: 'out',
  server: {
    androidScheme: 'https',
    cleartext: true
  }
};

export default config;
