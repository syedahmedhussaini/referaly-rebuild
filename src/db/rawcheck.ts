import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { db } from './client';
async function main() {
  // Mimic drizzle's relational query: geometry inside json_build_array
  const r = await db.execute(sql`SELECT json_build_array(geom) AS j FROM locations LIMIT 1`);
  const v = (r.rows as any[])[0].j;
  console.log('json_build_array(geom) =>', JSON.stringify(v).slice(0, 120));
  // And the text cast for comparison
  const r2 = await db.execute(sql`SELECT geom::text AS t FROM locations LIMIT 1`);
  console.log('geom::text =>', JSON.stringify((r2.rows as any[])[0].t).slice(0, 120));
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
