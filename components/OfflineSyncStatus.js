import { useEffect, useState } from 'react';
import { discardQueuedMutation, pendingMutationCount, queuedMutations, syncQueuedMutations } from '../lib/offlineQueue';

export default function OfflineSyncStatus({ userId, supabase, offline }) {
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState('');
  const [entries, setEntries] = useState([]);
  const [detailsOpen, setDetailsOpen] = useState(false);

  async function refresh() {
    try {
      setPending(await pendingMutationCount(userId));
      setEntries(await queuedMutations(userId));
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
      await refresh();
      setPending(result.pending);
      setMessage(result.pending ? 'برخی تغییرات هنوز ارسال نشده‌اند.' : result.synced ? 'تغییرات آفلاین ارسال شد.' : '');
    } catch {
      setMessage('همگام‌سازی آفلاین انجام نشد؛ دوباره تلاش کنید.');
    } finally {
      setSyncing(false);
    }
  }

  async function discard(entry) {
    if (!window.confirm('این تغییر آفلاین حذف شود؟ این عمل قابل بازگشت نیست.')) return;
    await discardQueuedMutation(userId, entry.id);
    await refresh();
    window.dispatchEvent(new Event('offline-queue-changed'));
  }

  if (!offline && pending === 0 && !message) return null;
  return (
    <section className="bg-brass/15 border border-brass/40 text-ink text-xs rounded-md px-3 py-2 mb-4">
      <div className="flex flex-wrap items-center gap-2">
        <span>{offline ? '📴' : '↻'}</span>
        <span>{offline ? `${pending} تغییر آفلاین در انتظار ارسال است.` : message || `${pending} تغییر در انتظار همگام‌سازی است.`}</span>
        {!offline && pending > 0 && (
          <button type="button" onClick={handleSync} disabled={syncing} className="focus-ring font-semibold underline underline-offset-2 disabled:opacity-60">
            {syncing ? 'در حال ارسال…' : 'همگام‌سازی اکنون'}
          </button>
        )}
        {entries.length > 0 && (
          <button type="button" onClick={() => setDetailsOpen((open) => !open)} className="focus-ring underline underline-offset-2">
            {detailsOpen ? 'بستن جزئیات' : 'مدیریت تغییرات'}
          </button>
        )}
      </div>
      {detailsOpen && (
        <ul className="mt-3 space-y-2 border-t border-brass/30 pt-3" aria-label="تغییرات آفلاین در انتظار">
          {entries.map((entry) => (
            <li key={entry.id} className="flex flex-wrap items-center justify-between gap-2">
              <span>{entry.operation === 'create' ? 'ثبت' : entry.operation === 'update' ? 'ویرایش' : 'حذف'} {entry.table === 'customers' ? 'مشتری' : entry.table === 'products' ? 'کالا' : entry.table}</span>
              <span className={entry.lastError ? 'text-badText' : 'text-ink/60'}>{entry.lastError ? `خطا: ${entry.lastError}` : 'در انتظار ارسال'}</span>
              <button type="button" onClick={() => discard(entry)} className="focus-ring text-badText underline underline-offset-2">حذف از صف</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
