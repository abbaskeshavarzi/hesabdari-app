import { useState } from 'react';
import Layout from '../components/Layout';
import ConfirmDialog from '../components/ConfirmDialog';
import { supabase } from '../lib/supabaseClient';
import { friendlyError } from '../lib/errorMessages';

const BACKUP_TABLES = [
  'business_settings',
  'customers',
  'suppliers',
  'products',
  'warehouses',
  'warehouse_stock',
  'invoices',
  'invoice_items',
  'stock_movements',
  'financial_accounts',
  'chart_of_accounts',
  'payments',
  'expenses',
  'journal_entries',
  'journal_lines',
];

const PAGE_SIZE = 500;
const MAX_BACKUP_BYTES = 50 * 1024 * 1024;

function todayStr() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function toHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function sha256(text) {
  if (!window.crypto?.subtle) {
    throw new Error('مرورگر شما امکان بررسی صحت فایل پشتیبان را ندارد.');
  }
  const buffer = await window.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(text)
  );
  return toHex(buffer);
}

async function fetchAllRows(table) {
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;
    rows.push(...(data || []));

    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows;
}

async function getCurrentOrganizationId() {
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user?.id;
  if (!userId) throw new Error('نشست کاربر معتبر نیست.');

  const { data, error } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', userId)
    .limit(1)
    .single();

  if (error || !data?.organization_id) {
    throw error || new Error('سازمان فعال کاربر پیدا نشد.');
  }

  return data.organization_id;
}

function withoutIntegrity(payload) {
  const { integrity, ...rest } = payload;
  return rest;
}

async function validateIntegrity(payload) {
  if (
    !payload?.integrity ||
    payload.integrity.algorithm !== 'SHA-256' ||
    typeof payload.integrity.hash !== 'string'
  ) {
    throw new Error('فایل پشتیبان فاقد اطلاعات صحت‌سنجی Stage 10 است.');
  }

  const calculated = await sha256(
    JSON.stringify(withoutIntegrity(payload))
  );

  if (calculated !== payload.integrity.hash) {
    throw new Error('صحت فایل پشتیبان تأیید نشد؛ فایل احتمالاً ناقص یا تغییر داده شده است.');
  }
}

