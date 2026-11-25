import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.educonnect.schoolapp',
  appName: 'EduConnect',
  webDir: 'out',
  server: {
    androidScheme: 'https',
    cleartext: false,
    allowNavigation: [
      'localhost',
      '127.0.0.1',
      '*.trycloudflare.com',
      'arrested-notices-constantly-illustrated.trycloudflare.com',
      'glory-kernel-arrives-kernel.trycloudflare.com',
      'suffered-dec-furnished-guarantees.trycloudflare.com',
    ],
  },
};

export default config;
