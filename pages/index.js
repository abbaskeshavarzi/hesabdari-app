import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import Layout from '../components/Layout';
import { CardSkeleton, ListSkeleton, SkeletonBar } from '../components/Skeleton';
import { formatJalaliShort } from '../lib/dateFormat';
import { friendlyError } from '../lib/errorMessages';
import { supabase } from '../lib/supabaseClient';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip);

function formatToman(n) {
  return new Intl.NumberFormat('fa-IR').format(Math.round(n || 0)) + ' تومان';
}

// نمودار ستونی فروش ۶ ماه اخیر با tooltip فارسی، جایگزین نمودار قبلی که با CSS خام ساخته شده بود
function SalesChart({ monthlyChart }) {
  const data = {
    labels: monthlyChart.map((b) => b.label),
    datasets: [
      {
        label: 'فروش',
        data: monthlyChart.map((b) => b.total),
        backgroundColor: '#B8873B',
        borderRadius: 6,
        maxBarThickness: 48,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    rtl: true,
    plugins: {
      legend: { display: false },
      tooltip: {
        rtl: true,
        titleFont: { family: 'Vazirmatn' },
        bodyFont: { family: 'Vazirmatn' },
        callbacks: {
          label: (ctx) => formatToman(ctx.parsed.y),
        },
      },
    },
    scales: {
      x: {
        reverse: true,
        ticks: { font: { family: 'Vazirmatn' } },
        grid: { display: false },
      },
      y: {
        beginAtZero: true,
        ticks: {
          font: { family: 'Vazirmatn' },
          callback: (v) => new Intl.NumberFormat('fa-IR', { notation: 'compact' }).format(v),
        },
        grid: { color: '#C7CCCB' },
      },
    },
  };

  return (
    <div style={{ height: '220px' }}>
      <Bar data={data} options={options} />
    </div>
  );
}

// دکمه‌ی «افزودن سریع»: یک دکمه‌ی اصلی برجسته (فاکتور، پرتکرارترین عمل) +
// یک فلش کوچیک کنارش برای دو گزینه‌ی دیگه (مشتری، هزینه).
// هر لینک با ?new=1 صفحه‌ی مقصد رو طوری باز می‌کنه که فرم افزودن از قبل بازه.
function QuickAddBar() {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative flex items-stretch mb-4 w-fit">
      <Link
        href="/invoices?new=1"
        className="focus-ring bg-brass hover:bg-brassDark text-white text-sm font-semibold rounded-s-md px-4 py-2.5"
      >
        + فاکتور جدید
      </Link>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="گزینه‌های بیشتر افزودن"
        aria-expanded={open}
        className="focus-ring bg-brass hover:bg-brassDark text-white rounded-e-md px-2.5 border-s border-white/25"
      >
        {open ? '▲' : '▼'}
      </button>
      {open && (
        <div className="absolute top-full mt-1 inset-x-0 sm:inset-x-auto sm:w-40 bg-surface border border-line rounded-md shadow-lg overflow-hidden z-10">
          <Link
            href="/customers?new=1"
            className="focus-ring block px-3 py-2 text-sm hover:bg-paper"
            onClick={() => setOpen(false)}
          >
            + مشتری جدید
          </Link>
          <Link
            href="/expenses?new=1"
            className="focus-ring block px-3 py-2 text-sm hover:bg-paper border-t border-line"
            onClick={() => setOpen(false)}
          >
            + هزینه جدید
          </Link>
        </div>
      )}
    </div>
  );
}

// نشانگر کوچیک روند فروش این ماه نسبت به ماه قبل (بالا/پایین/بدون تغییر)
function SalesTrend({ monthlyChart }) {
  if (!monthlyChart || monthlyChart.length < 2) return null;
  const current = monthlyChart[monthlyChart.length - 1].total;
  const previous = monthlyChart[monthlyChart.length - 2].total;
  if (!previous) return null;
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return <span className="text-[11px] text-ink/40 mr-1">بدون تغییر نسبت به ماه قبل</span>;
  const up = pct > 0;
  return (
    <span className={`text-[11px] mr-1 ${up ? 'text-goodText' : 'text-badText'}`}>
      {up ? '▲' : '▼'} {Math.abs(pct)}٪ نسبت به ماه قبل
    </span>
  );
}

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setError('');
    // به‌جای گرفتن کل جدول فاکتورها و مشتریان و محاسبه سمت مرورگر،
    // همه‌ی آمار داشبورد با یک درخواست از تابع دیتابیسی get_dashboard_stats گرفته می‌شه.
    // این باعث می‌شه با زیاد شدن تعداد فاکتورها، بارگذاری داشبورد کند نشه.
    const { data, error: rpcError } = await supabase.rpc('get_dashboard_stats');

    if (rpcError || !data) {
      setError(friendlyError(rpcError, 'خطا در بارگذاری آمار داشبورد. لطفاً صفحه را رفرش کنید.'));
      // stats را به یک حالت خالی (نه null) ست می‌کنیم تا Skeleton برای همیشه نمایش داده نشه
      // و کاربر به‌جای اسکلت بی‌پایان، صفحه‌ی خالی همراه پیام خطا رو ببینه.
      // مقادیر عددی خودشون هرگز مستقیم رندر نمی‌شن وقتی error ست شده (به‌جاش «—» نشون داده
      // می‌شه) تا با «۰ واقعی» اشتباه گرفته نشن.
      setStats({
        totalCustomers: 0,
        totalOwed: 0,
        monthSales: 0,
        recentInvoices: [],
        monthlyChart: [],
        topDebtors: [],
        overdueInvoices: [],
      });
      return;
    }

    const monthlyChart = (data.monthly_chart || []).map((b) => ({
      label: new Date(b.month_start).toLocaleDateString('fa-IR', { month: 'long' }),
      total: Number(b.total),
    }));

    setStats({
      totalCustomers: data.total_customers || 0,
      totalOwed: Number(data.total_owed) || 0,
      monthSales: Number(data.month_sales) || 0,
      recentInvoices: data.recent_invoices || [],
      monthlyChart,
      topDebtors: data.top_debtors || [],
      overdueInvoices: data.overdue_invoices || [],
    });
  }

  return (
    <Layout title="داشبورد">
      {error && (
        <div className="text-badText text-xs bg-bad/10 border border-bad/30 rounded-md px-3 py-2 mb-4">{error}</div>
      )}
      {/* دکمه‌ی افزودن سریع همیشه نمایش داده می‌شه، حتی موقع بارگذاری آمار،
          چون نیازی به داده‌ی آماری نداره و کاربر نباید برای شروع یه فاکتور جدید صبر کنه. */}
      <QuickAddBar />
      {!stats ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
          <div className="sm:col-span-3 bg-surface rounded-xl border border-line p-5">
            <SkeletonBar className="h-4 w-32 mb-4" />
            <SkeletonBar className="h-[180px] w-full" />
          </div>
          <div className="sm:col-span-3 grid sm:grid-cols-2 gap-4">
            <div className="bg-surface rounded-xl border border-line p-5">
              <SkeletonBar className="h-4 w-28 mb-3" />
              <ListSkeleton rows={4} />
            </div>
            <div className="bg-surface rounded-xl border border-line p-5">
              <SkeletonBar className="h-4 w-36 mb-3" />
              <ListSkeleton rows={4} />
            </div>
          </div>
          <div className="sm:col-span-3 bg-surface rounded-xl border border-line p-5">
            <SkeletonBar className="h-4 w-24 mb-3" />
            <ListSkeleton rows={5} />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-surface rounded-xl border border-line p-5">
            <div className="text-xs text-ink/50 mb-1">تعداد مشتریان</div>
            {/* در حالت خطا «—» نشون داده می‌شه، نه ۰، تا با «واقعاً صفر مشتری» اشتباه نشه */}
            <div className="text-2xl font-bold">{error ? '—' : stats.totalCustomers}</div>
          </div>
          <div className="bg-surface rounded-xl border border-line p-5">
            <div className="text-xs text-ink/50 mb-1">مطالبات باز</div>
            <div className="text-2xl font-bold text-badText">{error ? '—' : formatToman(stats.totalOwed)}</div>
          </div>
          <div className="bg-surface rounded-xl border border-line p-5">
            <div className="text-xs text-ink/50 mb-1">فروش این ماه</div>
            <div className="text-2xl font-bold text-goodText">{error ? '—' : formatToman(stats.monthSales)}</div>
            {!error && <SalesTrend monthlyChart={stats.monthlyChart} />}
          </div>
          <div className="sm:col-span-3 bg-surface rounded-xl border border-line p-5">
            <div className="text-sm font-semibold mb-4">روند فروش (۶ ماه اخیر)</div>
            <SalesChart monthlyChart={stats.monthlyChart} />
          </div>

          {(stats.topDebtors.length > 0 || stats.overdueInvoices.length > 0) && (
            <div className="sm:col-span-3 grid sm:grid-cols-2 gap-4">
              <div className="bg-surface rounded-xl border border-line p-5">
                <div className="text-sm font-semibold mb-3">بدهکارترین مشتریان</div>
                {stats.topDebtors.length === 0 ? (
                  <p className="text-xs text-ink/40">مطالبات بازی وجود ندارد.</p>
                ) : (
                  <ul className="text-sm divide-y divide-line">
                    {stats.topDebtors.map((b) => (
                      <li key={b.customer_id}>
                        {/* هر ردیف به صفحه‌ی مشتریان با جست‌وجوی از قبل پرشده لینک می‌شه،
                            به‌جای اینکه کاربر مجبور باشه دوباره اسم رو تایپ کنه */}
                        <Link
                          href={`/customers?search=${encodeURIComponent(b.name || '')}`}
                          className="focus-ring py-2 flex justify-between items-center hover:bg-paper -mx-1 px-1 rounded"
                        >
                          <span>{b.name}</span>
                          <span className="font-medium text-badText">{formatToman(b.balance)}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
                <Link href="/customers" className="focus-ring text-xs text-brass hover:underline block mt-3">
                  مشاهده همه مشتریان ←
                </Link>
              </div>
              <div className="bg-surface rounded-xl border border-line p-5">
                <div className="text-sm font-semibold mb-3">فاکتورهای معوق قدیمی (بیش از ۳۰ روز)</div>
                {stats.overdueInvoices.length === 0 ? (
                  <p className="text-xs text-ink/40">فاکتور معوق قدیمی‌ای وجود ندارد.</p>
                ) : (
                  <ul className="text-sm divide-y divide-line">
                    {stats.overdueInvoices.map((inv) => (
                      <li key={inv.id || inv.invoice_number}>
                        {/* لینک مستقیم به فاکتور (نه صرفاً به لیست کلی فاکتورها) */}
                        <Link
                          href={inv.id ? `/invoice-print?id=${inv.id}` : '/invoices'}
                          className="focus-ring py-2 flex justify-between items-center gap-2 hover:bg-paper -mx-1 px-1 rounded"
                        >
                          <span className="truncate">
                            {inv.customer_name || '—'} · {inv.invoice_number || ''}
                            <span className="text-[10px] text-badText mr-1">({inv.days_overdue} روز)</span>
                          </span>
                          <span className="font-medium whitespace-nowrap">{formatToman(inv.total_amount)}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
                <Link href="/invoices" className="focus-ring text-xs text-brass hover:underline block mt-3">
                  مشاهده همه فاکتورها ←
                </Link>
              </div>
            </div>
          )}

          <div className="sm:col-span-3 bg-surface rounded-xl border border-line p-5">
            <div className="text-sm font-semibold mb-3">آخرین فاکتورها</div>
            {stats.recentInvoices.length === 0 ? (
              <p className="text-xs text-ink/40">هنوز فاکتوری ثبت نشده است.</p>
            ) : (
              <ul className="text-sm divide-y divide-line">
                {stats.recentInvoices.map((inv, idx) => (
                  <li key={inv.id || idx}>
                    {/* قبلاً فقط تاریخ و مبلغ نشون داده می‌شد؛ الان نام مشتری و شماره فاکتور
                        هم اضافه شده و کل ردیف به خود فاکتور لینک می‌شه */}
                    <Link
                      href={inv.id ? `/invoice-print?id=${inv.id}` : '/invoices'}
                      className="focus-ring py-2 flex justify-between items-center gap-2 hover:bg-paper -mx-1 px-1 rounded"
                    >
                      <span className="truncate">
                        {inv.customer_name || '—'} · {inv.invoice_number || ''}
                        <span className="text-ink/40 text-xs mr-1">· {formatJalaliShort(inv.issue_date)}</span>
                      </span>
                      <span className="font-medium whitespace-nowrap">{formatToman(inv.total_amount)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </Layout>
  );
}
