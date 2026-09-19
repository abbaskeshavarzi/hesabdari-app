import fs from 'node:fs';
import path from 'node:path';

const roots = ['pages', 'components', 'lib', 'tests'];
const extensions = new Set(['.js', '.mjs', '.jsx']);
const ignored = new Set(['node_modules', '.next', 'out', '.git']);
const findings = [];

function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (extensions.has(path.extname(entry.name))) checkFile(full);
  }
}

function checkFile(file) {
  const text = fs.readFileSync(file, 'utf8');
  const rules = [
    [/\bdebugger\s*;/, 'debugger statement found'],
    [/console\.log\s*\(/, 'console.log found; use controlled error/reporting paths'],
    [/SUPABASE_SERVICE_ROLE_KEY|NEXT_PUBLIC_SUPABASE_SERVICE_ROLE|service_role/i, 'service-role secret reference found in application source'],
  ];
  for (const [pattern, message] of rules) {
    if (pattern.test(text)) findings.push(`${file}: ${message}`);
  }
}

for (const root of roots) walk(root);

if (findings.length) {
  console.error(findings.join('\n'));
  process.exit(1);
}

console.log('Static lint gate passed.');
