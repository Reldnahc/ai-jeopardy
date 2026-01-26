import { createClient } from "@supabase/supabase-js";

// Replace these values with your Supabase project details found in the Supabase dashboard
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL; // Your Supabase URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY; // anon key safe.

export const supabase = createClient(supabaseUrl, supabaseKey);