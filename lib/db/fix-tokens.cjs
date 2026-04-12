// fix-tokens.cjs - Pre-migration fix for user_emails unsubscribe_token
const { Client } = require("pg");

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  try {
    await client.connect();
    console.log("[fix-tokens] Connected to database");

    // Fill in unique tokens for any null/empty values
    const upd = await client.query(
      "UPDATE user_emails SET unsubscribe_token = gen_random_uuid()::text WHERE unsubscribe_token IS NULL OR unsubscribe_token = ''"
    );
    console.log("[fix-tokens] Updated " + upd.rowCount + " rows with unique tokens");

    // Add the unique constraint if it does not exist
    await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'user_emails_unsubscribe_token_unique'
        ) THEN
          ALTER TABLE user_emails
            ADD CONSTRAINT user_emails_unsubscribe_token_unique UNIQUE (unsubscribe_token);
          RAISE NOTICE 'Constraint added';
        END IF;
      END $$;
    `);
    console.log("[fix-tokens] Constraint ensured");
  } catch (err) {
    console.error("[fix-tokens] Error:", err.message);
  } finally {
    await client.end();
  }
}

main();
