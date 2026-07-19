$project = 'api'

function add-var($name, $env, $value, $sensitive=$false) {
  Write-Host "Adding $name to $env ..."
  $args = @('env','add',$name,$env,'--project',$project,'--value',$value,'-y')
  if ($sensitive) { $args += '--sensitive' }
  & vercel @args
}

# Non-sensitive
add-var 'SUPABASE_URL' 'production' 'https://vgfvjmpaftiufykejagk.supabase.co'
add-var 'SUPABASE_URL' 'preview' 'https://vgfvjmpaftiufykejagk.supabase.co'
add-var 'JWT_EXPIRES_IN' 'production' '15m'
add-var 'JWT_EXPIRES_IN' 'preview' '15m'
add-var 'REFRESH_TOKEN_TTL_DAYS' 'production' '7'
add-var 'REFRESH_TOKEN_TTL_DAYS' 'preview' '7'
add-var 'COOKIE_SAMESITE' 'production' 'strict'
add-var 'COOKIE_SAMESITE' 'preview' 'strict'
add-var 'CORS_ORIGINS' 'production' 'https://www.urbansportstore.online'
add-var 'CORS_ORIGINS' 'preview' 'https://www.urbansportstore.online'
add-var 'RATE_LIMIT_WINDOW_MS' 'production' '900000'
add-var 'RATE_LIMIT_WINDOW_MS' 'preview' '900000'
add-var 'RATE_LIMIT_MAX' 'production' '120'
add-var 'RATE_LIMIT_MAX' 'preview' '120'
add-var 'AUTH_RATE_LIMIT_MAX' 'production' '10'
add-var 'AUTH_RATE_LIMIT_MAX' 'preview' '10'
add-var 'SEED_ADMIN_EMAIL' 'production' 'urbansportstore@outlook.com'
add-var 'SEED_ADMIN_EMAIL' 'preview' 'urbansportstore@outlook.com'
add-var 'SEED_ADMIN_NAME' 'production' 'Admin Urban Sport Store'
add-var 'SEED_ADMIN_NAME' 'preview' 'Admin Urban Sport Store'
add-var 'SECURE_COOKIES' 'production' 'true'
add-var 'SECURE_COOKIES' 'preview' 'true'

# Sensitive
add-var 'SUPABASE_SERVICE_ROLE_KEY' 'production' 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZnZnZqbXBhZnRpdWZ5a2VqYWdrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NDMwOTgwNywiZXhwIjoyMDk5ODg1ODA3fQ.3N8dJGRFMkAKZEm6c6_S7nYFSSYk5CrjJu77XqfBz6o' $true
add-var 'SUPABASE_SERVICE_ROLE_KEY' 'preview' 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZnZnZqbXBhZnRpdWZ5a2VqYWdrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NDMwOTgwNywiZXhwIjoyMDk5ODg1ODA3fQ.3N8dJGRFMkAKZEm6c6_S7nYFSSYk5CrjJu77XqfBz6o' $true
add-var 'E2E_SECRET' 'production' '58af601e1292b7f1aa762ef7f0329d5ed0b047b5659ab392f69a456391a96076' $true
add-var 'E2E_SECRET' 'preview' '58af601e1292b7f1aa762ef7f0329d5ed0b047b5659ab392f69a456391a96076' $true
add-var 'DATABASE_URL' 'production' 'postgresql://postgres:UrbanSportStore2024Production@vgfvjmpaftiufykejagk.supabase.co:5432/postgres' $true
add-var 'DATABASE_URL' 'preview' 'postgresql://postgres:UrbanSportStore2024Production@vgfvjmpaftiufykejagk.supabase.co:5432/postgres' $true
add-var 'JWT_SECRET' 'production' 'aK7xR2mL9wQ5vN3bD7yZ1tF4cG6jHe8sProd2024SecureKey' $true
add-var 'JWT_SECRET' 'preview' 'aK7xR2mL9wQ5vN3bD7yZ1tF4cG6jHe8sProd2024SecureKey' $true
add-var 'SEED_ADMIN_PASSWORD' 'production' 'bM4_tX!8wK2#vP7$qR' $true
add-var 'SEED_ADMIN_PASSWORD' 'preview' 'bM4_tX!8wK2#vP7$qR' $true

Write-Host "Done. Listing envs:"; vercel env ls --project $project
