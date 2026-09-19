export function isPositiveAmount(value) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0;
}

export function isValidDateRange(from, to) {
  if (!from || !to) return false;
  return String(from) <= String(to);
}

export function isBalancedJournalLines(lines) {
  if (!Array.isArray(lines) || lines.length < 2) return false;
  const debit = lines.reduce((sum, line) => sum + Number(line?.debit || 0), 0);
  const credit = lines.reduce((sum, line) => sum + Number(line?.credit || 0), 0);
  return debit > 0 && debit === credit;
}

export function isValidInvoiceItem(item) {
  if (!item || typeof item !== 'object') return false;
  const quantity = Number(item.quantity);
  const unitPrice = Number(item.unit_price);
  return Boolean(String(item.product_name || '').trim()) &&
    Number.isFinite(quantity) && quantity > 0 &&
    Number.isFinite(unitPrice) && unitPrice >= 0;
}
