import type { Metadata, Viewport } from 'next';
import './globals.css';
import InstallPrompt from '@/components/InstallPrompt';

export const metadata: Metadata = {
  title: 'bogie Tracker Panel',
  description: 'B2B Dispatch Tracking Panel',
  manifest: '/manifest.json',
  icons: {
    apple: '/apple-touch-icon.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Bogie Tracker',
  },
};

export const viewport: Viewport = {
  themeColor: '#030712',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <InstallPrompt />
      </body>
    </html>
  );
}
