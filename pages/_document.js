import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
  return (
    <Html lang="fa" dir="rtl">
      <Head>
        <meta name="theme-color" content="#17233D" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="دفتر حساب" />
        <link rel="manifest" href="/hesabdari-app/manifest.json" />
        <link rel="apple-touch-icon" href="/hesabdari-app/icons/apple-touch-icon.png" />
        <link rel="icon" href="/hesabdari-app/icons/icon-192.png" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
