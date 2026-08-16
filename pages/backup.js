import { useState } from 'react';
import Layout from '../components/Layout';
import ConfirmDialog from '../components/ConfirmDialog';
import { supabase } from '../lib/supabaseClient';
import { friendlyError } from '../lib/errorMessages';

// ترتیب جدول‌ها برای خروجی گرفتن (ترتیب اهمیتی ندارد، فقط خوانایی)
const EXPORT_TABLES = [
  'business_settings',
  'customers',
  'products',
  'invoices',
  'invoice_items',
  'stock_movements',
  'payments',
  'expenses',
];

// ترتیب بازیابی مهم است: جدول‌هایی که بقیه به آن‌ها وابسته‌اند (کلید خارجی) باید زودتر برگردند
const IMPORT_ORDER = [
  'business_settings',
  'customers',
  'products',
  'invoices',
  'invoice_items',
  'stock_movements',
  'payments',
  'expenses',
];

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function rowsForCurrentUser(rows, userId) {
  return (rows || []).map((row) => {
    if (!row || typeof row !== 'object') return row;
    return { ...row, user_id: userId };
  });
}

function validateBackupFile(parsed) {
  if (!parsed || typeof parsed !== 'object' || !parsed.tables || typeof parsed.tables !== 'object') {
    throw new Error('invalid');
  }
  return parsed;
}

export default function Backup() {
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [fileData, setFileData] = useState(null);
  const [fileName, setFileName] = useState('');

  async function handleExport() {
    setExporting(true);
    setError('');
    setMessage('');
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData?.user) throw authError || new Error('auth-required');
      const result = {
        exported_at: new Date().toISOString(),
        app: 'hesabdari-app',
        version: 2,
        user_id: authData.user.id,
        tables: {},
      };
      for (const table of EXPORT_TABLES) {
        const { data, error } = await supabase.from(table).select('*');
        if (error) throw error;
        result.tables[table] = data || [];
      }
      const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `نوبر-پشتیبان-${todayStr()}.json`;
      link.click();
      URL.revokeObjectURL(url);
      setMessage('فایل پشتیبان با موفقیت دانلود شد.');
    } catch (err) {
      setError(friendlyError(err, 'خطا در گرفتن پشتیبان. لطفاً اتصال اینترنت را بررسی و دوباره تلاش کنید.'));
    }
    setExporting(false);
  }

  function handleFilePick(e) {
    const file = e.target.files?.[0];
    setError('');
    setMessage('');
    setFileData(null);
    setFileName('');
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = validateBackupFile(JSON.parse(reader.result));
        setFileData(parsed);
        setFileName(file.name);
      } catch {
        setError('فایل انتخاب‌شده معتبر نیست. باید همان فایل خروجی‌گرفته‌شده از همین بخش باشد.');
      }
    };
    reader.readAsText(file);
  }

  const [confirmImport, setConfirmImport] = useState(false);

  function askImport() {
    if (!fileData) return;
    setConfirmImport(true);
  }

  async function handleImport() {
    setConfirmImport(false);
    setImporting(true);
    setError('');
    setMessage('');
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData?.user) throw authError || new Error('auth-required');

      for (const table of IMPORT_ORDER) {
        const rows = rowsForCurrentUser(fileData.tables[table], authData.user.id);
        if (!rows || rows.length === 0) continue;
        const { error } = await supabase.from(table).upsert(rows, { onConflict: 'id' });
        if (error) throw error;
      }
      setMessage('بازیابی اطلاعات با موفقیت انجام شد.');
      setFileData(null);
      setFileName('');
    } catch (err) {
      setError(friendlyError(err, 'خطا در بازیابی اطلاعات. ممکن است بازیابی ناقص مانده باشد؛ لطفاً داده‌ها را بررسی کنید.'));
    }
    setImporting(false);
  }

  return (
    <Layout title="پشتیبان‌گیری">
      {message && <div className="text-goodText text-xs bg-good/10 rounded-md px-3 py-2 mb-4">{message}</div>}
      {error && <div className="text-badText text-xs bg-bad/10 rounded-md px-3 py-2 mb-4">{error}</div>}

      <div className="bg-surface border border-line rounded-xl p-5 mb-6">
        <h2 className="font-bold mb-2">خروجی گرفتن (دانلود پشتیبان)</h2>
        <p className="text-xs text-ink/60 mb-4">
          یک فایل کامل شامل اطلاعات قابل‌دسترسی همین حساب کاربری (مشتریان، کالاها، فاکتورها، پرداخت‌ها، هزینه‌ها و...) دانلود می‌شود.
          پیشنهاد می‌شود این فایل را جایی امن (مثل گوگل‌درایو یا ایمیل خودتان) نگه دارید.
        </p>
        <button
          onClick={handleExport}
          disabled={exporting}
          className="focus-ring bg-brass hover:bg-brassDark text-white text-sm rounded-md px-4 py-2 font-semibold disabled:opacity-60"
        >
          {exporting ? 'در حال آماده‌سازی…' : 'دانلود پشتیبان کامل'}
        </button>
      </div>

      <div className="bg-surface border border-line rounded-xl p-5">
        <h2 className="font-bold mb-2">بازیابی از فایل پشتیبان</h2>
        <p className="text-xs text-badText mb-4">
          توجه: این کار اطلاعات فعلی را با اطلاعات فایل جایگزین/ترکیب می‌کند و برگشت‌پذیر نیست. فقط از فایل‌هایی
          استفاده کنید که خودتان از همین اپ خروجی گرفته‌اید. هنگام بازیابی، داده‌ها به حساب کاربری فعلی متصل می‌شوند.
        </p>
        <input
          type="file"
          accept="application/json"
          onChange={handleFilePick}
          className="focus-ring block w-full text-sm mb-3 file:ml-3 file:rounded-md file:border-0 file:bg-ink file:text-white file:px-3 file:py-2 file:text-xs file:font-semibold"
        />
        {fileName && <p className="text-xs text-ink/60 mb-3">فایل انتخاب‌شده: {fileName}</p>}
        <button
          onClick={askImport}
          disabled={!fileData || importing}
          className="focus-ring bg-bad hover:opacity-90 text-white text-sm rounded-md px-4 py-2 font-semibold disabled:opacity-40"
        >
          {importing ? 'در حال بازیابی…' : 'بازیابی اطلاعات از این فایل'}
        </button>
      </div>

      <ConfirmDialog
        open={confirmImport}
        title="بازیابی از فایل پشتیبان"
        description="این کار اطلاعات فایل پشتیبان را در دیتابیس فعلی بازیابی می‌کند و رکوردهای هم‌شناسه را جایگزین می‌کند. این عملیات قابل بازگشت نیست. ادامه می‌دهید؟"
        confirmLabel="بازیابی اطلاعات"
        busy={importing}
        onConfirm={handleImport}
        onCancel={() => setConfirmImport(false)}
      />
    </Layout>
  );
}
