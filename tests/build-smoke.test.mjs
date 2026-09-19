import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const out = path.resolve('out');
const routes = ['login', 'register', 'forgot-password', 'reset-password', 'customers', 'products', 'inventory', 'invoices', 'payments', 'expenses', 'reports'];

test('production export contains all critical route entrypoints', () => {
  assert.equal(fs.existsSync(out), true, 'out/ does not exist; run npm run build first');
  for (const route of routes) {
    const file = path.join(out, route, 'index.html');
    assert.equal(fs.existsSync(file), true, `missing static route: /${route}/`);
  }
});
