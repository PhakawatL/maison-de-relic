// โครงทุกหน้า: <head> ฟอนต์ + CSS กลาง + header/footer ใส่ที่นี่ที่เดียว (แทนการ copy ทุกไฟล์ .html)
import '../styles/base.css';
import { I18nProvider } from '../lib/i18n';
import { SiteFooter, SiteHeader } from './SiteHeader';

export const metadata = { title: 'Maison de Relic' };

const FONTS =
  'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Thai:wght@400;600;700&family=Noto+Serif+Thai:wght@600;700&family=Bodoni+Moda:opsz,wght@6..96,400..700&display=swap';

export default function RootLayout({ children }) {
  return (
    <html lang="th" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href={FONTS} rel="stylesheet" />
      </head>
      <body>
        <I18nProvider>
          <SiteHeader />
          {children}
          <SiteFooter />
        </I18nProvider>
      </body>
    </html>
  );
}
