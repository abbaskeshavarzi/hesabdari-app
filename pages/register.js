import { useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { supabase } from '../lib/supabaseClient';

export default function Register() {
  const router=useRouter(); const [email,setEmail]=useState(''); const [password,setPassword]=useState('');
  const [organizationName,setOrganizationName]=useState(''); const [error,setError]=useState(''); const [message,setMessage]=useState(''); const [loading,setLoading]=useState(false);
  async function submit(e){
    e.preventDefault(); setError(''); setMessage(''); setLoading(true);
    if(password.length<8){setError('رمز عبور باید حداقل ۸ کاراکتر باشد.');setLoading(false);return;}
    const origin=window.location.origin; const base=process.env.NEXT_PUBLIC_BASE_PATH||'';
    const {data,error}=await supabase.auth.signUp({email:email.trim(),password,options:{data:{organization_name:organizationName.trim()||'کسب‌وکار جدید'},emailRedirectTo:origin+base+'/'}});
    setLoading(false);
    if(error){setError('ثبت‌نام انجام نشد. لطفاً اطلاعات را بررسی کنید.');return;}
    if(data.session) router.replace('/'); else setMessage('حساب ساخته شد. لطفاً ایمیل تأیید را بررسی کنید.');
  }
  return <div className="min-h-screen flex items-center justify-center bg-paper px-4"><form onSubmit={submit} className="w-full max-w-sm bg-surface rounded-xl border border-line p-8 shadow-sm">
    <div className="text-center mb-6"><div className="text-lg font-bold">ساخت حساب</div><div className="text-xs text-ink/50 mt-1">ایجاد فضای کسب‌وکار شما</div></div>
    {error&&<div className="text-badText text-xs bg-bad/10 border border-bad/30 rounded-md px-3 py-2 mb-4">{error}</div>}
    {message&&<div className="text-goodText text-xs bg-good/10 border border-good/30 rounded-md px-3 py-2 mb-4">{message}</div>}
    <label className="block text-xs text-ink/60 mb-1">نام کسب‌وکار</label><input value={organizationName} onChange={e=>setOrganizationName(e.target.value)} className="focus-ring w-full rounded-md border border-line px-3 py-2 text-sm mb-4" placeholder="مثلاً فروشگاه من" />
    <label className="block text-xs text-ink/60 mb-1">ایمیل</label><input type="email" required value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email" className="focus-ring w-full rounded-md border border-line px-3 py-2 text-sm mb-4" />
    <label className="block text-xs text-ink/60 mb-1">رمز عبور</label><input type="password" required minLength={8} value={password} onChange={e=>setPassword(e.target.value)} autoComplete="new-password" className="focus-ring w-full rounded-md border border-line px-3 py-2 text-sm mb-6" />
    <button disabled={loading} className="focus-ring w-full bg-brass hover:bg-brassDark text-white rounded-md py-2 text-sm font-semibold disabled:opacity-60">{loading?'در حال ساخت…':'ثبت‌نام'}</button>
    <div className="text-xs text-center mt-4"><Link href="/login" className="text-brass hover:underline">قبلاً حساب دارید؟ ورود</Link></div>
  </form></div>;
}
