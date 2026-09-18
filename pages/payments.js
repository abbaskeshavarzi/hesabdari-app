import { useEffect, useMemo, useState } from 'react';
import Layout from '../components/Layout';
import MoneyInput from '../components/MoneyInput';
import JalaliDatePicker from '../components/JalaliDatePicker';
import Pagination from '../components/Pagination';
import { TableSkeleton } from '../components/Skeleton';
import ConfirmDialog from '../components/ConfirmDialog';
import { formatJalaliShort } from '../lib/dateFormat';
import { friendlyError } from '../lib/errorMessages';
import { supabase } from '../lib/supabaseClient';

const PAGE_SIZE = 15;
const today = () => new Date().toISOString().slice(0, 10);
const money = (n) => new Intl.NumberFormat('fa-IR').format(Math.round(Number(n) || 0)) + ' تومان';
const METHOD_LABELS = { CASH: 'نقدی', CARD: 'کارت', BANK_TRANSFER: 'کارت‌به‌کارت / انتقال', CHECK: 'چک', OTHER: 'سایر' };
const emptyForm = { direction: 'RECEIPT', customer_id: '', supplier_id: '', invoice_id: '', financial_account_id: '', amount: '', payment_date: today(), payment_method: 'CASH', tracking_number: '', note: '' };

