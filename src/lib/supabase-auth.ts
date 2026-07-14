import { getSupabaseClient } from './supabase-client';

export const signInWithEmail = async (email: string, password: string) => {
  const client = getSupabaseClient();
  return client.auth.signInWithPassword({ email, password });
};

export const signUpWithEmail = async (email: string, password: string, options?: { name?: string }) => {
  const client = getSupabaseClient();
  return client.auth.signUp({ email, password, options: { data: { full_name: options?.name ?? '' } } });
};

export const signOut = async () => {
  const client = getSupabaseClient();
  return client.auth.signOut();
};

export const getCurrentUser = async () => {
  const client = getSupabaseClient();
  const { data: { user } } = await client.auth.getUser();
  return user;
};
