import { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import { supabase } from '../lib/supabaseClient';

export default function Settings() {
  const [form, setForm] = useState({ name: '', phone: '', address: '', logo_url: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('business_settings').select('*').eq('id', 'default').single();
    if (data) {
      setForm({
        name: data.name || '',
        phone: data.phone || '',
        address: data.address || '',
        logo_url: data.logo_url || '',
      });
    }
    setLoading(false);
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    const { error } = await supabase
      .from('business_settings')
      .update({
        name: form.name,
        phone: form.phone,
        address: form.address,
        updated_at: new Date().toISOString(),
      })
      .eq('id', 'default');
    setSaving(false);
    if (error) return setError('خطا در ذخیره تنظیمات.');
    setMessage('تنظیمات ذخیره شد.');
  }

  async function handleLogoUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    setSaving(true);
    setError('');
    const ext = file.name.split('.').pop();
    const path = 'logo.' + ext;
    const { error: uploadErr } = await supabase.storage.from('logos').upload(path, file, {
      upsert: true,
      cacheControl: '3600',
    });
    if (uploadErr) {
      setSaving(false);
      return setError('خطا در آپلود لوگو.');
    }
    const { data: pub } = supabase.storage.from('logos').getPublicUrl(path);
    const logoUrl = pub.publicUrl + '?t=' + Date.now();
    const { error: updateErr } = await supabase
      .from('business_settings')
      .update({ logo_url: logoUrl })
      .eq('id', 'default');
    setSaving(false);
    if (updateErr) return setError('خطا در ذخیره لوگو.');
    setForm((f) => ({ ...f, logo_url: logoUrl }));
    setMessage('لوگو با موفقیت ذخیره شد.');
  }

  return (
    <Layout title="تنظیمات کسب‌وکار">
      {loading ? (
        <p className="text-ink/50 text-sm">در حال بارگذاری…</p>
      ) : (
        <div className="max-w-xl">
          {error && <div className="text-bad text-xs bg-bad/10 rounded-md px-3 py-2 mb-4">{error}</div>}
          {message && <div className="text-good text-xs bg-good/10 rounded-md px-3 py-2 mb-4">{message}</div>}

          <div className="bg-white border border-line rounded-xl p-5 mb-6">
            <div className="text-sm font-semibold mb-3">لوگوی کسب‌وکار</div>
            <div className="flex items-center gap-4">
              {form.logo_url ? (
                <img src={form.logo_url} alt="لوگو" className="w-16 h-16 rounded-md object-contain border border-line bg-paper" />
              ) : (
                <div className="w-16 h-16 rounded-md border border-dashed border-line flex items-center justify-center text-xs text-ink/40">
                  بدون لوگو
                </div>
              )}
              <label className="focus-ring cursor-pointer text-sm text-brass hover:underline">
                {form.logo_url ? 'تغییر لوگو' : 'آپلود لوگو'}
                <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
              </label>
            </div>
            <p className="text-xs text-ink/40 mt-3">این لوگو روی فاکتور چاپی نمایش داده می‌شود.</p>
          </div>

          <form onSubmit={handleSave} className="bg-white border border-line rounded-xl p-5 space-y-3">
            <div>
              <label className="block text-xs text-ink/60 mb-1">نام کسب‌وکار</label>
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
                dir="ltr"
                className="focus-ring w-full rounded-md border border-line px-3 py-2 text-sm"
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
            <button
              disabled={saving}
              className="focus-ring bg-ink text-white text-sm rounded-md px-4 py-2 font-semibold disabled:opacity-60"
            >
              {saving ? 'در حال ذخیره…' : 'ذخیره تنظیمات'}
            </button>
          </form>
        </div>
      )}
    </Layout>
  );
}
