import test from 'node:test';
import assert from 'node:assert/strict';
import { classifySupabaseRequest } from '../../lib/monitoring.js';

test('monitoring classifies Supabase authentication requests', () => {
  assert.equal(classifySupabaseRequest('https://example.supabase.co/auth/v1/token'), 'authentication');
});

test('monitoring classifies RPC requests without exposing query parameters', () => {
  assert.equal(classifySupabaseRequest('https://example.supabase.co/rest/v1/rpc/post_invoice?x=1'), 'rpc');
});

test('monitoring classifies database REST requests', () => {
  assert.equal(classifySupabaseRequest('https://example.supabase.co/rest/v1/invoices'), 'database');
});
