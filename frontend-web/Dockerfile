# 前端生产构建 + Nginx 托管（多阶段构建）
# 阶段一：构建静态产物
FROM node:20-alpine AS build

WORKDIR /app

# 先拷贝依赖描述文件，利用 Docker 层缓存
COPY package*.json ./

# 安装依赖（含 devDependencies，用于 tsc + vite build）
RUN npm install

# 拷贝源码并构建
COPY . .
RUN npm run build

# 阶段二：Nginx 托管产物
FROM nginx:1.25-alpine

# 拷贝 Nginx 配置
COPY nginx.conf /etc/nginx/conf.d/default.conf

# 拷贝构建产物
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
