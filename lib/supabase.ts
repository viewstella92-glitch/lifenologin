import { createClient } from '@supabase/supabase-js'

// Only the public anon key goes here. Never put the service_role key in browser code.
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)
