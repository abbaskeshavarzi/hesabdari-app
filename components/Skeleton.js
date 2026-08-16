// کامپوننت‌های مشترک «اسکلت بارگذاری» — جایگزین متن ساده‌ی «در حال بارگذاری…»
// در حالت آماده، کاربر شکل کلی جدول/کارت‌ها رو زودتر می‌بینه و حس کندی کمتر می‌شه.

export function SkeletonBar({ className = '' }) {
  return <div className={`animate-pulse rounded bg-ink/10 ${className}`} />;
}

// برای استفاده داخل <tbody> جدول‌ها: چند ردیف با ستون‌های مشخص
export function TableSkeleton({ columns, rows = 5 }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={r}>
          {Array.from({ length: columns }).map((__, c) => (
            <td key={c}>
              <SkeletonBar className="h-4 w-full max-w-[110px]" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

// برای کارت‌های آماری (مثل داشبورد)
export function CardSkeleton({ className = '' }) {
  return (
    <div className={`bg-surface rounded-xl border border-line p-5 ${className}`}>
      <SkeletonBar className="h-3 w-20 mb-3" />
      <SkeletonBar className="h-6 w-28" />
    </div>
  );
}

// برای لیست‌های ساده (مثل بدهکارترین مشتریان، آخرین فاکتورها)
export function ListSkeleton({ rows = 4 }) {
  return (
    <ul className="divide-y divide-line">
      {Array.from({ length: rows }).map((_, r) => (
        <li key={r} className="py-2.5 flex justify-between items-center gap-3">
          <SkeletonBar className="h-4 w-24" />
          <SkeletonBar className="h-4 w-16" />
        </li>
      ))}
    </ul>
  );
}
