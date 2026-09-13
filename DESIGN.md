# 房产租赁经纪平台 - 设计文档

> 文档版本: v1.7  
> 适用阶段: MVP（最小可用版）  
> 服务区域: 东南亚多国（中 / 英 / 泰 三语）  
> 交付形态: Web 管理端 + 移动 App（业主/租客）+ 微信小程序
> 产品定位: **房产中介平台 + 增值服务**（对标贝壳找房/链家）

---

## 1. 项目概述

### 1.1 业务背景
公司主营东南亚房地产租赁经纪业务，本质是一个**房产中介平台**：一端对接业主的房源，一端服务租客的租住需求，并在此基础上提供清洁、维修、税费代缴等增值服务。系统需要服务 **5 类角色**：

| 角色 | 入口形态 | 核心诉求 |
|---|---|---|
| 经纪团队（管理员/Agent） | Web 管理端 | 房源/客户/合同/业绩全流程管理 |
| 业主（房东） | App / 小程序 | 查看房源在租状态、收租、托管增值服务 |
| 租客 | App / 小程序 | **找房、看房、签约、交租、报修、续约** |
| 公司员工（销售/运营） | App / Web | 业绩台账、考勤、客户跟进 |
| 公众 | Web 静态页 | 公司信息、联系方式 |

### 1.2 设计目标
1. **统一后端，差异前端**：5 个端共享同一套 REST API，通过 RBAC 控制可见数据
2. **C 端 = 找房平台体验，B 端 = 管理后台体验**：面向业主/租客的端（App/小程序）按**贝壳找房**的 C 端产品逻辑设计——**信息浏览优先、操作极简、视觉轻盈**，避免"后台管理"感；只有经纪/员工后台保留完整的表格化管理
3. **可扩展支付/通知**：抽象适配器，未来增加新支付/通知渠道不改核心逻辑
4. **可观测可运维**：所有关键操作（收租、合同）留痕，方便对账与审计
5. **多端代码复用**：业务组件在 Web/App/小程序间最大程度复用
6. **MVP 优先**：先跑通找房→看房→签约→收租→增值服务闭环，再迭代深度功能

---

## 2. 角色与功能模块

### 2.1 经纪团队管理端（Web）
- **数据总览（Dashboard）**：房源总数、空置/已租、即将到期租金、即将到期合同
- **房源管理（Room Master）**：项目/房号/业主/租金/押金/照片/状态
- **客户关系管理（CRM）**：
  - 客户线索：姓名、国籍、Line/WeChat、预算、感兴趣项目
  - 跟进状态：咨询中 → 已预约看房 → 洽谈中 → 待签约 → 已成交
- **合同管理**：合同上传/解析/到期预警
- **财务对账**：收付款流水、佣金核算、托管费

### 2.2 租客端（App / 小程序）—— 对标贝壳 C 端 App
> **定位：像逛贝壳/链家一样，围绕"住"完成找房与交易**。系统首先是**房产租赁 + 买卖双业务平台**，所有业务围绕这两点展开：租客既能**租房**（找房→看房→签约→交租→售后），也能**买房**（浏览在售房源→预约看房→谈价→成交）。界面以房源信息浏览为核心，操作极简，全程 C 端电商式体验。

- **首页（核心门户，双业务入口）**
  - 顶部横向定位城市选择器（如"曼谷"）+ 搜索框（区域 / 楼盘 / 关键词）
  - 双业务 Tab 导航：**[租房] [买房]**（对标贝壳"整租/新房"切换，MVP 先做"租房"为主口，"买房"做入口 + 在售列表）
  - Banner 轮播：热门楼盘 / 促销房源 / 限时活动
  - **功能宫格**：立即找房、地图找房、视频看房、贷款计算（可选）、委托找房、卖房估价
  - **主题模块**：精选房源、新上房源、给"买房"的推荐楼盘、热门二手房
  - 房源瀑布流卡片流（大图 + 价格 + 标签 + 收藏）
- **房源列表 / 筛选**
  - 顶部 Tab（整租/合租/买房）+ 底部抽屉筛选（价格区间、房型、面积、装修、朝向、近地铁）
  - 排序：综合 / 最新 / 价格 / 面积
  - 卡片式列表：大图、价格醒目、标签（近地铁 / 急租 / 视频看房 / 可买）、收藏
  - 列表顶部支持"地图模式"切换（点位图 + 底部卡片条）
- **房源详情**
  - 图片轮播 + 视频看房 / VR 看房入口
  - 核心信息：价格（租 / 售）、面积、房型、楼层、朝向、装修
  - **业务区分**：租房显示"月租金 + 押金"，买房显示"总价 + 贷款预估"
  - 房源卖点标签 + 基础配套（泳池/健身房/安保）+ 横评数据（真实房源）
  - 地图定位周边（学校/医院/商场/交通）
  - 底部固定操作条：**联系经纪 / 立即预约看房 / 收藏**（买房另含"算贷款"）
- **我的（用户中心）**
  - 我的浏览足迹 / 收藏 / 预约记录 / 委托记录
  - 我的租约（生效中 / 即将到期）→ 交租入口、续约
  - 我的购房订单（看房约谈 / 成交进度）
  - 在线客服、消息中心
- **增值服务**：清洁、空调清洗、WiFi 安装、水电代付、搬家服务（下单式，非管理式）

### 2.3 业主端（App / 小程序）—— 资产托管 + 出租/卖房委托，轻量不后台
> 业主端的核心不是"管理房源"，而是**"掌握资产状态 + 收租收房款 + 放心委托"**。业主既是**出租方**（托管出租、收租），也是**卖房方**（委托出售、估价、成交）。用卡片化信息流替代后台表格。

- **首页（资产概览，双业务）**
  - 我的房源卡片（封面图 + 在租/在售状态 + 月租金 / 售价）
  - 本月应收 / 实收 / 待收 三个数字
  - 近期到账动态时间流
  - **双业务入口**：委托出租 / 委托出售（卖房估价）
- **房源详情**
  - 出租：在租状态、当前租客（脱敏）、租约到期日、历史流水
  - 出售：挂牌状态、看房预约列表、意向客户、成交进度
- **委托中心**
  - 委托出租：房源→定价建议→挂牌→签约托管
  - 委托出售：房源→**在线估价**→挂牌→预约带看→成交
- **收益中心**：月度/季度/年度收入图表，收款明细（租金 + 售房款）
- **增值服务（托管）**
  - 年度托管套餐（佣金 + 托管费）一键订阅
  - 推荐服务：清洁、空调清洗、税费/水电/保险代缴
- **文档中心**：合同/收据/验房照片/产权文件（PDF 在线预览）
- **线上收款**：QR Code、Visa、支付宝、微信、Wise Transfer

### 2.4 员工端（App / Web）
- 销售台账：出租房源、佣金、每月业绩、排行榜
- 业绩月报：系统按签约/续约自动核算（无需员工手动填报）
- 考勤：每日上下班打卡、外出登记、定位
- 促销奖励公布
- 联系方式：手机 + 社交媒体
- 日历：租金催收提醒、合同到期提醒

### 2.5 公司信息端（Web 静态）
- 公司地址、地图嵌入
- 联系电话、邮箱
- 社交媒体公众号：Line、Facebook、Instagram、微信公众号

---

## 3. 系统架构

### 3.1 总体架构图

```
┌─────────────────────────────────────────────────────────────┐
│                    客户端层 (Frontend)                        │
│ ┌──────────────┐ ┌──────────────┐ ┌─────────────────────┐  │
│ │  Web 管理端  │ │   RN App     │ │   微信小程序(Taro)  │  │
│ │  React 18    │ │  React Native│ │   Taro 3            │  │
│ └──────────────┘ └──────────────┘ └─────────────────────┘  │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTPS / JSON
┌────────────────────────▼────────────────────────────────────┐
│                    API 网关 (Nginx / Kong)                    │
│  - 路由  - 限流  - SSL 终止  - CORS  - 统一鉴权转发          │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│                  应用服务层 (Backend)                         │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────┐│
│  │  FastAPI     │ │  Celery      │ │  FastAPI-Admin      ││
│  │  REST API    │ │  Async Tasks │ │  (SQLModel, 运维用) ││
│  └──────────────┘ └──────────────┘ └──────────────────────┘│
└──────┬───────────────┬─────────────┬─────────────────────────┘
       │               │             │
┌──────▼─────┐  ┌──────▼─────┐  ┌────▼──────────┐
│ PostgreSQL │  │   Redis    │  │   MinIO/S3    │
│  主数据库  │  │ 缓存+队列  │  │  文件存储     │
└────────────┘  └────────────┘  └───────────────┘

       ┌─────────────────────────────┐
       │      第三方服务 (Adapter)     │
       │  Payment  |  Notification    │
       │  SMS      |  Map/Translate   │
       └─────────────────────────────┘
```

### 3.2 部署拓扑
- **应用服务器**：2 核 4G 起，按需横向扩展
- **数据库**：PostgreSQL 15 主从架构（一主一从起步）
- **缓存/队列**：Redis 7 单实例 → Sentinel
- **文件存储**：MinIO 自建（成本低）或 AWS S3（**注意 S3 桶区域必须为 `ap-southeast-1` Bangkok**）
- **节点位置**：⚠️ **AWS Bangkok 区域（ap-southeast-1）**——PDPA §33 要求 PII 跨境传输需充分保护，**首选泰国境内部署**。如需 CDN 静态资源，CloudFront 边缘节点不在限制范围内

---

## 4. 技术选型

### 4.1 后端

| 技术 | 选型 | 理由 |
|---|---|---|
| 语言 | **Python 3.11+** | 团队小、SDK 丰富、AI 扩展好 |
| Web 框架 | **FastAPI** | 异步高性能、OpenAPI 文档自动生成、Pydantic 强类型 |
| ORM | **SQLAlchemy 2.0**（异步） + **Alembic**（迁移） | 成熟、类型提示完善、迁移工具链 |
| 后台 | **FastAPI-Admin**（SQLModel 实现，与 FastAPI 同生态） | 轻量、与 FastAPI 兼容；**超级管理员用的内网工具，非用户端入口** |
| 异步任务 | **Celery + Redis** | 定时租金提醒、通知推送、邮件发送 |
| 鉴权 | **JWT（access + refresh）+ OAuth2** | 多端适配，refresh token 滑动续期 |
| 文档 | **OpenAPI 3.0**（FastAPI 自动生成） | 前端可生成 client SDK |
| 验证 | **Pydantic v2** | 强类型、IDE 友好 |
| 测试 | **pytest + pytest-asyncio + httpx** | 标准组合 |

> 说明：业务用户面向的管理后台是 **React + Ant Design Pro** 实现的 Web 管理端（见 4.2），FastAPI-Admin 仅作为运维/DBA 的底层数据维护工具。**不要**在 FastAPI 中强行嵌入 Django Admin，二者框架不通。

> 备选：如团队 Java 背景强，可改为 **Spring Boot 3 + JPA + Redis**；如追求极致性能可改为 **Go + Gin + GORM**。

### 4.2 前端 Web（管理端）

| 技术 | 选型 | 理由 |
|---|---|---|
| 框架 | **React 18 + TypeScript** | 生态最广，团队好招 |
| 构建 | **Vite 5** | 启动快，HMR 流畅 |
| UI 库 | **Ant Design Pro** | 中后台开箱即用，含 Dashboard/表格/表单 |
| 状态 | **Zustand**（轻量）或 **Redux Toolkit** | 复杂业务用 RTK |
| 路由 | **React Router v6** | 标配 |
| 表格 | **Ant Design Table** + **ProTable** | 支持虚拟滚动、列设置 |
| 图表 | **ECharts** | Dashboard 图表需求 |
| 请求 | **Axios + React Query（TanStack Query）** | 自动缓存、重试、状态管理 |
| i18n | **react-i18next** | 中/英/泰 |
| 表单 | **React Hook Form + Zod** | 性能好、类型安全 |

### 4.3 移动 App（业主/租客）

| 技术 | 选型 | 理由 |
|---|---|---|
| 框架 | **React Native 0.74+** | 与 Web 共享 React/TS 经验 |
| 状态 | **Zustand** | 与 Web 保持一致 |
| 导航 | **React Navigation 6** | 标配 |
| UI | **NativeBase** 或 **Tamagui** | 跨平台组件库 |
| 国际化 | **i18next + react-native-localize** | 中/英/泰 |
| 推送 | **Notifee + FCM（Android）+ APNs（iOS）** | 应用内推送 |
| 扫码 | **react-native-vision-camera + vision-camera-code-scanner** | QR Code 支付 |
| 构建 | **EAS Build**（Expo）或自建 | 优先 Expo 简化发布 |

> 备选：**Flutter**（性能更好但语言 Dart 学习成本）。

### 4.4 微信小程序

| 技术 | 选型 | 理由 |
|---|---|---|
| 框架 | **Taro 3** | 用 React 语法写多端，可与 App/Web 共用部分业务组件 |
| UI | **Taro UI** 或 **NutUI** | 移动端优化 |
| 状态 | **Zustand** | 保持一致 |
| 编译目标 | 微信 / 支付宝 / H5（未来） | 一次开发多端发布 |

### 4.5 数据库 / 中间件

| 用途 | 选型 |
|---|---|
| 主数据库 | **PostgreSQL 15**（强类型、JSONB、地理信息） |
| 缓存 | **Redis 7**（会话/限流/任务队列） |
| 对象存储 | **MinIO**（自建）或 AWS S3（房源照片/合同 PDF） |
| 消息队列 | **Redis Streams**（轻量）或 RabbitMQ（量大时升级） |
| 全文检索 | PostgreSQL `tsvector`（MVP 够用，后期可加 Elasticsearch） |

### 4.6 第三方服务（Adapter 模式）

| 类型 | 渠道 | 详见 |
|---|---|---|
| 支付 | 30+ 渠道（Stripe/PromptPay/微信/支付宝/Wise/PayPal/GrabPay 等） | §7 支付系统设计 |
| 通知 | WeChat Work Bot、Line Notify、WhatsApp Business API、Facebook Messenger | §8 通知系统设计 |
| 短信 | Twilio / 阿里云短信 | §8 |
| 地图 | Google Maps / Mapbox | 公司信息端 |
| 翻译 | Google Translate API / LLM（Phase 4b） | §19.2 |
| 邮件 | SendGrid / Mailgun | §8 |
| 税务 | 泰国税务局 RD API | §16 税务子系统 |
| LLM/AI | OpenAI / Anthropic / Qwen / DeepSeek / 本地 Llama | §19.2 LLM Gateway |
| 对象存储 | MinIO / AWS S3 | §3.2 |

---

## 5. 数据模型（核心实体 ER）

```
┌──────────┐ 1   N ┌──────────┐ 1   N ┌──────────┐
│ Project  │───────│ Property │───────│  Lease   │
│ 项目/楼盘│       │  房源    │       │  租约    │
└──────────┘       └──────────┘       └────┬─────┘
     │                  │ 1                 │ N
     │                  │ N                 │
     │                  ▼                   ▼ 1
     │             ┌─────────┐         ┌─────────┐
     │             │ Owner   │         │ Tenant  │
     │             │ 业主    │         │ 租客    │
     │             └────┬────┘         └────┬────┘
     │                  │ 1                 │ 1
     │                  │ N                 │ N
     │             ┌────▼─────────────┐     │
     │             │ ServiceOrder     │     │
     │             │ 推荐服务订单     │     │
     │             └──────────────────┘     │
     │                                       │ N
     │                                  ┌────▼──────────┐
     │                                  │MaintenanceTicket│
     │                                  │ 报修工单      │
     │                                  └───────────────┘
     │
     │           ┌──────────┐        ┌───────────┐
     │      N    │ Document │        │ Payment   │
     └───────────│ 文档中心 │        │ 收付款    │
                 └──────────┘        └─────┬─────┘
                                          │ 1
                                          │ N
                 ┌──────────┐        ┌────▼──────────┐
                 │Notification│       │CommissionSettle│
                 │ 通知记录  │       │ 佣金结算      │
                 └──────────┘        └───────────────┘

┌──────────┐ N   1 ┌─────────┐ N   1 ┌──────────────┐
│  Lead    │───────│  User   │───────│   Employee   │
│ 线索客户 │       │ 统一账户│       │ 员工档案     │
└──────────┘       └─────────┘       └──────────────┘
                                            │ 1
                                            │ N
                                  ┌─────┬───┴───┬──────┐
                                  ▼     ▼       ▼      ▼
                            ┌──────┐┌──────┐┌──────┐┌─────────┐
                            │Attend││Perf. ││Event ││AuditLog │
                            │考勤  ││业绩  ││事件  ││审计日志 │
                            └──────┘└──────┘└──────┘└─────────┘
```

### 5.1 关键实体字段

> **字段规范（v1.3 起统一执行）**：所有核心业务表必须包含以下公共字段：
> - `id` UUID（主键）
> - `created_at`, `updated_at`（自动维护）
> - `deleted_at`（软删除，PDPA §26 数据保留策略）
> - `metadata JSONB DEFAULT '{}'`（业务扩展位，未来 AI 分析/自定义属性用）
> - `version int DEFAULT 1`（乐观锁，避免并发覆盖）

#### `users`（统一账户）
- 公共字段 + `phone, email, password_hash, role, locale, line_id, wechat_id, whatsapp, last_login_at, status(active/suspended/deleted)`

#### `properties`（房源）
- 公共字段 + `project_id, room_no, owner_id, monthly_rent, deposit, currency, status(vacant/rented/renewing), photos[], attributes JSONB`（如楼层/朝向/家具清单）

#### `leases`（租约）
- 公共字段 + `property_id, tenant_id, start_date, end_date, monthly_rent, deposit, contract_file_url, contract_hash, status(draft/active/expired/terminated), signed_at, terminated_reason`

#### `leads`（线索）
- 公共字段 + `name, nationality, phone, line_id, wechat_id, budget_min, budget_max, interested_projects[], stage(inquiry/visit/negotiating/pending/closed), assigned_agent_id, lead_score INT`（AI 评分位）

#### `payments`（收付款）
- 公共字段 + `lease_id, type(rent/deposit/commission/service), amount, currency, channel, status(pending/success/failed/refunded), proof_url, paid_at, idempotency_key, channel_order_id`

#### `payment_reconciliations`（对账记录）
- 公共字段 + `payment_id, channel, channel_txn_id, local_amount, channel_amount, currency, diff_amount, status(matched/unmatched/disputed), reconciled_at, notes`

#### `service_packages`（年度托管套餐订阅）
- 公共字段 + `owner_id, property_id, type(annual_management/full_service), commission_rate, management_fee_rate, start_date, end_date, status`

#### `employees`（员工档案，1:1 users）
- 公共字段 + `user_id, department, position, base_salary, commission_rate, joined_at`

#### `attendance`（考勤）
- 公共字段 + `employee_id, date, clock_in, clock_out, location_lat, location_lng, type(office/field), device_info`

#### `performances`（业绩主数据，系统自动生成）
- 不再由员工手动填报。业绩由 `commission_settlements`（佣金结算）自动聚合生成：签约/续约时系统生成结算记录，`performance` 接口实时按自然月汇总 `total_revenue / commission_earned / deals_closed[]`

#### `projects`（项目/楼盘）
- 公共字段 + `name, address, district, city, country, developer, property_management_company, lat, lng, total_units, completion_year, amenities[]`（如泳池/健身房/24h安保）

#### `tenants`（租客档案，1:1 users）
- 公共字段 + `user_id, nationality, passport_no(enc), id_card_no(enc), emergency_contact(enc), employer_info JSONB, monthly_income, tenant_credit_score INT`（Phase 4b AI 评分位）

