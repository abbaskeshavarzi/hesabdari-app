import { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import MoneyInput from '../components/MoneyInput';
import JalaliDatePicker from '../components/JalaliDatePicker';
import { formatJalaliShort } from '../lib/dateFormat';
import { downloadCsv } from '../lib/csv';
import { supabase } from '../lib/supabaseClient';

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

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('expenses').select('*').order('expense_date', { ascending: false });
    setRows(data || []);
    setLoading(false);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!form.amount || Number(form.amount) <= 0) {
      setError('مبلغ معتبر الزامی است.');
      return;
    }
    if (form.id) {
      const { error } = await supabase
        .from('expenses')
        .update({
          category: form.category,
          amount: Number(form.amount),
          expense_date: form.expense_date,
          description: form.description,
        })
        .eq('id', form.id);
      if (error) return setError('خطا در ویرایش هزینه.');
    } else {
      const { error } = await supabase.from('expenses').insert({
        category: form.category,
        amount: Number(form.amount),
        expense_date: form.expense_date,
        description: form.description,
      });
      if (error) return setError('خطا در ثبت هزینه.');
    }
    setForm(emptyForm);
    setShowForm(false);
    load();
  }

  function editRow(r) {
    setForm({
      id: r.id,
      category: r.category,
      amount: r.amount,
      expense_date: r.expense_date,
      description: r.description || '',
    });
    setShowForm(true);
  }

  async function deleteRow(id) {
    if (!confirm('این هزینه حذف شود؟')) return;
    await supabase.from('expenses').delete().eq('id', id);
    load();
  }

  const filtered = rows.filter((r) => {
    const q = search.trim();
    if (!q) return true;
    return (r.category || '').includes(q) || (r.description || '').includes(q);
  });

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

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-surface border border-line rounded-xl p-5 mb-6 grid sm:grid-cols-4 gap-3">
          {error && <div className="sm:col-span-4 text-bad text-xs bg-bad/10 rounded-md px-3 py-2">{error}</div>}
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
              <tr><td colSpan={5} className="text-center text-ink/40 py-6">در حال بارگذاری…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={5} className="text-center text-ink/40 py-6">هزینه‌ای ثبت نشده است.</td></tr>
            ) : (
              filtered.map((r) => (
                <tr key={r.id}>
                  <td>{formatJalaliShort(r.expense_date)}</td>
                  <td className="font-medium">{r.category}</td>
                  <td className="text-bad font-semibold">{formatToman(r.amount)}</td>
                  <td className="text-ink/60">{r.description || '—'}</td>
                  <td className="whitespace-nowrap">
                    <button onClick={() => editRow(r)} className="focus-ring text-xs text-brass hover:underline ml-3">ویرایش</button>
                    <button onClick={() => deleteRow(r.id)} className="focus-ring text-xs text-bad hover:underline">حذف</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Layout>
  );
}
