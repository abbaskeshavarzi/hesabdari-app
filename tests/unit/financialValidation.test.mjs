import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isPositiveAmount,
  isValidDateRange,
  isBalancedJournalLines,
  isValidInvoiceItem,
} from '../../lib/financialValidation.mjs';

test('positive amount validation rejects zero, negative and non-numeric values', () => {
  assert.equal(isPositiveAmount(1), true);
  assert.equal(isPositiveAmount('1000'), true);
  assert.equal(isPositiveAmount(0), false);
  assert.equal(isPositiveAmount(-1), false);
  assert.equal(isPositiveAmount('abc'), false);
});

test('date range validation rejects missing or reversed ranges', () => {
  assert.equal(isValidDateRange('2026-09-01', '2026-09-19'), true);
  assert.equal(isValidDateRange('2026-09-19', '2026-09-01'), false);
  assert.equal(isValidDateRange('', '2026-09-19'), false);
});

test('journal validation requires at least two balanced positive lines', () => {
  assert.equal(isBalancedJournalLines([
    { debit: 100, credit: 0 },
    { debit: 0, credit: 100 },
  ]), true);
  assert.equal(isBalancedJournalLines([
    { debit: 100, credit: 0 },
    { debit: 0, credit: 90 },
  ]), false);
  assert.equal(isBalancedJournalLines([{ debit: 100, credit: 100 }]), false);
});

test('invoice item validation rejects invalid quantity, price and description', () => {
  assert.equal(isValidInvoiceItem({ product_name: 'کالا', quantity: 1, unit_price: 100 }), true);
  assert.equal(isValidInvoiceItem({ product_name: 'کالا', quantity: 0, unit_price: 100 }), false);
  assert.equal(isValidInvoiceItem({ product_name: 'کالا', quantity: 1, unit_price: -1 }), false);
  assert.equal(isValidInvoiceItem({ product_name: '', quantity: 1, unit_price: 100 }), false);
});
