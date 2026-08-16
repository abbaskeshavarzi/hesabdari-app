import { useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient';

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError('ایمیل یا رمز عبور اشتباه است.');
      return;
    }
    router.replace('/');
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-paper px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm bg-surface rounded-xl border border-line p-8 shadow-sm">
        <div className="text-center mb-6">
          <div className="text-lg font-bold text-ink">دفتر حساب</div>
          <div className="text-xs text-ink/50 mt-1">ورود به پنل مدیریت</div>
        </div>
        {error && (
          <div className="text-badText text-xs bg-bad/10 border border-bad/30 rounded-md px-3 py-2 mb-4">{error}</div>
        )}
        <label className="block text-xs text-ink/60 mb-1">ایمیل</label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="focus-ring w-full rounded-md border border-line px-3 py-2 text-sm mb-4"
          placeholder="you@example.com"
        />
        <label className="block text-xs text-ink/60 mb-1">رمز عبور</label>
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="focus-ring w-full rounded-md border border-line px-3 py-2 text-sm mb-6"
          placeholder="••••••••"
        />
        <button
          type="submit"
          disabled={loading}
          className="focus-ring w-full bg-brass hover:bg-brassDark transition-colors text-white rounded-md py-2 text-sm font-semibold disabled:opacity-60"
        >
          {loading ? 'در حال ورود…' : 'ورود'}
        </button>
      </form>
    </div>
  );
}
