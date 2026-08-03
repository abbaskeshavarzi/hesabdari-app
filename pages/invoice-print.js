import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient';

function formatToman(n) {
  return new Intl.NumberFormat('fa-IR').format(Math.round(n || 0)) + ' تومان';
}

export default function InvoicePrint() {
  const router = useRouter();
  const { id } = router.query;
  const [invoice, setInvoice] = useState(undefined);
  const [items, setItems] = useState([]);
  const [business, setBusiness] = useState(null);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const cardRef = useRef(null);

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
    supabase
      .from('business_settings')
      .select('*')
      .eq('id', 'default')
      .single()
      .then(({ data }) => setBusiness(data || null));
  }, [id]);

  async function saveAsImage() {
    if (!cardRef.current) return;
    setSaving(true);
    try {
      const html2canvas = (await import('html2canvas')).default;
      if (document.fonts && document.fonts.ready) {
        await document.fonts.ready;
      }
      const canvas = await html2canvas(cardRef.current, {
        scale: 2,
        backgroundColor: '#ffffff',
        foreignObjectRendering: true,
      });
      const link = document.createElement('a');
      link.download = 'invoice-' + (invoice.invoice_number || id) + '.png';
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (e) {
      alert('خطا در ساخت عکس فاکتور.');
    }
    setSaving(false);
  }

  function buildSmsText() {
    const name = business ? business.name : '';
    const custName = invoice.customers ? invoice.customers.name : '';
    const amount = formatToman(invoice.total_amount);
    const num = invoice.invoice_number ? 'شماره ' + invoice.invoice_number + ' ' : '';
    return name + '\nفاکتور ' + num + 'برای ' + custName + '\nمبلغ: ' + amount + '\nتاریخ: ' + invoice.issue_date;
  }

  async function prepareSms() {
    const text = buildSmsText();
    const phone = invoice.customers && invoice.customers.phone ? invoice.customers.phone.replace(/\s/g, '') : '';
    const encoded = encodeURIComponent(text);
    if (phone) {
      const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
      const sep = isIOS ? '&' : '?';
      window.location.href = 'sms:' + phone + sep + 'body=' + encoded;
    } else {
      try {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      } catch (e) {
        alert(text);
      }
    }
  }

  if (invoice === undefined) {
    return <p className="p-10 text-sm text-ink/50">در حال بارگذاری…</p>;
  }
  if (invoice === null) {
    return <p className="p-10 text-sm text-bad">فاکتور یافت نشد.</p>;
  }

  return (
    <div className="min-h-screen bg-paper py-10 px-4">
      <div className="max-w-xl mx-auto">
        <div ref={cardRef} className="bg-white border border-line rounded-xl p-8 print:border-0 print:shadow-none">
          <div className="flex justify-between items-start border-b border-line pb-4 mb-6">
            <div className="flex items-start gap-3">
              {business && business.logo_url && (
                <img src={business.logo_url} alt="لوگو" className="w-12 h-12 rounded object-contain" />
              )}
              <div>
                <div className="font-bold text-lg">{business ? business.name : ''}</div>
                <div className="text-xs text-ink/60 mt-1">{business ? business.address : ''}</div>
                <div className="text-xs text-ink/60" dir="ltr">{business ? business.phone : ''}</div>
              </div>
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
        </div>

        <div className="grid grid-cols-3 gap-2 mt-4 print:hidden">
          <button
            onClick={() => window.print()}
            className="focus-ring bg-brass hover:bg-brassDark text-white rounded-md py-2 text-xs font-semibold"
          >
            چاپ فاکتور
          </button>
          <button
            onClick={saveAsImage}
            disabled={saving}
            className="focus-ring bg-ink text-white rounded-md py-2 text-xs font-semibold disabled:opacity-60"
          >
            {saving ? 'در حال ساخت…' : 'ذخیره به‌صورت عکس'}
          </button>
          <button
            onClick={prepareSms}
            className="focus-ring bg-good text-white rounded-md py-2 text-xs font-semibold"
          >
            {copied ? 'متن کپی شد ✓' : 'آماده‌سازی پیامک'}
          </button>
        </div>
      </div>
    </div>
  );
}
