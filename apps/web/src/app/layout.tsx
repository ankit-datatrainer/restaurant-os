import type { Metadata, Viewport } from 'next';
import { Toaster } from 'sonner';
import '@fontsource-variable/bricolage-grotesque';
import '@fontsource-variable/manrope';
import '@fontsource-variable/jetbrains-mono';
import '@fontsource-variable/noto-sans-devanagari';
import '@fontsource/instrument-serif/latin-400.css';
import '@fontsource/instrument-serif/latin-400-italic.css';
import './globals.css';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'Restaurant OS — Smart restaurant ordering & customer retention',
    template: '%s · Restaurant OS',
  },
  description:
    'From the first order to the next visit. Guests order and pay from the table, staff get every order instantly, and you learn who your regulars are so you can bring them back, with their permission.',
  openGraph: {
    title: 'Restaurant OS — Smart restaurant ordering & customer retention',
    description:
      'From the first order to the next visit: table ordering, an instant order dashboard, customer profiles, consent-based WhatsApp offers and honest feedback with your Google review link.',
    type: 'website',
    siteName: 'Restaurant OS',
    locale: 'en_IN',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Restaurant OS — Smart restaurant ordering & customer retention',
    description: 'From the first order to the next visit — make restaurant service smarter, simpler, and more connected.',
  },
  icons: { icon: '/icon.svg' },
};

export const viewport: Viewport = {
  themeColor: '#0C0D10',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Toaster
          position="top-center"
          richColors
          closeButton
          toastOptions={{ className: 'font-sans', duration: 3500 }}
        />
      </body>
    </html>
  );
}
