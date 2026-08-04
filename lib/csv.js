// ساخت و دانلود فایل CSV از یک آرایه از داده‌ها
// یک BOM اضافه می‌شود تا اکسل متن فارسی را درست (UTF-8) نمایش دهد
export function downloadCsv(filename, headers, rows) {
  const escape = (val) => {
    const s = val === null || val === undefined ? '' : String(val);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  };
  const lines = [headers.map(escape).join(',')];
  rows.forEach((row) => {
    lines.push(row.map(escape).join(','));
  });
  const csvContent = '\uFEFF' + lines.join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