export default function Payments() {
  const [payments, setPayments] = useState([]), [customers, setCustomers] = useState([]), [suppliers, setSuppliers] = useState([]);
  const [invoices, setInvoices] = useState([]), [accounts, setAccounts] = useState([]), [accountBalances, setAccountBalances] = useState([]);
  const [loading, setLoading] = useState(true), [form, setForm] = useState(emptyForm), [showForm, setShowForm] = useState(false);
  const [error, setError] = useState(''), [search, setSearch] = useState(''), [page, setPage] = useState(1), [submitting, setSubmitting] = useState(false);
  const [confirm, setConfirm] = useState({ open: false, id: null, busy: false });

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const [{ data: custs, error: custError }, { data: supps }, { data: invs }, { data: accs }, { data: balances }, { data: pays, error: payError }] = await Promise.all([
      supabase.from('customers').select('id,name').order('name'),
      supabase.from('suppliers').select('id,name').order('name'),
      supabase.from('invoices').select('id,invoice_number,customer_id,total_amount,payment_status,status,customers(name)').eq('status', 'POSTED').order('issue_date', { ascending: false }),
      supabase.from('financial_accounts').select('id,name,account_type,is_active').order('name'),
      supabase.from('financial_account_balances').select('*').order('name'),
      supabase.from('payments').select('id,direction,transaction_kind,customer_id,supplier_id,invoice_id,financial_account_id,amount,payment_date,payment_method,tracking_number,note,reversed_payment_id,customers(name),suppliers(name),financial_accounts(name),invoices(invoice_number)').order('payment_date', { ascending: false }).order('created_at', { ascending: false }),
    ]);
    if (custError || payError) setError(friendlyError(custError || payError, 'خطا در دریافت اطلاعات مالی. لطفاً دوباره تلاش کنید.'));
    setCustomers(custs || []); setSuppliers(supps || []); setInvoices(invs || []);
    setAccounts((accs || []).filter((a) => a.is_active)); setAccountBalances(balances || []); setPayments(pays || []); setLoading(false);
  }

  function setDirection(direction) {
    setForm((v) => ({ ...v, direction, customer_id: direction === 'RECEIPT' ? v.customer_id : '', supplier_id: direction === 'PAYMENT' ? v.supplier_id : '', invoice_id: '' }));
    setError('');
  }

  async function submit(e) {
    e.preventDefault(); setError('');
    if (!form.financial_account_id || !form.amount || Number(form.amount) <= 0) return setError('حساب مالی و مبلغ معتبر الزامی است.');
    if (form.direction === 'RECEIPT' && !form.customer_id) return setError('برای دریافت، انتخاب مشتری الزامی است.');
    if (form.direction === 'PAYMENT' && !form.supplier_id) return setError('برای پرداخت، انتخاب تأمین‌کننده الزامی است.');
    setSubmitting(true);
    const { error: rpcError } = await supabase.rpc('create_payment', {
      p_direction: form.direction, p_customer_id: form.direction === 'RECEIPT' ? form.customer_id : null,
      p_supplier_id: form.direction === 'PAYMENT' ? form.supplier_id : null,
      p_invoice_id: form.direction === 'RECEIPT' && form.invoice_id ? form.invoice_id : null,
      p_financial_account_id: form.financial_account_id, p_amount: Number(form.amount), p_payment_date: form.payment_date,
      p_payment_method: form.payment_method, p_tracking_number: form.tracking_number || null, p_note: form.note || null,
    });
    setSubmitting(false);
    if (rpcError) return setError(friendlyError(rpcError, 'ثبت تراکنش انجام نشد. لطفاً اطلاعات را بررسی کنید.'));
    setForm(emptyForm); setShowForm(false); await load();
  }

  function askReverse(id) { setConfirm({ open: true, id, busy: false }); }

  async function reverse() {
    setConfirm((v) => ({ ...v, busy: true }));
    const { error: rpcError } = await supabase.rpc('reverse_payment', { p_payment_id: confirm.id, p_reason: 'برگشت تراکنش از داخل سیستم' });
    if (rpcError) {
      setConfirm({ open: false, id: null, busy: false });
      return setError(friendlyError(rpcError, 'برگشت تراکنش انجام نشد. لطفاً دوباره تلاش کنید.'));
    }
    setConfirm({ open: false, id: null, busy: false }); await load();
  }

  const reversedIds = useMemo(() => new Set(payments.filter((p) => p.reversed_payment_id).map((p) => p.reversed_payment_id)), [payments]);
  const filtered = payments.filter((p) => {
    const q = search.trim();
    return !q || (p.customers?.name || '').includes(q) || (p.suppliers?.name || '').includes(q) || (p.note || '').includes(q) || (p.tracking_number || '').includes(q) || (p.invoices?.invoice_number || '').includes(q);
  });
  useEffect(() => { setPage(1); }, [search]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)), rows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalReceived = payments.reduce((s, p) => s + (p.direction === 'RECEIPT' ? Number(p.amount) : 0), 0);
  const totalPaid = payments.reduce((s, p) => s + (p.direction === 'PAYMENT' ? Number(p.amount) : 0), 0);

  return (
    <Layout title="دریافت و پرداخت">
      <div className="grid sm:grid-cols-3 gap-3 mb-5">
        <div className="bg-surface border border-line rounded-xl p-4"><div className="text-xs text-ink/55 mb-1">مجموع دریافت ثبت‌شده</div><div className="text-lg font-bold text-goodText">{money(totalReceived)}</div></div>
        <div className="bg-surface border border-line rounded-xl p-4"><div className="text-xs text-ink/55 mb-1">مجموع پرداخت ثبت‌شده</div><div className="text-lg font-bold text-badText">{money(totalPaid)}</div></div>
        <div className="bg-surface border border-line rounded-xl p-4"><div className="text-xs text-ink/55 mb-1">تعداد تراکنش‌ها</div><div className="text-lg font-bold">{payments.length.toLocaleString('fa-IR')}</div></div>
      </div>

      <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="جست‌وجوی طرف حساب، پیگیری، فاکتور یا توضیح…" className="focus-ring rounded-md border border-line px-3 py-2 text-sm w-full sm:w-80" />
        <button onClick={() => { setShowForm((v) => !v); setError(''); }} className="focus-ring bg-brass hover:bg-brassDark text-white text-sm rounded-md px-4 py-2 font-semibold">{showForm ? 'بستن فرم' : '+ ثبت دریافت / پرداخت'}</button>
      </div>

      {error && <div role="alert" className="text-badText text-xs bg-bad/10 rounded-md px-3 py-2 mb-4">{error}</div>}

      {showForm && (
        <form onSubmit={submit} className="bg-surface border border-line rounded-xl p-5 mb-6">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="lg:col-span-4">
              <label className="block text-xs text-ink/60 mb-1">نوع تراکنش</label>
              <div className="flex gap-2">
                <button type="button" onClick={() => setDirection('RECEIPT')} className={`focus-ring rounded-md px-4 py-2 text-sm ${form.direction === 'RECEIPT' ? 'bg-good text-white' : 'border border-line'}`}>دریافت از مشتری</button>
                <button type="button" onClick={() => setDirection('PAYMENT')} className={`focus-ring rounded-md px-4 py-2 text-sm ${form.direction === 'PAYMENT' ? 'bg-bad text-white' : 'border border-line'}`}>پرداخت به تأمین‌کننده</button>
              </div>
            </div>

            <div>
              <label className="block text-xs text-ink/60 mb-1">{form.direction === 'RECEIPT' ? 'مشتری *' : 'تأمین‌کننده *'}</label>
              <select value={form.direction === 'RECEIPT' ? form.customer_id : form.supplier_id} onChange={(e) => setForm({ ...form, [form.direction === 'RECEIPT' ? 'customer_id' : 'supplier_id']: e.target.value, invoice_id: '' })} className="focus-ring w-full rounded-md border border-line px-3 py-2 text-sm bg-surface">
                <option value="">انتخاب کنید…</option>
                {(form.direction === 'RECEIPT' ? customers : suppliers).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
            </div>

            {form.direction === 'RECEIPT' && (
              <div>
                <label className="block text-xs text-ink/60 mb-1">اتصال به فاکتور (اختیاری)</label>
                <select value={form.invoice_id} onChange={(e) => setForm({ ...form, invoice_id: e.target.value })} className="focus-ring w-full rounded-md border border-line px-3 py-2 text-sm bg-surface">
                  <option value="">بدون اتصال به فاکتور</option>
                  {invoices.filter((i) => !form.customer_id || i.customer_id === form.customer_id).map((i) => <option key={i.id} value={i.id}>#{i.invoice_number || 'بدون شماره'} — {money(i.total_amount)}</option>)}
                </select>
              </div>
            )}

            <div>
              <label className="block text-xs text-ink/60 mb-1">حساب مالی *</label>
              <select value={form.financial_account_id} onChange={(e) => setForm({ ...form, financial_account_id: e.target.value })} className="focus-ring w-full rounded-md border border-line px-3 py-2 text-sm bg-surface">
                <option value="">انتخاب حساب…</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              {accounts.length === 0 && <div className="text-xs text-badText mt-1">ابتدا یک حساب مالی فعال بسازید.</div>}
            </div>

            <div><label className="block text-xs text-ink/60 mb-1">مبلغ *</label><MoneyInput value={form.amount} onChange={(v) => setForm({ ...form, amount: v })} className="focus-ring w-full rounded-md border border-line px-3 py-2 text-sm" placeholder="0" /></div>
            <div><label className="block text-xs text-ink/60 mb-1">تاریخ *</label><JalaliDatePicker value={form.payment_date} onChange={(v) => setForm({ ...form, payment_date: v })} className="focus-ring w-full rounded-md border border-line px-3 py-2 text-sm bg-surface" /></div>
            <div>
              <label className="block text-xs text-ink/60 mb-1">روش پرداخت *</label>
              <select value={form.payment_method} onChange={(e) => setForm({ ...form, payment_method: e.target.value })} className="focus-ring w-full rounded-md border border-line px-3 py-2 text-sm bg-surface">
                {Object.entries(METHOD_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </select>
            </div>
            <div><label className="block text-xs text-ink/60 mb-1">شماره پیگیری</label><input value={form.tracking_number} onChange={(e) => setForm({ ...form, tracking_number: e.target.value })} className="focus-ring w-full rounded-md border border-line px-3 py-2 text-sm" placeholder="اختیاری" /></div>
            <div className="lg:col-span-4"><label className="block text-xs text-ink/60 mb-1">توضیحات</label><input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className="focus-ring w-full rounded-md border border-line px-3 py-2 text-sm" placeholder="توضیحات تراکنش…" /></div>
            <div className="lg:col-span-4"><button disabled={submitting || accounts.length === 0} className="focus-ring bg-ink text-white text-sm rounded-md px-5 py-2 font-semibold disabled:opacity-50">{submitting ? 'در حال ثبت…' : 'ثبت تراکنش'}</button></div>
          </div>
        </form>
      )}

      <div className="bg-surface border border-line rounded-xl overflow-x-auto">
        <table className="ledger">
          <thead><tr><th>تاریخ</th><th>نوع</th><th>طرف حساب</th><th>مبلغ</th><th>روش</th><th>حساب مالی</th><th>پیگیری</th><th>فاکتور</th><th>وضعیت</th><th></th></tr></thead>
          <tbody>
            {loading ? <TableSkeleton columns={10} /> : rows.length === 0 ? <tr><td colSpan={10} className="text-center text-ink/40 py-6">تراکنشی یافت نشد.</td></tr> : rows.map((p) => {
              const isReversal = p.transaction_kind === 'REVERSAL', alreadyReversed = reversedIds.has(p.id);
              return <tr key={p.id}>
                <td>{formatJalaliShort(p.payment_date)}</td>
                <td><span className={`text-xs font-semibold ${isReversal ? 'text-badText' : p.direction === 'RECEIPT' ? 'text-goodText' : 'text-badText'}`}>{isReversal ? 'برگشت' : p.direction === 'RECEIPT' ? 'دریافت' : 'پرداخت'}</span></td>
                <td className="font-medium">{p.customers?.name || p.suppliers?.name || '—'}</td>
                <td className={p.direction === 'RECEIPT' ? 'text-goodText font-semibold' : 'text-badText font-semibold'}>{money(p.amount)}</td>
                <td>{METHOD_LABELS[p.payment_method] || p.payment_method}</td>
                <td>{p.financial_accounts?.name || '—'}</td><td>{p.tracking_number || '—'}</td>
                <td>{p.invoices?.invoice_number ? `#${p.invoices.invoice_number}` : '—'}</td>
                <td>{isReversal ? 'برگشت‌شده' : alreadyReversed ? 'برگشت خورده' : 'ثبت‌شده'}</td>
                <td>{!isReversal && !alreadyReversed && <button onClick={() => askReverse(p.id)} className="focus-ring text-xs text-badText hover:underline">برگشت</button>}</td>
              </tr>;
            })}
          </tbody>
        </table>
        <Pagination page={page} totalPages={totalPages} onChange={setPage} totalCount={filtered.length} pageSize={PAGE_SIZE} />
      </div>

      <div className="mt-5 bg-surface border border-line rounded-xl p-4">
        <div className="text-sm font-semibold mb-3">مانده حساب‌های مالی</div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {accountBalances.length === 0 ? <div className="text-xs text-ink/45">هنوز حساب مالی ثبت نشده است.</div> : accountBalances.map((a) => <div key={a.financial_account_id} className="border border-line rounded-lg p-3"><div className="text-xs text-ink/55">{a.name}</div><div className="font-bold mt-1">{money(a.balance)}</div></div>)}
        </div>
      </div>

      <ConfirmDialog open={confirm.open} title="برگشت تراکنش" description="این تراکنش حذف نمی‌شود؛ یک تراکنش معکوس و قابل پیگیری برای خنثی‌کردن آن ثبت خواهد شد. ادامه می‌دهید؟" confirmLabel="ثبت برگشت" busy={confirm.busy} onConfirm={reverse} onCancel={() => setConfirm({ open: false, id: null, busy: false })} />
    </Layout>
  );
}
