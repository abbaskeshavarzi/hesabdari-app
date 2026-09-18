import { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import MoneyInput from '../components/MoneyInput';
import { friendlyError } from '../lib/errorMessages';
import { supabase } from '../lib/supabaseClient';

const TYPES = { CASH: 'صندوق', BANK: 'بانک', CARD: 'کارت', OTHER: 'سایر' };
const emptyForm = { id: null, name: '', account_type: 'CASH', account_number: '', opening_balance: '', is_active: true };
const money = (n) => new Intl.NumberFormat('fa-IR').format(Math.round(Number(n) || 0)) + ' تومان';

export default function FinancialAccounts() {
  const [rows, setRows] = useState([]), [form, setForm] = useState(emptyForm), [showForm, setShowForm] = useState(false);
  const [error, setError] = useState(''), [loading, setLoading] = useState(true), [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data, error: e } = await supabase.from('financial_account_balances').select('*').order('name');
    if (e) setError(friendlyError(e, 'خطا در دریافت حساب‌های مالی. لطفاً دوباره تلاش کنید.'));
    setRows(data || []); setLoading(false);
  }

  function openNew() { setForm(emptyForm); setError(''); setShowForm(true); }
  function openEdit(row) {
    setForm({ id: row.financial_account_id, name: row.name || '', account_type: row.account_type || 'CASH', account_number: row.account_number || '', opening_balance: String(row.opening_balance || ''), is_active: row.is_active });
    setError(''); setShowForm(true);
  }

  async function save(e) {
    e.preventDefault(); setError('');
    if (!form.name.trim()) return setError('نام حساب الزامی است.');
    if (Number(form.opening_balance) < 0) return setError('موجودی افتتاحیه نمی‌تواند منفی باشد.');
    setSaving(true);
    const payload = { name: form.name.trim(), account_type: form.account_type, account_number: form.account_number.trim() || null, opening_balance: Number(form.opening_balance) || 0, is_active: form.is_active, updated_at: new Date().toISOString() };
    const result = form.id ? await supabase.from('financial_accounts').update(payload).eq('id', form.id) : await supabase.from('financial_accounts').insert(payload);
    setSaving(false);
    if (result.error) return setError(friendlyError(result.error, 'ذخیره حساب مالی انجام نشد. لطفاً دوباره تلاش کنید.'));
    setShowForm(false); setForm(emptyForm); await load();
  }

  async function deactivate(row) {
    const { error: e } = await supabase.from('financial_accounts').update({ is_active: false, updated_at: new Date().toISOString() }).eq('id', row.financial_account_id);
    if (e) setError(friendlyError(e, 'غیرفعال‌سازی حساب انجام نشد. لطفاً دوباره تلاش کنید.'));
    else await load();
  }

  return <Layout title="حساب‌های مالی">
    <div className="flex justify-between items-center gap-3 mb-4">
      <div className="text-sm text-ink/60">صندوق، بانک و حساب‌هایی که دریافت و پرداخت از آن‌ها انجام می‌شود.</div>
      <button onClick={showForm ? () => setShowForm(false) : openNew} className="focus-ring bg-brass hover:bg-brassDark text-white text-sm rounded-md px-4 py-2 font-semibold">{showForm ? 'بستن فرم' : '+ حساب مالی جدید'}</button>
    </div>
    {error && <div role="alert" className="text-badText text-xs bg-bad/10 rounded-md px-3 py-2 mb-4">{error}</div>}
    {showForm && <form onSubmit={save} className="bg-surface border border-line rounded-xl p-5 mb-6 grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
      <div><label className="block text-xs text-ink/60 mb-1">نام حساب *</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="focus-ring w-full rounded-md border border-line px-3 py-2 text-sm" placeholder="مثلاً صندوق فروشگاه" /></div>
      <div><label className="block text-xs text-ink/60 mb-1">نوع</label><select value={form.account_type} onChange={(e) => setForm({ ...form, account_type: e.target.value })} className="focus-ring w-full rounded-md border border-line px-3 py-2 text-sm bg-surface">{Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
      <div><label className="block text-xs text-ink/60 mb-1">شماره حساب / کارت</label><input value={form.account_number} onChange={(e) => setForm({ ...form, account_number: e.target.value })} className="focus-ring w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
      <div><label className="block text-xs text-ink/60 mb-1">موجودی افتتاحیه</label><MoneyInput value={form.opening_balance} onChange={(v) => setForm({ ...form, opening_balance: v })} className="focus-ring w-full rounded-md border border-line px-3 py-2 text-sm" /></div>
      <label className="flex items-center gap-2 text-sm mt-6"><input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />فعال</label>
      <div className="sm:col-span-2 lg:col-span-5"><button disabled={saving} className="focus-ring bg-ink text-white text-sm rounded-md px-5 py-2 font-semibold disabled:opacity-50">{saving ? 'در حال ذخیره…' : 'ذخیره حساب'}</button></div>
    </form>}
    <div className="bg-surface border border-line rounded-xl overflow-x-auto">
      <table className="ledger"><thead><tr><th>نام حساب</th><th>نوع</th><th>شماره</th><th>موجودی افتتاحیه</th><th>مانده فعلی</th><th>وضعیت</th><th></th></tr></thead>
      <tbody>{loading ? <tr><td colSpan={7} className="text-center py-6">در حال بارگذاری…</td></tr> : rows.length === 0 ? <tr><td colSpan={7} className="text-center text-ink/40 py-6">حساب مالی ثبت نشده است.</td></tr> : rows.map((row) => <tr key={row.financial_account_id}>
        <td className="font-medium">{row.name}</td><td>{TYPES[row.account_type] || row.account_type}</td><td>{row.account_number || '—'}</td><td>{money(row.opening_balance)}</td><td className="font-semibold">{money(row.balance)}</td><td>{row.is_active ? 'فعال' : 'غیرفعال'}</td>
        <td className="flex gap-3"><button onClick={() => openEdit(row)} className="focus-ring text-xs text-brass hover:underline">ویرایش</button>{row.is_active && <button onClick={() => deactivate(row)} className="focus-ring text-xs text-badText hover:underline">غیرفعال</button>}</td>
      </tr>)}</tbody></table>
    </div>
  </Layout>;
}
