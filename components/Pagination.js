// کامپوننت صفحه‌بندی ساده و قابل‌استفاده در همه‌ی جدول‌های اپ

export default function Pagination({ page, totalPages, onChange, totalCount, pageSize }) {
  if (totalPages <= 1) return null;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, totalCount);

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-line text-sm flex-wrap">
      <div className="text-ink/50 text-xs">
        {from}–{to} از {totalCount}
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onChange(page - 1)}
          disabled={page <= 1}
          className="focus-ring rounded-md border border-line px-3 py-1.5 text-xs disabled:opacity-40 disabled:cursor-not-allowed"
        >
          قبلی
        </button>
        <span className="text-xs text-ink/60 min-w-[3.5rem] text-center">
          صفحه {page} از {totalPages}
        </span>
        <button
          onClick={() => onChange(page + 1)}
          disabled={page >= totalPages}
          className="focus-ring rounded-md border border-line px-3 py-1.5 text-xs disabled:opacity-40 disabled:cursor-not-allowed"
        >
          بعدی
        </button>
      </div>
    </div>
  );
}