export default function Backup() {
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [fileData, setFileData] = useState(null);
  const [fileName, setFileName] = useState('');
  const [validation, setValidation] = useState(null);
  const [confirmImport, setConfirmImport] = useState(false);

  async function handleExport() {
    setExporting(true);
    setError('');
    setMessage('');
    try {
      const organizationId = await getCurrentOrganizationId();
      const tables = {};
      const tableCounts = {};

      for (const table of BACKUP_TABLES) {
        const rows = await fetchAllRows(table);
        tables[table] = rows;
        tableCounts[table] = rows.length;
      }

      const basePayload = {
        format: 'hesabdari-business-backup',
        version: 1,
        schema: 'stage-10',
        exported_at: new Date().toISOString(),
        organization_id: organizationId,
        restore_mode: 'MERGE_SAFE',
        tables,
      };

      const integrityHash = await sha256(JSON.stringify(basePayload));
      const payload = {
        ...basePayload,
        integrity: {
          algorithm: 'SHA-256',
          hash: integrityHash,
        },
      };

      const text = JSON.stringify(payload, null, 2);
      const bytes = new TextEncoder().encode(text).byteLength;
      if (bytes > MAX_BACKUP_BYTES) {
        throw new Error('حجم پشتیبان بیش از حد مجاز است. داده را به چند بازه/نسخه تقسیم کنید.');
      }

      const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `hesabdari-backup-${todayStr()}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      const totalRows = Object.values(tableCounts).reduce((sum, count) => sum + count, 0);
      setMessage(`پشتیبان امن ساخته شد: ${totalRows.toLocaleString('fa-IR')} رکورد.`);
    } catch (err) {
      setError(friendlyError(err, 'خطا در گرفتن پشتیبان. اتصال اینترنت و دسترسی پشتیبان‌گیری را بررسی کنید.'));
    } finally {
      setExporting(false);
    }
  }

  async function handleFilePick(e) {
    const file = e.target.files?.[0];
    setError('');
    setMessage('');
    setFileData(null);
    setFileName('');
    setValidation(null);
    if (!file) return;

    try {
      if (file.size > MAX_BACKUP_BYTES) {
        throw new Error('حجم فایل پشتیبان بیش از حد مجاز است.');
      }

      const text = await file.text();
      const parsed = JSON.parse(text);

      await validateIntegrity(parsed);

      const { data, error: validationError } = await supabase.rpc(
        'validate_business_backup',
        { p_payload: parsed }
      );

      if (validationError) throw validationError;
      if (!data?.valid) {
        throw new Error('اعتبارسنجی فایل پشتیبان موفق نبود.');
      }

      setFileData(parsed);
      setFileName(file.name);
      setValidation(data);
      setMessage('فایل از نظر ساختار، سازمان و دسترسی برای بازیابی بررسی شد.');
    } catch (err) {
      setError(
        friendlyError(
          err,
          'فایل انتخاب‌شده معتبر نیست یا با سازمان فعلی سازگار نیست.'
        )
      );
    }
  }

  function askImport() {
    if (!fileData || !validation) return;
    setConfirmImport(true);
  }

  async function handleImport() {
    setConfirmImport(false);
    setImporting(true);
    setError('');
    setMessage('');

    try {
      // Re-validate immediately before the sensitive operation.
      await validateIntegrity(fileData);

      const { data, error: restoreError } = await supabase.rpc(
        'restore_business_backup',
        { p_payload: fileData }
      );

      if (restoreError) throw restoreError;

      setMessage(
        `بازیابی ایمن انجام شد. ${Number(data?.inserted_rows || 0).toLocaleString('fa-IR')} رکورد جدید اضافه شد؛ هیچ رکوردی overwrite یا حذف نشد.`
      );
      setFileData(null);
      setFileName('');
      setValidation(null);
    } catch (err) {
      setError(
        friendlyError(
          err,
          'بازیابی انجام نشد. هیچ بخشی از عملیات ناقص نباید در دیتابیس باقی مانده باشد؛ داده‌ها را بررسی کنید.'
        )
      );
    } finally {
      setImporting(false);
    }
  }

  const tableCountEntries = validation
    ? Object.entries(validation.table_counts || {})
    : [];

  return (
    <Layout title="پشتیبان‌گیری و امنیت داده">
      {message && (
        <div className="text-goodText text-xs bg-good/10 rounded-md px-3 py-2 mb-4">
          {message}
        </div>
      )}
      {error && (
        <div className="text-badText text-xs bg-bad/10 rounded-md px-3 py-2 mb-4">
          {error}
        </div>
      )}

      <div className="bg-surface border border-line rounded-xl p-5 mb-6">
        <h2 className="font-bold mb-2">ساخت پشتیبان ساختاریافته</h2>
        <p className="text-xs text-ink/60 mb-4 leading-6">
          اطلاعات کسب‌وکار فعلی با RLS خوانده می‌شود و در یک فایل JSON استاندارد ذخیره می‌شود.
          فایل شامل شناسه سازمان، نسخه ساختار، تعداد رکوردها و SHA-256 برای تشخیص خرابی یا تغییر فایل است.
          اطلاعات Auth، نقش‌ها، Permissionها و Audit Log عمداً برای Restore وارد نمی‌شوند.
        </p>
        <button
          onClick={handleExport}
          disabled={exporting}
          className="focus-ring bg-brass hover:bg-brassDark text-white text-sm rounded-md px-4 py-2 font-semibold disabled:opacity-60"
        >
          {exporting ? 'در حال ساخت پشتیبان…' : 'دانلود پشتیبان امن'}
        </button>
      </div>

      <div className="bg-surface border border-line rounded-xl p-5">
        <h2 className="font-bold mb-2">اعتبارسنجی و بازیابی ایمن</h2>
        <p className="text-xs text-ink/60 mb-4 leading-6">
          ابتدا فایل از نظر فرمت، SHA-256، سازمان، ساختار داده و محدودیت‌های Database بررسی می‌شود.
          Restore فقط به‌صورت Merge Safe انجام می‌شود: رکوردهای موجود نه ویرایش می‌شوند و نه حذف؛
          فقط رکوردهای قابل‌بازیابی که وجود ندارند اضافه می‌شوند. کل عملیات Database داخل یک تراکنش انجام می‌شود.
        </p>

        <input
          type="file"
          accept="application/json"
          onChange={handleFilePick}
          className="focus-ring block w-full text-sm mb-3 file:ml-3 file:rounded-md file:border-0 file:bg-ink file:text-white file:px-3 file:py-2 file:text-xs file:font-semibold"
        />

        {fileName && (
          <p className="text-xs text-ink/60 mb-3">
            فایل انتخاب‌شده: <span dir="ltr">{fileName}</span>
          </p>
        )}

        {validation && (
          <div className="border border-good/30 bg-good/5 rounded-lg p-4 mb-4">
            <div className="text-sm font-semibold mb-2">نتیجه اعتبارسنجی</div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
              {tableCountEntries.map(([table, count]) => (
                <div key={table} className="bg-surface border border-line rounded-md px-2 py-1.5">
                  <span dir="ltr">{table}</span>: {Number(count).toLocaleString('fa-IR')}
                </div>
              ))}
            </div>
            <div className="text-[11px] text-ink/50 mt-3">
              حالت بازیابی: فقط افزودن رکوردهای موجودنبودن؛ بدون UPDATE و DELETE.
            </div>
          </div>
        )}

        <button
          onClick={askImport}
          disabled={!fileData || !validation || importing}
          className="focus-ring bg-bad hover:opacity-90 text-white text-sm rounded-md px-4 py-2 font-semibold disabled:opacity-40"
        >
          {importing ? 'در حال بازیابی ایمن…' : 'بازیابی اطلاعات'}
        </button>
      </div>

      <div className="mt-5 text-[11px] text-ink/45 leading-5">
        نکته: این قابلیت پشتیبان منطقیِ اطلاعات کسب‌وکار است، نه جایگزین Backup/PITR خود Supabase.
        فایل پشتیبان شامل اطلاعات مالی حساس است و باید در محل امن نگهداری شود.
      </div>

      <ConfirmDialog
        open={confirmImport}
        title="تأیید بازیابی ایمن"
        description="قبل از Restore دوباره اعتبارسنجی انجام می‌شود. این عملیات فقط رکوردهای غایب را اضافه می‌کند و هیچ رکورد مالی موجود را overwrite یا حذف نمی‌کند. در صورت خطا، کل تراکنش Database برگشت می‌خورد. ادامه می‌دهید؟"
        confirmLabel="تأیید و بازیابی"
        busy={importing}
        onConfirm={handleImport}
        onCancel={() => setConfirmImport(false)}
      />
    </Layout>
  );
}
