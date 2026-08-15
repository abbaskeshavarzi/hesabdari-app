import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../lib/supabaseClient';

function formatToman(n) {
  return new Intl.NumberFormat('fa-IR').format(Math.round(n || 0)) + ' تومان';
}

// جست‌وجوی هم‌زمان در مشتریان، کالاها و فاکتورها
export default function GlobalSearch({ open, onClose }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setResults(null);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults(null);
      return;
    }
    setLoading(true);
    const timer = setTimeout(async () => {
      const [{ data: customers }, { data: products }, { data: invoices }] = await Promise.all([
        supabase.from('customers').select('id, name, phone').ilike('name', `%${q}%`).limit(5),
        supabase.from('products').select('id, name, price, stock_qty').ilike('name', `%${q}%`).limit(5),
        supabase
          .from('invoices')
          .select('id, invoice_number, total_amount, customers(name)')
          .ilike('invoice_number', `%${q}%`)
          .limit(5),
      ]);
      setResults({ customers: customers || [], products: products || [], invoices: invoices || [] });
      setLoading(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  if (!open) return null;

  const hasAny = results && (results.customers.length || results.products.length || results.invoices.length);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-20" onClick={onClose}>
      <div
        className="bg-surface w-full max-w-lg rounded-xl shadow-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 p-3 border-b border-line">
          <span className="text-ink/40">🔎</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="جست‌وجو در مشتریان، کالاها، شماره فاکتور…"
            className="focus-ring flex-1 bg-transparent text-sm py-1 outline-none"
          />
          <button onClick={onClose} className="focus-ring text-ink/40 hover:text-ink text-sm px-2">✕</button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto">
          {!query.trim() ? (
            <p className="text-xs text-ink/40 text-center py-8">برای جست‌وجو شروع به تایپ کنید…</p>
          ) : loading ? (
            <p className="text-xs text-ink/40 text-center py-8">در حال جست‌وجو…</p>
          ) : !hasAny ? (
            <p className="text-xs text-ink/40 text-center py-8">نتیجه‌ای یافت نشد.</p>
          ) : (
            <div className="divide-y divide-line">
              {results.customers.length > 0 && (
                <div className="p-2">
                  <div className="text-[10px] text-ink/40 px-2 mb-1">مشتریان</div>
                  {results.customers.map((c) => (
                    <Link
                      key={c.id}
                      href="/customers"
                      onClick={onClose}
                      className="focus-ring flex items-center justify-between px-2 py-2 rounded-md hover:bg-paper text-sm"
                    >
                      <span>{c.name}</span>
                      {c.phone && <span className="text-xs text-ink/40" dir="ltr">{c.phone}</span>}
                    </Link>
                  ))}
                </div>
              )}
              {results.products.length > 0 && (
                <div className="p-2">
                  <div className="text-[10px] text-ink/40 px-2 mb-1">کالاها</div>
                  {results.products.map((p) => (
                    <Link
                      key={p.id}
                      href="/products"
                      onClick={onClose}
                      className="focus-ring flex items-center justify-between px-2 py-2 rounded-md hover:bg-paper text-sm"
                    >
                      <span>{p.name}</span>
                      <span className="text-xs text-ink/40">موجودی: {p.stock_qty}</span>
                    </Link>
                  ))}
                </div>
              )}
              {results.invoices.length > 0 && (
                <div className="p-2">
                  <div className="text-[10px] text-ink/40 px-2 mb-1">فاکتورها</div>
                  {results.invoices.map((inv) => (
                    <Link
                      key={inv.id}
                      href="/invoices"
                      onClick={onClose}
                      className="focus-ring flex items-center justify-between px-2 py-2 rounded-md hover:bg-paper text-sm"
                    >
                      <span>{inv.invoice_number} · {inv.customers?.name || '—'}</span>
                      <span className="text-xs text-ink/40">{formatToman(inv.total_amount)}</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
