import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const src=readFileSync(new URL('../../api/sii/point-outbox-run.js',import.meta.url),'utf8');
const vercel=JSON.parse(readFileSync(new URL('../../vercel.json',import.meta.url),'utf8'));
test('outbox endpoint cannot run in production and is disabled by default',()=>{
 assert.match(src,/process\.env\.VERCEL_ENV!=='preview'/);
 assert.match(src,/process\.env\.SII_POINT_OUTBOX_PREVIEW_ENABLED!=='true'/);
 assert.match(src,/configured\.length<32/);
 assert.match(src,/x-sii-outbox-secret/);
 assert.doesNotMatch(src,/emitirBoleta|recordPayment|crm_finalize_point_sale/);
});
test('outbox route is explicit before fallback',()=>{
 const i=vercel.rewrites.findIndex(x=>x.source==='/api/sii/point-outbox-run');
 const fallback=vercel.rewrites.findIndex(x=>x.source==='/(.*)');
 assert.ok(i>=0&&i<fallback);
});
