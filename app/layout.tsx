import './globals.css';
import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'Indian Passport Photo',
  description: 'Generate Passport Seva-compliant photos and printable A4 sheets.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#0F172A',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <main className="mx-auto min-h-dvh max-w-md px-4 pb-12 pt-6 sm:max-w-2xl md:max-w-4xl">
          {children}
        </main>
      </body>
    </html>
  );
}
