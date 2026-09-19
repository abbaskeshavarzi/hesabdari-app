import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Layout from '../components/Layout';
import MoneyInput from '../components/MoneyInput';
import JalaliDatePicker from '../components/JalaliDatePicker';
import { formatJalaliShort } from '../lib/dateFormat';
import Pagination from '../components/Pagination';
import { TableSkeleton } from '../components/Skeleton';
import ConfirmDialog from '../components/ConfirmDialog';
import { downloadCsv } from '../lib/csv';
import { supabase } from '../lib/supabaseClient';
import { isPositiveAmount } from '../lib/financialValidation.mjs';
import { friendlyError } from '../lib/errorMessages';

const PAGE_SIZE = 15;

function formatToman(n) {
  return new Intl.NumberFormat('fa-IR').format(Math.round(n || 0)) + ' تومان';
}

const CATEGORIES = ['اجاره', 'حقوق و دستمزد', 'خرید کالا', 'قبوض', 'حمل‌ونقل', 'تبلیغات', 'متفرقه'];
const emptyForm = {
  id: null,
  category: 'متفرقه',
  amount: '',
  expense_date: new Date().toISOString().slice(0, 10),
  description: '',
};

export default function Expenses() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const router = useRouter();

  useEffect(() => {
    load();
  }, []);

  // پشتیبانی از دکمه‌ی «افزودن سریع» در داشبورد: با /expenses?new=1 فرم افزودن
  // مستقیم باز می‌شه، بدون اینکه کاربر لازم باشه خودش دکمه رو بزنه.
  useEffect(() => {
    if (router.query.new === '1') {
      setForm(emptyForm);
      setShowForm(true);
    }
  }, [router.query.new]);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('expenses').select('*').order('expense_date', { ascending: false });
    setRows(data || []);
    setLoading(false);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!isPositiveAmount(form.amount)) return setError('مبلغ معتبر الزامی است.');
    const { data: expenseAccount } = await supabase.from('chart_of_accounts').select('id').eq('code', '5100').eq('account_type', 'EXPENSE').eq('is_active', true).limit(1).maybeSingle();
    const { data: financialAccount } = await supabase.from('financial_accounts').select('id').eq('is_active', true).limit(1).maybeSingle();
    if (!expenseAccount?.id || !financialAccount?.id) return setError('برای ثبت هزینه باید حساب هزینه 5100 و حداقل یک حساب مالی فعال وجود داشته باشد.');
    const { error: rpcError } = await supabase.rpc('post_expense', {
      p_category: form.category,
      p_amount: Number(form.amount),
      p_expense_date: form.expense_date,
      p_financial_account_id: financialAccount.id,
      p_expense_account_id: expenseAccount.id,
      p_description: form.description || null,
    });
    if (rpcError) return setError(friendlyError(rpcError, 'ثبت هزینه انجام نشد.'));
    setForm(emptyForm); setShowForm(false); await load();
  }

  function editRow(r) {
    setForm({ id: null, category: r.category, amount: r.amount, expense_date: r.expense_date, description: r.description || '' });
    setShowForm(true);
    setError('هزینه‌های ثبت‌شده حسابداری قابل ویرایش نیستند؛ برای اصلاح باید در مرحله Reversal اصلاح شوند.');
  }

  const [confirmDelete, setConfirmDelete] = useState({ open: false, id: null, busy: false });

  function askDelete(id) {
    setConfirmDelete({ open: true, id, busy: false });
  }

  async function doDelete() {
    setConfirmDelete({ open: false, id: null, busy: false });
    setError('حذف مستقیم هزینه ثبت‌شده مجاز نیست. برای اصلاح از Reversal استفاده می‌شود.');
  }

  const filtered = rows.filter((r) => {
    const q = search.trim();
    if (!q) return true;
    return (r.category || '').includes(q) || (r.description || '').includes(q);
  });

  useEffect(() => {
    setPage(1);
  }, [search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function exportCsv() {
    const headers = ['تاریخ', 'دسته', 'مبلغ', 'توضیحات'];
    const csvRows = filtered.map((r) => [r.expense_date, r.category, r.amount, r.description || '']);
    downloadCsv('هزینه‌ها.csv', headers, csvRows);
  }

  return (
    <Layout title="هزینه‌ها">
      <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="جست‌وجو بر اساس دسته یا توضیح…"
          className="focus-ring rounded-md border border-line px-3 py-2 text-sm w-full sm:w-64"
        />
        <div className="flex gap-2">
          <button
            onClick={exportCsv}
            className="focus-ring bg-surface border border-line text-ink text-sm rounded-md px-4 py-2 font-semibold"
          >
            خروجی CSV
          </button>
          <button
            onClick={() => {
              setForm(emptyForm);
              setShowForm((s) => !s);
            }}
            className="focus-ring bg-brass hover:bg-brassDark text-white text-sm rounded-md px-4 py-2 font-semibold"
          >
            {showForm ? 'بستن فرم' : '+ هزینه جدید'}
          </button>
        </div>
      </div>

      {!showForm && error && (
        <div className="text-badText text-xs bg-bad/10 rounded-md px-3 py-2 mb-4">{error}</div>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-surface border border-line rounded-xl p-5 mb-6 grid sm:grid-cols-4 gap-3">
          {error && <div className="sm:col-span-4 text-badText text-xs bg-bad/10 rounded-md px-3 py-2">{error}</div>}
          <div>
            <label className="block text-xs text-ink/60 mb-1">دسته</label>
            <select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              className="focus-ring w-full rounded-md border border-line px-3 py-2 text-sm bg-surface"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-ink/60 mb-1">مبلغ (تومان)</label>
            <MoneyInput
              value={form.amount}
              onChange={(v) => setForm({ ...form, amount: v })}
              className="focus-ring w-full rounded-md border border-line px-3 py-2 text-sm"
              placeholder="0"
            />
          </div>
          <div>
            <label className="block text-xs text-ink/60 mb-1">تاریخ</label>
            <JalaliDatePicker
              value={form.expense_date}
              onChange={(v) => setForm({ ...form, expense_date: v })}
              className="focus-ring w-full rounded-md border border-line px-3 py-2 text-sm text-right bg-surface"
            />
          </div>
          <div>
            <label className="block text-xs text-ink/60 mb-1">توضیحات (اختیاری)</label>
            <input
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="focus-ring w-full rounded-md border border-line px-3 py-2 text-sm"
            />
          </div>
          <div className="sm:col-span-4">
            <button className="focus-ring bg-ink text-white text-sm rounded-md px-4 py-2 font-semibold">
              {form.id ? 'ذخیره تغییرات' : 'ثبت هزینه'}
            </button>
          </div>
        </form>
      )}

      <div className="bg-surface border border-line rounded-xl overflow-x-auto">
        <table className="ledger">
          <thead>
            <tr>
              <th>تاریخ</th>
              <th>دسته</th>
              <th>مبلغ</th>
              <th>توضیحات</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableSkeleton columns={5} />
            ) : pageRows.length === 0 ? (
              <tr><td colSpan={5} className="text-center text-ink/40 py-6">هزینه‌ای ثبت نشده است.</td></tr>
            ) : (
              pageRows.map((r) => (
                <tr key={r.id}>
                  <td>{formatJalaliShort(r.expense_date)}</td>
                  <td className="font-medium">{r.category}</td>
                  <td className="text-badText font-semibold">{formatToman(r.amount)}</td>
                  <td className="text-ink/60">{r.description || '—'}</td>
                  <td className="whitespace-nowrap">
                    <button onClick={() => editRow(r)} className="focus-ring text-xs text-brass hover:underline ml-3">ویرایش</button>
                    <button onClick={() => askDelete(r.id)} className="focus-ring text-xs text-badText hover:underline">حذف</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <Pagination page={page} totalPages={totalPages} onChange={setPage} totalCount={filtered.length} pageSize={PAGE_SIZE} />
      </div>

      <ConfirmDialog
        open={confirmDelete.open}
        title="حذف هزینه"
        description="این هزینه حذف شود؟ این عملیات قابل بازگشت نیست."
        confirmLabel="حذف هزینه"
        busy={confirmDelete.busy}
        onConfirm={doDelete}
        onCancel={() => setConfirmDelete({ open: false, id: null, busy: false })}
      />
    </Layout>
  );
}
