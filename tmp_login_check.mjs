import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL || 'https://geapxdyyfmygqrqfnier.supabase.co';
const anon = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdlYXB4ZHl5Zm15Z3FycWZuaWVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ3NDYwNjksImV4cCI6MjEwMDMyMjA2OX0.9-Mrkcrr-u5ghCe6UpK3B-11P62fYEqwlHzRXalh5O0';
const client = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });

const email = 'urbansportstore@outlook.com';
const password = 'N4xF8jZ2wP9qL5vT';

const { data, error } = await client.auth.signInWithPassword({ email, password });
console.log(JSON.stringify({ error: error?.message || null, userEmail: data?.user?.email || null, userId: data?.user?.id || null, hasToken: Boolean(data?.session?.access_token) }, null, 2));
