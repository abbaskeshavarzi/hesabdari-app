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
        <div className="text-bad text-xs bg-bad/10 border border-bad/30 rounded-md px-3 py-2 mb-4">{error}</div>
      )}
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
            <div className="text-2xl font-bold">{stats.totalCustomers}</div>
          </div>
          <div className="bg-surface rounded-xl border border-line p-5">
            <div className="text-xs text-ink/50 mb-1">مطالبات باز</div>
            <div className="text-2xl font-bold text-bad">{formatToman(stats.totalOwed)}</div>
          </div>
          <div className="bg-surface rounded-xl border border-line p-5">
            <div className="text-xs text-ink/50 mb-1">فروش این ماه</div>
            <div className="text-2xl font-bold text-good">{formatToman(stats.monthSales)}</div>
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
                      <li key={b.customer_id} className="py-2 flex justify-between items-center">
                        <span>{b.name}</span>
                        <span className="font-medium text-bad">{formatToman(b.balance)}</span>
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
                    {stats.overdueInvoices.map((inv, idx) => (
                      <li key={idx} className="py-2 flex justify-between items-center gap-2">
                        <span className="truncate">
                          {inv.customer_name || '—'} · {inv.invoice_number || ''}
                          <span className="text-[10px] text-bad mr-1">({inv.days_overdue} روز)</span>
                        </span>
                        <span className="font-medium whitespace-nowrap">{formatToman(inv.total_amount)}</span>
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
                  <li key={idx} className="py-2 flex justify-between">
                    <span>{formatJalaliShort(inv.issue_date)}</span>
                    <span className="font-medium">{formatToman(inv.total_amount)}</span>
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
