# ============================================================
# Adopt Prisma migrations on a project that has only ever used db push.
#
# Why: the build script runs `prisma db push --accept-data-loss` on
# every Vercel deploy, against production Neon. Today's changes are
# additive so nothing drops — but that flag means a future destructive
# change goes through silently and takes the club's season with it.
#
# What this does:
#   1. Generates a baseline migration from the CURRENT schema.
#   2. Marks it as already applied, locally and on Neon, so Prisma
#      stops trying to create tables that are already there.
#
# It does NOT change any data and does NOT alter either database's
# structure. It only writes the _prisma_migrations bookkeeping table.
#
# Run from the repo root:   .\scripts\adopt-migrations.ps1
# ============================================================

$ErrorActionPreference = "Stop"
$name = "0_init"
$dir  = "prisma/migrations/$name"

if (Test-Path "prisma/migrations") {
  Write-Host "prisma/migrations already exists — nothing to baseline." -ForegroundColor Yellow
  Write-Host "If you meant to start over, delete it first." -ForegroundColor Yellow
  exit 1
}

Write-Host "`n1/4  Creating $dir" -ForegroundColor Cyan
New-Item -ItemType Directory -Path $dir -Force | Out-Null

Write-Host "2/4  Generating baseline SQL from the current schema" -ForegroundColor Cyan
# --from-empty + --to-schema-datamodel reads the schema FILE only.
# It does not touch either database.
npx prisma migrate diff `
  --from-empty `
  --to-schema-datamodel prisma/schema.prisma `
  --script | Out-File -FilePath "$dir/migration.sql" -Encoding utf8

$lines = (Get-Content "$dir/migration.sql" | Measure-Object -Line).Lines
if ($lines -lt 10) {
  Write-Host "Baseline looks empty ($lines lines). Stopping before anything is marked applied." -ForegroundColor Red
  exit 1
}
Write-Host "     $lines lines written to $dir/migration.sql" -ForegroundColor Green

Write-Host "3/4  Marking it applied on the LOCAL database" -ForegroundColor Cyan
npx prisma migrate resolve --applied $name

Write-Host "4/4  Marking it applied on NEON" -ForegroundColor Cyan
Write-Host "     Point DATABASE_URL at Neon for this step only." -ForegroundColor Yellow
Write-Host "     Paste nothing into chat. Set it in this shell:" -ForegroundColor Yellow
Write-Host '       $env:DATABASE_URL = "<your Neon connection string>"' -ForegroundColor DarkGray
Write-Host "     then re-run just this line:" -ForegroundColor Yellow
Write-Host "       npx prisma migrate resolve --applied $name" -ForegroundColor DarkGray

Write-Host "`nLocal baseline done. After the Neon step, verify both with:" -ForegroundColor Green
Write-Host "  npx prisma migrate status" -ForegroundColor DarkGray
Write-Host "`nOnly once BOTH say 'Database schema is up to date', change the" -ForegroundColor Green
Write-Host "build script in package.json from:" -ForegroundColor Green
Write-Host '  "build": "prisma generate && prisma db push --accept-data-loss && next build"' -ForegroundColor DarkGray
Write-Host "to:" -ForegroundColor Green
Write-Host '  "build": "prisma generate && prisma migrate deploy && next build"' -ForegroundColor DarkGray
