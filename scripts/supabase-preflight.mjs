import { readdir, readFile } from 'node:fs/promises';
import { dirname, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDirectory = resolve(projectRoot, 'supabase', 'migrations');
const reconciliationDocument = resolve(projectRoot, 'docs', 'supabase-migration-reconciliation.md');
const knownUnsafeMigration = '20260727000000_set_admin_raw_app_meta.sql';
const blockers = [];

let migrationFiles;
try {
  migrationFiles = (await readdir(migrationsDirectory))
    .filter((fileName) => fileName.toLowerCase().endsWith('.sql'))
    .sort();
} catch {
  blockers.push({ file: 'supabase/migrations', reason: 'No se pudo inspeccionar el directorio local.' });
  migrationFiles = [];
}

for (const fileName of migrationFiles) {
  const filePath = resolve(migrationsDirectory, fileName);
  let sql;
  try {
    sql = await readFile(filePath, 'utf8');
  } catch {
    blockers.push({ file: `supabase/migrations/${fileName}`, reason: 'No se pudo leer el archivo SQL.' });
    continue;
  }

  const executableSql = sql
    .replace(/--[^\r\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  const hasPrivilegedRole = /\b(?:ADMIN|OWNER|CATALOG_MANAGER|LOGISTICS|ACCOUNTANT)\b/i.test(executableSql);
  const updatesAuthAppMetadata = /\bUPDATE\s+(?:auth\.)?users\b/i.test(executableSql)
    && /\braw_app_meta_data\b/i.test(executableSql);
  const assignsProfileRoleByEmail = /\bUPDATE\s+(?:public\.)?profiles\b[\s\S]{0,1200}\bSET\b[\s\S]{0,800}\brole\b[\s\S]{0,1200}\bWHERE\b[\s\S]{0,500}\bemail\b/i.test(executableSql);

  if (fileName === knownUnsafeMigration) {
    blockers.push({
      file: `supabase/migrations/${fileName}`,
      reason: 'Migración histórica insegura detectada; CLI podría descubrirla.',
    });
  }

  if (hasPrivilegedRole && updatesAuthAppMetadata) {
    blockers.push({
      file: `supabase/migrations/${fileName}`,
      reason: 'SQL asigna un rol privilegiado a metadata de Auth.',
    });
  }

  if (hasPrivilegedRole && assignsProfileRoleByEmail) {
    blockers.push({
      file: `supabase/migrations/${fileName}`,
      reason: 'SQL asigna un rol privilegiado usando email como selector.',
    });
  }
}

try {
  const reconciliation = await readFile(reconciliationDocument, 'utf8');
  if (!/^Reconciliation status:\s*RECONCILED\s*$/im.test(reconciliation)) {
    blockers.push({
      file: 'docs/supabase-migration-reconciliation.md',
      reason: 'El estado no está documentado como RECONCILED por revisión manual.',
    });
  }
} catch {
  blockers.push({
    file: 'docs/supabase-migration-reconciliation.md',
    reason: 'Falta la guía de reconciliación y su estado explícito.',
  });
}

if (blockers.length > 0) {
  console.error('Supabase preflight: BLOQUEADO. No ejecutes supabase db push.');
  for (const blocker of blockers) {
    console.error(`- ${blocker.file}: ${blocker.reason}`);
  }
  console.error('Requiere reconciliación manual del historial remoto y revisión del dueño del proyecto.');
  process.exitCode = 1;
} else {
  console.log('Supabase preflight: archivos locales revisados y reconciliación documentada.');
}
