import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import Layout from '../components/Layout';
import MoneyInput from '../components/MoneyInput';
import JalaliDatePicker from '../components/JalaliDatePicker';
import { formatJalaliShort } from '../lib/dateFormat';
import { downloadCsv } from '../lib/csv';
import { supabase } from '../lib/supabaseClient';

function formatToman(n) {
  return new Intl.NumberFormat('fa-IR').format(Math.round(n || 0)) + ' تومان';
}

const emptyHeader = {
  customer_id: '',
  invoice_number: '',
  issue_date: new Date().toISOString().slice(0, 10),
  description: '',
  status: 'معوق',
};
const emptyLine = { product_id: '', product_name: '', quantity: '1', unit_price: '' };

export default function Invoices() {
  const [invoices, setInvoices] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [header, setHeader] = useState(emptyHeader);
  const [lines, setLines] = useState([{ ...emptyLine }]);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [itemsCache, setItemsCache] = useState({});

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const { data: custs } = await supabase.from('customers').select('id, name').order('name');
    const { data: prods } = await supabase.from('products').select('id, name, price, unit, stock_qty').order('name');
    const { data: invs } = await supabase
      .from('invoices')
      .select('id, invoice_number, issue_date, total_amount, description, status, customer_id, customers(name)')
      .order('issue_date', { ascending: false });
    setCustomers(custs || []);
    setProducts(prods || []);
    setInvoices(invs || []);
    setLoading(false);
  }

  function nextInvoiceNumber(list) {
    const nums = (list || [])
      .map((i) => parseInt(String(i.invoice_number).replace(/\D/g, ''), 10))
      .filter((n) => !isNaN(n));
    const max = nums.length ? Math.max(...nums) : 1000;
    return String(max + 1);
  }

  function openNewForm() {
    setHeader({ ...emptyHeader, invoice_number: nextInvoiceNumber(invoices) });
    setLines([{ ...emptyLine }]);
    setError('');
    setShowForm(true);
  }

  function updateLine(idx, patch) {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }

  function pickProduct(idx, productId) {
    const p = products.find((x) => x.id === productId);
    updateLine(idx, {
      product_id: productId,
      product_name: p ? p.name : '',
      unit_price: p ? String(p.price) : '',
    });
  }

  function addLine() {
    setLines((prev) => [...prev, { ...emptyLine }]);
  }

  function removeLine(idx) {
    setLines((prev) => prev.filter((_, i) => i !== idx));
  }

  const total = lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unit_price) || 0), 0);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    const validLines = lines.filter((l) => l.product_name.trim() && Number(l.quantity) > 0);
    if (!header.customer_id) return setError('انتخاب مشتری الزامی است.');
    if (validLines.length === 0) return setError('حداقل یک قلم کالا با مقدار معتبر لازم است.');

    setSubmitting(true);
    // این عملیات به‌صورت اتمیک روی دیتابیس انجام می‌شود: ثبت فاکتور + اقلام + کسر
    // موجودی همه با هم موفق یا همه با هم لغو می‌شوند (بدون ریسک ناهماهنگی داده).
    const { error: rpcErr } = await supabase.rpc('create_invoice_with_items', {
      p_customer_id: header.customer_id,
      p_invoice_number: header.invoice_number || null,
      p_issue_date: header.issue_date,
      p_description: header.description,
      p_status: header.status,
      p_items: validLines.map((l) => ({
        product_id: l.product_id || null,
        product_name: l.product_name,
        quantity: Number(l.quantity),
        unit_price: Number(l.unit_price) || 0,
      })),
    });
    setSubmitting(false);

    if (rpcErr) {
      return setError(rpcErr.message || 'خطا در ثبت فاکتور.');
    }

    setShowForm(false);
    load();
  }

  async function deleteRow(id) {
    if (!confirm('این فاکتور حذف شود؟ (توجه: موجودی انبار خودکار برنمی‌گردد)')) return;
    await supabase.from('invoices').delete().eq('id', id);
    load();
  }

  async function changeStatus(id, status) {
    setInvoices((prev) => prev.map((i) => (i.id === id ? { ...i, status } : i)));
    await supabase.from('invoices').update({ status }).eq('id', id);
  }

  function statusColor(status) {
    if (status === 'پرداخت‌شده') return 'text-good bg-good/10';
    if (status === 'نیمه‌پرداخت') return 'text-brassDark bg-brass/10';
    return 'text-bad bg-bad/10';
  }

  async function toggleExpand(id) {
    if (expanded === id) {
      setExpanded(null);
      return;
    }
    setExpanded(id);
    if (!itemsCache[id]) {
      const { data } = await supabase.from('invoice_items').select('*').eq('invoice_id', id);
      setItemsCache((prev) => ({ ...prev, [id]: data || [] }));
    }
  }

  const filtered = invoices.filter((inv) => {
    const q = search.trim();
    if (!q) return true;
    return (inv.customers && inv.customers.name || '').includes(q) || (inv.invoice_number || '').includes(q);
  });

  function exportCsv() {
    const headers = ['تاریخ', 'مشتری', 'شماره فاکتور', 'مبلغ', 'وضعیت'];
    const csvRows = filtered.map((inv) => [
      inv.issue_date,
      inv.customers ? inv.customers.name : '',
      inv.invoice_number || '',
      inv.total_amount,
      inv.status || 'معوق',
    ]);
    downloadCsv('فاکتورها.csv', headers, csvRows);
  }

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
          onClick={exportCsv}
          className="focus-ring bg-surface border border-line text-ink text-sm rounded-md px-4 py-2 font-semibold"
        >
          خروجی CSV
        </button>
        <button
          onClick={() => (showForm ? setShowForm(false) : openNewForm())}
          className="focus-ring bg-brass hover:bg-brassDark text-white text-sm rounded-md px-4 py-2 font-semibold"
        >
          {showForm ? 'بستن فرم' : '+ فاکتور جدید'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-surface border border-line rounded-xl p-5 mb-6">
          {error && <div className="text-bad text-xs bg-bad/10 rounded-md px-3 py-2 mb-3">{error}</div>}
          <div className="grid sm:grid-cols-4 gap-3 mb-4">
            <div>
              <label className="block text-xs text-ink/60 mb-1">مشتری</label>
              <select
                value={header.customer_id}
                onChange={(e) => setHeader({ ...header, customer_id: e.target.value })}
                className="focus-ring w-full rounded-md border border-line px-3 py-2 text-sm bg-surface"
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
                value={header.invoice_number}
                onChange={(e) => setHeader({ ...header, invoice_number: e.target.value })}
                className="focus-ring w-full rounded-md border border-line px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-ink/60 mb-1">تاریخ صدور</label>
              <JalaliDatePicker
                value={header.issue_date}
                onChange={(v) => setHeader({ ...header, issue_date: v })}
                className="focus-ring w-full rounded-md border border-line px-3 py-2 text-sm text-right bg-surface"
              />
            </div>
            <div>
              <label className="block text-xs text-ink/60 mb-1">وضعیت پرداخت</label>
              <select
                value={header.status}
                onChange={(e) => setHeader({ ...header, status: e.target.value })}
                className="focus-ring w-full rounded-md border border-line px-3 py-2 text-sm bg-surface"
              >
                <option value="معوق">معوق</option>
                <option value="نیمه‌پرداخت">نیمه‌پرداخت</option>
                <option value="پرداخت‌شده">پرداخت‌شده</option>
              </select>
            </div>
          </div>

          <div className="mb-2 text-xs text-ink/60">اقلام فاکتور</div>
          <div className="space-y-2 mb-3">
            {lines.map((l, idx) => {
              const subtotal = (Number(l.quantity) || 0) * (Number(l.unit_price) || 0);
              return (
                <div key={idx} className="grid grid-cols-12 gap-2 items-center bg-paper rounded-md p-2">
                  <select
                    value={l.product_id}
                    onChange={(e) => pickProduct(idx, e.target.value)}
                    className="focus-ring col-span-4 rounded-md border border-line px-2 py-2 text-xs bg-surface"
                  >
                    <option value="">کالا را انتخاب کنید (یا دستی وارد کنید)…</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>{p.name} (موجودی: {p.stock_qty})</option>
                    ))}
                  </select>
                  <input
                    value={l.product_name}
                    onChange={(e) => updateLine(idx, { product_name: e.target.value })}
                    placeholder="شرح قلم"
                    className="focus-ring col-span-3 rounded-md border border-line px-2 py-2 text-xs"
                  />
                  <input
                    type="number"
                    value={l.quantity}
                    onChange={(e) => updateLine(idx, { quantity: e.target.value })}
                    placeholder="تعداد"
                    className="focus-ring col-span-2 rounded-md border border-line px-2 py-2 text-xs"
                  />
                  <MoneyInput
                    value={l.unit_price}
                    onChange={(v) => updateLine(idx, { unit_price: v })}
                    className="focus-ring col-span-2 rounded-md border border-line px-2 py-2 text-xs"
                    placeholder="قیمت واحد"
                  />
                  <div className="col-span-1 flex items-center justify-between">
                    <button type="button" onClick={() => removeLine(idx)} className="focus-ring text-bad text-xs">حذف</button>
                  </div>
                  <div className="col-span-12 text-left text-xs text-ink/50">{formatToman(subtotal)}</div>
                </div>
              );
            })}
          </div>
          <button type="button" onClick={addLine} className="focus-ring text-xs text-brass hover:underline mb-4">
            + افزودن قلم دیگر
          </button>

          <div className="flex justify-between items-center bg-ink text-paper rounded-lg px-4 py-3 mb-4">
            <span className="text-sm">جمع کل</span>
            <span className="font-bold text-lg">{formatToman(total)}</span>
          </div>

          <button disabled={submitting} className="focus-ring bg-ink text-white text-sm rounded-md px-4 py-2 font-semibold disabled:opacity-60">{submitting ? 'در حال ثبت…' : 'ثبت فاکتور'}</button>
        </form>
      )}

      <div className="bg-surface border border-line rounded-xl overflow-x-auto">
        <table className="ledger">
          <thead>
            <tr>
              <th>تاریخ</th>
              <th>مشتری</th>
              <th>شماره فاکتور</th>
              <th>مبلغ</th>
              <th>وضعیت</th>
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
                <React.Fragment key={inv.id}>
                  <tr>
                    <td>{formatJalaliShort(inv.issue_date)}</td>
                    <td className="font-medium">{inv.customers ? inv.customers.name : '—'}</td>
                    <td>{inv.invoice_number || '—'}</td>
                    <td>{formatToman(inv.total_amount)}</td>
                    <td>
                      <select
                        value={inv.status || 'معوق'}
                        onChange={(e) => changeStatus(inv.id, e.target.value)}
                        className={`focus-ring text-xs rounded-md px-2 py-1 border-0 font-semibold ${statusColor(inv.status)}`}
                      >
                        <option value="معوق">معوق</option>
                        <option value="نیمه‌پرداخت">نیمه‌پرداخت</option>
                        <option value="پرداخت‌شده">پرداخت‌شده</option>
                      </select>
                    </td>
                    <td className="whitespace-nowrap">
                      <button onClick={() => toggleExpand(inv.id)} className="focus-ring text-xs text-ink/60 hover:underline ml-3">
                        {expanded === inv.id ? 'بستن' : 'اقلام'}
                      </button>
                      <Link
                        href={'/invoice-print?id=' + inv.id}
                        target="_blank"
                        className="focus-ring text-xs text-brass hover:underline ml-3"
                      >
                        چاپ
                      </Link>
                      <button onClick={() => deleteRow(inv.id)} className="focus-ring text-xs text-bad hover:underline">حذف</button>
                    </td>
                  </tr>
                  {expanded === inv.id && (
                    <tr>
                      <td colSpan={6} className="bg-paper">
                        {!itemsCache[inv.id] ? (
                          <p className="text-xs text-ink/40 py-2">در حال بارگذاری…</p>
                        ) : itemsCache[inv.id].length === 0 ? (
                          <p className="text-xs text-ink/40 py-2">قلمی ثبت نشده (فاکتور قدیمی).</p>
                        ) : (
                          <ul className="text-xs divide-y divide-line">
                            {itemsCache[inv.id].map((it) => (
                              <li key={it.id} className="flex justify-between py-1.5">
                                <span>{it.product_name} × {it.quantity}</span>
                                <span>{formatToman(it.quantity * it.unit_price)}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Layout>
  );
}