#### `documents`（文档中心）
- 公共字段 + `owner_id, property_id, lease_id, type(contract/receipt/inspection_photo/tax_invoice/wht_certificate/other), title, file_url, file_size, mime_type, file_hash(SHA-256), version INT, uploaded_by, tags[]`
- **用途**：业主端文档中心、租客端合同查看、PDPA 数据导出

#### `service_orders`（推荐服务订单）
- 公共字段 + `orderer_id, orderer_type(owner/tenant), property_id, service_type(cleaning/ac_cleaning/wifi_install/utility_payment/insurance/tax_payment), status(pending/assigned/in_progress/completed/cancelled), scheduled_at, completed_at, provider_id(外包商), amount, currency, payment_id, notes, rating INT`
- **用途**：清洁/空调清洗/WiFi/水电代付/税费代缴/保险等增值服务

#### `maintenance_tickets`（报修工单）
- 公共字段 + `property_id, tenant_id, lease_id, title, description, photos[], priority(low/medium/high/urgent), status(open/assigned/in_progress/resolved/closed), assigned_to(员工/外包), resolved_at, resolution_notes, resolution_photos[], cost, payment_id`
- **状态机**：`open → assigned → in_progress → resolved → closed`（可回退到 `in_progress`）

#### `notifications`（通知记录）
- 公共字段 + `user_id, channel(in_app/push/email/sms/wechat/line/whatsapp/facebook), template_key, recipient, subject, content, status(queued/sent/delivered/failed/read), sent_at, delivered_at, read_at, retry_count, error_message, related_entity_type, related_entity_id`
- **用途**：通知系统发送记录、重试追踪、已读状态

#### `commission_settlements`（佣金结算）
- 公共字段 + `employee_id, lease_id, deal_type(new_rental/renewal/management), commission_base, commission_rate, commission_amount, currency, status(pending/approved/paid), settled_at, paid_at, performance_id`
- **用途**：员工佣金核算、月度结算、与业绩报表关联

#### `events`（领域事件流，事件溯源 + 异步解耦）
- 公共字段 + `event_id UUID, event_type(lease_signed/payment_received/property_status_changed/...), aggregate_type, aggregate_id, payload JSONB, occurred_at, published_at, consumer_status`
- **用途**：核心业务操作发布事件，供未来 AI 模块、数据分析、通知模块订阅
- **存储**：业务表写 PostgreSQL + 推送到 Redis Streams（双写）
- **消费者**：Phase 1 仅通知模块订阅；Phase 4 扩展为 BI 管道、AI 推理、推荐系统

#### `feature_flags`（功能开关）
- `key, value, enabled, rollout_percentage, target_users[], created_at, updated_at, expires_at`
- **用途**：灰度发布新功能（如某个 AI 模块仅给 10% 用户开放）
- **实现**：本地 DB 即可，Phase 1 后期可升级到 Unleash / LaunchDarkly

#### `audit_logs`（审计日志）
- 公共字段 + `actor_user_id, action(read/create/update/delete/export), resource_type, resource_id, pii_fields_accessed[], ip_address, user_agent, request_id, prev_value, new_value`
- **PDPA §27 强制要求**

#### `consents`（同意记录，PDPA §22）
- 公共字段 + `user_id, purpose, granted(bool), granted_at, revoked_at, ip_address, user_agent, policy_version`

#### `data_subject_requests`（数据主体请求，PDPA §30）
- 公共字段 + `user_id, request_type(access/rectification/erasure/portability/restriction), status, submitted_at, completed_at, response_data_url, notes`

#### `tax_records` / `tax_invoices` / `wht_certificates` / `company_tax_profile`（见 §16）

---

## 5.2 REST API 端点表（核心）

> 前缀：`/api/v1`，鉴权：`Authorization: Bearer <jwt>`，RBAC 在中间件层校验

| 资源 | 方法 | 路径 | 角色 | 说明 |
|---|---|---|---|---|
| 鉴权 | POST | `/auth/login` | 公开 | 手机号+密码，返回 access/refresh |
| 鉴权 | POST | `/auth/refresh` | 公开 | 刷新 token |
| 鉴权 | GET | `/auth/me` | 任意 | 当前用户信息 |
| 房源 | GET | `/properties` | Agent+ | 支持分页、筛选（状态/项目/价格区间） |
| 房源 | POST | `/properties` | Agent+ | 创建房源 |
| 房源 | GET | `/properties/{id}` | Agent+/Owner(本人) | 详情含照片 |
| 房源 | PATCH | `/properties/{id}` | Agent+ | 更新 |
| 房源 | POST | `/properties/{id}/photos` | Agent+ | 上传照片（multipart） |
| 房源 | GET | `/properties/me` | Owner | 业主查看自己的房产列表 |
| 租约 | GET | `/leases` | Agent+ | 列表（按状态/到期日筛选） |
| 租约 | POST | `/leases` | Agent+ | 创建租约 |
| 租约 | GET | `/leases/{id}` | Agent+/Tenant(本人) | 详情 |
| 租约 | GET | `/leases/expiring` | Agent+ | 即将到期租约（D-30/D-7/D-1） |
| 租约 | GET | `/leases/me` | Tenant | 租客查看自己的租约 |
| 线索 | GET | `/leads` | Agent+ | 列表 |
| 线索 | POST | `/leads` | Agent+ | 新建线索 |
| 线索 | PATCH | `/leads/{id}/stage` | Agent+ | 推进跟进阶段 |
| 收款 | GET | `/payments` | Agent+ | 流水（支持按 channel/currency/status 筛选） |
| 收款 | POST | `/payments` | Tenant | 创建支付单（含幂等键） |
| 收款 | GET | `/payments/channels` | Tenant | 获取可用支付渠道列表（按地区/币种智能推荐） |
| 收款 | POST | `/payments/{id}/proof` | Tenant | 上传银行转账凭证（线下渠道） |
| 收款 | POST | `/payments/{id}/refund` | Agent+ | 退款 |
| 收款 | GET | `/payments/reconciliations` | Admin | 对账记录 |
| 收款 | POST | `/payments/webhook/{channel}` | 公开(三方回调) | 支付结果回调（统一入口） |
| 业主 | GET | `/owners/me/income` | Owner | 租金收入汇总 |
| 业主 | GET | `/owners/me/documents` | Owner | 文档列表（合同/收据/验房照片） |
| 业主 | POST | `/service-packages` | Owner | 订阅年度托管套餐 |
| 员工 | POST | `/attendance/clock-in` | Employee | 上班打卡（带 GPS） |
| 员工 | POST | `/attendance/clock-out` | Employee | 下班打卡 |
| 员工 | GET | `/attendance/me` | Employee | 我的考勤 |
| 业绩 | GET | `/performance/me` | Employee | 我的业绩（系统自动核算） |
| 业绩 | GET | `/performance/leaderboard` | 任意已登录 | 排行榜 |
| Dashboard | GET | `/dashboard/summary` | Agent+ | 房源/合同/到期统计 |
| 项目 | GET / POST | `/projects` | Agent+ | 项目/楼盘 CRUD |
| 租客 | GET / PATCH | `/tenants/me` | Tenant | 租客档案 |
| 文档 | GET / POST | `/documents` | Agent+/Owner/Tenant | 文档中心（按 type 筛选） |
| 文档 | GET | `/documents/{id}/download` | 有权限 | 下载文件 |
| 推荐服务 | GET / POST | `/service-orders` | Owner/Tenant | 推荐服务下单 |
| 推荐服务 | PATCH | `/service-orders/{id}/status` | Agent+ | 更新订单状态（派单/完成） |
| 报修 | GET / POST | `/maintenance-tickets` | Tenant/Agent+ | 报修工单 |
| 报修 | PATCH | `/maintenance-tickets/{id}` | Agent+ | 更新工单状态 |
| 通知 | GET | `/notifications/me` | 任意已登录 | 我的站内信 |
| 通知 | PATCH | `/notifications/{id}/read` | 任意已登录 | 标记已读 |
| 佣金 | GET | `/commissions/me` | Employee | 我的佣金结算 |
| 佣金 | POST | `/commissions/{id}/approve` | Admin | 审核佣金 |
| 通知 | POST | `/notifications/dispatch` | 系统/Celery | 内部接口，发送通知 |
| 公司 | GET | `/company/info` | 公开 | 公司信息（地址/电话/社交媒体） |

> 完整 OpenAPI 文档由 FastAPI 自动生成，部署在 `/docs`（Swagger UI）和 `/redoc`。

---

## 5.3 领域事件规范

> 所有核心业务操作必须发布领域事件，作为未来 AI/BI/通知的可观测接入点。
> 实现方式：业务事务提交 → 写 `events` 表（outbox 模式） → Celery worker 转发到 Redis Streams → 消费者订阅。

| 事件类型 | 触发时机 | Payload 示例 | 消费者 |
|---|---|---|---|
| `lease.signed` | 租约创建/签约 | `{lease_id, property_id, tenant_id, monthly_rent}` | 通知、BI、推荐 |
| `lease.expiring` | 合同到期前 30/7/1 天 | `{lease_id, days_remaining}` | 通知、续约 AI |
| `lease.renewed` | 租约续约成功 | `{old_lease_id, new_lease_id, property_id}` | 通知、BI |
| `lease.terminated` | 租约终止/退房 | `{lease_id, property_id, reason, deposit_refunded}` | 通知、BI、财务 |
| `payment.received` | 收款成功 | `{payment_id, amount, currency, channel}` | 通知、BI、对账 |
| `payment.failed` | 收款失败 | `{payment_id, reason}` | 通知、重试 |
| `property.status_changed` | 房源状态变更 | `{property_id, from, to}` | BI、推荐 |
| `lead.created` | 新线索 | `{lead_id, source, budget}` | AI 评分、分配 |
| `lead.stage_changed` | 跟进阶段推进 | `{lead_id, from_stage, to_stage}` | BI、转化率分析 |
| `service_order.created` | 推荐服务下单 | `{order_id, service_type, property_id}` | 派单、通知 |
| `service_order.completed` | 服务完成 | `{order_id, rating, cost}` | BI、结算 |
| `maintenance_ticket.created` | 租客报修 | `{ticket_id, property_id, priority}` | 派单、通知 |
| `maintenance_ticket.resolved` | 报修解决 | `{ticket_id, cost, resolution}` | 通知、结算 |
| `commission.settled` | 佣金结算 | `{settlement_id, employee_id, amount}` | 通知、BI |
| `attendance.anomaly` | 考勤异常 | `{employee_id, type}` | 通知 |

---

## 6. 核心业务流程

### 6.1 房源 → 签约 → 收租 主流程
1. **录入房源**（Web） → 状态 `vacant`
2. **创建线索**（Web） → 跟进到 `closed`
3. **生成租约**（Web） → 上传合同 PDF → 状态 `active`
4. **房源状态** → `rented`
5. **Celery 定时任务**：每月 1 日生成应收账单 → 通过 Line/WeChat/WhatsApp 推送给租客
6. **租客支付**（App） → 选择渠道 → 上传凭证 / 支付成功回调
7. **Payment 状态** → `success` → 通知业主 + 员工
8. **Celery 提醒**：合同到期前 30/7/1 天推送续约通知

### 6.2 年度托管套餐订阅
1. 业主在 App 选择套餐
2. 生成 `service_package` 记录
3. 佣金（1 个月租金）一次性收取
4. 托管费（半个月租金）仅在有 `active` 租约的月份按比例收取
5. 每年自动续费提醒，提前 30 天通知业主

### 6.3 业绩月报与排行榜（系统自动核算）
1. 签约/续约成功 → 系统自动生成 `commission_settlements` 结算记录（归属成交员工）
2. 系统按自然月自动聚合员工业绩：`总业绩 = Σ 佣金基数`、`佣金 = Σ 佣金金额`、`成交单数`
3. 业绩汇总实时反映到 Dashboard 排行榜（按佣金降序）
4. 佣金审核/发放走后台结算流程，业绩口径始终以系统结算记录为准

### 6.4 推荐服务派单流程
1. 业主/租客在 App 选择服务类型（清洁/空调清洗/WiFi/水电代付/保险/税费代缴）
2. 创建 `service_orders`（status=`pending`）→ 发布 `service_order.created` 事件
3. 系统自动匹配外包商（Phase 1 人工分配，Phase 4 AI 智能匹配）
4. 状态 `pending → assigned` → 通知外包商 + 下单人
5. 外包商上门服务 → 状态 `in_progress`
6. 服务完成 → 状态 `completed` → 下单人验收 + 评分
7. 生成 `payment`（如有费用）→ 结算给外包商
8. 发布 `service_order.completed` 事件 → BI 分析

### 6.5 报修工单流程
1. 租客在 App 提交报修（描述 + 照片 + 优先级）
2. 创建 `maintenance_tickets`（status=`open`）→ 发布 `maintenance_ticket.created` 事件
3. 系统派单（优先 `urgent` 自动通知值班员工）
4. 状态 `open → assigned → in_progress`
5. 物业/外包处理 → 上传处理照片 → 状态 `resolved`
6. 租客确认验收 → 状态 `closed`
7. 如有费用 → 关联 `payment` → 发布 `maintenance_ticket.resolved` 事件
8. **退回机制**：租客不满意可从 `resolved` 退回 `in_progress`

### 6.6 续约流程
1. 合同到期前 30 天 Celery 任务触发 → 发布 `lease.expiring` 事件
2. 系统通过社交媒体 + 推送通知业主和租客
3. 租客在 App 确认续约意向 → 经纪跟进
4. 生成新租约（关联旧 `lease_id`）→ 上传新合同
5. 旧租约状态 `active → expired`，新租约 `active`
6. 押金处理：原押金结转 / 补差 / 退还（按业务规则）
7. 发布 `lease.renewed` 事件 → BI 统计续约率
8. 房源状态保持 `rented`

### 6.7 退房流程
1. 租客发起退租通知（提前 30 天，或协商）
2. 经纪安排验房日期 → 生成 `documents`（验房照片）
3. 验房流程：
   - 检查房屋损坏 → 拍照存证
   - 如有损坏 → 从押金扣除（需业主确认）
   - 生成验房报告 PDF
4. 水电清算：
   - 读取最后水电读数
   - 计算应付金额 → 关联 `service_orders`（utility_payment）
5. 押金结算：
   - 押金 - 扣除 - 水电欠款 = 应退金额
   - 生成退款 `payment`（原路退回 / 银行转账）
6. 租约状态 `active → terminated`
7. 房源状态 `rented → vacant`
8. 发布 `lease.terminated` 事件 → 通知业主 + BI
9. 文档归档：退房报告、验房照片、押金结算单存入 `documents`

### 6.8 佣金结算流程
1. 租约签约成功 → 自动生成 `commission_settlements`（status=`pending`）
2. 佣金类型：
   - `new_rental`：新租约佣金 = 1 个月租金（向业主收）
   - `renewal`：续约佣金 = 半个月租金（按合同约定）
   - `management`：托管费 = 半个月租金/年（仅托管套餐）
3. 月度结算任务（每月 1 日）：
   - 汇总当月所有 `pending` 佣金
   - 关联员工 `performance` 月报
   - 主管审核 → 状态 `pending → approved`
4. 财务发放 → 状态 `approved → paid` → 发布 `commission.settled` 事件
5. 员工 App 收到通知 → 可查看佣金明细
6. Dashboard 排行榜更新

---

## 7. 支付系统设计

> 系统需要覆盖**国内外已知大部分支付通道**。采用"**统一适配层 + 分阶段接入**"策略：先建好抽象，Phase 1 接 3-4 个核心渠道跑通流程，Phase 2/3 按业务量逐个扩展到 20+ 渠道。

### 7.1 支付渠道矩阵（类型 × 区域）

#### 7.1.1 中国大陆渠道

| 渠道 | 类型 | 接入方式 | 商户资质 | Phase | 备注 |
|---|---|---|---|---|---|
| 微信支付 | 钱包/QR | API 直连 | 国内营业执照 + ICP | **1** 🟢 | 境内版（CNY） |
| 支付宝 | 钱包/QR | API 直连 | 国内营业执照 + ICP | **1** 🟢 | 境内版（CNY） |
| 银联在线（UnionPay Online） | 银行卡 | API 直连 | 国内营业执照 | 2 🟡 | 覆盖借记卡/信用卡 |
| 京东支付 | 钱包 | API 直连 | 国内营业执照 | 3 ⚪ | 锦上添花 |
| 百度钱包 | 钱包 | API 直连 | 国内营业执照 | 3 ⚪ | 用户量小 |
| 云闪付 | 钱包/QR | API 直连 | 银联认证 | 2 🟡 | 银联系，覆盖广 |
| Apple Pay（境内） | 钱包 | 银联通道 | 走银联即可 | 2 🟡 | iOS 用户 |
| 银行直连（B2B） | 转账 | 各家银行 API | 公司银行账户 | 2 🟡 | 大额转账、对公 |

#### 7.1.2 国际通用渠道

| 渠道 | 类型 | 接入方式 | 商户资质 | Phase | 备注 |
|---|---|---|---|---|---|
| **Stripe** | 银行卡+钱包+BNPL | API 直连 | 海外公司主体（已有 ✅） | **1** 🟢 | Visa/MC/Amex/Apple Pay/Google Pay/Klarna 一站搞定 |
| **PayPal** | 钱包 | API 直连 | PayPal Business 账户 | 2 🟡 | 国际用户偏好 |
| **Apple Pay（国际）** | 钱包 | 走 Stripe/Adyen | 同上 | 2 🟡 | iOS 用户 |
| **Google Pay** | 钱包 | 走 Stripe/Adyen | 同上 | 2 🟡 | Android 用户 |
| **Visa / Mastercard 直连** | 银行卡 | 收单行 | 需 PCI-DSS 认证 | 3 ⚪ | 通常走 Stripe/Adyen 即可 |
| **Klarna / Afterpay** | 先买后付 | 走 Stripe | 同上 | 3 ⚪ | 欧美用户偏好 |

#### 7.1.3 东南亚本地渠道（重点）

| 渠道 | 适用国家 | 类型 | 接入方式 | Phase | 备注 |
|---|---|---|---|---|---|
| **PromptPay QR** | 泰国 | QR/银行转账 | 银行 API（SCB/KBank） | **1** 🟢 | 泰国央行官方，最普及 |
| TrueMoney Wallet | 泰国 | 钱包 | API 直连 | 2 🟡 | 泰国本地用户 |
| Rabbit LINE Pay | 泰国 | 钱包 | LINE Pay API | 2 🟡 | LINE 生态用户 |
| 7-Eleven Counter | 泰国 | 线下柜台 | Counter Service API | 2 🟡 | 不上网用户也能付 |
| PayNow | 新加坡 | QR/银行转账 | DBS/OCBC API | 2 🟡 | 新加坡央行 |
| GrabPay | 东南亚 | 钱包 | GrabPay API | 2 🟡 | 6 国通用 |
| ShopeePay | 东南亚 | 钱包 | Shopee Open API | 3 ⚪ | 电商用户 |
| DuitNow | 马来西亚 | QR/银行转账 | 银行 API | 3 ⚪ | 马来央行 |
| GCash | 菲律宾 | 钱包 | GCash API | 3 ⚪ | 菲央行 |
| PayPay | 日本 | QR | PayPay API | 3 ⚪ | 日 QR 龙头 |
| KakaoPay | 韩国 | 钱包 | Kakao API | 3 ⚪ | 韩主流 |
| Toss | 韩国 | 转账 | Toss API | 3 ⚪ | 韩新兴 |

#### 7.1.4 跨境转账 / 国际汇款

| 渠道 | 类型 | 接入方式 | Phase | 备注 |
|---|---|---|---|---|
| **Wise Transfer** | 跨境转账 | Wise API | **1** 🟢 | 多币种手续费低 |
| SWIFT | 银行间 | 收单行 | 2 🟡 | 大额 B2B |
| SEPA | 欧元区 | 银行 API | 2 🟡 | 欧洲用户 |
| MoneyGram | 汇款 | API | 3 ⚪ | 海外华人 |
| Western Union | 汇款 | API | 3 ⚪ | 海外华人 |
| PingPong / Airwallex | 跨境收款 | API | 2 🟡 | 国内出海商家收款 |
| **Alipay+** | 跨境钱包聚合 | Alipay+ API | 2 🟡 | 一键接入 10+ 亚洲钱包 |

