#!/usr/bin/env bash
# ============================================================
# PostgreSQL 每日备份（在宿主机执行，写入 ./backups）
# 用法：bash scripts/backup.sh
# 定时任务示例：0 3 * * * cd /opt/vip-app && bash scripts/backup.sh >> logs/backup.log 2>&1
# ============================================================
set -euo pipefail
cd "$(dirname "$0")/.."

ENV_FILE=.env.prod
[ -f "$ENV_FILE" ] || ENV_FILE=.env

PG_USER=$(grep -E '^POSTGRES_USER=' "$ENV_FILE" | cut -d= -f2- || echo postgres)
PG_DB=$(grep -E '^POSTGRES_DB=' "$ENV_FILE" | cut -d= -f2- || echo rental_db)
RETENTION_DAYS=$(grep -E '^BACKUP_RETENTION_DAYS=' "$ENV_FILE" | cut -d= -f2- || echo 14)

mkdir -p backups
FILE="backups/db-$(date +%Y%m%d-%H%M%S).sql.gz"

echo "备份 ${PG_DB} -> ${FILE}"
docker exec -t rental_postgres pg_dump -U "$PG_USER" -d "$PG_DB" --clean --if-exists \
  | gzip > "$FILE"

find backups -name 'db-*.sql.gz' -type f -mtime +"$RETENTION_DAYS" -delete
echo "完成；已清理 ${RETENTION_DAYS} 天前的备份"
