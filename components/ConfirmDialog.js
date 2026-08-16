import { useEffect, useRef } from 'react';

/**
 * مودال تأیید عمومی (برای حذف یا هر عملیات حساس دیگر).
 * از تگ بومی <dialog> استفاده می‌کند: مرورگر خودش فوکوس‌تراپ و بستن با کلید Esc
 * را مدیریت می‌کند، پس نیازی به کد دستی برای این دو مورد نیست.
 *
 * استفاده:
 *   <ConfirmDialog
 *     open={confirmState.open}
 *     title="حذف فاکتور"
 *     description="این فاکتور حذف شود؟ ..."
 *     onConfirm={doDelete}
 *     onCancel={() => setConfirmState({ open: false })}
 *   />
 */
export default function ConfirmDialog({
  open,
  title = 'تأیید عملیات',
  description = '',
  confirmLabel = 'حذف',
  cancelLabel = 'انصراف',
  danger = true,
  busy = false,
  onConfirm,
  onCancel,
}) {
  const dialogRef = useRef(null);
  const titleId = 'confirm-dialog-title';
  const descId = 'confirm-dialog-desc';

  // باز/بسته کردن واقعی دیالوگ را با متدهای بومی showModal/close انجام می‌دیم
  // (نه با حذف/افزودن از DOM)، چون این متدها فوکوس‌تراپ و مدیریت لایه‌ی مودال
  // (کنار همه‌ی محتوای صفحه با inert خودکار) را به‌صورت داخلی مرورگر انجام می‌دن.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  // کلید Esc رویداد "cancel" رو خودکار شلیک می‌کنه؛ همون مسیر لغو رو صدا می‌زنیم
  // تا وضعیت والد (state) هم با بسته‌شدن واقعی دیالوگ هماهنگ بمونه.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    function handleCancel(e) {
      e.preventDefault();
      if (!busy) onCancel && onCancel();
    }
    dialog.addEventListener('cancel', handleCancel);
    return () => dialog.removeEventListener('cancel', handleCancel);
  }, [onCancel, busy]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      className="confirm-dialog"
      onClick={(e) => {
        // کلیک روی پس‌زمینه (::backdrop) باعث میشه target خودِ عنصر dialog باشه
        // (نه محتوای داخلیش)، پس با این شرط می‌شه کلیک بیرون از جعبه رو تشخیص داد.
        if (e.target === dialogRef.current && !busy) {
          onCancel && onCancel();
        }
      }}
    >
      <div className="p-5 w-[min(90vw,380px)]" dir="rtl">
        <h2 id={titleId} className="text-sm font-semibold mb-2">{title}</h2>
        {description && (
          <p id={descId} className="text-xs text-ink/60 mb-5 leading-6">{description}</p>
        )}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            autoFocus
            disabled={busy}
            onClick={onCancel}
            className="focus-ring text-sm rounded-md px-4 py-2 font-semibold border border-line disabled:opacity-60"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className={`focus-ring text-sm rounded-md px-4 py-2 font-semibold text-white disabled:opacity-60 ${
              danger ? 'bg-bad hover:bg-bad/90' : 'bg-ink hover:bg-ink/90'
            }`}
          >
            {busy ? 'در حال انجام…' : confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
