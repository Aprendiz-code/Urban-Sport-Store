import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

function parseEnv(filePath) {
  const text = readFileSync(filePath, 'utf8');
  return Object.fromEntries(
    text
      .split(/\r?\n/)
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const [key, ...rest] = line.split('=');
        return [key.trim(), rest.join('=').trim()];
      }),
  );
}

async function main() {
  const backendEnv = parseEnv('api/.env.local');
  const publicEnv = parseEnv('.env.local');

  const supabaseUrl = backendEnv.SUPABASE_URL;
  const serviceRoleKey = backendEnv.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in api/.env.local');
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  const usersResult = await adminClient.auth.admin.listUsers({ perPage: 100 });
  if (usersResult.error) {
    throw usersResult.error;
  }

  const users = usersResult.data.users || [];
  const userCandidates = users.filter((user) => {
    const appMeta = user.app_metadata || {};
    const userMeta = user.user_metadata || {};
    return (
      appMeta.role === 'ADMIN' ||
      appMeta.isAdmin === true ||
      appMeta.is_admin === true ||
      userMeta.role === 'ADMIN' ||
      userMeta.isAdmin === true ||
      userMeta.is_admin === true
    );
  });

  let adminUser = null;
  if (userCandidates.length === 1) {
    adminUser = userCandidates[0];
    console.log('Found admin via metadata:', adminUser.email, adminUser.id);
  } else {
    const profiles = await adminClient.from('profiles').select('id,role').eq('role', 'ADMIN').limit(10);
    if (profiles.error) {
      throw profiles.error;
    }
    if (!profiles.data || profiles.data.length === 0) {
      throw new Error('No admin user found by metadata or profiles.role=ADMIN');
    }
    if (profiles.data.length > 1) {
      throw new Error(`Multiple ADMIN profiles found: ${profiles.data.map((row) => row.id).join(', ')}`);
    }
    const profile = profiles.data[0];
    const getResult = await adminClient.auth.admin.getUserById(profile.id);
    if (getResult.error) {
      throw getResult.error;
    }
    if (!getResult.data?.user) {
      throw new Error(`Profile user ${profile.id} not found in auth users`);
    }
    adminUser = getResult.data.user;
    console.log('Found admin via profiles table:', adminUser.email, adminUser.id);
  }

  const targetEmail = 'urbansportstore@outlook.com';
  const targetPassword = 'N4xF8jZ2wP9qL5vT';

  const updatedUserMetadata = {
    ...(adminUser.user_metadata || {}),
    role: 'ADMIN',
    isAdmin: true,
    email_verified: true,
  };

  const updateResult = await adminClient.auth.admin.updateUserById(adminUser.id, {
    email: targetEmail,
    password: targetPassword,
    email_confirm: true,
    user_metadata: updatedUserMetadata,
  });

  if (updateResult.error) {
    throw updateResult.error;
  }

  console.log('Updated admin user:', updateResult.data?.user?.id, updateResult.data?.user?.email);

  if (!publicEnv.VITE_SUPABASE_URL || !publicEnv.VITE_SUPABASE_ANON_KEY) {
    throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env.local for verification');
  }

  const publicClient = createClient(publicEnv.VITE_SUPABASE_URL, publicEnv.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });

  const signInResult = await publicClient.auth.signInWithPassword({
    email: targetEmail,
    password: targetPassword,
  });

  if (signInResult.error) {
    throw signInResult.error;
  }

  console.log('Verified login succeeded for admin email:', targetEmail);
  console.log('Signed in user id:', signInResult.data?.user?.id);
}

main().catch((error) => {
  console.error('ERROR:', error?.message || error);
  process.exit(1);
});
