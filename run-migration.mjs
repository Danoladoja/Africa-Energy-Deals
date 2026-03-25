import fs from 'fs';
import pg from 'pg';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.log('No DATABASE_URL found, skipping migration');
  process.exit(0);
}

const sqlFile = './migration-to-production.sql';
if (!fs.existsSync(sqlFile)) {
  console.log('No migration file found, skipping');
  process.exit(0);
}

console.log('Running migration-to-production.sql...');
const sql = fs.readFileSync(sqlFile, 'utf-8');
const client = new pg.Client({ connectionString: databaseUrl });

try {
  await client.connect();
  await client.query(sql);
  console.log('Migration completed successfully!');

  const result = await client.query('SELECT COUNT(*) as count FROM energy_projects');
  console.log('Total projects in database:', result.rows[0].count);
} catch (err) {
  console.error('Migration failed:', err.message);
  process.exit(1);
} finally {
  await client.end();
}
