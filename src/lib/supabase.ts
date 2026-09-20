import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
  throw new Error(
    "Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY. " +
    "Create a .env file at the project root — see SETUP.md.",
  );
}

/**
 * This client uses the PUBLISHABLE key, which respects Row Level Security.
 * It is safe to ship to the browser — RLS is what actually enforces that a
 * player can only write their own promotion's data (see db/schema-v2.sql).
 *
 * NEVER import the secret (sb_secret_...) key here or anywhere under src/.
 * That key bypasses RLS entirely and belongs only in server-side contexts
 * (Supabase Edge Functions), configured through Supabase's own env store.
 */
export const supabase = createClient(url, key);
