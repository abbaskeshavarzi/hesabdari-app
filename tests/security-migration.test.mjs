import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(new URL('../supabase-migration-12-security-hardening.sql', import.meta.url), 'utf8');
const backupPage = readFileSync(new URL('../pages/backup.js', import.meta.url), 'utf8');
const workflow = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');

test('security migration scopes every business table by user_id', () => {
  for (const table of [
    'customers',
    'products',
    'invoices',
    'payments',
    'stock_movements',
    'invoice_items',
    'expenses',
    'business_settings',
  ]) {
    assert.match(migration, new RegExp(`alter table ${table} add column if not exists user_id`));
    assert.match(migration, new RegExp(`select private_user_policy\\('${table}'\\)`));
  }
});

test('security migration limits storage writes to authenticated user folder', () => {
  assert.match(migration, /allowed_mime_types = array\['image\/png', 'image\/jpeg', 'image\/webp'\]/);
  assert.match(migration, /file_size_limit = 2097152/);
  assert.match(migration, /storage\.foldername\(name\)\)\[1\] = auth\.uid\(\)::text/);
  assert.match(migration, /alter table business_settings alter column id set default auth\.uid\(\)::text/);
});

test('backup import rewrites restored rows to the current authenticated user', () => {
  assert.match(backupPage, /function rowsForCurrentUser/);
  assert.match(backupPage, /user_id: userId/);
  assert.match(backupPage, /supabase\.auth\.getUser\(\)/);
});

test('ci runs the project test suite before build', () => {
  assert.match(workflow, /npm ci/);
  assert.match(workflow, /npm test/);
  assert.match(workflow, /npm run build/);
});