### 7.2 支付聚合器对比（推荐方案）

> 调研显示：自建对接 20+ 渠道需 3-4 人月，且每年需持续维护各渠道 API 变更。**强烈建议优先评估支付聚合器**。

| 聚合器 | 覆盖渠道 | 费率 | 入驻难度 | 适合场景 | 接入成本 |
|---|---|---|---|---|---|
| **Stripe** | 银行卡+Apple/Google Pay+KLARNA+部分本地钱包 | 2.9% + $0.3 | 简单（已有海外主体） | 国际化首选 | 1-2 周 |
| **Adyen** | 银行卡 + 30+ 本地钱包（PromptPay/GrabPay/PayPay 等） | 协商（量大有优惠） | 中等 | 东南亚深度本地化 | 3-4 周 |
| **Checkout.com** | 类似 Adyen，覆盖广 | 协商 | 中等 | 替代 Adyen | 3-4 周 |
| **Ping++** | 中国聚合（微信/支付宝/银联等） | 0.6% | 简单（需国内主体） | 国内收款 | 1-2 周 |
| **Yaband Pay** | 东南亚聚合 | 1-2% | 简单 | 泰国本地收款 | 1-2 周 |

**推荐组合**：
- **国际通用** → Stripe（已覆盖银行卡 + Apple/Google Pay，可扩 PayPal/Klarna）
- **东南亚本地** → Adyen（30+ 钱包和银行转账）或 Yaband Pay（轻量）
- **中国大陆** → 微信/支付宝境内版直连（如有国内主体）或 Ping++ 聚合

### 7.3 统一支付接口（Adapter + Strategy 模式）

```python
from typing import Protocol
from enum import Enum

class PaymentChannel(str, Enum):
    # 国际
    STRIPE = "stripe"
    PAYPAL = "paypal"
    WISE = "wise"
    # 东南亚
    PROMPTPAY = "promptpay"
    TRUEMONEY = "truemoney"
    GRABPAY = "grabpay"
    # 中国大陆
    WECHAT_CN = "wechat_cn"
    ALIPAY_CN = "alipay_cn"
    UNIONPAY = "unionpay"
    # ...

class PaymentProvider(Protocol):
    """所有支付渠道必须实现的接口"""
    channel: PaymentChannel
    
    async def create_order(self, request: CreateOrderRequest) -> OrderInfo: ...
    async def query_status(self, order_id: str) -> PaymentStatus: ...
    async def cancel_order(self, order_id: str) -> CancelResult: ...
    async def refund(self, request: RefundRequest) -> RefundResult: ...
    async def handle_webhook(self, payload: bytes, headers: dict) -> WebhookResult: ...
    async def verify_webhook_signature(self, payload: bytes, signature: str) -> bool: ...

class CreateOrderRequest(BaseModel):
    idempotency_key: str          # 幂等键，防重复下单
    amount: Decimal               # 金额（最小单位：分）
    currency: str                 # ISO 4217
    description: str
    customer: CustomerInfo
    metadata: dict                # 业务数据：lease_id, owner_id, etc.
    success_url: str | None
    cancel_url: str | None
    expires_at: datetime | None

class OrderInfo(BaseModel):
    order_id: str
    channel: PaymentChannel
    amount: Decimal
    currency: str
    status: PaymentStatus
    payment_url: str | None       # 收银台 URL（网页跳转）
    qr_code: str | None           # QR 内容（钱包扫码）
    deep_link: str | None         # App 唤起链接
    expires_at: datetime | None

class PaymentService:
    def __init__(self):
        self._providers: dict[PaymentChannel, PaymentProvider] = {
            PaymentChannel.STRIPE: StripeProvider(),
            PaymentChannel.PROMPTPAY: PromptPayProvider(),
            PaymentChannel.WECHAT_CN: WechatCNProvider(),
            PaymentChannel.ALIPAY_CN: AlipayCNProvider(),
            PaymentChannel.WISE: WiseProvider(),
            # 后续 Phase 2/3 注册更多
        }
    
    async def pay(self, channel: PaymentChannel, request: CreateOrderRequest) -> OrderInfo:
        provider = self._providers[channel]
        return await provider.create_order(request)
    
    async def handle_webhook(self, channel: PaymentChannel, payload, headers) -> WebhookResult:
        provider = self._providers[channel]
        if not await provider.verify_webhook_signature(payload, headers.get("X-Signature")):
            raise InvalidSignatureError()
        return await provider.handle_webhook(payload, headers)
```

### 7.4 支付状态机

```
PENDING ──→ SUCCESS ──→ PARTIAL_REFUNDED ──→ REFUNDED
    │           │
    │           └──→ DISPUTED ──→ RESOLVED
    ├──→ FAILED
    ├──→ CANCELLED
    └──→ EXPIRED
```

### 7.5 关键子系统

#### 7.5.1 幂等键管理
- 客户端传 `Idempotency-Key` 头，UUID v4
- Redis 存 24h，重复键直接返回上次结果
- 防止用户重复点击、网络重试导致双扣

#### 7.5.2 统一 Webhook 路由
```
POST /api/v1/payments/webhook/{channel}
```
- 单一入口，channel 决定路由到哪个 provider
- 所有 webhook 必做：验签 → 幂等检查 → 解析 → 落库 → 触发业务事件
- 失败重试（指数退避）+ 死信队列

#### 7.5.3 对账任务（每日 03:00）
- 对比本地 `payments` 表 vs 各渠道后台账单
- 差异记录到 `payment_reconciliations` 表
- 差异 > 0.01 THB 报警
- 财务 Web 界面查看差异并手动处理

#### 7.5.4 退款流程
- 全额 / 部分退款
- 原路退回（Stripe/支付宝/微信都支持）
- 跨渠道退款（极少情况）需财务确认
- 退款同步生成反向 WHT 调整

#### 7.5.5 结算与对公账户
- 收款 → 公司收款账户 → 按结算周期提现
- 不同渠道结算周期：Stripe T+2，支付宝 T+1，微信 T+1，PromptPay T+1
- 资金归集到公司主账户后再分配给业主

### 7.6 路由与渠道路由器

```python
class PaymentRouter:
    """根据用户地区/币种/金额智能推荐最优渠道"""
    
    async def recommend(self, user: User, amount: Decimal, currency: str) -> list[PaymentChannel]:
        recommendations = []
        # 规则示例
        if user.country == "TH" and currency == "THB":
            recommendations.append(PaymentChannel.PROMPTPAY)  # 首选
        elif user.country == "CN" and currency == "CNY":
            recommendations.append(PaymentChannel.WECHAT_CN)
            recommendations.append(PaymentChannel.ALIPAY_CN)
        else:
            recommendations.append(PaymentChannel.STRIPE)
        return recommendations
```

### 7.7 安全与合规

- **PCI-DSS 合规**：首选方式是不接触卡号（Stripe Elements / Alipay SDK），避免自建卡号存储
- **Webhook 验签**：所有渠道强制 HMAC-SHA256 验签
- **金额服务端校验**：客户端不传最终金额
- **限流**：每用户每分钟 5 笔支付，每 IP 每小时 30 笔
- **资金安全**：对接渠道使用公司主体账户，开通双因子提现
- **反洗钱（AML）**：单笔 > 50,000 THB 触发人工审核
- **审计日志**：所有支付操作写 `audit_logs`（PDPA §27）

### 7.8 Phase 接入计划

#### Phase 1（必做 4 个）🟢
1. **Stripe**（覆盖国际银行卡 + Apple/Google Pay）
2. **PromptPay QR**（泰国本地核心）
3. **微信支付（境内版）**（如已注册国内主体；否则用跨境版）
4. **支付宝（境内版）**（同上）
- Phase 1 验收：能收至少 4 个渠道的款项，webhook 流程跑通，对账任务日跑无差异

#### Phase 2（按业务量扩展 6-8 个）🟡
- PayPal、Wise、TrueMoney、LINE Pay、银联云闪付、Alipay+、GrabPay、PayNow

#### Phase 3（补全其他）⚪
- PayPay、KakaoPay、Toss、GCash、DuitNow、7-Eleven Counter、MoneyGram、Western Union 等

#### 新渠道接入成本
- **走聚合器（推荐）**：每个渠道 1-3 天，主要是配置和测试
- **直连**：每个渠道 1-3 周（含资质申请、API 对接、webhook、对账、退款测试）

### 7.9 渠道适配器目录结构

```
backend/app/providers/payment/
├── __init__.py
├── base.py                 # PaymentProvider Protocol
├── service.py              # PaymentService 总控
├── router.py               # PaymentRouter 智能推荐
├── models.py               # CreateOrderRequest/OrderInfo 等
├── exceptions.py
├── channels/
│   ├── stripe.py
│   ├── promptpay.py
│   ├── wechat_cn.py
│   ├── alipay_cn.py
│   ├── wise.py
│   ├── paypal.py           # Phase 2
│   ├── truemoney.py        # Phase 2
│   └── ... (后续按需添加)
├── webhook.py              # 统一 webhook 路由
├── reconciliation.py       # 对账任务
└── refunds.py              # 退款服务
```

---

## 8. 通知系统设计

### 8.1 通知渠道适配器

```python
class NotificationChannel(Protocol):
    async def send(self, recipient: str, template: str, data: dict) -> bool: ...

# 实现
LineNotifyChannel()
WechatWorkBotChannel()
WhatsAppBusinessChannel()
FacebookMessengerChannel()
SmsChannel()
EmailChannel()
FCMPushChannel()  # App 推送
```

### 8.2 通知触发场景
| 场景 | 渠道优先级 | 模板 |
|---|---|---|
| 租金缴费提醒·租客 ≤M-7 | 社交媒体 → 推送 → 短信 | "您 X 月房租 X 元将于 X 日到期，请及时缴纳..." |
| 租金缴费提醒·租客 D-7/D-3/D-1 | 社交媒体 → 推送 → 短信 | "您 X 月房租 X 元将于 D 天后到期..." |
| 租金缴费跟进·员工 D-7/D-3/D-1 | 推送 → 站内信 | "负责租户 X 的租金 D 天后到期，请跟进催缴..." |
| 租金缴费·今日到期 D-0 | 推送 → 短信 | 租客"今日到期请缴费" / 员工"今日需跟进收款" |
| 租金缴费·逾期 | 推送 → 短信 → 升级 | 租客"已逾期请尽快缴纳" / 员工"逾期需处理并升级" |
| 合同到期提醒（D-30/D-7/D-1） | 社交媒体 → 推送 | "您的合同将于 X 日到期..." |
| 支付成功通知 | 推送 + 社交媒体 | "已收到 X 月租金 X 元..." |
| 续约通知 | 社交媒体 + 邮件 | "您的房源/租约可续约..." |
| 考勤异常 | 推送 | "您今日未打卡..." |

> 租金缴费通知策略：每日 09:00 Celery 执行 `check_upcoming_rent_payments`，对每个待缴租金单同时创建**租客 + 负责员工（agent）**两条站内通知，按阶段幂等去重（`template_key + related_entity_id`）避免重复推送。阶段模板键：租客 `rent_due_{7d/3d/1d/today}/rent_overdue`，员工对应 `_admin` 后缀。

### 8.3 失败重试
- Redis Stream 队列，失败入死信队列
- 指数退避重试（1min → 5min → 30min → 2h）
- 每日统计发送成功率到监控

---

## 9. 多语言与多端设计

### 9.1 国际化
- **前端**：i18next，资源文件 `zh.json / en.json / th.json`
- **后端**：错误消息国际化（Accept-Language 头）
- **数据库**：固定中文（如业主姓名）原文存，地址等可翻译字段存 `JSONB` 多语言副本

### 9.2 跨端代码复用策略
| 层 | 复用方式 |
|---|---|
| 后端 API | 100% 共享 |
| 业务逻辑（TypeScript） | 抽离到 `packages/shared`（如日期、金额格式化、校验规则） |
| UI 组件 | Web 用 AntD；App 用 NativeBase；小程序用 NutUI —— 视觉差异大，分开维护 |
| 类型定义 | 通过 OpenAPI 自动生成 TypeScript client，三端共用 |

### 9.3 货币与时区
- 数据库存 ISO 4217 货币代码（THB / USD / CNY）
- 展示时按业主/租客所在国家格式化
- 时区统一存 UTC，展示按 `Asia/Bangkok` 或 `Asia/Shanghai`

---

## 9A. 平台化界面设计规范（对标贝壳 C 端 App）

> **核心原则：C 端（租客/业主/公众）是"房产租赁 + 买卖平台"，不是"管理系统"。** 所有业务围绕**租赁**与**买卖**两条主线展开（MVP 以租赁为主业务、买卖做入口与在售列表）。界面让用户像逛贝壳/链家一样自然完成"找房→看房→签约/成交→收付→售后"的旅程。B 端（经纪/后台）仍保留表格化界面（见 §4.2）。

### 9A.1 视觉基调
| 维度 | 规范 |
|---|---|
| 主色 | 贝壳蓝系（约 `#00A0E9`）或品牌蓝，强调科技感与专业感 |
| 背景 | 页面大面积留白，卡片化内容浮于浅灰背景（`#F5F6F7`） |
| 卡片 | 白色圆角卡片（8–12px），阴影轻、无边框生硬感 |
| 价格 | **全平台统一醒目**：主色高亮 + 加粗大字号；租房 `฿ 25,000/月`，购房 `฿ 3,500,000` |
| 标签 | 圆角小标签（近地铁/急租/视频看房/可售），色块区分，不喧宾夺主 |
| 图片 | 大图优先，3:2 或 4:3 比例，顶部满宽轮播，支持懒加载 |
| 字体 | 大字号标题 + 中等正文，移动端优先，避免密集表格感 |

### 9A.2 信息架构（导航）
- **租客端**：底部 Tab 导航 = **首页 / 找房 / 消息 / 我的**（对标贝壳）
  - 首页顶部为**双业务入口**：`[租房] [买房]` 切换
- **业主端**：底部 Tab 导航 = **首页 / 收益 / 服务 / 我的**
  - 首页含"委托出租 / 委托出售"双入口
- 顶部：定位城市选择器 + 搜索框常驻（全球站最常用入口）
- 二级页：筛选抽屉从底部弹出，单选/多选标签，避免跳转堆叠
- 详情页：底部固定操作栏（联系 / 预约 / 收藏），关键动作始终可达

### 9A.3 关键交互模式
1. **找房 = 浏览驱动**：房源用瀑布流/卡片流，滚动加载，信息密度高但整洁
2. **筛选 = 抽屉式**：区域/价格/房型一次展开，实时回显计数，点"确定"即应用
3. **业务切换 = 顶部 Tab**：`[租房] [买房]` 一键切换，主色下划线高亮当前业务
4. **看房 = 一键预约**：选中房源 → 选时段 → 提交预约 → 经纪确认 → 通知
5. **签约/成交 = 引导式**：步骤条（确认房源→确认价格→上传证件→电子确认→完成），每步清晰
6. **收付 = 一键直达**：租客从"我的租约"直达支付（QR/钱包/凭证）；业主从"到账动态"直达收款
7. **收藏/足迹**：收藏按钮常驻卡片 & 详情，足迹自动记录，供复购/推荐
8. **地图找房**：列表可切地图模式，点位 + 底部卡片条，拖动地图实时刷新
9. **动效**：页面切换轻量滑入，卡片点击有反馈，不拖沓

### 9A.4 C 端页面清单（MVP 落地）
| 端 | 页面 | 说明 |
|---|---|---|
| 租客 | **首页（双门户）** | 城市定位 + 搜索 + `[租房/买房]` Tab + Banner + 功能宫格 + 主题模块 + 房源流 |
| 租客 | 房源列表 | 顶部 Tab（整租/合租/买房）+ 底部抽屉筛选 + 排序 + 卡片流 + 地图模式 |
| 租客 | 房源详情 | 轮播 + 视频/VR + 租/售价格 + 配套 + 地图周边 + 底部操作栏 |
| 租客 | 委托找房 | 提交需求（区域/预算/房型）→ 经纪跟进 |
| 租客 | 购房订单 | 看房约谈 / 成交进度（买房场景） |
| 租客 | 我的 | 足迹/收藏/预约/租约/交租/报修/购房订单 |
| 业主 | 首页（资产双业务） | 房源卡片 + 应收实收待收 + 到账动态 + 委托出租/出售入口 |
| 业主 | 委托中心 | 委托出租 / 委托出售（在线估价 → 挂牌 → 带看 → 成交） |
| 业主 | 收益中心 | 收入图表 + 收款明细（租金 + 售房款） |
| 业主 | 增值服务 | 托管套餐 + 清洁/维修/代缴 下单 |
| 业主/租客 | 登录/注册 | 手机号 + 验证码 + PDPA 同意勾选 |

### 9A.5 与 B 端的关系
- 同一房源数据，C 端展示"找房卡片"，B 端展示"管理表格"，**不复用同一套 UI**，但共享同一套 API
- 房源可同时挂牌出租与出售（标记 `sale_status` / `rent_status`），B 端维护，C 端实时反映
- 经纪在后台维护房源状态（空置/在租/在售），C 端实时反映；状态变更通过事件驱动同步（见 §5.3）
- C 端只暴露"浏览/预约/交租/购房意向"等消费者动作；"上架/定价/审核/成交/财务"一律收敛到 B 端

---

## 10. 安全设计

### 10.1 鉴权与授权
- JWT access token（15 分钟）+ refresh token（7 天，HttpOnly cookie 或 SecureStorage）
- RBAC：Admin / Agent / Owner / Tenant / Employee 五种角色
- 资源级权限（如租客只能看自己的租约）

### 10.2 数据安全
- 密码 bcrypt（cost=12）
- 敏感字段（身份证、银行卡）AES-256 加密存储
- HTTPS 全站，HSTS
- 数据库连接 SSL
- 定期备份（WAL 归档 + 每日全量）

### 10.3 防护
- 接口限流（Redis 滑动窗口）：登录 5 次/分钟，每用户 1000 次/小时
- SQL 注入：ORM 参数化 + 输入校验
- XSS：前端不直接渲染 HTML，所有富文本走白名单
- CSRF：JWT 不依赖 cookie，免 CSRF；refresh token 走 SameSite=Strict
- 文件上传：白名单 mime + 大小限制 + 病毒扫描（ClamAV）

---

## 11. 部署与运维（基础）

