import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient';
import { BUSINESS } from '../lib/businessInfo';

function formatToman(n) {
  return new Intl.NumberFormat('fa-IR').format(Math.round(n || 0)) + ' تومان';
}

export default function InvoicePrint() {
  const router = useRouter();
  const { id } = router.query;
  const [invoice, setInvoice] = useState(undefined);
  const [items, setItems] = useState([]);

  useEffect(() => {
    if (!id) return;
    supabase
      .from('invoices')
      .select('*, customers(name, phone, address)')
      .eq('id', id)
      .single()
      .then(({ data }) => setInvoice(data || null));
    supabase
      .from('invoice_items')
      .select('*')
      .eq('invoice_id', id)
      .then(({ data }) => setItems(data || []));
  }, [id]);

  if (invoice === undefined) {
    return <p className="p-10 text-sm text-ink/50">در حال بارگذاری…</p>;
  }
  if (invoice === null) {
    return <p className="p-10 text-sm text-bad">فاکتور یافت نشد.</p>;
  }

  return (
    <div className="min-h-screen bg-paper py-10 px-4">
      <div className="max-w-xl mx-auto bg-white border border-line rounded-xl p-8 print:border-0 print:shadow-none">
        <div className="flex justify-between items-start border-b border-line pb-4 mb-6">
          <div>
            <div className="font-bold text-lg">{BUSINESS.name}</div>
            <div className="text-xs text-ink/60 mt-1">{BUSINESS.address}</div>
            <div className="text-xs text-ink/60" dir="ltr">{BUSINESS.phone}</div>
          </div>
          <div className="text-left">
            <div className="text-xs text-ink/50">شماره فاکتور</div>
            <div className="font-bold">{invoice.invoice_number || '—'}</div>
            <div className="text-xs text-ink/50 mt-2">تاریخ</div>
            <div>{invoice.issue_date}</div>
          </div>
        </div>

        <div className="mb-6">
          <div className="text-xs text-ink/50 mb-1">مشتری</div>
          <div className="font-semibold">{invoice.customers ? invoice.customers.name : ''}</div>
          {invoice.customers && invoice.customers.phone && <div className="text-xs text-ink/60" dir="ltr">{invoice.customers.phone}</div>}
          {invoice.customers && invoice.customers.address && <div className="text-xs text-ink/60">{invoice.customers.address}</div>}
        </div>

        <table className="ledger mb-6">
          <thead>
            <tr>
              <th>شرح</th>
              <th>تعداد</th>
              <th>قیمت واحد</th>
              <th>جمع</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={3}>{invoice.description || 'خدمات / کالا'}</td>
                <td>{formatToman(invoice.total_amount)}</td>
              </tr>
            ) : (
              items.map((it) => (
                <tr key={it.id}>
                  <td>{it.product_name}</td>
                  <td>{it.quantity}</td>
                  <td>{formatToman(it.unit_price)}</td>
                  <td>{formatToman(it.quantity * it.unit_price)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <div className="flex justify-between items-center bg-ink text-paper rounded-lg px-4 py-3">
          <span className="text-sm">مبلغ قابل پرداخت</span>
          <span className="font-bold text-lg">{formatToman(invoice.total_amount)}</span>
        </div>

        <button
          onClick={() => window.print()}
          className="focus-ring mt-8 w-full bg-brass hover:bg-brassDark text-white rounded-md py-2 text-sm font-semibold print:hidden"
        >
          چاپ فاکتور
        </button>
      </div>
    </div>
  );
}
