import { supabase } from './supabase.js';
import { ApiError } from './response.js';

export async function requireAdmin(userId: string): Promise<void> {
  const { data, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .limit(1)
    .single();

  if (error || !data?.role) {
    throw new ApiError(403, 'Admin access required');
  }

  if (data.role !== 'ADMIN') {
    throw new ApiError(403, 'Admin access required');
  }
}
