import { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import { formatJalaliShort } from '../lib/dateFormat';
import { supabase } from '../lib/supabaseClient';

const emptyForm = { product_id: '', direction: 'in', qty: '', reason: '' };

export default function Inventory() {
  const [products, setProducts] = useState([]);
  const [movements, setMovements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const { data: prods } = await supabase.from('products').select('id, name, unit, stock_qty').order('name');
    const { data: moves } = await supabase
      .from('stock_movements')
      .select('id, change_qty, reason, created_at, products(name, unit)')
      .order('created_at', { ascending: false })
      .limit(50);
    setProducts(prods || []);
    setMovements(moves || []);
    setLoading(false);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    const qtyNum = Number(form.qty);
    if (!form.product_id || !qtyNum || qtyNum <= 0) {
      setError('انتخاب کالا و مقدار معتبر الزامی است.');
      return;
    }
    const signedQty = form.direction === 'in' ? qtyNum : -qtyNum;
    const product = products.find((p) => p.id === form.product_id);
    if (form.direction === 'out' && product && product.stock_qty < qtyNum) {
      setError('موجودی کافی نیست.');
      return;
    }

    const { error: moveErr } = await supabase.from('stock_movements').insert({
      product_id: form.product_id,
      change_qty: signedQty,
      reason: form.reason || (form.direction === 'in' ? 'ورود کالا' : 'خروج کالا'),
    });
    if (moveErr) return setError('خطا در ثبت تراکنش انبار.');

    const newQty = (product?.stock_qty || 0) + signedQty;
    const { error: updateErr } = await supabase
      .from('products')
      .update({ stock_qty: newQty })
      .eq('id', form.product_id);
    if (updateErr) return setError('خطا در به‌روزرسانی موجودی.');

    setForm(emptyForm);
    setShowForm(false);
    load();
  }

  return (
    <Layout title="انبار">
      <div className="flex justify-between items-center mb-4">
        <p className="text-xs text-ink/50">آخرین ۵۰ تراکنش انبار</p>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="focus-ring bg-brass hover:bg-brassDark text-white text-sm rounded-md px-4 py-2 font-semibold"
        >
          {showForm ? 'بستن فرم' : '+ ثبت ورود/خروج کالا'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white border border-line rounded-xl p-5 mb-6 grid sm:grid-cols-4 gap-3">
          {error && <div className="sm:col-span-4 text-bad text-xs bg-bad/10 rounded-md px-3 py-2">{error}</div>}
          <div>
            <label className="block text-xs text-ink/60 mb-1">کالا</label>
            <select
              value={form.product_id}
              onChange={(e) => setForm({ ...form, product_id: e.target.value })}
              className="focus-ring w-full rounded-md border border-line px-3 py-2 text-sm bg-white"
            >
              <option value="">انتخاب کنید…</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>{p.name} (موجودی: {p.stock_qty})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-ink/60 mb-1">نوع تراکنش</label>
            <select
              value={form.direction}
              onChange={(e) => setForm({ ...form, direction: e.target.value })}
              className="focus-ring w-full rounded-md border border-line px-3 py-2 text-sm bg-white"
            >
              <option value="in">ورود کالا (افزایش)</option>
              <option value="out">خروج کالا (کاهش)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-ink/60 mb-1">مقدار</label>
            <input
              type="number"
              value={form.qty}
              onChange={(e) => setForm({ ...form, qty: e.target.value })}
              className="focus-ring w-full rounded-md border border-line px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-ink/60 mb-1">دلیل (اختیاری)</label>
            <input
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
              placeholder="مثلاً: خرید از تأمین‌کننده"
              className="focus-ring w-full rounded-md border border-line px-3 py-2 text-sm"
            />
          </div>
          <div className="sm:col-span-4">
            <button className="focus-ring bg-ink text-white text-sm rounded-md px-4 py-2 font-semibold">ثبت تراکنش</button>
          </div>
        </form>
      )}

      <div className="bg-white border border-line rounded-xl overflow-x-auto">
        <table className="ledger">
          <thead>
            <tr>
              <th>تاریخ</th>
              <th>کالا</th>
              <th>تغییر</th>
              <th>دلیل</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} className="text-center text-ink/40 py-6">در حال بارگذاری…</td></tr>
            ) : movements.length === 0 ? (
              <tr><td colSpan={4} className="text-center text-ink/40 py-6">هنوز تراکنشی ثبت نشده است.</td></tr>
            ) : (
              movements.map((m) => (
                <tr key={m.id}>
                  <td>{formatJalaliShort(m.created_at)}</td>
                  <td className="font-medium">{m.products?.name || '—'}</td>
                  <td className={m.change_qty > 0 ? 'text-good font-semibold' : 'text-bad font-semibold'}>
                    {m.change_qty > 0 ? '+' : ''}{m.change_qty} {m.products?.unit}
                  </td>
                  <td className="text-ink/60">{m.reason || '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Layout>
  );
}
