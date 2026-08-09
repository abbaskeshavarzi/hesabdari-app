import { useEffect } from 'react';
import '../styles/globals.css';

export default function App({ Component, pageProps }) {
  useEffect(() => {
    const saved = localStorage.getItem('theme');
    document.documentElement.classList.toggle('dark', saved === 'dark');
  }, []);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/hesabdari-app/sw.js').catch(() => {});
    }
  }, []);

  return <Component {...pageProps} />;
}
