import { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import { supabase } from '../lib/supabaseClient';

function formatToman(n) {
  return new Intl.NumberFormat('fa-IR').format(Math.round(n || 0)) + ' تومان';
}

const emptyForm = {
  customer_id: '',
  invoice_number: '',
  issue_date: new Date().toISOString().slice(0, 10),
  total_amount: '',
  description: '',
};

export default function Invoices() {
  const [invoices, setInvoices] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    load();
  }, []);

  function nextInvoiceNumber(list) {
    const nums = (list || [])
      .map((i) => parseInt(String(i.invoice_number).replace(/\D/g, ''), 10))
      .filter((n) => !isNaN(n));
    const max = nums.length ? Math.max(...nums) : 1000;
    return String(max + 1);
  }

  function openNewForm(list) {
    setForm({ ...emptyForm, invoice_number: nextInvoiceNumber(list) });
    setShowForm(true);
  }

  async function load() {
    setLoading(true);
    const { data: custs } = await supabase.from('customers').select('id, name').order('name');
    const { data: invs } = await supabase
      .from('invoices')
      .select('id, invoice_number, issue_date, total_amount, description, customer_id, customers(name)')
      .order('issue_date', { ascending: false });
    setCustomers(custs || []);
    setInvoices(invs || []);
    setLoading(false);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!form.customer_id || !form.total_amount) {
      setError('انتخاب مشتری و مبلغ فاکتور الزامی است.');
      return;
    }
    const { error } = await supabase.from('invoices').insert({
      customer_id: form.customer_id,
      invoice_number: form.invoice_number || null,
      issue_date: form.issue_date,
      total_amount: Number(form.total_amount),
      description: form.description,
    });
    if (error) return setError('خطا در ثبت فاکتور.');
    setForm(emptyForm);
    setShowForm(false);
    load();
  }

  async function deleteRow(id) {
    if (!confirm('این فاکتور حذف شود؟')) return;
    await supabase.from('invoices').delete().eq('id', id);
    load();
  }

  const filtered = invoices.filter((inv) => {
    const q = search.trim();
    if (!q) return true;
    return (inv.customers?.name || '').includes(q) || (inv.invoice_number || '').includes(q);
  });

  return (
    <Layout title="فاکتورها">
      <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="جست‌وجو بر اساس مشتری یا شماره فاکتور…"
          className="focus-ring rounded-md border border-line px-3 py-2 text-sm w-full sm:w-64"
        />
        <button
          onClick={() => (showForm ? setShowForm(false) : openNewForm(invoices))}
          className="focus-ring bg-brass hover:bg-brassDark text-white text-sm rounded-md px-4 py-2 font-semibold"
        >
          {showForm ? 'بستن فرم' : '+ فاکتور جدید'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white border border-line rounded-xl p-5 mb-6 grid sm:grid-cols-3 gap-3">
          {error && <div className="sm:col-span-3 text-bad text-xs bg-bad/10 rounded-md px-3 py-2">{error}</div>}
          <div>
            <label className="block text-xs text-ink/60 mb-1">مشتری</label>
            <select
              value={form.customer_id}
              onChange={(e) => setForm({ ...form, customer_id: e.target.value })}
              className="focus-ring w-full rounded-md border border-line px-3 py-2 text-sm bg-white"
            >
              <option value="">انتخاب کنید…</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-ink/60 mb-1">شماره فاکتور (خودکار، قابل ویرایش)</label>
            <input
              value={form.invoice_number}
              onChange={(e) => setForm({ ...form, invoice_number: e.target.value })}
              className="focus-ring w-full rounded-md border border-line px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-ink/60 mb-1">تاریخ صدور</label>
            <input
              type="date"
              value={form.issue_date}
              onChange={(e) => setForm({ ...form, issue_date: e.target.value })}
              className="focus-ring w-full rounded-md border border-line px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-ink/60 mb-1">مبلغ (تومان)</label>
            <input
              type="number"
              value={form.total_amount}
              onChange={(e) => setForm({ ...form, total_amount: e.target.value })}
              className="focus-ring w-full rounded-md border border-line px-3 py-2 text-sm"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs text-ink/60 mb-1">توضیحات (اختیاری)</label>
            <input
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="focus-ring w-full rounded-md border border-line px-3 py-2 text-sm"
            />
          </div>
          <div className="sm:col-span-3">
            <button className="focus-ring bg-ink text-white text-sm rounded-md px-4 py-2 font-semibold">ثبت فاکتور</button>
          </div>
        </form>
      )}

      <div className="bg-white border border-line rounded-xl overflow-x-auto">
        <table className="ledger">
          <thead>
            <tr>
              <th>تاریخ</th>
              <th>مشتری</th>
              <th>شماره فاکتور</th>
              <th>توضیحات</th>
              <th>مبلغ</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="text-center text-ink/40 py-6">در حال بارگذاری…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={6} className="text-center text-ink/40 py-6">فاکتوری یافت نشد.</td></tr>
            ) : (
              filtered.map((inv) => (
                <tr key={inv.id}>
                  <td>{inv.issue_date}</td>
                  <td className="font-medium">{inv.customers?.name || '—'}</td>
                  <td>{inv.invoice_number || '—'}</td>
                  <td className="text-ink/60">{inv.description || '—'}</td>
                  <td>{formatToman(inv.total_amount)}</td>
                  <td className="whitespace-nowrap">
                    <a
                      href={`/invoice-print?id=${inv.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="focus-ring text-xs text-brass hover:underline ml-3"
                    >
                      چاپ
                    </a>
                    <button onClick={() => deleteRow(inv.id)} className="focus-ring text-xs text-bad hover:underline">حذف</button>
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