> 本章节描述 Phase 1 的基础运维。完整的可观测性演进规划见 [§19.3.4](#1934-可观测性opentelemetry)。

### 11.1 CI/CD
- **GitHub Actions / GitLab CI**
  - PR 触发：lint + type check + pytest + 单元测试
  - main 分支：构建 Docker 镜像 → 推送到 Registry → 部署到 staging
  - 手动审批 → 部署到 production

### 11.2 基础监控
- **错误监控**：Sentry（前端 + 后端）
- **指标**：Prometheus + Grafana（API 延迟、错误率、Celery 队列长度）
- **日志**：结构化 JSON → Phase 2 起接入 Loki/ELK 集中化
- **告警**：API P99 > 1s、错误率 > 1%、支付失败率 > 5%
- > 演进路径见 [§19.4 运维演进路径](#194-运维演进路径)

### 11.3 备份策略
- 数据库：每日全量 + 实时 WAL 归档，保留 30 天
- 文件：MinIO 跨区复制
- 灾备：每季度一次恢复演练

---

## 12. 阶段计划（Roadmap）

> **重要约束**：MVP 阶段目标 = **业务跑通** ≠ **功能完整**。下面对每个任务标注 **🟢 必做** / **🟡 可延后** / **⚪ 占位/桩**。

### Phase 1 - MVP（建议 10-12 周）
**目标：5 个端的核心流程跑通，能真实录入一笔房源并完成签约 + 月度税务合规 + PDPA 合规 + 演进基础设施就绪**

#### 后端基础（Week 1-3）
- 🟢 项目脚手架（FastAPI + Docker + CI）
- 🟢 用户/角色/RBAC（5 种角色）
- 🟢 PostgreSQL + Alembic 初始化（含 **WAL 归档**）
- 🟢 文件上传（MinIO，本地 mock 即可）
- 🟢 鉴权 API（login / refresh / me）
- 🟢 **PDPA 基础设施：consents / audit_logs / data_subject_requests 三表 + PII 加密层**
- 🟢 **隐私政策页面（zh/en/th）+ 注册流程同意勾选**
- 🟢 **统一公共字段**：`created_at/updated_at/deleted_at/metadata JSONB/version` 自动混入基类
- 🟢 **`events` 业务事件表 + Outbox 模式 + Redis Streams 转发**
- 🟢 **`feature_flags` 表 + 中间件**（灰度发布基础设施）
- 🟢 **结构化 JSON 日志 + request_id 中间件 + Prometheus `/metrics`**

#### 经纪团队端 - Web（Week 2-5）
- 🟢 房源 CRUD + 照片上传
- 🟢 线索管理 + 跟进状态机
- 🟢 租约管理 + 合同文件上传（含 SHA-256 哈希存证）
- 🟢 Dashboard 4 个核心数字
- 🟡 高级筛选/导出 Excel
- ⚪ 智能推荐（Phase 4）

#### 业主端 - App + 小程序（Week 3-6）
- 🟢 我的房产列表（只读）
- 🟢 文档查看（PDF 在线预览）
- 🟡 租金收入图表（接入 mock 数据）
- ⚪ 线上支付（Phase 2 接入）
- ⚪ 年度托管套餐订阅（Phase 3）

#### 租客端 - App + 小程序（Week 3-6）
- 🟢 我的租约（只读）
- 🟢 合同/收据查看
- 🟡 租金到期日历
- ⚪ 实际支付（Phase 2 接入）
- ⚪ 报修工单（Phase 3）

#### 员工端 - App + Web（Week 4-7）
- 🟢 上下班打卡（GPS）
- 🟢 联系方式展示
- 🟢 业绩自动核算（系统按佣金结算聚合）+ 排行榜
- ⚪ 外出登记
- ⚪ 促销奖励公布

#### 公司信息端 - Web 静态页（Week 1）
- 🟢 公司地址、地图、联系方式、社交媒体

#### 泰国税务子系统（Week 5-9，并行）
- 🟢 `tax_records` / `tax_invoices` / `company_tax_profile` / `wht_certificates` 四张表
- 🟢 WHT 计算引擎（个人 5% / 公司 3%）
- 🟢 e-Tax Invoice XML 生成器（按 RD 规范）
- 🟢 PKI 数字签名（PKCS#7）
- 🟢 RD API 适配器（sandbox 环境）
- 🟢 财务审核 Web 界面
- 🟢 月度 WHT 汇总 Celery 任务
- 🟢 每日 02:00 对账任务
- ⚠️ **RD 生产环境对接（需企业资质申请，Phase 1 末提交申请）**

#### PDPA 合规深化（Week 6-9）
- 🟢 4 个数据主体权利 API（export/rectify/delete/consents）
- 🟢 数据访问中间件自动写 `audit_logs`
- 🟢 Celery 数据保留清理任务（按 §17.6 策略）
- 🟢 DPO 联系方式展示
- 🟡 数据泄露应急流程文档 + 演练

#### 跨端共享（Week 8-10）
- 🟢 OpenAPI → TypeScript client 自动生成
- 🟢 多语言基础设施（zh / en，th 留位 → Phase 3 完善）
- 🟢 部署到 staging（**服务器必须位于泰国境内，AWS Bangkok 区域**）

#### Phase 1 验收标准
- ✅ 经纪能在 Web 录入 1 套房、跟进 1 条线索到签约
- ✅ 业主能用 App 看到自己这套房
- ✅ 租客能用 App 看到自己的租约
- ✅ 员工能打卡、查看排行榜
- ✅ 公开页能展示公司信息
- ✅ **能对一笔收款生成 e-Tax Invoice 草稿 + WHT 记录**
- ✅ **注册新用户必须勾选隐私政策，且所有同意行为留痕**
- ✅ **租客可一键导出自己的所有数据（PDPA §30）**

### Phase 2 - 支付与门户（4-6 周）
- [ ] 接入 Stripe + PromptPay QR
- [ ] 业主/租客真实账户与租金收付
- [ ] 收付款流水对账（Celery 日任务）
- [ ] 租金/合同到期定时提醒（Line + 邮件）
- [ ] 微信支付/支付宝（视业务量）

### Phase 3 - 增值与运营（4-6 周）
- [ ] 年度托管套餐订阅
- [ ] 推荐服务（清洁/维修）派单
- [ ] 完整泰语 i18n
- [ ] 业绩排行榜 + 奖励公示
- [ ] 通知适配器完善（WhatsApp / Facebook）

### Phase 4a - 数据分析与 BI（4-6 周）
**目标：让管理层能从数据中看到业务真相**
- [ ] **数据管道**：Debezium CDC 监听 PostgreSQL → Kafka / Redis Streams
- [ ] **数据仓库**：ClickHouse（自建）或 BigQuery（托管）
- [ ] **ETL/调度**：Apache Airflow 或 Dagster
- [ ] **BI 工具**：Metabase（开源）或 Superset
- [ ] **预置看板**：
  - 销售看板（线索转化率、漏斗、来源分析）
  - 房源看板（出租率、空置天数、收益分析）
  - 财务看板（应收/实收、佣金、WHT、渠道占比）
  - 员工看板（业绩排名、考勤、佣金）
- [ ] **Ad-hoc 查询**：业务人员自助 SQL
- [ ] **业务表补全**：`properties.attributes JSONB` 收集楼层/朝向等结构化特征

### Phase 4b - LLM 介入：OCR + 智能客服（4-6 周）
**目标：减少人工录入 + 提升业主/租客咨询响应速度**
- [ ] **LLM Gateway**（`ai_services` 适配层）上线，支持多模型
- [ ] **合同/收据 OCR**：上传 PDF/图片 → 抽取结构化数据（金额、日期、双方信息）→ 自动填充 `leases` 表
- [ ] **RAG 智能客服**：
  - 向量库（Qdrant / Milvus / Weaviate）
  - 索引范围：合同条款 FAQ / 公司服务说明 / 政策文档
  - 多语言（中/英/泰）问答
- [ ] **线索 AI 评分**：根据历史成交数据训练 lead_score 模型
- [ ] **自动翻译**：房源描述、文档多语言互译（zh ↔ en ↔ th）
- [ ] **Token 成本监控**：每日 / 每月用量 + 单次调用成本告警

### Phase 4c - LLM 介入：推荐 + 高级分析（4-6 周）
**目标：提升匹配效率 + 经营决策辅助**
- [ ] **房源-租客智能推荐**：基于 embeddings 的相似度匹配
- [ ] **租金定价建议**：ML 模型分析周边市场，给出合理价格区间
- [ ] **租约续约预测**：识别高续约概率客户 vs 流失风险
- [ ] **AI 助手（Agent 框架）**：经纪人用自然语言查询业务数据
- [ ] **异常检测**：自动识别异常支付、异常考勤

### Phase 5 - 架构演进（持续）
- [ ] 微服务拆分（按需：用户/房源/支付/税务独立部署）
- [ ] 多区域部署（曼谷 + 新加坡主备）
- [ ] 灾备与多活
- [ ] SaaS 化（待定）

---

## 13. 项目目录结构

```
vip-app/
├── backend/                          # FastAPI 后端
│   ├── app/
│   │   ├── api/                      # 路由（/api/v1/）
│   │   │   ├── v1/
│   │   │   │   ├── auth.py
│   │   │   │   ├── properties.py
│   │   │   │   ├── leases.py
│   │   │   │   ├── leads.py
│   │   │   │   ├── payments.py
│   │   │   │   ├── tax.py            # §16 税务子系统
│   │   │   │   ├── ai.py             # §19.2 LLM Gateway
│   │   │   │   ├── analytics.py      # §19.1 BI 端点
│   │   │   │   └── ...
│   │   ├── core/                     # 配置/安全/依赖
│   │   │   ├── config.py
│   │   │   ├── security.py
│   │   │   ├── database.py
│   │   │   ├── logging.py            # §19.3.4 JSON 日志
│   │   │   ├── middleware.py         # request_id / metrics
│   │   │   └── feature_flags.py      # §19.3.2
│   │   ├── models/                   # SQLAlchemy 模型
│   │   │   ├── base.py               # 公共字段基类（§5.1）
│   │   │   ├── user.py
│   │   │   ├── property.py
│   │   │   ├── lease.py
│   │   │   ├── event.py              # §5.3 领域事件
│   │   │   ├── audit.py              # §17 PDPA 审计
│   │   │   └── tax.py                # §16
│   │   ├── schemas/                  # Pydantic schemas
│   │   ├── services/                 # 业务逻辑层
│   │   │   ├── payment_service.py
│   │   │   ├── lease_service.py
│   │   │   ├── event_dispatcher.py   # §5.3 Outbox
│   │   │   └── ...
│   │   ├── tasks/                    # Celery 任务
│   │   │   ├── rent_reminder.py
│   │   │   ├── reconciliation.py
│   │   │   ├── wht_filing.py
│   │   │   └── data_retention.py     # §17 PDPA 清理
│   │   ├── providers/                # 外部服务适配器
│   │   │   ├── payment/              # §7 支付（30+ 渠道）
│   │   │   ├── notification/         # §8 通知
│   │   │   ├── tax/                  # §16 RD 泰国税务局
│   │   │   ├── ai/                   # §19.2 LLM Gateway
│   │   │   │   ├── base.py           # LLMProvider Protocol
│   │   │   │   ├── service.py        # AIService
│   │   │   │   ├── openai.py
│   │   │   │   ├── anthropic.py
│   │   │   │   ├── qwen.py
│   │   │   │   └── local_llm.py
│   │   │   └── storage/              # MinIO/S3
│   │   └── main.py
│   ├── alembic/                      # 数据库迁移
│   ├── tests/
│   ├── pyproject.toml
│   └── Dockerfile
├── frontend-web/                      # React 管理端（经纪/员工）
│   ├── src/
│   │   ├── pages/
│   │   ├── components/
│   │   ├── api/                      # OpenAPI 自动生成 client
│   │   └── i18n/                     # zh / en / th
│   └── package.json
├── mobile-app/                        # React Native（业主/租客）
│   ├── src/
│   │   ├── screens/
│   │   ├── components/
│   │   └── i18n/
│   └── package.json
├── mini-program/                      # Taro 3 微信小程序
│   ├── src/
│   └── package.json
├── packages/
│   └── shared-types/                 # 跨端共享 TypeScript 类型
├── infra/                            # 运维与部署
│   ├── docker-compose.yml            # 本地开发
│   ├── docker-compose.prod.yml       # 生产（Phase 2+）
│   ├── nginx/
│   ├── prometheus/
│   ├── grafana/
│   ├── airflow/                      # Phase 4a ETL
│   └── k8s/                          # Phase 2+ K8s 部署
├── docs/
│   ├── DESIGN.md                     # 本文档
│   ├── API.md                        # 自动生成
│   ├── DEPLOY.md
│   ├── ADR/                          # §19.6 架构决策记录
│   └── RUNBOOK.md                    # 运维手册
└── README.md
```

---

## 14. 风险与对策

| 风险 | 影响 | 对策 |
|---|---|---|
| Line/WhatsApp/Facebook 官方 API 审核周期长 | 通知功能延期 | 优先用 Line Notify（最简单）+ 邮件兜底 |
| 支付渠道各国合规要求不同 | 接入延期 | 优先上线 Stripe + PromptPay（泰国本地），其他渠道 Phase 2 |
| 业主/租客对 App 下载意愿低 | 用户增长慢 | 小程序作为主入口，App 作为补充 |
| 性能瓶颈（房源图片多） | 加载慢 | CDN + WebP 自动转换 + 懒加载 |
| 多语言翻译质量 | 用户体验 | 先中文 + 英文（机器翻译兜底），泰语请母语者校对 |
| 数据迁移（Excel 存量数据） | 上线延期 | 写一次性 ETL 脚本，Phase 1 末完成 |
| 🔴 **泰国 RD 生产环境申请周期长** | 真实税务申报延期 | 先用 sandbox 跑通，Phase 1 末提交企业资质 |
| 🔴 **PKI 数字证书管理** | 证书过期导致申报失败 | 自动到期告警（提前 60 天）+ 多证书备份 |
| 🔴 **PDPA 合规审计未通过** | 罚款最高 500 万泰铢 | 法务 + DPO 介入；Phase 1 必做项不可妥协 |
| 🟡 **PII 加密对性能影响** | 查询变慢 | AES-GCM 硬件加速；PII 字段加索引冗余明文 hash（只用于查找） |

---

## 15. 业务确认事项（已确认 v1.0）

> 业务方已确认 5 项关键决策（2026-07-28），架构与数据模型已按此调整。

| # | 问题 | 决定 | 对架构的影响 |
|---|---|---|---|
| 1 | 多公司/多租户 | **单一公司使用** | 移除 `company_id` 多租户字段；user/role 模型简化 |
| 2 | 泰国税务局对接 | **需要** | 新增"税务子系统"章节（见 §16），涉及 WHT 计算与 e-Tax Invoice |
| 3 | 电子合同 | **待确认** | Phase 1 暂按"PDF 上传 + SHA-256 哈希存证"实现，留可替换的接口 |
| 4 | PDPA 合规 | **需要** | 新增"PDPA 合规设计"章节（见 §17），含 consent/audit_log/PII 加密 |
| 5 | 离线工作 | **不需要** | 不开发离线缓存；员工端需要联网 |

---

## 15A. 待与业务核对事项清单

> **用途：** 集中列出所有需要业务方/甲方拍板确认的点，避免散落、遗漏。核对完成后，将"决定"回填到本表，并同步标记到对应设计章节。**优先级：🔴 高（影响架构/收入，必须在设计定稿前确认）；🟡 中（影响功能范围，MVP 前确认）；🟢 低（上线前后确认即可）。**

### 15A.1 商业模式与收入（🔴 最关键）

| # | 决策点 | 现状/假设 | 需确认 | 优先级 | 影响章节 |
|---|---|---|---|---|---|
| A1 | 公司定位 | 房产租赁 + 买卖双业务经纪平台 | 是"经纪平台"（撮合）还是"托管公司"（包租转租）？两者法律义务与资金流不同 | 🔴 | §1/§2 |
| A2 | 收入来源 | 佣金 + 托管费 + 服务费 | 主要收入是佣金/托管费/服务费差价/平台抽成/租金息差？ | 🔴 | §1/§7 |
| A3 | 佣金模式 | 佣金 = 1 个月租金（业主托管套餐） | 向业主收还是向租客收？双边？买卖佣金比例？ | 🔴 | §6.2/§6.8 |
| A4 | 托管模式 | 年度托管套餐（佣金 1 个月 + 托管费 0.5 个月，仅在有租约时收）| 是否做"包租转租"？空置期是否免托管费？住宅/商产是否区分？ | 🔴 | §6.2 |
| A5 | 增值服务定价 | 硬编码：清洁 ฿1500/次、空调 ฿800/台、代缴税费 ฿500/次、水电 ฿200/月、保险 ฿300/次 | 定价谁定？是否含税？分区域调价？是否后台可配置？ | 🟡 | §6.4 |
| A6 | 买卖业务范围 | MVP 仅做"入口 + 在售列表" | 买卖是否 Phase 1 必须完整跑通（估价/带看/成交）？还是仅展示？ | 🟡 | §2.2/§9A |
| A7 | 币种 | 全栈泰铢 ฿ | 国内用户是否需要人民币展示？汇率来源与基准日？ | 🟡 | §9.3 |

### 15A.2 目标用户与市场（🔴）

| # | 决策点 | 现状/假设 | 需确认 | 优先级 | 影响章节 |
|---|---|---|---|---|---|
| B1 | 用户优先级 | 在泰中国人 + 国内中国人 | 主要用户：在泰租客 / 国内业主 / 泰本地人？排序 | 🔴 | §1 |
| B2 | 地域范围 | 曼谷/普吉/清迈/芭提雅/华欣（前端硬编码） | 是否含苏梅/甲米等？区域固定还是后台可配？ | 🟡 | §2/§9A |
| B3 | 物业类型 | 公寓为主 | 是否含别墅/商铺/写字楼/酒店公寓？ | 🟡 | §2/§9A |
| B4 | 语言优先级 | 中英泰三语 | 主语言？泰文是否必须（影响合同/税务文档）？ | 🟡 | §9 |
| B5 | 获客渠道 | — | 用户从哪来？是否需要裂变/推荐机制？ | 🟢 | §20 |

### 15A.3 业务边界（Phase 1 做什么）（🔴）

| # | 决策点 | 现状/假设 | 需确认 | 优先级 | 影响章节 |
|---|---|---|---|---|---|
| C1 | 必上端 | 5 端全做 | Web/App(iOS+Android)/小程序，Phase 1 全上还是分批？ | 🔴 | §12 |
| C2 | 核心闭环 | 房源→签约→收租 | 租赁找房闭环 Phase 1 必须跑通哪些环节？ | 🔴 | §6 |
| C3 | 线上支付 | 支付适配器已写，未真实联调 | Phase 1 必须线上付款？还是允许线下转账+传凭证？ | 🔴 | §7 |
| C4 | 电子合同 | PDF 上传 + 哈希存证 | 是否做电子签约（Legal tech）？还是 PDF 存证即可？ | 🟡 | §6 |
| C5 | 报修/服务 | mock 界面 | Phase 1 是否上线闭环？还是仅展示联系方式？ | 🟡 | §6.5 |
| C6 | 员工/考勤 | mock | Phase 1 是否做内部团队管理？还是先只做业主租客侧？ | 🟡 | §2.4 |
| C7 | 公司信息端 | — | Phase 1 是否需要？ | 🟢 | §2.5 |

### 15A.4 合规与资质（🔴）

| # | 决策点 | 现状/假设 | 需确认 | 优先级 | 影响章节 |
|---|---|---|---|---|---|
| D1 | 运营主体 | — | 泰国公司还是中国公司？还是两地各一个？影响税务/支付资质 | 🔴 | §16/§7 |
| D2 | 经纪牌照 | — | 是否持有泰国房地产经纪牌照？外籍从业限制？ | 🔴 | §1 |
| D3 | PDPA 数据存储 | 部署定在新加坡 | PII 能否存新加坡？是否必须在泰国境内？跨境传输需额外同意？ | 🔴 | §17 |
| D4 | 泰国税务 | e-Tax Invoice / WHT | 是否对接 RD API？业主泰籍/外籍（税率不同）？ | 🔴 | §16 |
| D5 | 小程序备案 | ICP 备案需 20 工作日 | 备案主体是哪家中国公司？营业执照齐全？ | 🔴 | §11 |
| D6 | 支付资质 | 微信/支付宝需中国主体，PromptPay 需泰国主体 | 两者主体是否都具备？ | 🔴 | §7 |
| D7 | 外汇 | — | 跨境租金收付是否涉外汇管制？资金如何合规回流？ | 🟡 | §7/§16 |

### 15A.5 财务与资金流（🔴）

| # | 决策点 | 现状/假设 | 需确认 | 优先级 | 影响章节 |
|---|---|---|---|---|---|
| E1 | 收款账户 | — | 租金打到平台账户还是业主账户？是否资金监管（escrow）？ | 🔴 | §7 |
| E2 | 分账周期 | — | 平台收租后多久结算给业主？T+1？月结？ | 🔴 | §7.5 |
| E3 | 抽成方式 | — | 每笔抽成还是固定服务费？ | 🔴 | §7 |
| E4 | 发票 | — | 给业主/租客开发票吗？泰票还是中国票？谁开？ | 🟡 | §16 |
| E5 | 税务承担 | — | 租金税/WHT/VAT 谁承担？平台代缴还是业主自理？ | 🟡 | §16 |
| E6 | 押金归属 | 默认 2 个月租金 | 押金存平台还是业主？押金统一比例？违约扣押规则？退租走原路退回？ | 🟡 | §6.7 |
| E7 | 滞纳金/违约金 | 未实现 | 是否收逾期滞纳金？比例？提前退租违约金？ | 🟡 | §6 |

### 15A.6 组织与运营（🟡）

| # | 决策点 | 现状/假设 | 需确认 | 优先级 | 影响章节 |
|---|---|---|---|---|---|
| F1 | 运营方 | — | 上线后房源录入/客户跟进/催租由谁负责？ | 🟡 | §11 |
| F2 | 客服 | — | 客服谁做？响应 SLA？工作时段（中泰时差）？ | 🟡 | §8 |
| F3 | 维修团队 | — | 自有还是外包？覆盖城市？响应时效？ | 🟡 | §6.5 |
| F4 | 系统运维 | — | 上线后运维由我方托管还是客户团队接管？ | 🟡 | §11 |
| F5 | 权限分配 | admin/agent/owner/tenant/employee 5 角色 | 谁是超管？谁能审批新员工/经纪账号？角色边界？ | 🟡 | §10 |

### 15A.7 数据与隐私（🟡）

| # | 决策点 | 现状/假设 | 需确认 | 优先级 | 影响章节 |
|---|---|---|---|---|---|
| G1 | 数据归属 | — | 房源/客户数据归公司还是平台？合同终止后如何处理？ | 🟡 | §17 |
| G2 | 数据留存 | — | 用户注销后数据保留多久？合同/财务记录法定留存期？ | 🟡 | §17.6 |
| G3 | 隐私同意 | PDPA 同意勾选已实现 | 同意条款文案谁撰写？是否需律师审核？撤回同意流程？ | 🟡 | §17.5 |

### 15A.8 第三方对接凭证（上线前必须提供）

| # | 类别 | 需提供凭证 | 最迟时间 | 影响节点 |
|---|---|---|---|---|
| H1 | 支付 | 支付宝 APP_ID/密钥、微信 MCH_ID/KEY/证书、PromptPay Merchant ID、Stripe Key、Wise API Key | Phase1 前 | §7 |
| H2 | 通知 | Twilio SID/Token/号码、SMTP、FCM、Line/WhatsApp 凭证、微信通知凭据 | Phase1 前 | §8 |
| H3 | 税务 | 泰国税务局 RD API Key（e-Tax/WHT） | Phase1 | §16 |
| H4 | 地图 | Google Maps / Longdo Map Key | Phase1 | §2 |
| H5 | OCR/实名 | 护照/身份证 OCR 服务账号 | Phase1 | §17 |
| H6 | 短信（泰国） | AIS/TrueMove SMS API 账号 | Phase1 | §8 |
| H7 | 回调地址 | 各支付通道 notify/callback 域名 | Phase1 | §7.5 |

### 15A.9 部署与运维（🟢）

| # | 决策点 | 现状/假设 | 需确认 | 优先级 | 影响章节 |
|---|---|---|---|---|---|
| I1 | 云厂商 | 推荐阿里云（新加坡主 + 国内小程序） | 是否同意？还是 AWS/腾讯云？ | 🟢 | §11 |
| I2 | 域名 | 未购买 | 域名想叫什么？.com 还是 .co.th？ | 🟢 | §11 |
| I3 | 备案主体 | — | 备案主体公司全称/负责人？ | 🟢 | §11 |
| I4 | SSL | 免费 Let's Encrypt | 是否需要企业 OV 证书？ | 🟢 | §11 |
| I5 | 备份策略 | 未定 | 备份频率/保留期/异地灾备？ | 🟢 | §11 |
| I6 | 运维责任 | — | 上线后运维谁负责？ | 🟢 | §11 |

### 15A.10 内容与多语言（🟢）

| # | 决策点 | 现状/假设 | 需确认 | 优先级 | 影响章节 |
|---|---|---|---|---|---|
| J1 | 泰文翻译 | AI 生成 | 是否需要业务方/泰籍员工校对？专业术语是否准确？ | 🟢 | §9 |
| J2 | 营销文案 | 开发者撰写 | 是否需要市场部定稿？ | 🟢 | §9 |
| J3 | 公司信息 | 未填 | 实际电话/地址/Line/Facebook/IG/微信？ | 🟢 | §2.5 |
| J4 | 房源描述模板 | 未定 | 是否需要标准文案模板？多语言同步方式？ | 🟢 | §2 |

### 15A.11 项目交付与付款（依据当前方案，待双方确认）

| # | 决策点 | 现状/假设 | 需确认 |
|---|---|---|---|
| K1 | 付款分期 | 4 期：预付 20% + 后端Web 30% + 移动端 30% + 上线质保 20% | 比例是否认可？ |
| K2 | 开发周期 | 3 个月（W1–W12）+ 3 个月质保 | 周期是否认可？ |
| K3 | 质保期 | 3 个月免费修缺陷 | 时长是否认可？ |
| K4 | 范围变更 | 超《业务确认书》走变更单另计费 | 是否认可？ |
| K5 | 第三方费用 | 云/API/短信/上架费由甲方承担 | 是否认可？ |
| K6 | 源码归属 | 质保尾款结清后归甲方 | 是否认可？ |
| K7 | 甲方配合项 | 域名/备案/开发者账号/支付商户号 Key 由甲方按时提供 | 是否认可？ |

### 15A.12 新增增强需求（v1.8·7 项）核对清单（🟡）

> 对应 §22「新增增强需求」，后端接口已预留，依赖以下第三方凭证与业务决策方可深度启用。

| # | 功能 | 决策点 | 现状/假设 | 需确认 | 优先级 | 影响章节 |
|---|---|---|---|---|---|---|
| L1 | 即时聊天 | 会话挂载实体 | 支持房源/租约/订单挂载 + 自由会话 | 聊天入口放在哪些页面？是否需要客服工作台？ | 🟡 | §22.1 |
| L2 | 即时聊天 | 附件/离线 | 文字+图片+文件，WebSocket 在线推送 | 附件大小上限？离线留言与推送渠道？消息存档时长？ | 🟡 | §22.1 |
| L3 | 电子签 | 签名方案 | 站内数字签名（RSA/HMAC）+ SVG | 是否需对接第三方电子签（DocuSign 等）保证司法认可？ | 🔴 | §22.2 |
| L4 | 电子签 | 合同模板 | counters 渲染 HTML 合同 | 合同条款/模板由谁提供？中/英/泰版本？ | 🔴 | §22.2 |
| L5 | 电子签 | 效力属地 | 泰国电子交易法（ECT Act）效力 | 是否有本地律所出具电子签效力意见？ | 🟡 | §22.2 |
| L6 | AI 接口 | 第三方 | OpenAI 兼容接口 | 是否有 `OPENAI_API_KEY` 及额度预算？ | 🟡 | §22.3 |
| L7 | AI 接口 | 应用优先级 | 智能客服/合同生成/找房问答/自动回复/翻译 | 首期上线哪几个场景？PDPA 数据合规如何约束？ | 🟡 | §22.3 |
| L8 | 备份 | 策略 | 每日 02:00 Celery 全库 .gz 备份 | 保留期/异地灾备目标（MinIO/S3）？是否需多级备份？ | 🟡 | §22.4 |
| L9 | 地图找房 | 凭证 | Google Maps Geocoding | Google Maps API Key + 计费账本（合并 §15A.8 H4）？ | 🟡 | §22.5 |
| L10 | 地图找房 | 点位存储 | properties 存 lat/lng | 房源如何批量打点？是否需要地图聚类/国际化标签？ | 🟡 | §22.5 |
| L11 | 翻译 | 凭证 | Google Cloud Translation v2 | Google Translation API Key 及目标语言范围（zh/en/th/…）？ | 🟡 | §22.6 |
| L12 | 翻译 | 缓存 | 未缓存 | 是否缓存翻译结果以减少 API 费用？ | 🟢 | §22.6 |
| L13 | GPS 考勤 | 半径 | 默认 500KM、办公点曼谷 | 基准办公点经纬度？各分公司是否独立半径？ | 🔴 | §22.7 |
| L14 | GPS 考勤 | 外勤审批 | ExternalTripApplication 前后台审批 | 外勤申请审批层级/时限？需对接 Google Maps 距离校验？ | 🟡 | §22.7 |
| L15 | GPS 考勤 | 隐私授权 | 打卡上传 lat/lng | 是否需员工定位授权（PDPA 知情同意，复用 consents）？ | 🟡 | §22.7 |

---

## 16. 泰国税务子系统（Tax Subsystem）

> 公司作为中介代业主/租客处理税务申报，必须在 Phase 1 就纳入，不能延后。

### 16.1 涉及税种
| 税种 | 适用 | 税率 | 频率 | 备注 |
|---|---|---|---|---|
| **WHT（预扣所得税）** | 业主收到租金时 | 个人 5% / 公司 3% | 月度代扣，季度申报 | 中介作为代扣义务人 |
| **e-Tax Invoice** | 每笔租金收款 | — | 每笔 | 需 RD 数字证书签名 |
| **印花税** | 租赁合同 | 0.1%（租金总额） | 签订时一次性 | 合同签订后 15 日内缴纳 |
| VAT | 一般不适用 | 7% | — | 个人出租住宅通常不交；公司主体按情况 |

> ⚠️ 具体税种、税率、计算口径需由泰国本地会计师复核后落地。

### 16.2 数据模型新增

#### `tax_records`（税务记录）
- `id, lease_id, payment_id, tax_type(wht/stamp/vat), tax_base, tax_rate, tax_amount, status(pending/filed/paid), rd_document_id, filed_at, paid_at`

#### `tax_invoices`（电子发票）
- `id, payment_id, invoice_number, issue_date, seller_info, buyer_info, line_items[], subtotal, tax_amount, total, xml_payload, signature, rd_submission_id, status(draft/submitted/accepted/rejected)`

#### `company_tax_profile`（公司税务档案，单条）
- `id, company_name, tax_id, rd_certificate_serial, rd_certificate_pem, rd_api_key, rd_environment(sandbox/prod)`

#### `wht_certificates`（预扣税证明）
- `id, owner_id, tax_year, total_rent, total_wht, certificate_pdf_url, issued_at, submitted_to_rd_at`

### 16.3 业务流程

#### 月度 WHT 代扣流程
1. 月底 Celery 任务聚合当月所有 `payments` 记录
2. 按业主分组，计算 WHT（个人 5% / 公司 3%）
3. 生成 `tax_records`（status=pending）和 `wht_certificates` 草稿
4. 财务在 Web 后台审核 → 确认提交
5. 通过 RD API 提交（XML + 数字签名）
6. 状态同步：`pending → filed → paid`

#### e-Tax Invoice 流程
1. 租客每笔付款成功（webhook 回调）后
2. 自动生成 `tax_invoices`（草稿）
3. 调用 RD `IssueInvoice` API 提交（XML 格式 + PKI 签名）
4. 状态：`draft → submitted → accepted/rejected`
5. `accepted` 后生成 PDF 给租客/业主下载

### 16.4 技术组件

```
backend/app/providers/tax/
├── rd_api.py              # RD 官方 API 客户端（HTTP + 签名）
├── wht_calculator.py      # WHT 计算引擎
├── invoice_builder.py     # e-Tax Invoice XML 生成器
├── pdf_renderer.py        # PDF 渲染（WeasyPrint）
├── certificate_manager.py # PKI 证书管理
└── exceptions.py          # RD 错误码 → 业务异常映射
```

**关键依赖**：
- `cryptography`：PKCS#7 数字签名（RD 要求）
- `lxml`：XML 生成
- `WeasyPrint`：PDF 渲染
- `httpx`：RD API 异步调用

### 16.5 RD API 适配器（Adapter 模式）
```python
class TaxAuthorityProvider(Protocol):
    async def submit_wht(self, records: list[TaxRecord]) -> SubmissionResult: ...
    async def issue_invoice(self, invoice: TaxInvoice) -> InvoiceResult: ...
    async def query_status(self, submission_id: str) -> StatusResult: ...
    async def download_certificate(self, wht_id: str) -> bytes: ...

class RDThailandProvider:
    """泰国税务局 RD API 实现"""
    def __init__(self, cert: RDCertificate): ...
    # 实现 4 个方法，对接 RD Open API
```

### 16.6 失败与重试
- RD API 限流（429）→ 指数退避（1/5/30 分钟）
- 签名失败 / 证书过期 → 紧急告警 + 阻塞所有税务提交
- 申报失败 → 死信队列 + 人工介入界面
- 每日 02:00 对账任务：本地 `tax_records` vs RD 提交记录

### 16.7 Phase 1 必做项（不可延后）
- [ ] WHT 计算引擎
- [ ] e-Tax Invoice XML 生成
- [ ] RD 沙箱环境对接（先 sandbox，prod 需 RD 审批）
- [ ] 财务审核界面
- [ ] 月度 Celery 任务

---

## 17. PDPA 合规设计（Thailand PDPA）

> PDPA（Personal Data Protection Act, B.E. 2562）于 2022 年 6 月 1 日全面生效。违规最高罚款 500 万泰铢。**必须从 Phase 1 就落地，不能后补。**

### 17.1 PDPA 核心要求映射

| PDPA 条款 | 系统要求 | 实现方式 |
|---|---|---|
| §22 知情同意 | 注册/收集时显式同意 | `consents` 表 + 注册流程勾选 |
| §23 目的限定 | 仅用于声明目的 | 数据访问层校验 `purpose` |
| §24 数据最小化 | 不收集无关字段 | 表结构最小化 + 字段白名单 |
| §25 数据准确性 | 可更新、可更正 | 租客/业主可自助修改 PII |
| §26 存储限制 | 超期删除/匿名化 | Celery 定时清理任务 |
| §27 安全措施 | 加密 + 访问控制 | PII 字段加密 + RBAC |
| §30 数据主体权利 | 查阅/更正/删除/可携带 | 4 个 API 端点 |
| §33 跨境传输 | 充分保护措施 | 服务器位于泰国境内（AWS Bangkok） |
| §37-41 数据泄露通知 | 72 小时内通报 | Sentry 告警 + 应急流程 |
| §42-45 DPO | 任命数据保护官 | 公司层面任命，系统中记录 DPO 联系方式 |

### 17.2 数据模型（PDPA 相关，定义见 §5.1）

> 以下表已在 §5.1 统一定义，此处仅说明 PDPA 合规要点。

| 表名 | PDPA 条款 | 合规要点 |
|---|---|---|
| `consents` | §22 知情同意 | 每次同意/撤回都必须记录 IP、User-Agent、政策版本 |
| `audit_logs` | §27 安全措施 | 每次访问 PII 字段必须记录 `pii_fields_accessed[]` |
| `data_subject_requests` | §30 数据主体权利 | 请求处理 SLA：30 天内响应 |
| `privacy_policy_versions` | §22 知情同意 | 政策变更时需重新获取用户同意 |

### 17.3 PII 加密策略

**PII 字段识别清单**：
- `users.id_card_no, passport_no, bank_account, tax_id`
- `tenants.emergency_contact, employer_info`
- `leads.phone, line_id, wechat_id, whatsapp`
- `payments.bank_reference`

**加密方案**：
- 算法：AES-256-GCM
- 密钥管理：AWS KMS / HashiCorp Vault
- 每字段独立 IV，密文存数据库，明文需运行时解密
- 密钥每 90 天轮换

### 17.4 数据主体权利 API

| 端点 | 方法 | 说明 | 实现时间 |
|---|---|---|---|
| `/api/v1/users/me/data-export` | GET | 导出本人所有数据（JSON + PDF） | Phase 1 |
| `/api/v1/users/me/data-rectify` | POST | 更正本人 PII 字段 | Phase 1 |
| `/api/v1/users/me/delete` | POST | 申请删除账户（软删除 + 30 天后悔期） | Phase 1 |
| `/api/v1/users/me/consents` | GET / PATCH | 查看与撤回同意 | Phase 1 |

### 17.5 注册流程改造

```
[输入手机号] → [发送验证码] → [设置密码] → 
[隐私政策勾选✅ + 明确同意项: 
  □ 同意为租赁服务收集和使用数据（必选）
  □ 同意接收租金/合同提醒（必选）
  □ 同意接收营销信息（可选）
] → [注册成功]
```

每一步记录到 `consents` 表，关联 `privacy_policy_versions`。

### 17.6 数据保留与删除策略

| 数据类型 | 保留期 | 过期处理 |
|---|---|---|
| 用户基本信息 | 账户存续期间 | 软删除 → 30 天后硬删除 |
| 合同/收据 | 合同结束后 10 年（泰国法律要求） | 匿名化 PII |
| 支付流水 | 5 年 | 匿名化 PII |
| 考勤记录 | 3 年 | 硬删除 |
| 审计日志 | 3 年 | 压缩归档 |
| 营销同意 | 撤回后立即停止使用 | 记录撤回时间 |

### 17.7 第三方数据共享清单（需用户单独同意）
- 支付渠道（Stripe/Alipay/Wise）→ 支付时单独同意
- Line/WeChat/WhatsApp → 通知时单独同意
- 泰国税务局 RD → 税务申报（基于法律义务，可不取得同意但需告知）
- 保险公司/外包维修 → 服务订单时单独同意

### 17.8 Phase 1 必做项（不可延后）
- [ ] `consents` / `audit_logs` / `data_subject_requests` 三张表
- [ ] PII 字段加密（应用层透明加解密）
- [ ] 4 个数据主体权利 API
- [ ] 注册流程改造 + 隐私政策页面（中/英/泰）
- [ ] Celery 数据保留清理任务
- [ ] 公司层面任命 DPO 并在系统记录

---

## 18. 文档版本记录

| 版本 | 日期 | 变更 |
|---|---|---|
| v1.0 | 2026-07-28 | 初版：5 端架构 + Python FastAPI 技术栈 + REST API 表 + 4 阶段路线图 |
| v1.1 | 2026-07-28 | 业务确认 5 项决策落地；新增 §16 泰国税务子系统（WHT/e-Tax Invoice）、§17 PDPA 合规设计；移除多租户字段；调整 Phase 1 必做项 |
| v1.2 | 2026-07-28 | 支付系统全面扩展：新增 §7 渠道矩阵（中国大陆/国际/东南亚/跨境 30+ 渠道）、聚合器对比（Stripe/Adyen/Ping++）、统一接口增强（幂等键、智能路由、状态机）；新增 `payment_reconciliations` 表 |
| v1.3 | 2026-07-28 | 新增 §19 系统演进规划（数据 BI、LLM/AI、架构柔性）；拆分 Phase 4 为 4a/4b/4c；新增 `events` / `feature_flags` / `audit_logs` / `consents` / `data_subject_requests` 表；统一所有业务表公共字段（created_at/updated_at/deleted_at/metadata/version）；新增 §5.3 领域事件规范 |
| v1.4 | 2026-07-28 | **全面审查修复**：修复 4 处内部矛盾（架构图 Django Admin→SQLModel、§4.6 支付表更新、§17.2 PDPA 表去重引用 §5.1、§11 简化交叉引用 §19）；新增 7 个缺失实体（projects/tenants/documents/service_orders/maintenance_tickets/notifications/commission_settlements）；新增 5 个业务流程（§6.4-6.8：推荐服务派单/报修工单/续约/退房/佣金结算）；新增 §20 后续可扩展模块（10 项：消息中心/文件版本/信用评估/爬虫/API 门户/审计界面/推送策略/自助验房/财务报表/SaaS 预留）；新增 §21 文档健康度检查清单；领域事件从 8 类扩展到 15 类；ER 图更新；API 端点表新增 12 个端点 |
| v1.5 | 2026-07-28 | **新增 §24 容量规划与性能基线**（用户量/并发量估算、各组件 QPS 上限、5 大瓶颈分析、3 个阶段部署规格与月费用、9 项 SLO 指标、5 个压测场景、横向扩展策略）；回答"本架构能扛多少并发"的明确数据：单实例 200-300 并发用户 / 80-150 QPS，理论上限 3,000-5,000 并发连接 |
| v1.6 | 2026-07-28 | **新增 §24.10 高并发演进方案（10 万 DAU 场景）**：核心结论（技术栈能支撑但需分布式升级）、10 万 DAU 容量重算（峰值 1-1.5 万并发/3,000-5,000 QPS）、各组件承载差距分析（8 组件）、目标架构图（K8s + PG 主从 + Redis Cluster + Kafka + S3/CDN + 多 AZ）、5 层瓶颈与升级方案对照、$4,700/月成本估算、5 个高 ROI 升级项、分 5 阶段迁移路径 |
| v1.7 | 2026-08-05 | **产品定位重构为"房产中介平台 + 增值服务"（对标贝壳找房）**：更新 §1 项目概述（C 端找房平台体验 vs B 端管理后台）；重写 §2.2 租客端（找房旅程）、§2.3 业主端（收租托管轻量化）；新增 §9A 平台化界面设计规范（视觉基调/导航/交互模式/C 端页面清单/与 B 端关系） |
| v1.8 | 2026-08-05 | **业务主线上线为"租赁 + 买卖"双业务（对标贝壳 C 端 App）**：重写 §2.2 租客端首页为双门户（`[租房] [买房]` 切换 + 功能宫格 + 主题模块）、房源详情区分租/售价、新增委托找房/购房订单；§2.3 业主端新增委托出租/出售、在线估价、收益涵盖售房款；§9A 全面升级为双业务设计规范（业务切换 Tab、地图找房、委托中心、页面清单补全） |
| v1.9 | 2026-08-05 | **新增 §15A 待与业务核对事项清单**：集中收录 11 类共 60+ 项待业务方确认事项（商业模式/目标用户/业务边界/合规资质/财务资金流/组织运营/数据隐私/第三方凭证/部署运维/内容多语言/项目交付付款），按优先级 🔴🟡🟢 分级，标注影响章节，便于核对后回填决定 |
| v1.10 | 2026-09-13 | **新增 7 项增强特性（v1.8）**：新增 §22 新增增强需求（即时聊天/电子签合同/AI 接口预留/每日数据备份/Google Map 找房/Google 翻译/500KM GPS 考勤）后端全量实现，附 §22.8 端接入清单；新增 §15A.12 待确认清单（15 项，含第三方凭证与业务决策）；原 §22 容量规划重编号为 §24 以消解章节冲突 |
| v1.11 | 2026-09-13 | **新增 §23 全量优化闭环（v1.9）**：预约看房（访客转化）×4 端、缴费凭证 receipt、员工工作台工单响应时效、管理端审计日志 audit-logs；同步补 0003 迁移与验收项 |
| v1.12 | 2026-09-13 | **新增 §25 管理员端全平台覆盖**：管理员工作台 5 大 Tab（运营概览/财务对账/运营趋势/审计/佣金）Web·App·小程序三端一致；员工性能排行榜三端接入（小程序新增页面）；预约
看房管理双视角（员工/管理员可查看全部预约+状态流转）补齐 App 与小程序 |
| v1.13 | 2026-09-13 | **新增 §26 战略扩张四大维度（买卖交易闭环 / 分销体系 / 多国市场 / 数据决策）**：按平台定位（东南亚最大房产中介平台）落地，全部 Web·App·小程序三端接入；后端新增 5 组路由与 7 张表
（sale_listings/property_deals/broker_partners/referrals/split_deals/market_configs 等）；小程序补齐 saleListingApi/propertyDealApi/brokerApi/marketApi/marketDataApi 与 4 个管理页面 + 工作台宫格入口 |

---

## 19. 系统演进与未来扩展规划

> 本章节是**为未来 2-3 年的运维与升级预留的设计钩子**。所有"占位"在 Phase 1 就要落地基础设施和接口约定，具体功能按业务节奏在 Phase 4/5 启用。

### 19.1 数据分析与 BI 基础设施

#### 19.1.1 为什么需要单独设计
- 在线业务库（PostgreSQL）适合事务处理，**不适合复杂分析查询**（多表 JOIN、聚合、OLAP）
- 直接在业务库跑 BI 查询会**拖慢在线业务**
- 解决方案：**CDC 同步 + 数据仓库 + 独立 BI 层**

#### 19.1.2 数据架构（推荐）

```
┌──────────────────┐    CDC      ┌──────────────────┐
│  PostgreSQL      │──────────▶ │  ClickHouse /    │
│  (在线业务库)    │  Debezium  │  BigQuery        │
│                  │            │  (数据仓库)      │
└──────────────────┘            └─────────┬────────┘
                                          │
                                  ┌───────▼────────┐
                                  │  Airflow /     │
                                  │  Dagster       │
                                  │  (ETL 调度)    │
                                  └───────┬────────┘
                                          │
                              ┌───────────┼────────────┐
                              ▼           ▼            ▼
                          ┌────────┐ ┌────────┐ ┌─────────┐
                          │Metabase│ │Superset│ │自定义报表│
                          │ (BI)   │ │ (BI)   │ │         │
                          └────────┘ └────────┘ └─────────┘
```

#### 19.1.3 技术选型对比

| 组件 | 选型 | 理由 | Phase |
|---|---|---|---|
| CDC | **Debezium** | 主流开源 CDC，监听 PostgreSQL WAL | 4a |
| 消息总线 | Kafka / Redis Streams | Phase 1 已有 Redis，Phase 4a 评估升级到 Kafka | 4a |
| 数据仓库 | **ClickHouse**（自建） 或 **BigQuery**（托管） | ClickHouse 性价比高、BigQuery 免运维 | 4a |
| ETL 调度 | **Airflow**（主流）或 **Dagster**（现代） | Airflow 生态成熟 | 4a |
| BI 工具 | **Metabase**（开源）或 **Superset**（开源） | 免费、可嵌入、与 PG/CH 兼容 | 4a |
| 实时分析 | Redis + 流处理 | 简单实时需求 | 4a |

#### 19.1.4 Phase 1 必做的预留
- [x] 所有业务表加 `created_at, updated_at, deleted_at` 审计字段
- [x] 关键表加 `metadata JSONB` 扩展字段
- [x] 数据库启用 **WAL 归档**（Debezium 依赖）
- [x] **业务事件表 `events`**（§5.3 已设计）
- [x] 所有写操作必须**同时**写 `events` 表
- [ ] **不开通 CDC**（Phase 4a 启用）

### 19.2 LLM / AI 介入规划

#### 19.2.1 高价值场景（按 ROI 排序）

| 场景 | 价值 | 实现成本 | Phase | 数据依赖 |
|---|---|---|---|---|
| **合同/收据 OCR** | 节省 80% 录入时间 | 中（LLM + Prompt） | 4b | 历史合同 PDF |
| **RAG 智能客服** | 7x24 响应、减轻人工 | 中（向量库 + LLM） | 4b | 政策文档 + FAQ |
| **线索 AI 评分** | 提升转化率 10-20% | 高（需训练数据） | 4b | 历史成交数据 |
| **多语言自动翻译** | 解决泰语沟通障碍 | 低（LLM 直出） | 4b | 无 |
| **房源-租客推荐** | 提升撮合效率 | 高（推荐系统） | 4c | 历史成交 + 行为 |
| **租金定价建议** | 减少定价失误 | 中（爬虫 + ML） | 4c | 市场数据 |
| **AI 数据助手** | 经纪人自助查询 | 中（Text-to-SQL） | 4c | 数据仓库 |
| **异常检测** | 风控减损 | 中（时序分析） | 4c | 业务事件流 |

#### 19.2.2 LLM Gateway 适配层（`ai_services`）

> **类比支付/通知的 Adapter 模式**——所有 LLM 能力必须经过统一网关。

```python
# 后端 LLM 适配层设计
class LLMProvider(Protocol):
    async def chat(self, messages: list[Message], **opts) -> LLMResponse: ...
    async def embed(self, texts: list[str]) -> list[list[float]]: ...
    async def extract_structured(self, prompt: str, schema: dict) -> dict: ...

class AIService:
    """LLM 统一入口，支持多模型切换、A/B 测试、成本控制"""
    def __init__(self):
        self._providers: dict[str, LLMProvider] = {
            "openai_gpt4o": OpenAIGPT4oProvider(),
            "openai_gpt4o_mini": OpenAIGPT4oMiniProvider(),
            "anthropic_claude": AnthropicClaudeProvider(),
            "alibaba_qwen": AlibabaQwenProvider(),  # 国内合规
            "deepseek": DeepSeekProvider(),  # 性价比
            "local_llama": LocalLlamaProvider(),  # 敏感数据
        }
    
    async def chat(self, model: str, messages, **opts):
        provider = self._providers[model]
        # 自动记录 token 使用、成本、延迟
        return await provider.chat(messages, **opts)
```

#### 19.2.3 多模型支持策略

| 模型 | 用途 | 成本（参考） | 合规 |
|---|---|---|---|
| **OpenAI GPT-4o** | 复杂推理、智能客服主力 | $2.5/M tokens | 数据出境 |
| **OpenAI GPT-4o-mini** | 简单任务、翻译、分类 | $0.15/M tokens | 数据出境 |
| **Anthropic Claude 3.5** | 长文档、合同 OCR | $3/M tokens | 数据出境 |
| **阿里 Qwen2.5** | 国内合规备选 | ¥0.004/千 tokens | 国内 |
| **DeepSeek V3** | 性价比、中文场景 | ¥1/M tokens | 国内 |
| **本地 Llama 3 / Qwen** | 敏感数据（PDPA） | GPU 成本 | 完全可控 |

**路由策略**：
- 敏感数据（PII）→ 本地模型
- 国内用户 → 国内模型（Qwen/DeepSeek）
- 复杂任务 → GPT-4o/Claude
- 简单任务 → GPT-4o-mini

#### 19.2.4 RAG 架构（智能客服 + 文档问答）

```
用户提问
    ↓
[意图识别] → 简单 → 直答
    ↓ 复杂
[Query 改写] → 优化检索关键词
    ↓
[向量检索] ← Qdrant / Milvus
    ↓
[上下文拼接] + Prompt
    ↓
[LLM 生成] → GPT-4o / Claude
    ↓
[后处理] → 引用来源、敏感词过滤
    ↓
回答 + 引用
```

**向量库选型**：
- **Qdrant**（推荐）：轻量、单机可跑、API 友好
- **Milvus**：分布式、功能强
- **Weaviate**：GraphQL 友好
- **pgvector**（Phase 1 备选）：直接用 PG 扩展，零额外组件

#### 19.2.5 Token 成本控制

- 每日 / 每月预算上限（按部门、按用户）
- 单次调用成本 > 阈值报警
- 缓存常见问答（命中率 50%+ 可省 30% 成本）
- 模型自动降级（预算不足时 mini 模型替代）

#### 19.2.6 Phase 1 必做的预留
- [x] 业务事件表（AI 模块订阅入口）
- [x] `properties.attributes JSONB`（结构化特征）
- [x] `leads.lead_score` 字段（AI 评分位）
- [x] 文档元数据（PDF/图片存 MinIO + 抽取文本待用）
- [ ] **不部署 AI**（Phase 4b 启用）

### 19.3 架构柔性设计

#### 19.3.1 领域事件驱动（已设计，见 §5.3）
**核心思想**：业务操作不直接调用 AI/BI/通知，而是发布事件，由订阅者消费。
- 解耦主流程
- 异步、可重试
- 新增 AI/BI 消费者**无需修改主流程**

#### 19.3.2 Feature Flag（功能开关）
- 新功能（特别是 AI）默认 **OFF**，按用户/比例灰度
- Phase 1 末实现 `feature_flags` 表 + 中间件

#### 19.3.3 API 版本化
- 所有接口从 Phase 1 起强制 `/api/v1/`
- v1 → v2 兼容期：双版本并存 → 流量切换 → 下线 v1
- OpenAPI Schema 自动发布到内部 SDK 仓库

#### 19.3.4 可观测性（OpenTelemetry）
- **指标**：Prometheus 格式（FastAPI middleware 自动埋点）
  - HTTP 延迟直方图（按 endpoint + status）
  - Celery 任务时长（按 task name）
  - DB 连接池使用率
  - LLM 调用次数 / 成本
- **日志**：结构化 JSON（方便 ELK/Loki 采集）
  - request_id 全链路贯穿
  - PII 字段脱敏（自动）
- **链路追踪**：OpenTelemetry → Jaeger / Tempo
  - 跨服务追踪（FastAPI → Celery → 外部 API）
- **错误监控**：Sentry（前端 + 后端）
  - 自动捕获未处理异常
  - 关联到 release/commit

**Phase 1 必做**：
- [x] 结构化 JSON 日志
- [x] request_id 中间件
- [x] Prometheus `/metrics` 端点
- [ ] Sentry 接入（可后补）
- [ ] OpenTelemetry trace（可后补）

#### 19.3.5 灰度发布 & A/B 测试
- Phase 1 末实现简单版本：Feature Flag + 比例
- Phase 4 升级到 **Unleash**（开源）或 **LaunchDarkly**（SaaS）
- 关键场景：AI 客服 10% 用户先试 → 全量

### 19.4 运维演进路径

| 能力 | Phase 1 起步 | Phase 2 增强 | Phase 4+ 完善 |
|---|---|---|---|
| 监控 | Prometheus + Grafana | + 告警规则 | + SLO/SLI 体系 |
| 日志 | JSON 文件 | Loki/ELK 集中化 | + 业务大盘 |
| 错误监控 | 基础 | Sentry | + Release Health |
| 链路追踪 | request_id 关联 | OpenTelemetry | 分布式追踪 |
| 备份 | DB 日备 | 跨区复制 | PITR (Point-in-time Recovery) |
| 容灾 | 单区 | 同城双活 | 异地多活 |
| 部署 | Docker Compose | K8s (EKS) | 多集群 |
| CI/CD | GitHub Actions 基础 | 自动化测试 + 灰度 | 蓝绿/金丝雀 |
| 安全扫描 | 依赖检查 | SAST + 容器扫描 | DAST + 渗透测试 |
| 容量规划 | 手动 | 基础预测 | 自动扩缩容 |

### 19.5 团队能力演进建议

| 阶段 | 团队规模 | 关键角色 |
|---|---|---|
| Phase 1-2 | 1-3 人 | 全栈为主 |
| Phase 3 | 3-5 人 | + 1 名运维/DevOps |
| Phase 4 | 5-8 人 | + 1 名数据工程师、+ 1 名 AI 工程师 |
| Phase 5 | 8-12 人 | + 产品经理、+ UI/UX 设计师、+ 测试工程师 |

### 19.6 关键决策记录（ADR 格式）

> 重大架构决策建议维护一份 **ADR（Architecture Decision Record）**：
> - 决策背景
> - 备选方案
> - 最终选择
> - 后果（正面 / 负面）
> - 后续可逆性

未来如需重新评估某决策（如换技术栈），有据可查。

---

## 20. 后续可扩展模块（锦上添花）

> 以下模块按业务节奏排期，Phase 1 不实现但架构已预留接入点。

### 20.1 消息中心（站内信）
- **价值**：统一消息收件箱，跨端同步已读状态，避免通知散落在各社交媒体
- **实现**：基于 `notifications` 表（§5.1 已定义），新增 Web/App/小程序的消息列表页
- **Phase**：2
- **接入点**：`GET /notifications/me`、WebSocket 实时推送

### 20.2 文件版本管理
- **价值**：合同/文档多版本，支持回滚和对比，满足审计要求
- **实现**：`documents` 表已有 `version` 字段；新增版本对比 API + Web 界面
- **Phase**：2
- **接入点**：`documents.version` + MinIO 对象版本管理

### 20.3 租客信用评估
- **价值**：基于历史支付行为评分，辅助业主决策是否接受租客
- **实现**：`tenants.tenant_credit_score`（§5.1 已预留）；Phase 4b 用 ML 训练评分模型
- **Phase**：4b
- **接入点**：`tenants.tenant_credit_score` + 历史支付数据

### 20.4 市场数据爬虫
- **价值**：抓取周边租金均价，辅助定价建议
- **实现**：Celery 定时爬虫 → 存入 `metadata` 或独立 `market_data` 表 → Phase 4c 租金定价模型
- **Phase**：4c
- **接入点**：领域事件 + BI 管道

### 20.5 API 文档门户
- **价值**：对外开放 API 文档（如未来做开放平台/合作伙伴接入）
- **实现**：FastAPI 自动生成 OpenAPI → Redoc/Swagger UI 部署到公网 → 加 API Key 认证
- **Phase**：3
- **接入点**：`/docs` + `/redoc`（FastAPI 内置）

### 20.6 审计日志查询界面
- **价值**：管理员可视化查询 PDPA 审计日志，满足合规审计要求
- **实现**：`audit_logs` 表（§5.1 已定义）+ Web 管理端查询界面（筛选：时间/操作者/资源类型/PII 字段）
- **Phase**：2
- **接入点**：`audit_logs` 表 + Admin RBAC

### 20.7 移动端推送策略细化
- **价值**：避免通知打扰，提升用户体验
- **实现**：
  - 静默时段（22:00-08:00 非紧急通知暂缓）
  - 免打扰模式（用户可设置）
  - 优先级分级（urgent 立即推送 / normal 排队 / low 仅站内信）
  - 聚合通知（多条租金提醒合并为一条）
- **Phase**：2
- **接入点**：`notifications` 表 + 推送中间件

### 20.8 租客自助入住/退房
- **价值**：App 内引导式验房清单 + 拍照存证，减少人工成本
- **实现**：
  - 入住：App 引导逐项检查（门锁/家电/墙面/卫生间）→ 拍照 → 生成入住报告
  - 退房：同上 → 对比入住报告 → 自动标记差异
  - 数据存入 `documents`（type=inspection_photo）
- **Phase**：3
- **接入点**：`documents` + 退房流程（§6.7）

### 20.9 业主财务报表导出
- **价值**：年度收入报表 PDF，业主可用于报税/贷款证明
- **实现**：
  - 汇总业主年度租金收入、WHT、托管费、服务费
  - 生成 PDF（WeasyPrint，与税务子系统共用）
  - 关联 `tax_records` + `payments` + `wht_certificates`
- **Phase**：2
- **接入点**：`GET /owners/me/income` + PDF 渲染

### 20.10 多公司 SaaS 预留
- **价值**：虽然 Phase 1 单一公司，但未来可能 SaaS 化服务多家中介
- **实现**：
  - Phase 1：所有表**不加** `company_id` 字段（YAGNI 原则）
  - Phase 5 SaaS 化时：用 PostgreSQL Schema 隔离 + 共享应用层
  - 或加 `company_id` 字段 + 行级安全（RLS）
- **Phase**：5（待定）
- **接入点**：迁移脚本 + RBAC 扩展

---

## 21. 文档健康度检查清单

> 每次重大更新后应检查以下项目，确保文档质量。

| 检查项 | 状态 | 说明 |
|---|---|---|
| 章节编号连续 | ✅ | §1-§21 + §22 新增增强 + §23 健康追加 + §24 容量 |
| 架构图与技术选型一致 | ✅ | v1.4 已修复 Django Admin 矛盾 |
| 数据模型与 API 端点对应 | ✅ | 每个实体都有 CRUD 端点 |
| 业务流程覆盖所有角色 | ✅ | 5 端 + 8 个业务流程 |
| 领域事件覆盖所有流程 | ✅ | 15 类事件 |
| Phase 任务与章节对应 | ✅ | 每个 Phase 引用具体章节 |
| PDPA 合规落地 | ✅ | §17 + §5.1 统一定义 |
| 税务子系统完整 | ✅ | §16 + 4 张表 + 流程 |
| 支付渠道矩阵覆盖 | ✅ | §7 30+ 渠道 |
| 演进规划有接入点 | ✅ | §19 + §20 每项都标注接入点 |

---

## 22. 新增增强需求（v1.8）

> 立项于 2026-09-13：7 项增强特性，覆盖聊天、电子签、AI、备份、地图找房、多语言翻译、GPS 考勤。后端已全量实现并注册到 `/api/v1`（共 26 组路由），客户端（Web / App / 小程序 / Pad）按 §22.8 逐个接入。

### 22.1 即时聊天（客户 ↔ 房东 ↔ 工作人员）
- **目标**：客户/房东可直接在系统内咨询经纪/工作人员，无需跳转外部聊天。
- **实现**：
  - 会话 `Conversation`（chats 表）+ 消息 `Message`（chat_messages 表），参与者存用户 id 列表。
  - REST：`GET/POST /chat/conversations`，`GET/POST /chat/conversations/{id}/messages`。
  - 实时：WebSocket `/api/v1/chat/ws/chat/{conversation_id}?token=JWT`（站内广播，分布式可换 Redis pub/sub）。
- **接入点**：各端「客服/联系工作人员」入口 + Agent 工作台「会话中心」。

### 22.2 电子签合同（根据用户信息自动生成 + 签名）
- **目标**：录入用户/租约信息后自动渲染合同，各方数字签名后生效。
- **实现**：
  - 合同 `Contract` + 签署方 `ContractParty` + 签名留痕 `SignatureRecord`。
  - 自动生成：`POST /contracts/generate`（从 counters 渲染 HTML 合同，计算全文 SHA-256）。
  - 签名：`POST /contracts/{id}/parties` 追加签署方；`POST /contracts/{id}/sign` 数字签名（优先 RSA-256，退回 HMAC-SHA256），生成签名 SVG 与哈希留痕；全部签署后状态置 `signed`。
  - 落盘合同文件到 `CONTRACT_OUTPUT_DIR`。
- **接入点**：签约流（看房→租约→生成合同→双方签名）。

### 22.3 AI 应用接口预留
- **目标**：为 AI 应用（智能客服、合同生成、找房问答、自动回复、翻译增强）预留统一接口。
- **实现**：
  - `providers/ai`（OpenAI 兼容 /chat/completions）；未配置 `OPENAI_API_KEY` 时返回保留提示。
  - `GET /ai/health`（能力清单 + 配置状态）；`POST /ai/chat`（对话）。
- **接入点**：各端「AI 助手」透出；配置密钥后即启用真实生成。

### 22.4 数据备份 / 每日同步
- **目标**：数据每天自动备份同步，防止丢失。
- **实现**：
  - `BackupJob`（backup_jobs 表）+ `services/backup_service.py`：全库表序列化 `.gz JSON`，SQLite 开发库额外复制 `.db`。
  - 手动：`POST /backup/run`（admin）；记录：`GET /backup/jobs`。
  - 定时：Celery Beat 每天 02:00 触发 `daily_backup_sync`，任务路由 `app/tasks/backup.*` → `default` 队列。
- **接入点**：管理端「数据备份」页；生产可把 `BACKUP_DIR` 指向挂载盘/MinIO。

### 22.5 地图找房（Google Map）
- **目标**：用 Google Map 找房（地图点位 + 检索）。
- **实现**：
  - `providers/geo`（Google Geocoding + 站内 Mock 兜底）；`haversine` 距离计算。
  - `POST /geo/geocode`、`POST /geo/reverse`、`POST /geo/distance`、`POST /geo/attendance`。
  - 房源经纬度存于 `properties.metadata（或扩展 lat/lng）`，地图页批次点位渲染。
- **接入点**：C 端房源列表「地图模式」（复用 PublicListings 地图布局）。

### 22.6 多语言翻译（Google 翻译按钮）
- **目标**：业务人员上传的房源信息可能是多国语言，用户可点「翻译」自选语言。
- **实现**：
  - `providers/translate`（Google Cloud Translation v2；未配置密钥走站内 mock）。
  - `POST /translate`（单条）、`POST /translate/bulk`（批量 keyed_texts）。
- **接入点**：房源详情/列表页「翻译」按钮（目标语言 zh/en/th 可选）。

### 22.7 GPS 考勤（500KM 半径 + 外勤申请）
- **目标**：打卡需在公司基准点半径（默认 500KM，可配）内；超出必须提前填写外勤/出差申请并获批。
- **实现**：
  - 考勤表已含 `check_in_location/check_out_location`（GPS）。`POST /attendance/check-in`、`/check-out` 接收 `{lat,lng}`。
  - 半径校验 `POST /geo/attendance`（`ATTENDANCE_RADIUS_KM`，办公点 `ATTENDANCE_OFFICE_LAT/LNG`）。
  - 外勤申请 `ExternalTripApplication`：`POST /attendance/external-trips`、`GET /attendance/external-trips`、`POST /attendance/external-trips/{id}/approve`（admin/agent）。
- **接入点**：员工端考勤打卡页（定位 → 半径校验 → 申请外勤）。

### 22.8 端接入清单（差异前端，同 API）
| 端 | 聊天 | 电子签 | AI | 备份 | 地图找房 | 翻译 | GPS 考勤 |
|---|---|---|---|---|---|---|---|
| Web | 🔲 | 🔲 | 🔲 | 🔲 | 🔲 | 🔲 | 🔲 |
| App(RN) | 🔲 | 🔲 | 🔲 | 🔲 | 🔲 | 🔲 | 🔲 |
| 小程序(Taro) | 🔲 | 🔲 | 🔲 | 🔲 | 🔲 | 🔲 | 🔲 |

---

## 23. 文档健康度检查清单（追加）

| 检查项 | 状态 | 说明 |
|---|---|---|
| 新增 §22 七项特性后端实现 | ✅ | 模型/Provider/路由/Celery 已完成 |
| 后端启动自检 | ✅ | `/api/v1` 26 组路由，导入通过 |
| 端接入进度 | 🔲 | 见 §22.8，逐端盖章 |

**文档结束。后续如有架构调整或新增模块，请在此文件追加版本记录。**

---

## 24. 容量规划与性能基线

> 回答"这套框架能扛多少并发"——基于本架构组件的容量估算、瓶颈分析、部署规格和扩展策略。

### 24.1 业务量预估（单一公司视角）

| 指标 | Phase 1 起步 | Phase 3 稳定期 | Phase 5 满载 |
|---|---|---|---|
| 注册用户总量 | 500 - 2,000 | 5,000 - 20,000 | 50,000+ |
| 日活用户（DAU） | 50 - 200 | 500 - 2,000 | 5,000+ |
| 房源总量 | 50 - 200 | 500 - 2,000 | 10,000+ |
| 月签约量 | 10 - 30 | 100 - 300 | 1,000+ |
| 月支付笔数 | 50 - 150 | 500 - 1,500 | 5,000+ |
| 文档/图片总量 | 1,000 - 5,000 | 50,000 - 200,000 | 1,000,000+ |

### 24.2 并发量估算

| 场景 | 峰值并发用户 | 峰值 QPS | 平均 QPS | 备注 |
|---|---|---|---|---|
| **普通浏览**（房源/列表） | 200 | 60 | 10 | 多数为读请求 |
| **登录/认证** | 50 | 5 | 1 | 高频但短时 |
| **签约/支付** | 30 | 3 | 0.5 | 关键路径，秒杀级 |
| **文件上传**（合同/照片） | 20 | 2 | 0.2 | 慢请求占用长连接 |
| **WebSocket/通知推送** | 100 | 100 | 30 | 长连接，并发≠QPS |
| **管理端 Dashboard 刷新** | 10 | 1 | 0.2 | 重查询 |

**峰值并发总量**：约 **200-300 用户 / 80-150 QPS / 100 WebSocket 连接**

### 24.3 各组件承载上限

| 组件 | 单实例上限 | 瓶颈 | 调优手段 |
|---|---|---|---|
| **FastAPI（uvicorn 4 worker）** | 3,000 - 5,000 并发连接 | CPU | 增加 worker 数 / 横向扩展实例 |
| **Nginx 反向代理** | 10,000+ 并发 | 文件描述符 | worker_rlimit_nofile 65535 |
| **PostgreSQL 15** | 1,000 - 2,000 QPS（简单查询） | 连接数 / 磁盘 I/O | 连接池 + SSD + 索引优化 |
| **Redis** | 100,000+ QPS | 内存 | 集群 / 持久化策略 |
| **Celery worker** | 1,000 task/s（CPU 任务）<br>100 task/s（IO 任务） | 任务执行时间 | 增加 worker 并发数 |
| **MinIO / S3** | 5,000+ 上传/s | 带宽 | CDN 卸载 / 分片上传 |
| **WebSocket（FastAPI）** | 单实例 10,000 长连接 | 文件描述符 | Redis Pub/Sub 跨实例广播 |

### 24.4 真实瓶颈分析

按业务路径预测的瓶颈点（**从最可能成为瓶颈的排起**）：

#### 🔴 第一瓶颈：PostgreSQL 连接数
- 默认 max_connections = 100，**3 个 FastAPI 实例 × 30 连接 = 90**，耗尽
- **必须用 PgBouncer 池化**：将 3000 应用连接池化为 100-200 真实 DB 连接
- 预估性能损失 < 5%，收益巨大

#### 🟡 第二瓶颈：磁盘 I/O（图片/文件）
- 房源图片、合同 PDF 占用大
- **必须用对象存储（MinIO/S3）**，应用层不直接存文件
- **静态资源用 CDN 卸载**（CloudFront / Cloudflare）

#### 🟡 第三瓶颈：复杂报表查询
- Dashboard 跨多表聚合可能跑 5-30 秒
- **必须用预聚合表**（如 `dashboard_property_stats` 每日定时刷）
- 或 Phase 4a 引入 ClickHouse

#### 🟢 第四瓶颈：WebSocket 长连接
- 业主/租客 App 保持推送连接
- **单实例 1 万连接够用**，多实例用 Redis Pub/Sub 广播

#### 🟢 第五瓶颈：支付回调并发
- 多个支付渠道同时回调，可能短时 100+ req/s
- **webhook 端点设计为无状态 + 立即 200 OK + 异步处理**

### 24.5 部署规格推荐

#### Phase 1 起步（最低可用，1-2 年）

| 服务 | 规格 | 月费用（AWS Bangkok） |
|---|---|---|
| **应用服务器 × 2** | 4 vCPU / 8 GB RAM | $80 × 2 = $160 |
| **PostgreSQL RDS** | db.t4g.medium（2 vCPU / 4 GB / 100 GB SSD） | $80 |
| **Redis ElastiCache** | cache.t4g.small（1 vCPU / 1.5 GB） | $25 |
| **MinIO / S3** | 500 GB + 1 TB 流量 | $30 |
| **负载均衡 ALB** | 标准型 | $20 |
| **数据备份 + 监控** | S3 Glacier + Grafana Cloud | $20 |
| **CDN（CloudFront）** | 1 TB 流量 | $20 |
| **域名/SSL/杂项** | - | $15 |
| **小计** | | **~$370 / 月** |

#### Phase 3 稳定（中型公司，3-5 年）

| 服务 | 规格 | 月费用 |
|---|---|---|
| 应用服务器 × 4 | 8 vCPU / 16 GB | $640 |
| PostgreSQL RDS | db.m6g.large（2 vCPU / 8 GB / 500 GB） | $200 |
| Redis | cache.m6g.large | $100 |
| S3 + CloudFront | 5 TB | $150 |
| ALB + WAF | - | $50 |
| 其他 | - | $60 |
| **小计** | | **~$1,200 / 月** |

#### Phase 5 满载（横向扩展，无上限）

- 应用层：K8s 集群（EKS），HPA 自动伸缩 3-20 实例
- 数据库：主从 + 读写分离 + PgBouncer
- Redis：Cluster 模式（3 主 3 从）
- 文件：S3 + CloudFront
- 月费用 $3,000 - $5,000

### 24.6 性能基线指标（SLO）

| 指标 | 目标 | 测量方式 |
|---|---|---|
| API P50 延迟 | < 50 ms | Prometheus histogram |
| API P95 延迟 | < 200 ms | Prometheus histogram |
| API P99 延迟 | < 500 ms | Prometheus histogram |
| 错误率（5xx） | < 0.1% | Counter |
| 支付成功率 | > 99% | 业务指标 |
| 通知送达率 | > 98% | 通知表统计 |
| 数据库 QPS | < 1,000 | pg_stat_statements |
| 缓存命中率 | > 85% | Redis INFO |
| 慢查询（>1s） | < 0.5% | pg_stat_statements |
| 系统可用性 | > 99.9%（年宕机 < 8.76h） | 业务监控 |

### 24.7 压测方案

#### 工具选型
- **Locust**（推荐，Python 写脚本，与 FastAPI 生态一致）
- **k6**（Go 写脚本，性能更好）
- **wrk**（极简 HTTP 压测）
- **Artillery**（YAML 配置）

#### Phase 1 必做压测场景
1. **登录风暴**：100 用户同时登录，验证 token 发放和速率限制
2. **房源列表查询**：500 并发持续 5 分钟，验证缓存命中
3. **支付回调**：50 并发 webhook，验证幂等性和异步处理
4. **大文件上传**：20 用户同时上传 50 MB 文件
5. **WebSocket 推送**：1000 长连接持续推送通知

#### 压测指标收集
- 响应时间分布（P50/P95/P99）
- 错误率
- 系统资源（CPU/内存/IO/网络）
- 数据库慢查询
- 缓存命中率
- 队列积压情况

#### 容量预警阈值
- CPU > 70% 持续 5 分钟 → 告警
- 内存 > 80% → 告警
- DB 连接数 > 80% → 告警
- Redis 内存 > 75% → 告警
- 队列长度 > 1000 → 告警
- API P99 > 1s → 告警

### 24.8 横向扩展策略

```
                  ┌─────────────────┐
   ┌─→  ALB  ───→  FastAPI 实例 1  ├──┐
   │              └─────────────────┘  │
   │                                   │  → PgBouncer
客户端 ──→ CloudFront → ALB ─┤         │  → Redis Cluster
   │              ┌─────────────────┐  │
   └─→  ALB  ───→  FastAPI 实例 2  ├──┘
                  └─────────────────┘
                         │
                         ↓
                  ┌─────────────────┐
                  │ Celery Workers  │ → PostgreSQL 主从
                  └─────────────────┘ → S3 + CloudFront
```

**扩展触发条件**：
- CPU 持续 > 70% → 增加 FastAPI 实例
- DB QPS > 800 → 考虑读副本
- Redis 内存 > 75% → 升级实例或 Cluster
- 队列积压 > 1000 → 增加 Celery worker

### 24.9 一句话回答

> **本架构单实例最低可承载 200-300 并发用户 / 80-150 QPS**（Phase 1 业务量级），**理论上限 3,000-5,000 并发连接**（按 4 worker 配置）。
>
> 对单一房产中介公司（DAU 500-2,000，签约 100-300/月）有 **10-20 倍余量**，完全够用 2-3 年。
>
> 真正容易成为瓶颈的不是应用层，而是 **PostgreSQL 连接数**（必须配 PgBouncer）和 **图片/文件存储**（必须上 CDN）。

---

### 24.10 高并发演进方案（10 万 DAU 场景）

> 假设业务体量跳跃到 **DAU 100,000**（约为 Phase 1 的 500-2000 倍，Phase 5 满载的 20 倍），当前架构能否支撑？

#### 24.10.1 核心结论

> ✅ **技术栈（FastAPI + PostgreSQL + Redis）本身能支撑 10 万 DAU**
>
> ❌ **但部署形态必须从单体升级到分布式**——单实例架构会立即崩溃
>
> 💰 **月成本从 $370 跳到 $3,000-5,000**（约 10-13 倍）

#### 24.10.2 10 万 DAU 容量重算

**业务参数**：
- 注册用户 100 万 - 500 万
- 日活 100,000
- 房源总量 50,000+
- 月签约 5,000-10,000
- 月支付 30,000-50,000
- 文档/图片 1,000 万+

**峰值估算**（DAU 10 万，假设 20% 同时在线、5% 在做写操作）：

| 场景 | 峰值并发用户 | 峰值 QPS | 平均 QPS | 倍数（vs Phase 1） |
|---|---|---|---|---|
| **普通浏览**（房源/列表） | 20,000 | 6,000 | 1,000 | 100x |
| **登录/认证** | 5,000 | 500 | 100 | 100x |
| **签约/支付** | 3,000 | 300 | 50 | 100x |
| **文件上传** | 2,000 | 200 | 20 | 100x |
| **WebSocket/通知推送** | 10,000 | 10,000 | 3,000 | 100x |
| **管理端 Dashboard 刷新** | 500 | 50 | 10 | 50x |

**峰值并发总量**：约 **1-1.5 万并发用户 / 3,000-5,000 QPS / 1 万 WebSocket 连接**

#### 24.10.3 各组件承载差距分析

| 组件 | 当前单实例上限 | 10 万 DAU 需求 | 缺口 | 解决方式 |
|---|---|---|---|---|
| **FastAPI 单实例** | 3,000-5,000 并发 | 15,000+ 并发 | 3-5x | **横向扩展 5-10 个实例 + K8s HPA** |
| **Nginx** | 10,000+ 并发 | 15,000+ | 1.5-2x | **多 Nginx 实例 + ALB 负载均衡** |
| **PostgreSQL 单实例** | 1,000-2,000 QPS | 3,000-5,000 QPS | 2-3x | **主从读写分离 + PgBouncer + 必要时分库分表** |
| **Redis 单实例** | 100,000 QPS | 200,000+ QPS | 2x | **Redis Cluster（3 主 3 从）** |
| **Celery 单机** | 1,000 task/s | 5,000+ task/s | 5x | **多 worker 节点 + Flower 监控** |
| **文件存储** | 5,000 上传/s | 10,000+ 上传/s | 2x | **S3 + CloudFront CDN 卸载 + 分片上传** |
| **WebSocket 单实例** | 10,000 长连接 | 10,000+ 长连接 | 临界 | **多实例 + Redis Pub/Sub 广播** |
| **事件总线** | Redis Streams 10K/s | 50K+ 事件/s | 5x | **升级到 Apache Kafka** |

#### 24.10.4 目标架构（10 万 DAU）

```
                                   ┌─────────────────┐
                                   │   CloudFront    │
                                   │   (CDN + 缓存)   │
                                   └────────┬────────┘
                                            │
                          ┌─────────────────┼─────────────────┐
                          ▼                 ▼                 ▼
                    ┌──────────┐      ┌──────────┐      ┌──────────┐
                    │ ALB 多AZ │      │ ALB 多AZ │      │ ALB 多AZ │
                    │ (跨可用区) │      │          │      │          │
                    └─────┬────┘      └─────┬────┘      └─────┬────┘
                          │                 │                 │
                  ┌───────┴───────┐         │                 │
                  ▼               ▼         ▼                 ▼
           ┌────────────┐  ┌────────────┐ ┌────────────┐ ┌────────────┐
           │ FastAPI ×5 │  │ FastAPI ×5 │ │ FastAPI ×3 │ │ WebSocket  │
           │ K8s Pod 1  │  │ K8s Pod 2  │ │ Celery     │ │ ×3 节点   │
           └──────┬─────┘  └──────┬─────┘ └──────┬─────┘ └──────┬─────┘
                  │               │               │               │
                  └───────────────┴───────┬───────┴───────────────┘
                                          │
                          ┌───────────────┼───────────────┐
                          ▼               ▼               ▼
                   ┌───────────┐   ┌──────────┐    ┌──────────┐
                   │ PgBouncer │   │  Redis   │    │  Kafka   │
                   │ (连接池)  │   │ Cluster  │    │ 3 节点   │
                   └─────┬─────┘   │ 3主3从   │    └────┬─────┘
                         │         └────┬─────┘         │
                         ▼              ▼               ▼
                  ┌──────────────────────────┐    ┌──────────┐
                  │ PostgreSQL 主从          │    │ ClickHou │
                  │ 主 + 2 读副本            │    │ -se BI   │
                  │ 必要时分库分表           │    │ (Phase4a)│
                  └──────────────────────────┘    └──────────┘
                         │
                         ▼
                  ┌──────────────┐
                  │ S3 + 备份    │
                  └──────────────┘
```

**关键演进点**：
- ✅ **应用层**：K8s 集群 + HPA（基于 CPU/内存/队列长度自动伸缩 3-20 Pod）
- ✅ **数据库**：主从 + 读写分离 + PgBouncer 池化
- ✅ **缓存**：Redis Cluster 模式
- ✅ **消息总线**：从 Redis Streams 升级到 Kafka（高吞吐 + 持久化）
- ✅ **静态资源**：CloudFront CDN（卸载 80% 流量）
- ✅ **多 AZ 部署**：跨可用区容灾（AWS Bangkok 至少 2 AZ）

#### 24.10.5 5 层瓶颈与升级方案对照

| 瓶颈 | 升级方案 | 工作量 | 优先级 |
|---|---|---|---|
| 🔴 **PG 连接数** | 配 PgBouncer + 增加 max_connections | 1 天 | P0（必做） |
| 🔴 **PG 写性能** | 读写分离（主写 + 2 读副本） | 3-5 天 | P0 |
| 🟡 **PG 单表大** | 分库分表（按 `property_id` 哈希）或按时间分区 | 1-2 周 | P1 |
| 🟡 **Redis 单点** | Redis Cluster（3 主 3 从） | 3-5 天 | P0 |
| 🟡 **事件吞吐** | Redis Streams → Kafka（10 倍吞吐） | 1 周 | P1 |
| 🟡 **应用层扩展** | Docker → K8s + HPA 自动伸缩 | 2-3 周 | P0 |
| 🟢 **WebSocket 扩展** | 多实例 + Redis Pub/Sub 广播 | 1 周 | P1 |
| 🟢 **CDN 卸载** | 静态资源全部走 CloudFront | 3 天 | P0（成本最低效果最大） |
| 🟢 **BI 查询慢** | 引入 ClickHouse 数据仓库 | 2-3 周（Phase 4a） | P2 |
| 🟢 **微服务化** | 拆分用户/房源/支付/税务独立部署 | 1-2 月（Phase 5） | P3 |

#### 24.10.6 成本估算（10 万 DAU）

| 服务 | 规格 | 月费用（USD） |
|---|---|---|
| **K8s 集群（EKS）** | 5-10 个应用 Pod + 3 Celery Pod | $1,200 |
| **PostgreSQL 主 + 2 读副本** | db.r6g.large × 3（8 vCPU / 32 GB） | $900 |
| **PgBouncer 集群** | 2 实例 + 自动故障转移 | $100 |
| **Redis Cluster** | cache.r6g.large × 6（3 主 3 从） | $600 |
| **Kafka 集群（MSK）** | 3 节点 kafka.m5.large | $500 |
| **S3 + CloudFront** | 10 TB 存储 + 50 TB 流量 | $800 |
| **ALB + WAF + Route 53** | 多 AZ | $200 |
| **监控 / 日志 / 备份** | Grafana Cloud + S3 Glacier | $300 |
| **其他（域名/SSL/CDN 杂项）** | - | $100 |
| **小计** | | **~$4,700 / 月** |

**成本结构变化**：
- Phase 1：~$370/月
- Phase 3：~$1,200/月
- **Phase 高并发（10 万 DAU）：~$4,700/月**
- 单 DAU 成本：$0.0037 → $0.012 → **$0.047**（10 万 DAU）

#### 24.10.7 5 个必做的架构升级项（按 ROI 排序）

| # | 升级项 | 投入 | 收益 | ROI |
|---|---|---|---|---|
| 1 | **CDN 卸载静态资源** | 3 天，$50/月 | 减少 80% 应用层流量，P99 延迟降 50% | ⭐⭐⭐⭐⭐ |
| 2 | **PgBouncer + 读写分离** | 1 周，$100/月 | 连接数支持 10x 增长，应用层可横向扩展 | ⭐⭐⭐⭐⭐ |
| 3 | **Redis Cluster** | 3 天，$300/月 | 缓存容量和吞吐翻倍，消除单点故障 | ⭐⭐⭐⭐ |
| 4 | **K8s + HPA** | 2-3 周，$500/月 | 自动伸缩 3-20 Pod，零停机扩容 | ⭐⭐⭐⭐ |
| 5 | **事件总线升级到 Kafka** | 1 周，$500/月 | 事件吞吐 10x，支持事件溯源和重放 | ⭐⭐⭐ |

#### 24.10.8 性能与可靠性目标（10 万 DAU）

| 指标 | 目标 | 测量方式 |
|---|---|---|
| API P99 延迟 | < 300 ms | Prometheus |
| 错误率 | < 0.05% | Counter |
| 支付成功率 | > 99.5% | 业务指标 |
| 系统可用性 | > 99.95%（年宕机 < 4.38h） | 业务监控 |
| 缓存命中率 | > 90% | Redis INFO |
| 数据库主从延迟 | < 1s | pg_stat_replication |
| 队列最大积压 | < 5,000 | Celery Flower |
| CDN 命中率 | > 85% | CloudFront 报表 |

#### 24.10.9 分阶段迁移路径

**前置条件**：先验证业务真达到 10 万 DAU，再启动以下升级（不要过早优化）：

| 阶段 | 时间点 | 触发条件 | 升级内容 |
|---|---|---|---|
| **阶段 1** | DAU > 1,000 | 监控告警 | 配 PgBouncer + Redis 主从 + CDN |
| **阶段 2** | DAU > 5,000 | DB CPU > 70% | PostgreSQL 读写分离 + Redis Cluster |
| **阶段 3** | DAU > 20,000 | 队列积压 | K8s 迁移 + HPA + 多 AZ |
| **阶段 4** | DAU > 50,000 | 事件延迟 | Redis Streams → Kafka |
| **阶段 5** | DAU > 100,000 | 单表 > 5,000 万行 | 分库分表 + 微服务化 |

**每阶段投入产出比都验证后再进入下一阶段**——避免过早优化。

#### 24.10.10 一句话回答

> **当前架构能支撑 10 万 DAU，但需要从单体升级到分布式**（K8s + PG 主从 + Redis Cluster + Kafka + CDN）。
>
> **月成本 $3,000-5,000**，单 DAU 成本约 $0.047。
>
> **建议分 5 阶段演进**，每阶段基于真实业务量触发（不要过早优化）。
>
> **最大 ROI 升级**：CDN（$50/月 → 减 80% 流量）+ PgBouncer（$100/月 → 支持 10x 连接）= 投入 < $200/月，效果立竿见影。

---

## 23. 全量优化闭环（v1.9）

> 立项于 2026-09-13：按「分角色用户体验优化」框架补齐访客/租客/员工/管理端五类角色的关键缺口，优先落地转化与财权闭环。后端已实现并注册到 `/api/v1`，App / 小程序 / Web 按各小节接入。原 §23 规划按需保留，序号顺延以消解冲突（当前约 100 条路由）。

### 23.1 预约看房（访客转化闭环）
- **目标**：访客（潜在租客）对意向房源发起看房预约，员工确认后形成「找房 → 预约 → 看房 → 成交」漏斗，补全访客态吸附抓手。
- **模型**：`ViewingAppointment`（`viewing_appointments` 表），支持未注册访客信息（`visitor_*`）与已登录用户关联（`requester_user_id`），关联线索 `lead_id` 便于 CRM 跟踪；状态 `pending → confirmed → completed / cancelled / no_show`。
- **接口**：`POST /viewings`（提交预约）、`GET /viewings/mine`（我的预约）、`GET /viewings`（员工列表）、`PATCH /viewings/{id}`（员工确认/完成/取消/爽约，确认时自动绑定当前员工）。
- **接入点**：App 与小程序的访客态金刚区新增「预约看房」入口 + 独立预约页（选房源/填时间/备注 + 我的预约列表）。
- **迁移**：`0003_viewing_appointments`（复用 `create_all` 仅建缺失表，列类型与模型对齐）。

### 23.2 缴费凭证（租客财权闭环）
- **目标**：缴费成功后租客可查看/打印结构化收款收据，形成可留存凭证。
- **实现**：`GET /payments/{id}/receipt` 返回结构化凭证数据（单号、金额、类型、渠道、交易号、支付时间、收款方、关联房源/租约），仅付款方/收款方/管理端可访问。
- **接入点**：App 与小程序的缴费页对「已支付」账单显示「查看凭证」，弹窗展示凭证明细。

### 23.3 员工工单响应时效（履约质量）
- **目标**：员工工作台补充维修工单响应指标，量化服务时效。
- **实现**：`GET /employees/workbench` 的 `summary` 新增 `open_maintenance`（名下待办工单数）与 `avg_resolve_hours`（平均解决时长，按 `resolved_at - created_at` 计算）。
- **接入点**：员工端首页工作台概览卡片。

### 23.4 管理端审计日志（合规留痕）
- **目标**：管理端可审计「谁在何时对何资源做了何种操作」，满足权责追溯与符合性核查。
- **实现**：
  - `GET /audit-logs`（分页 + 按 action / resource_type / actor_user_id / 时间窗过滤，附操作人姓名邮箱）。
  - `GET /audit-logs/summary`（按动作与资源类型聚合数量）。
  - 复用既有 `AuditLog` 模型（`pdpa_audit_logs` 表）。

### 23.5 后续待办（勿删）
- 租客：续约一体化（到期提醒 → 一键续约）、退租/押金结算、发票（税务 Invoice/WHT）下载。
- 房东：空置房源营销推广（外推访客流量）、按周边行情自动定价建议、年度财务汇总导出。
- 员工：租约临期 SLA 跟进、佣金规则后台配置。
- 管理端：Dashboard 既有 `/summary` 已覆盖房源/收入/线索，可补财务对账明细与运营趋势图。

## 24. 全量优化落地（v1.10）

> 立项 2026-09-13：把 §23 规划中「全部优化」剩余的缺口一次性落地，覆盖管理端、租客、房东、访客四类角色的后端能力与三端前端集成。后端接口已注册到 `/api/v1`，迁移 `0004_commission_rules_favorites`。

### 24.1 佣金规则配置（员工/管理端）
- **模型**：`CommissionRule`（`commission_rules` 表）——按成交类型（new_rental / renewal / management）配置佣金比例，支持全局/按部门/按员工三种适用范围，可设封顶与起算门槛、启用停用、生效区间。
- **接口**：`GET/POST /commission-rules`、`GET/PATCH/DELETE /commission-rules/{id}`（admin 权限）。
- **接入**：Web 管理端新增「佣金规则」页（列表 + 新增/编辑弹窗 + 启停 + 删除）。

### 24.2 房源收藏（访客/租客意愿沉淀）
- **模型**：`Favorite`（`favorites` 表，`user_id + property_id` 唯一约束）。
- **接口**：`POST /favorites`（幂等收藏）、`DELETE /favorites/{property_id}`、`GET /favorites`（分页 + 房源信息）、`GET /favorites/status/{property_id}`。
- **接入**：App 与小程序房源卡片右上角收藏切换（乐观更新 + 高亮），小程序首页访客态新增「我的收藏」入口与收藏列表页。

### 24.3 房东三件套
- `GET /owners/me/marketing`：空置房源一览 + 分享链接。
- `GET /owners/me/pricing-suggestion`：按同户型在租房源均值给出升/降/持平定价建议。
- `GET /owners/me/annual-financial-summary?year=`：按月度汇总已收/待收/逾期，形成房东年度对账导出数据。
- **接入**：App 新增 `OwnerPortalScreen` 房东工作台（年度汇总卡片 + 营销空置房 + 定价建议 + 月度明细）。

### 24.4 管理端财务对账与运营趋势
- `GET /dashboard/financial-reconciliation`：按房源聚合已收/应收/逾期 + 逐笔明细（admin）。
- `GET /dashboard/trend?months=`：近 N 月营收、新签租约、新线索、预约、维修工单逐月走势（admin）。
- **接入**：Web 管理端新增「财务对账」「运营趋势」两页（对账卡片 + 房源聚合表 + 逐笔明细；趋势柱状图 + 月度表）。

### 24.5 退租押金结算专职流程
- `POST /leases/{id}/deposit-settlement`：核算 `押金 − 到期未付租金 − 损耗 − 其他扣款 = 应退/应补`，自动更新租约终止、房源空置，应退押金生成 `refund` 支付单（原路退回）。
- **接入**：Web 租约/App 面向员工的退租交互。

### 24.6 税务发票下载 + 维修评价
- `GET /payments/{id}/invoice`：含净额/税额/VAT率/合计的税务发票导出数据（THB 租金/押金/水电按 7% 拆税）。
- `POST /maintenance-tickets/{id}/rate`：租客对已解决工单 1-5 星评价 + 反馈（服务闭环）。
- **接入**：App 与小程序缴费页「发票」按钮弹窗；维修列表点击工单弹详情 + 已解决单可评分。

### 24.7 管理端审计日志 / 预约看房管理页
- Web 管理端新增「审计日志」（复用 `GET /audit-logs` + 过滤 + 摘要）与「预约看房」（`GET /viewings` + `PATCH /viewings/{id}` 状态流转）。

### 接线与验证
- 路由：`app/api/v1/__init__.py` 新增 `commission_rules`、`favorites` 两个分组（累计 30 个路由分组）。
- 迁移：`0004_commission_rules_favorites`（`create_all` 仅建缺失表）。
- 验证：backend ruff 通过、pytest 6 项通过、前端 web tsc 通过、mobile/miniapp 三端 API 接线完成。

## 25. 管理员端全平台覆盖（v1.11）

> 目标：管理员/员工（admin/employee/agent）核心管理能力在 Web / App / 小程序三端一致。

### 25.1 管理员工作台（5 大 Tab，三端一致）
| 能力 | Web | App | 小程序 |
|---|---|---|---|
| 运营概览（房源/入住率/到期合同/空置/待收款 + 临期租约） | ✅ | ✅ | ✅ |
| 财务对账（已收/应收/逾期 + 按房源） | ✅ | ✅ | ✅ |
| 运营趋势（近 12 月营收/新签/新线索） | ✅ | ✅ | ✅ |
| 审计日志 | ✅ | ✅ | ✅ |
| 佣金规则后台配置（增/启停） | ✅ | ✅ | ✅ |

- **App 补齐**：`admin/HomeScreen.tsx` 新增「运营概览」Tab 与 `dashboardApi.expiringLeases`，对齐小程序。
- **小程序**：`admin/home` 五 Tab 齐备。

### 25.2 员工性能排行榜（三端）
- 后端 `GET /employees/leaderboard`（按佣金聚合）+ 个人 `GET /employees/me` 摘要。
- **自定义**：Web `employee/performance`、App `employee/PerformanceScreen`、小程序新增 `employee/performance` 页面，员工工作台加入口。

### 25.3 预约看房管理视角（员工/管理员 vs 访客双视角）
- `GET /viewings`（全部，require_employee）、`PATCH /viewings/{id}`（状态流转：确认/完成/爽约/取消）。
- **App / 小程序** 的 `ViewingsScreen` 按角色分流：员工/管理员加载全部预约并展示访客信息 + 状态流转按钮；普通用户保留「我的预约 + 提交表单」。三端 API 均新增 `list` / `updateStatus` 封装。

### 25.4 验证
- mobile tsc 通过、frontend-web tsc 通过、miniapp `taro build --type weapp` 通过。

## 26. 战略扩张四大维度（v1.12）
> 定位：做东南亚最大的房地产中介平台。用户可租/售/买增值服务/维修；员工可寻客户/带看/管房源/核业绩/管客户；企业除自营员工外，开放分销体系，统一管理员工/房源/渠道客户。
> 围绕此定位落地四大战略维度，全部完成 Web / App / 小程序三端接入，与租赁主链路形成「租售双轮 + 分销裂变 + 多国扩张 + 数据壁垒」闭环。

### 26.1 买卖交易闭环（租售双轮）
- 模型：`sale_listings`（售/求挂牌）、`property_deals`（产权成交）、`PropertyDealEscrow`（定金托管）、`PropertyDealMortgage`（按揭）、`Valuation`（自动估价 AVM）。
- 路由：`/api/v1/sale-listings`、`/api/v1/property-deals`。
- 端口：Web `SaleDeals`、App `admin/SaleDealsScreen`、小程序 `admin/sale-deals`（挂牌上下架/标记成交 + 成交管理）。

### 26.2 分销体系（开放给外部经纪人 / 渠道）
- 模型：`broker_partners`（独立/中介/加盟/影响者）、`referrals`（转介绍裂变）、`split_deals`（联合单佣金分拆）。
- 路由：`/api/v1/brokers`（含 `/invite/{code}` 邀请、`/referrals`、`/split-deals`）。
- 端口：Web `Distribution`、App `admin/DistributionScreen`、小程序 `admin/distribution`（渠道商审批/停用 + 我的转介绍）。

### 26.3 多国市场底座（东南亚扩张）
- 模型：`market_configs`（分市场币种/语言/时区）、`local_payment_channels`（本地支付渠道聚合）、`market_compliance_docs`（分国合规/模板）。
- 路由：`/api/v1/markets`（含 `/channels`、`/compliance`）。
- 端口：Web `Markets`、App `admin/MarketsScreen`、小程序 `admin/markets`（国家市场/支付渠道/合规文档）。

### 26.4 数据决策壁垒（指数 / 匹配 / 流失预警）
- 模型：`market_indices`、`market_reports`、`property_lead_matches`（房源-线索智能匹配）、`tenant_churn_signals`（租客流失预警）。
- 路由：`/api/v1/market-data`。
- 端口：Web `MarketIntelligence`、App `admin/MarketIntelScreen`、小程序 `admin/market-intel`（指数/报告/流失预警处理）。

### 26.5 三端接入清单
| 模块 | Web | App | 小程序 |
|---|---|---|---|
| 买卖交易闭环 | `pages/SaleDeals` | `SaleDealsScreen` | `pages/admin/sale-deals` |
| 分销体系 | `pages/Distribution` | `DistributionScreen` | `pages/admin/distribution` |
| 多国市场 | `pages/Markets` | `MarketsScreen` | `pages/admin/markets` |
| 数据决策 | `pages/MarketIntelligence` | `MarketIntelScreen` | `pages/admin/market-intel` |
- **小程序**：`services/api.ts` 新增 `saleListingApi` / `propertyDealApi` / `brokerApi` / `marketApi` / `marketDataApi`（Query 参数接口以 `qs()` 拼接进 URL）；路由注册于 `app.config.ts`；管理员工作台新增「战略业务模块」宫格入口。

### 26.6 验证
- backend ruff 全绿、pytest 15 项通过；frontend-web tsc 通过、mobile-app tsc 通过、miniapp `taro build --type weapp` 通过。
