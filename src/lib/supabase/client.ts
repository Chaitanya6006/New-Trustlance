import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const supabaseUrl =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) ||
  (import.meta.env.NEXT_PUBLIC_SUPABASE_URL as string | undefined) ||
  "";

const supabaseKey =
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ||
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ||
  (import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string | undefined) ||
  "";

if (!supabaseUrl || !supabaseKey) {
  console.warn(
    "[TrustLance] Missing Supabase environment variables. Please check your .env.local configuration (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY or VITE_SUPABASE_PUBLISHABLE_KEY).",
  );
}

export const supabase = createClient<Database>(supabaseUrl, supabaseKey);
