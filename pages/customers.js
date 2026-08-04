import { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import { downloadCsv } from '../lib/csv';
import { supabase } from '../lib/supabaseClient';

function formatToman(n) {
  return new Intl.NumberFormat('fa-IR').format(Math.round(n || 0)) + ' تومان';
}

const emptyForm = { id: null, name: '', phone: '', address: '' };

export default function Customers() {
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
    const { data, error } = await supabase.from('customer_balances').select('*').order('name');
    if (!error) setRows(data || []);
    setLoading(false);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!form.name.trim()) {
      setError('نام مشتری الزامی است.');
      return;
    }
    if (form.id) {
      const { error } = await supabase
        .from('customers')
        .update({ name: form.name, phone: form.phone, address: form.address })
        .eq('id', form.id);
      if (error) return setError('خطا در ویرایش مشتری.');
    } else {
      const { error } = await supabase
        .from('customers')
        .insert({ name: form.name, phone: form.phone, address: form.address });
      if (error) return setError('خطا در ثبت مشتری.');
    }
    setForm(emptyForm);
    setShowForm(false);
    load();
  }

  function editRow(r) {
    setForm({ id: r.customer_id, name: r.name, phone: r.phone || '', address: r.address || '' });
    setShowForm(true);
  }

  async function deleteRow(id) {
    if (!confirm('این مشتری و همه فاکتورهای مرتبط حذف شود؟')) return;
    await supabase.from('customers').delete().eq('id', id);
    load();
  }

  const filtered = rows.filter((r) => {
    const q = search.trim();
    if (!q) return true;
    return (r.name || '').includes(q) || (r.phone || '').includes(q);
  });

  function exportCsv() {
    const headers = ['نام', 'تماس', 'آدرس', 'وضعیت', 'مبلغ'];
    const csvRows = filtered.map((r) => [
      r.name,
      r.phone || '',
      r.address || '',
      r.balance > 0 ? 'بدهکار' : r.balance < 0 ? 'بستانکار' : 'تسویه',
      Math.abs(r.balance),
    ]);
    downloadCsv('مشتریان.csv', headers, csvRows);
  }

  return (
    <Layout title="مشتریان">
      <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="جست‌وجو بر اساس نام یا شماره تماس…"
          className="focus-ring rounded-md border border-line px-3 py-2 text-sm w-full sm:w-64"
        />
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
          {showForm ? 'بستن فرم' : '+ مشتری جدید'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-surface border border-line rounded-xl p-5 mb-6 grid sm:grid-cols-3 gap-3">
          {error && <div className="sm:col-span-3 text-bad text-xs bg-bad/10 rounded-md px-3 py-2">{error}</div>}
          <div>
            <label className="block text-xs text-ink/60 mb-1">نام مشتری</label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="focus-ring w-full rounded-md border border-line px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-ink/60 mb-1">شماره تماس</label>
            <input
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="focus-ring w-full rounded-md border border-line px-3 py-2 text-sm"
              dir="ltr"
            />
          </div>
          <div>
            <label className="block text-xs text-ink/60 mb-1">آدرس</label>
            <input
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              className="focus-ring w-full rounded-md border border-line px-3 py-2 text-sm"
            />
          </div>
          <div className="sm:col-span-3">
            <button className="focus-ring bg-ink text-white text-sm rounded-md px-4 py-2 font-semibold">
              {form.id ? 'ذخیره تغییرات' : 'ثبت مشتری'}
            </button>
          </div>
        </form>
      )}

      <div className="bg-surface border border-line rounded-xl overflow-x-auto">
        <table className="ledger">
          <thead>
            <tr>
              <th>نام</th>
              <th>تماس</th>
              <th>آدرس</th>
              <th>وضعیت حساب</th>
              <th>مبلغ</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="text-center text-ink/40 py-6">در حال بارگذاری…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={6} className="text-center text-ink/40 py-6">موردی یافت نشد.</td></tr>
            ) : (
              filtered.map((r) => (
                <tr key={r.customer_id}>
                  <td className="font-medium">{r.name}</td>
                  <td dir="ltr" className="text-left">{r.phone || '—'}</td>
                  <td>{r.address || '—'}</td>
                  <td>
                    {r.balance > 0 ? (
                      <span className="text-bad text-xs font-semibold">بدهکار</span>
                    ) : r.balance < 0 ? (
                      <span className="text-good text-xs font-semibold">بستانکار</span>
                    ) : (
                      <span className="text-ink/40 text-xs">تسویه</span>
                    )}
                  </td>
                  <td>{formatToman(Math.abs(r.balance))}</td>
                  <td className="whitespace-nowrap">
                    <button onClick={() => editRow(r)} className="focus-ring text-xs text-brass hover:underline ml-3">ویرایش</button>
                    <button onClick={() => deleteRow(r.customer_id)} className="focus-ring text-xs text-bad hover:underline">حذف</button>
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
