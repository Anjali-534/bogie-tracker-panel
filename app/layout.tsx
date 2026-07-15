import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'bogie Tracker Panel',
  description: 'B2B Dispatch Tracking Panel',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
