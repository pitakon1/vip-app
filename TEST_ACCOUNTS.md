# 测试账号

> 本文件记录系统各角色的测试登录账号，仅供开发与测试使用。生产环境请勿使用。

## 登录地址

- Web 管理端：http://localhost:3000
- API 文档：http://localhost:8000/docs

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
