import { test, expect } from '@playwright/test';
import crypto from 'node:crypto';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const USER_A = { email: process.env.E2E_USER_A_EMAIL, password: process.env.E2E_USER_A_PASSWORD };
const USER_B = { email: process.env.E2E_USER_B_EMAIL, password: process.env.E2E_USER_B_PASSWORD };

test.beforeAll(() => {
  for (const entry of Object.entries({ NEXT_PUBLIC_SUPABASE_URL: SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY: SUPABASE_ANON_KEY, E2E_USER_A_EMAIL: USER_A.email, E2E_USER_A_PASSWORD: USER_A.password, E2E_USER_B_EMAIL: USER_B.email, E2E_USER_B_PASSWORD: USER_B.password })) {
    if (!entry[1]) throw new Error('Missing required E2E secret: ' + entry[0]);
  }
});

async function login(page, credentials) {
  await page.goto('/login/');
  await page.getByLabel('ایمیل').fill(credentials.email);
  await page.getByLabel('رمز عبور').fill(credentials.password);
  await page.getByRole('button', { name: 'ورود' }).click();
  await expect(page).not.toHaveURL(/\/login\/?$/);
}

async function getAccessToken(page) {
  return page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => k.startsWith('sb-') && k.endsWith('-auth-token'));
    if (!key) throw new Error('Supabase auth storage entry was not found');
    const parsed = JSON.parse(localStorage.getItem(key));
    if (!parsed || !parsed.access_token) throw new Error('Supabase access token was not found');
    return parsed.access_token;
  });
}

async function apiRequest(page, path, options = {}) {
  const token = await getAccessToken(page);
  const response = await page.request.fetch(SUPABASE_URL + path + (options.query || ''), {
    method: options.method || 'GET',
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    data: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  let json = null;
  try { json = await response.json(); } catch {}
  return { response, json };
}

async function loginAndCollect(page, credentials) {
  await login(page, credentials);
  const org = await apiRequest(page, '/rest/v1/organization_members', { query: '?select=organization_id&limit=10' });
  expect(org.response.ok(), await org.response.text()).toBeTruthy();
  const memberships = org.json || [];
  expect(memberships.length).toBeGreaterThan(0);
  return { organizationIds: [...new Set(memberships.map((m) => m.organization_id))] };
}

async function visibleIds(page, table) {
  const result = await apiRequest(page, '/rest/v1/' + table, { query: '?select=id&limit=20' });
  expect(result.response.ok(), await result.response.text()).toBeTruthy();
  return (result.json || []).map((row) => row.id).filter(Boolean);
}

async function crossTenantSelect(page, table, organizationId) {
  return apiRequest(page, '/rest/v1/' + table, { query: '?select=id,organization_id&organization_id=eq.' + organizationId + '&limit=20' });
}

async function crossTenantInsertCustomer(page, organizationId) {
  const marker = 'PHASE2_SECURITY_TEST_' + Date.now() + '_' + crypto.randomUUID();
  return apiRequest(page, '/rest/v1/customers', {
    method: 'POST',
    body: { id: crypto.randomUUID(), organization_id: organizationId, name: marker, notes: marker },
  });
}

test('real authenticated users are isolated from each other', async ({ browser }) => {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();
  try {
    const a = await loginAndCollect(pageA, USER_A);
    const b = await loginAndCollect(pageB, USER_B);
    expect(a.organizationIds.length).toBe(1);
    expect(b.organizationIds.length).toBe(1);
    expect(a.organizationIds[0]).not.toBe(b.organizationIds[0]);
    const aOrg = a.organizationIds[0];
    const bOrg = b.organizationIds[0];
    const aVisible = await Promise.all(['customers', 'products', 'invoices'].map((t) => visibleIds(pageA, t)));
    const bVisible = await Promise.all(['customers', 'products', 'invoices'].map((t) => visibleIds(pageB, t)));

    for (const table of ['organizations','organization_members','customers','suppliers','products','warehouses','warehouse_stock','stock_movements','invoices','invoice_items','payments','expenses','financial_accounts','chart_of_accounts','journal_entries','journal_lines','audit_logs']) {
      const aToB = await crossTenantSelect(pageA, table, bOrg);
      expect(aToB.response.ok() || aToB.response.status() === 403, 'A -> B ' + table + ' HTTP ' + aToB.response.status()).toBeTruthy();
      if (aToB.response.ok()) expect(aToB.json || [], 'A can see B rows in ' + table).toEqual([]);
      const bToA = await crossTenantSelect(pageB, table, aOrg);
      expect(bToA.response.ok() || bToA.response.status() === 403, 'B -> A ' + table + ' HTTP ' + bToA.response.status()).toBeTruthy();
      if (bToA.response.ok()) expect(bToA.json || [], 'B can see A rows in ' + table).toEqual([]);
    }

    const bInsertA = await crossTenantInsertCustomer(pageB, aOrg);
    expect([401,403,409].includes(bInsertA.response.status())).toBeTruthy();
    const aInsertB = await crossTenantInsertCustomer(pageA, bOrg);
    expect([401,403,409].includes(aInsertB.response.status())).toBeTruthy();

    for (const item of [
      ['get_dashboard_stats', {}],
      ['get_reports_data', { p_from: '2000-01-01', p_to: '2100-01-01', p_page: 1, p_page_size: 50 }],
      ['get_inventory_report_page', { p_page: 1, p_page_size: 50 }],
      ['get_cash_flow_transactions', { p_from: '2000-01-01', p_to: '2100-01-01', p_page: 1, p_page_size: 50 }],
    ]) {
      const resultA = await apiRequest(pageA, '/rest/v1/rpc/' + item[0], { method: 'POST', body: item[1] });
      expect(resultA.response.ok(), 'A RPC ' + item[0] + ' HTTP ' + resultA.response.status()).toBeTruthy();
      expect(JSON.stringify(resultA.json || '')).not.toContain(bOrg);
      const resultB = await apiRequest(pageB, '/rest/v1/rpc/' + item[0], { method: 'POST', body: item[1] });
      expect(resultB.response.ok(), 'B RPC ' + item[0] + ' HTTP ' + resultB.response.status()).toBeTruthy();
      expect(JSON.stringify(resultB.json || '')).not.toContain(aOrg);
    }

    expect(aVisible.flat().length).toBeGreaterThan(0);
    expect(bVisible.flat().length).toBeGreaterThan(0);
  } finally {
    await contextA.close();
    await contextB.close();
  }
});
