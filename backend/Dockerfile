FROM python:3.12-slim

# 设置环境变量，禁止生成 .pyc 文件，禁用输出缓冲
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# 设置工作目录
WORKDIR /app

# 安装系统依赖（cryptography 等需编译的包所需的构建工具）
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libffi-dev \
    && rm -rf /var/lib/apt/lists/*

# 复制依赖文件并安装
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 复制项目代码
COPY . .

# 暴露应用端口
EXPOSE 8000

# 启动应用（worker 数可由 WEB_CONCURRENCY 环境变量覆盖，默认 4）
#
# 先跑 `alembic upgrade head` 再启动：此前容器启动完全不执行迁移，新库/新版本代码
# 会因为缺表缺列直接 500（迁移只能靠人工记得手动执行）。
# 迁移在启动前串行完成，uvicorn 才会拉起多 worker，避免各 worker 并发建表。
CMD ["sh", "-c", "alembic upgrade head && exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers ${WEB_CONCURRENCY:-4}"]
