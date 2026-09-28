import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { db } from './client';
async function main() {
  const r = await db.execute(sql`SELECT geom FROM locations LIMIT 1`);
  const v = (r.rows as any[])[0].geom;
  console.log('typeof:', typeof v);
  console.log('isBuffer:', Buffer.isBuffer(v));
  console.log('value:', JSON.stringify(String(v)).slice(0, 120));
  console.log('length:', String(v).length);
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
