import { useEffect } from 'react';
import '../styles/globals.css';

export default function App({ Component, pageProps }) {
  useEffect(() => {
    const saved = localStorage.getItem('theme');
    document.documentElement.classList.toggle('dark', saved === 'dark');
  }, []);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
      navigator.serviceWorker.register(`${basePath}/sw.js`).catch(() => {});
    }
  }, []);

  return <Component {...pageProps} />;
}
