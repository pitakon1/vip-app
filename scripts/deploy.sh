#!/usr/bin/env bash
# ============================================================
# 服务器一键部署（生产 compose）
# 用法：bash scripts/deploy.sh
# 前置：
#   1) 服务器已安装 Docker Engine 24+ 与 docker compose 插件
#   2) 项目根目录已放好 .env.prod（参照 .env.prod 模板，改域名与口令）
#   3) 防火墙放行 3000（或在外层 Nginx 做 443 -> 3000 反代）
# ============================================================
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f .env.prod ]; then
  echo "[ERROR] 缺少 .env.prod，请先基于根目录 .env.prod 修改域名与口令" >&2
  exit 1
fi

COMPOSE="docker compose --env-file .env.prod -f docker-compose.prod.yml"

echo "[1/4] 构建镜像 ..."
$COMPOSE build --pull

echo "[2/4] 启动服务 ..."
$COMPOSE up -d --remove-orphans

echo "[3/4] 等待后端就绪（最多 180s）..."
for i in $(seq 1 60); do
  status=$(docker inspect -f '{{.State.Health.Status}}' rental_fastapi 2>/dev/null || echo missing)
  if [ "$status" = "healthy" ]; then
    echo "  后端已就绪"
    break
  fi
  if [ "$i" = "60" ]; then
    echo "[ERROR] 后端未在 180s 内就绪，最近日志：" >&2
    $COMPOSE logs --tail=80 fastapi >&2
    exit 1
  fi
  sleep 3
done

echo "[4/4] 服务状态："
$COMPOSE ps

# 首次部署可选：初始化测试数据（只应执行一次，重复执行会因唯一约束失败）
if [ "${SEED_ON_FIRST_DEPLOY:-0}" = "1" ]; then
  echo "初始化种子数据 ..."
  $COMPOSE exec -T fastapi python seed.py
fi

echo
echo "部署完成。入口：http://<服务器IP>:3000 （API 由前端 Nginx 反代到 /api）"
echo "健康检查：http://<服务器IP>:3000/health"
