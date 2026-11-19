# Gotenberg 8 + 中文字体
#
# 官方镜像不带 CJK 字体，Word/Excel 转 PDF 时中文会变成方块（豆腐块）。
# 这里在官方镜像上安装 Noto CJK 与 emoji 字体，Gotenberg 启动时会自动
# 扫描 /usr/share/fonts 下的字体。
FROM gotenberg/gotenberg:8

USER root

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        fonts-noto-cjk \
        fonts-noto-color-emoji \
    && fc-cache -f \
    && rm -rf /var/lib/apt/lists/*

# 保持官方镜像的默认用户与入口，无需覆盖 CMD/ENTRYPOINT。
