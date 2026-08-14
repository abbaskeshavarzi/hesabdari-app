import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { supabase } from '../lib/supabaseClient';

const NAV = [
  { href: '/', label: 'داشبورد', key: '01' },
  { href: '/customers', label: 'مشتریان', key: '02' },
  { href: '/products', label: 'کالاها', key: '03' },
  { href: '/inventory', label: 'انبار', key: '04' },
  { href: '/invoices', label: 'فاکتورها', key: '05' },
  { href: '/payments', label: 'پرداخت‌ها', key: '06' },
  { href: '/expenses', label: 'هزینه‌ها', key: '07' },
  { href: '/reports', label: 'گزارش فروش', key: '08' },
  { href: '/best-performers', label: 'پرفروش‌ترین‌ها', key: '09' },
  { href: '/profit-loss', label: 'سود و زیان', key: '10' },
  { href: '/backup', label: 'پشتیبان‌گیری', key: '12' },
  { href: '/settings', label: 'تنظیمات', key: '11' },
];

export default function Layout({ children, title }) {
  const router = useRouter();
  const [session, setSession] = useState(undefined);
  const [business, setBusiness] = useState(null);
  const [dark, setDark] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    setIsOffline(!navigator.onLine);
    const goOffline = () => setIsOffline(true);
    const goOnline = () => setIsOffline(false);
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem('theme');
    const isDark = saved === 'dark';
    setDark(isDark);
    document.documentElement.classList.toggle('dark', isDark);
  }, []);

  function toggleDark() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem('theme', next ? 'dark' : 'light');
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (!s) router.replace('/login');
    });
    return () => listener.subscription.unsubscribe();
  }, [router]);

  useEffect(() => {
    if (!session) return;
    supabase
      .from('business_settings')
      .select('name, logo_url')
      .eq('id', 'default')
      .single()
      .then(({ data }) => setBusiness(data || null));
  }, [session]);

  useEffect(() => {
    if (session === null) router.replace('/login');
  }, [session, router]);

  // با هر تغییر صفحه، منوی کشویی موبایل بسته بشه
  useEffect(() => {
    setMenuOpen(false);
  }, [router.pathname]);

  if (session === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center text-ink/60 text-sm">
        در حال بارگذاری…
      </div>
    );
  }
  if (!session) return null;

  const navList = (onNavigate) => (
    <>
      {NAV.map((item) => {
        const active = router.pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={`focus-ring flex items-center gap-2 rounded-md px-3 py-2.5 text-sm transition-colors ${
              active ? 'bg-brass text-ink font-semibold' : 'text-gray-300 hover:bg-white/10'
            }`}
          >
            <span className="text-[10px] opacity-60 font-mono">{item.key}</span>
            {item.label}
          </Link>
        );
      })}
    </>
  );

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      {/* نوار بالای موبایل */}
      <div className="md:hidden sticky top-0 z-40">
        <header className="bg-[#12182B] text-gray-200 flex items-center justify-between px-4 py-3 border-b border-white/10">
          <div className="flex items-center gap-2 min-w-0">
            {business?.logo_url && (
              <img src={business.logo_url} alt="لوگو" className="w-7 h-7 rounded object-contain bg-surface shrink-0" />
            )}
            <div className="font-bold text-base tracking-tight truncate">{business?.name || 'دفتر حساب'}</div>
          </div>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            aria-label={menuOpen ? 'بستن منو' : 'باز کردن منو'}
            aria-expanded={menuOpen}
            className="focus-ring p-2 -m-2 rounded-md hover:bg-white/10 shrink-0"
          >
            {menuOpen ? (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            ) : (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M4 7h16M4 12h16M4 17h16" />
              </svg>
            )}
          </button>
        </header>

        {/* پنل کشویی منو */}
        <div
          className={`absolute top-full inset-x-0 bg-[#12182B] border-b border-white/10 shadow-xl origin-top transition-all duration-200 ${
            menuOpen ? 'opacity-100 scale-y-100' : 'opacity-0 scale-y-0 pointer-events-none'
          }`}
        >
          <nav className="flex flex-col p-3 gap-1 max-h-[65vh] overflow-y-auto">
            {navList(() => setMenuOpen(false))}
          </nav>
          <div className="p-3 border-t border-white/10 flex items-center gap-4">
            <button
              onClick={toggleDark}
              className="focus-ring text-xs text-gray-400 hover:text-white flex items-center gap-1"
            >
              {dark ? '☀️ حالت روشن' : '🌙 حالت تاریک'}
            </button>
            <button
              onClick={() => supabase.auth.signOut()}
              className="focus-ring text-xs text-gray-400 hover:text-white underline underline-offset-2"
            >
              خروج از حساب
            </button>
          </div>
        </div>
      </div>

      {/* پس‌زمینه‌ی نیمه‌شفاف پشت منوی باز، برای بستن با تپ بیرون از منو */}
      {menuOpen && (
        <div className="md:hidden fixed inset-0 bg-black/50 z-30" onClick={() => setMenuOpen(false)} />
      )}

      {/* سایدبار دسکتاپ */}
      <aside className="hidden md:flex md:w-60 shrink-0 bg-[#12182B] text-gray-200 flex-col">
        <div className="p-5">
          <div className="flex items-center gap-2">
            {business?.logo_url && (
              <img src={business.logo_url} alt="لوگو" className="w-8 h-8 rounded object-contain bg-surface" />
            )}
            <div className="font-bold text-lg tracking-tight">{business?.name || 'دفتر حساب'}</div>
          </div>
          <div className="text-xs text-gray-400 mt-1">حسابداری کسب‌وکار</div>
          <nav className="mt-8 flex flex-col gap-1">{navList()}</nav>
        </div>
        <div className="p-5 flex items-center gap-4">
          <button
            onClick={toggleDark}
            className="focus-ring text-xs text-gray-400 hover:text-white flex items-center gap-1"
          >
            {dark ? '☀️ حالت روشن' : '🌙 حالت تاریک'}
          </button>
          <button
            onClick={() => supabase.auth.signOut()}
            className="focus-ring text-xs text-gray-400 hover:text-white underline underline-offset-2"
          >
            خروج از حساب
          </button>
        </div>
      </aside>
      <main className="flex-1 p-4 md:p-10">
        {isOffline && (
          <div className="bg-brass/15 border border-brass/40 text-ink text-xs rounded-md px-3 py-2 mb-4 flex items-center gap-2">
            <span>📶</span>
            <span>اتصال اینترنت قطع است. صفحاتی که قبلاً باز کرده‌اید قابل مشاهده‌اند، ولی ثبت یا ویرایش اطلاعات نیاز به اینترنت دارد.</span>
          </div>
        )}
        {title && <h1 className="text-xl font-bold mb-6">{title}</h1>}
        {children}
      </main>
    </div>
  );
}
