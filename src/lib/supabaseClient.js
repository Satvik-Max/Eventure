import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://vnequodfvykmlafcratu.supabase.co';
const supabaseAnonKey ='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZuZXF1b2RmdnlrbWxhZmNyYXR1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDk3NDg0MjIsImV4cCI6MjA2NTMyNDQyMn0.lkRMwlPKAbiRT9kVRp5EqOjqrfewv2RKFXu4NWL2O5w';
export const supabase = createClient(supabaseUrl, supabaseAnonKey , {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  }
});
