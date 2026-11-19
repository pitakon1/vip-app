# ============================================================
# 离线打包 Docker 镜像（在能联网 + 已装 Docker 的机器上执行）
# 产物：deploy/images/*.tar，拷到服务器后 docker load 即可运行
# 用法（PowerShell）：powershell -ExecutionPolicy Bypass -File scripts\pack-images.ps1
# ============================================================
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if (-not (Test-Path '.env.prod')) {
  Write-Host '[ERROR] 缺少 .env.prod（仅用于变量替换，打包阶段不读取业务配置）' -ForegroundColor Red
  exit 1
}

$compose = @('compose', '--env-file', '.env.prod', '-f', 'docker-compose.prod.yml')

Write-Host '[1/3] 构建业务镜像 ...'
docker @compose build

Write-Host '[2/3] 拉取基础镜像 ...'
docker pull postgres:15
docker pull valkey/valkey:8-alpine

Write-Host '[3/3] 导出镜像 ...'
New-Item -ItemType Directory -Force -Path 'deploy\images' | Out-Null
$images = @{
  'rental-backend.tar'  = 'rental-backend:prod'
  'rental-frontend.tar' = 'rental-frontend:prod'
  'postgres15.tar'      = 'postgres:15'
  'valkey8.tar'         = 'valkey/valkey:8-alpine'
}
foreach ($pair in $images.GetEnumerator()) {
  $out = Join-Path 'deploy\images' $pair.Key
  Write-Host "  save $($pair.Value) -> $out"
  docker save -o $out $pair.Value
}

Write-Host ''
Write-Host '完成。部署到服务器：'
Write-Host '  1) 上传项目目录 + deploy\images\*.tar'
Write-Host '  2) for f in deploy/images/*.tar; do docker load -i "$f"; done'
Write-Host '  3) bash scripts/deploy.sh'
