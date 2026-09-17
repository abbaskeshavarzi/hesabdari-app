import { useEffect, useState } from 'react';
import { pendingMutationCount, syncQueuedMutations } from '../lib/offlineQueue';

export default function OfflineSyncStatus({ userId, supabase, offline }) {
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState('');

  async function refresh() {
    try {
      setPending(await pendingMutationCount(userId));
    } catch {
      setPending(0);
    }
  }

  useEffect(() => {
    refresh();
    window.addEventListener('offline-queue-changed', refresh);
    return () => window.removeEventListener('offline-queue-changed', refresh);
  }, [userId]);

  useEffect(() => {
    if (!offline && pending > 0) handleSync();
    // همگام‌سازی خودکار فقط پس از بازگشت اتصال اجرا می‌شود.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offline]);

  async function handleSync() {
    if (offline || syncing) return;
    setSyncing(true);
    setMessage('');
    try {
      const result = await syncQueuedMutations({ userId, client: supabase });
      setPending(result.pending);
      setMessage(result.pending ? 'برخی تغییرات هنوز ارسال نشده‌اند.' : result.synced ? 'تغییرات آفلاین ارسال شد.' : '');
    } catch {
      setMessage('همگام‌سازی آفلاین انجام نشد؛ دوباره تلاش کنید.');
    } finally {
      setSyncing(false);
    }
  }

  if (!offline && pending === 0 && !message) return null;
  return (
    <div className="bg-brass/15 border border-brass/40 text-ink text-xs rounded-md px-3 py-2 mb-4 flex flex-wrap items-center gap-2">
      <span>{offline ? '📴' : '↻'}</span>
      <span>{offline ? `${pending} تغییر آفلاین در انتظار ارسال است.` : message || `${pending} تغییر در انتظار همگام‌سازی است.`}</span>
      {!offline && pending > 0 && (
        <button type="button" onClick={handleSync} disabled={syncing} className="focus-ring font-semibold underline underline-offset-2 disabled:opacity-60">
          {syncing ? 'در حال ارسال…' : 'همگام‌سازی اکنون'}
        </button>
      )}
    </div>
  );
}
