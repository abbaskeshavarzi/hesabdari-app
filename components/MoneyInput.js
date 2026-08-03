function formatNumber(v) {
  if (v === '' || v === null || v === undefined) return '';
  const digits = String(v).replace(/[^0-9]/g, '');
  if (!digits) return '';
  return new Intl.NumberFormat('en-US').format(Number(digits));
}

// ورودی مبلغ که هنگام تایپ، عدد را به‌صورت سه‌رقم سه‌رقم (۱,۲۵۰,۰۰۰) نمایش می‌دهد
// مقدار واقعی (بدون کاما) از طریق onChange به بیرون داده می‌شود
export default function MoneyInput({ value, onChange, className, placeholder }) {
  function handleChange(e) {
    const raw = e.target.value.replace(/[^0-9]/g, '');
    onChange(raw);
  }
  return (
    <input
      type="text"
      inputMode="numeric"
      dir="ltr"
      value={formatNumber(value)}
      onChange={handleChange}
      className={className}
      placeholder={placeholder}
    />
  );
}
