# 测试账号

> 本文件记录系统各角色的测试登录账号，仅供开发与测试使用。生产环境请勿使用。

## 登录地址

- Web 管理端：http://localhost:3000
- API 文档：http://localhost:8000/docs

## 本地启动后端（开发）

开发环境必须热重载：改后端代码自动重启 worker，不用手动重启。

- 一键：双击根目录 `start_backend.bat`
  - 先杀掉**所有**属于本后端的历史进程（reloader / 中间层 / worker 全部，而不是只杀占 8000 的那个），确认 8000 释放后再启动，避免“旧进程占着端口、新进程起不来”
  - 日志：`backend/logs/uvicorn-dev.log`；每次重载会依次记录
    `WatchFiles detected changes ... Reloading...` 与 `dev_server: worker restarted, new pid=...`
- 手动（与一键等价）：

  ```powershell
  cd backend
  .venv\Scripts\python.exe dev_server.py
  ```

- 只监听 `backend/app` 下的代码；`uploads/`、`contracts/`、`logs/` 等运行期目录不参与监听，避免写文件触发重载风暴。
- **不要**直接跑 `uvicorn app.main:app --reload`：Windows 下 uvicorn 用 `CTRL_C_EVENT + join()` 结束旧 worker，没有交互式控制台时信号送不到，reloader 会卡死——日志出现 `Reloading...` 但旧代码继续服务、新 worker 不启动。`dev_server.py` 只把这一步换成 `terminate()`，其余（watchfiles 监听、端口复用）保持不变。
- **不要**直接跑不带 `--reload` 的 `uvicorn app.main:app`：它会占住 8000 且永不重载，导致别人的 reload 实例无法绑定（这是“reload 不生效”的常见原因）。
- 生产/部署：`backend/Dockerfile` 使用 `uvicorn --workers`（**不带** `--reload`），由 docker compose 构建启动；不要用开发脚本或 reload 模式跑生产。

## 测试账号一览

| 角色 | 邮箱 | 密码 | 姓名 | 角色标识 |
| --- | --- | --- | --- | --- |
| 系统管理员 | admin@viprental.com | admin123 | 系统管理员 | admin |
| 经纪 | agent@viprental.com | agent123 | 经纪小明 | agent |
| 业主 | owner@viprental.com | owner123 | 业主张先生 | owner |
| 租客 | tenant@viprental.com | tenant123 | 租客李小姐 | tenant |
| 员工 | employee@viprental.com | emp123 | 员工王五 | employee |

## 各角色可访问功能

- **admin（系统管理员）**：全部功能，含数据总览、房源管理、租约、付款、用户、项目、员工、线索、Feature Flag 等。
- **agent（经纪）**：数据总览、房源管理（CRUD）、租约、付款、线索、客户跟进。
- **owner（业主）**：我的房源、租约、收益、服务预约、报修。
- **tenant（租客）**：浏览房源、我的租约、付款记录、报修、服务预约。
- **employee（员工）**：数据总览、房源管理（CRUD）、租约、线索、客户跟进。

## 重置数据

如需重置测试数据，可在后端目录执行：

```bash
python -m seed
```

执行后将重新创建上述账号及配套的项目、房源、租约、付款等种子数据。

## 安全提示

- 以上账号仅用于本地开发与测试，切勿部署到生产环境。
- 生产环境应通过正式注册流程创建账号，并使用强密码。
