// Read-only smoke probe. Do not pass secrets on command line or print response data.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(scriptDir, '../../.env');
const privateValues = {};
if (fs.existsSync(envPath)) {
  const envText = fs.readFileSync(envPath, 'utf8').replace(/^\uFEFF/, '');
  for (const line of envText.split(/\r?\n/)) {
    const separator = line.indexOf('=');
    if (separator < 1) continue;
    const name = line.slice(0, separator).trim();
    if (!['API_ODOO', 'ODOO_URL', 'ODOO_DATABASE'].includes(name)) continue;
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\s+#.*$/, '');
    }
    privateValues[name] = value;
  }
}

const url = process.env.ODOO_URL ?? privateValues.ODOO_URL ?? 'https://ioeb.odoo.com';
const key = process.env.API_ODOO ?? process.env.ODOO_API_KEY ?? privateValues.API_ODOO;
const database = process.env.ODOO_DATABASE ?? privateValues.ODOO_DATABASE;

if (!url || !key) {
  console.error('Set API_ODOO in ioe-api/.env or ODOO_API_KEY in private environment.');
  process.exitCode = 2;
} else {
  const endpoint = new URL('/json/2/res.company/search_read', url);
  if (endpoint.protocol !== 'https:' && endpoint.hostname !== 'localhost' && endpoint.hostname !== '127.0.0.1') {
    console.error('HTTPS required for non-local Odoo URL.');
    process.exitCode = 2;
  } else {
    const headers = {
      authorization: `bearer ${key}`,
      'content-type': 'application/json; charset=utf-8',
      'user-agent': 'ioe-odoo-readonly-probe/1',
    };
    if (database) headers['x-odoo-database'] = database;
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({ domain: [], fields: ['id'], limit: 1 }),
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) {
        console.error(`Odoo JSON-2 returned HTTP ${response.status}.`);
        process.exitCode = 1;
      } else {
        const rows = await response.json();
        if (!Array.isArray(rows)) throw new Error('Unexpected JSON-2 response shape');
        console.log(`Odoo JSON-2 read-only OK; company records returned: ${rows.length}.`);
      }
    } catch (error) {
      console.error(`Odoo JSON-2 probe failed: ${error.name}.`);
      process.exitCode = 1;
    }
  }
}
