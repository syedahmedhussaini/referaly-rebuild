import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { db } from './client';
async function main() {
  const r = await db.execute(sql`SELECT id, geom FROM locations ORDER BY id`);
  for (const row of (r.rows as any[])) {
    const v = row.geom;
    console.log(row.id.slice(0,8), '| type:', typeof v, '| len:', v == null ? 'null' : String(v).length, '| val:', JSON.stringify(String(v)).slice(0, 80));
  }
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
