# 完成度核查报告（只读）

- 核查日期：2026-11-17
- 核查范围：`backend/`、`frontend-web/`、`mobile-app/`、`miniapp/`、`docs/`
- 核查方式：读取运行中后端的 `http://127.0.0.1:8000/openapi.json`（369 个 path / 450 个 operation）、静态检索三端代码、只读查阅 `backend/.env` 与 `frontend-web/.env` 的键是否存在（不读取、不输出密钥值）、对公开只读接口做实测。
- 本报告只记录事实，不含改进建议。

---

## 0. 核查基准数字

| 项 | 数量 | 说明 |
|---|---|---|
| 后端路由（operation） | 450 | 来自运行中 openapi |
| 后端 path | 369 | 同上 |
| Web 路由定义 | 91 | `App.tsx` 72 条 + `routes/publicRoutes.tsx` 19 条（含 `*`、`/owner/*`） |
| Web 角色菜单项 | 45 | `config/roleMenus.ts` 中 `key: '/...'` |
| App 注册 screen | 81 | `navigation/RootNavigator.tsx` 的 `<Stack.Screen>` |
| 小程序注册页面 | 80 | `app.config.ts` 主包 40 + 9 个分包 40 |

---

## 1. 后端：空实现、mock、无前端接口

### 1.1 显式未完成标记
- `TODO` / `FIXME` / `NotImplemented` / `HTTP 501`：`backend/app/api/v1/**` 内 **0 处**。
- `pass` 仅 1 处，在 `backend/app/api/v1/company.py:383`（删除 logo 时磁盘文件已不存在的容错），不是空实现。
- `return {}` / `return []` 共 20 余处（`attendance.py`、`chat.py`、`documents.py`、`leases.py`、`owners.py`、`public.py`、`exports.py` 等），抽查均为"无数据时返回空集合"的正常空态（如 `documents.py:85-92`、`attendance.py:718-722`、`public.py:1895-1900`），不是占位实现。

### 1.2 返回模拟数据 / 占位实现的模块

| 位置 | 行为 | 触发条件 |
|---|---|---|
| `backend/app/providers/payment/generic_provider.py:1,29-42` | 通用占位 Provider，未接入渠道直接抛"尚未开通"（fail closed） | 25 个未实现渠道 |
| `backend/app/providers/payment/router.py:21-33` | `PaymentChannel` 共 31 个枚举（`base.py:8-39`），6 个真实实现（stripe/lianlian/promptpay/wechat/alipay/wise），其余 25 个由循环注册 `GenericProvider` | — |
| `backend/app/providers/geo/__init__.py:63-91` | 未配置 Key 时按地址哈希生成**假经纬度**（曼谷周边），不报错 | `GOOGLE_MAPS_SERVER_API_KEY` 为空 |
| `backend/app/api/v1/projects.py:154` | 创建楼盘时调用上述 geocode，会把假坐标落库 | 同上 |
| `backend/app/providers/translate/__init__.py:24-52` | 未配置 Key 时返回 `provider:"mock"`，`translated_text` 基本等于原文 | `GOOGLE_TRANSLATE_API_KEY` 为空 |
| `backend/app/providers/ai/__init__.py:27-28` | AI 对话为预留占位（`status:"reserved"`） | 无 |
| `backend/app/core/feature_flags.py:27-64` | `is_enabled()` 无任何调用方；`FeatureFlag` 表无任何管理 API | — |

### 1.3 有接口、三端从未调用（实测交叉检索）

| 接口 | 后端实现 | 前端调用 |
|---|---|---|
| `/verifications/*`（7 个：POST `/verifications`、properties/listings 历史、listings 新鲜度、summary、queue、expire-due） | `backend/app/api/v1/verifications.py` 完整 | 0（Web/App/小程序均无 `verifications` 字样） |
| `GET /public/developers`、`GET /public/developers/{id}` | 完整（楼盘开发商） | 0（无开发商页面；分类页"品牌"仍 `notAvailable`） |
| `GET /billing/integrations` | 完整 | 0（Web 无集成/渠道状态页） |
| `GET /operations/trend` | 完整 | 0（趋势页 `pages/Trend/index.tsx` 调的是 `/dashboard/trend`，不是本接口） |
| `POST /uploads/gc` | 完整（孤儿文件清理） | 0 |
| `POST /auth/logout` | 完整 | 0（前端只清本地 token） |
| `POST /commissions/{id}/approve` | 完整 | 0（佣金审批无前端入口） |
| `/ai/chat`、`/ai/chat/stream` | reserved 占位 | 0（`aiApi` 已定义，无页面使用） |

> 已核对不属此列：`brokers` 模块有 App 调用（`mobile-app/src/screens/admin/CommissionRulesScreen.tsx:201` 调 `brokerApi.list`，`screens/broker/BrokerAgreementScreen.tsx:63,68,90` 调 `brokerApi.me/agreements/createAgreement`），仅缺 C 端公开经纪人目录。

### 1.4 有模型但缺少写路径

| 模型/字段 | 证据 | 事实 |
|---|---|---|
| `FeatureFlag` | `models/*` + `core/feature_flags.py` | 无 API、无调用方；前端也无 feature flag 判断 |
| `DataSubjectRequest` / `PrivacyPolicyVersion` | `models/pdpa.py:77,96` | 两张表已建模，但除 `models/__init__.py` 导出外全库无任何引用：无 API、无服务、无读写路径 |
| `Lease.contract_url` | 字段仅由 `LeaseCreate`/`LeaseUpdate` 透传（`leases.py:180,193` → `:567,583,673,698`）；全库无业务赋值，三端也从不传该字段 | 接口层可写，但电子签完成/合同上传等业务都不写，实际恒为 NULL |
| `Event` | 由 `core/events.py` 的 `publish_event` 写入 | 正常，不属于缺口 |

---

## 2. Web：路由、菜单、占位入口

### 2.1 菜单与路由一致性
- 45 个菜单项 → 对应路由 **0 个缺失**（`roleMenus.ts` 的 `key` 全部能在 `App.tsx`/`publicRoutes.tsx` 找到）。
- 无页面被 feature flag 关闭（flag 体系未启用）。

### 2.2 存在但无任何入口的"死路由"（4 条）

| 路由 | 代码 | 页面状态 |
|---|---|---|
| `/sale-deals` | `App.tsx:200` | 页面完整，调用 `property-deals` 接口 |
| `/distribution` | `App.tsx:201` | 页面完整，调用 `brokerApi`（经纪人列表/邀请/分佣/成交分成） |
| `/market-intelligence` | `App.tsx:203` | 页面完整，调用 `markets` 接口 |
| `/tenant/my-listings` | `App.tsx:283` | 页面完整，但无任何链接指向（员工端用 `/my-listings`） |

> 影响：经纪人/分销后台（`/distribution`）功能完整却完全不可达，是"有页面无入口"的最大单点。

### 2.3 "即将上线/暂未开放"占位入口（37 个）

| 文件 | 个 | 代表项 |
|---|---|---|
| `pages/category/Resale.tsx` | 8 | 地图、成交、经纪人、榜单、直播、地铁、业主、对比 |
| `pages/category/RentCategory.tsx` | 6 | 地图、通勤、自营、最新、经纪人、带家具 |
| `pages/category/Factory.tsx` | 5 | 严选、经纪人、地铁、周边环境、VR |
| `pages/category/Commercial.tsx` | 4 | 严选、经纪人、地铁、VR |
| `pages/category/Land.tsx` / `Hotel.tsx` | 2/2 | 严选、经纪人 |
| `pages/category/NewHouse.tsx` | 10 | 品牌开发商、土拍信息、经纪人、现房、小户型、楼盘榜单、VR看房、开盘直播、三人拼团、地铁沿线（共用 `mk()` 兜底） |

### 2.4 页面级空壳
- 未发现只渲染空态且无接口调用的页面；未发现空 `onClick`。

### 2.5 写死中文（未走 i18n）
- `pages/Trend/index.tsx`：14 处（"运营趋势"、"月度营收"、"运营指标（合同 / 线索 / 看房）"、表头等）。
- `pages/Company/index.tsx`：9 处（"公司信息"、"企业资料"、"资质文件"、表头等）。
- 其余 Web 页面扫描结果为 0。

---

## 3. App 与小程序

### 3.1 App：注册但无任何跳转的 screen（4 个）

| screen | 证据 | 说明 |
|---|---|---|
| `OwnerHome` | `RootNavigator.tsx:301` | 业主端旧首页，无入口（文档 D-09 已记录） |
| `MyContracts` | `RootNavigator.tsx:350` | 租客/业主合同列表；实际入口走 `Contracts`（`ProfileScreen.tsx:891`） |
| `Documents` | `RootNavigator.tsx:282` | 文档列表独立页，全库无 `navigate('Documents')` |
| `Test` | `RootNavigator.tsx:276` | 调试面板，仍打包在正式包内 |

### 3.2 App 占位入口（39 个）
- 分布：`ResaleScreen` 8、`RentCategoryScreen` 6、`FactoryScreen` 5、`CommercialScreen` 4、`HotelScreen` 3、`LandScreen` 2、`NewHouseScreen` 10、`ProfileScreen` 1。
- 占位点击统一跳 `FeatureNotAvailable` 页（`screens/FeatureNotAvailableScreen.tsx`），不是"点了无反应"。

### 3.3 小程序：注册但无跳转的页面（2 个）

| 页面 | 证据 | 事实 |
|---|---|---|
| `pages/admin/partners/index` | `app.config.ts:94` 注册；全库无 `navigateTo` 指向 | 页面完整（调用 `adminPartnersApi`），但管理端无入口 |
| `pages/staff/contract/index` | `app.config.ts:99` 注册；全库无跳转 | 与主包 `pages/contract/index` 重复的旧签署页 |

补充事实：`pages/owner/properties/binding.tsx` 不在 `app.config.ts` 中，但它是被 `pages/owner/properties/index.tsx` 引用的组件（不是页面），**不属于缺陷**。

### 3.4 小程序占位入口（40 个）
- 分布：租房 5、二手房 7、新房 10、商铺 4、厂房 6、酒店 4、土地 4（新房共用 `mk()` 兜底，其余为逐个 `notAvailable(`）。

### 3.5 小程序电子签
- 签署页 `pages/contract/index` 已注册（`app.config.ts:72-75`）且有入口（`pages/my-home/index.tsx:209`）。
- 但租约详情页用 `Taro.navigateTo({url: lease.contract_url})` 打开合同（`pages/tenant/leases/detail.tsx:157`），而 `Lease.contract_url` 没有任何业务写入（见 1.4），该按钮实际不会出现。

### 3.6 帮助中心兜底
- 三端均有真实帮助中心页面（Web `pages/HelpCenter`、App `HelpCenterScreen`、小程序 `pages/help/index`），不是空壳兜底。

### 3.7 写死文案
- App：`CRMScreen.tsx:144` 客户标题兜底 `'客户咨询'`；`AttendanceScreen.tsx:560` 打卡备注 `'远程考勤打卡'`；`tenant/ServicesScreen.tsx:311` 下单备注 `'公共事业代缴（单笔）'`。
- 小程序：`pages/contract/index.tsx:149,651` 印章默认名 `'测试印章'`（同时作为提交兜底）。
- 其余扫描命中为日志或多语言字典（zh/en/th），不是页面级写死。

---

## 4. 重点功能逐项真实状态

| 模块 | 状态 | 证据 | 影响用户程度 |
|---|---|---|---|
| **电子签** | 半成品（自签，符合既定方案） | `services/kaifang_sign_service.py` 使用 pyHanko + 自签 CA（证书优先级 `:101-110`）；`TSA_URL` 为空时 `_make_timestamper()` 返回 None（`:861-873`），签署结果 `tsa_status:"not_configured"`（`:529-563`）。无第三方电子签 SDK。三端均有签署入口 | 中：合同可签可验，但无第三方可信时间戳/存证 |
| **会员权益** | 未开始（已确认不做） | 全库仅剩 i18n 文案 `center:'会员中心'`（`frontend-web/src/i18n/locales/zh.ts:261`），无模型、无接口、无页面 | 无（既定不做） |
| **房屋评估报告** | 未开始（已确认不做） | 全库无 `appraisal`/评估报告实现；仅有"估价仅供参考"提示 | 无（既定不做） |
| **支付** | 仅外部依赖 | 31 渠道 / 6 真实（stripe/lianlian/promptpay/wechat/alipay/wise）/ 25 个 `GenericProvider` 占位（`payment/base.py:8-39`、`payment/router.py:21-33`）；`LIANLIAN_MERCHANT_ID`、`LIANLIAN_PRIVATE_KEY`、`PROMPTPAY_TARGET`、`STRIPE_*`、`WECHAT_MERCHANT_ID`、`AGGREGATOR_*` 在 `backend/.env` 中均未配置 | **高**：在线支付、服务下单付款、押金全部走不通 |
| **地图** | 半成品 + 仅外部依赖 | 前端 `VITE_GOOGLE_MAPS_WEB_API_KEY` 已配置（`frontend-web/.env`）；服务端 `GOOGLE_MAPS_API_KEY`/`GOOGLE_MAPS_SERVER_API_KEY` 为空；`/public/listings/{id}/commute` 实测返回 `available:false, reason:"no_key"`；`providers/geo` 无 Key 时返回假坐标（`geo/__init__.py:63-91`）；分类页地图：Web/App 的租房、二手房仍 `notAvailable`（各 2 处），Web 酒店/土地已跳 `/map`，小程序租房/二手房已跳 `/pages/public/map/index` | 中：地图页可打开，但服务端逆地理/通勤不可用，且有假坐标风险 |
| **实名认证** | 已完成（三端，证件上传 + 人工审核，不接人脸/第三方核验） | 后端 `/identity/*` 8 个接口（`api/v1/identity.py:206-426`，已挂载）；Web `pages/Tenant/Identity.tsx` + `pages/Operations/IdentityReview.tsx`；App `screens/tenant/IdentityVerificationScreen.tsx` + `services/identityApi.ts` + `ProfileScreen.tsx:339` 入口；小程序 `app.config.ts:41` + `pages/profile/index.tsx:515` 入口 | 无（仅缺第三方核验资质） |
| **榜单与成交价** | 已完成（受数据门槛） | `/public/rankings` 实测：`sample_count:0, published:false`（发布门槛 5 条成交）；三端均有榜单/成交卡片（Web `pages/Home/components/DealRankings.tsx`、App `components/DealRankingsCard.tsx`、小程序 `pages/tenant/home/index.tsx:136`）；成交价接口 `/property-deals` 完整 | 低：功能完整，暂无数据可展示 |
| **经纪人线索** | 半成品 | 后端 `leads` + `brokers` 完整；App 已有调用（`screens/admin/CommissionRulesScreen.tsx:201`、`screens/broker/BrokerAgreementScreen.tsx:63,68,90`）；Web 经纪人/分销页在 `/distribution`（`App.tsx:201`）但**无菜单入口**；C 端"找经纪人"仍 `notAvailable`，且无 `/public/brokers` 公开接口 | 中：后台不可达，C 端无经纪人可浏览 |
| **搬家服务** | 已完成 | 后端 `service-orders` + 计价 SKU `moving`（`services/pricing.py`）；Web `pages/Tenant/Services.tsx`、App `TenantServicesScreen`、小程序 `pages/svc/services`；付款依赖支付凭据 | 低（除付款） |
| **小区公告** | 已完成 | 后端 `announcements`；Web `/tenant/announcements`、App `AnnouncementsScreen`、小程序 `pages/tenant/announcements/index` | 无 |
| **我的看房** | 已完成 | 后端 `viewings`（`/viewings/mine`）；Web `/tenant/viewings`、App `MyViewingsScreen`、小程序 `pages/tenant/viewings/index` | 无 |
| **房屋估价** | 已完成（估算，非评估报告） | `GET /properties/{id}/value-estimate`；Web `Tenant/ValueEstimate.tsx`、App `ValueEstimateScreen`、小程序 `tenant/valuation/index`；页面有"仅供参考"提示 | 低：口径为估值区间 |
| **推送** | 半成品 + 仅外部依赖 | `DevicePushToken` 表 + `/devices/push-token` 接口；`mobile-app/src/lib/push.ts` 完整；但 `mobile-app/app.json` 无 EAS `projectId`；登录不自动注册（`registerPushToken` 仅在 `NotificationPrefsScreen.tsx:33` 调用，`store/auth.ts` 只调用 `unregisterPushToken`） | 中：不进入通知设置页就收不到推送 |
| **短信 OTP** | 仅外部依赖 | `/auth/otp/request`、`/auth/otp/verify` 完整；`TWILIO_*`、`SMTP_*`、`SMS_PROVIDER` 全空；`OTP_DEV_CODE_ECHO=true` 且 `DEBUG=true` 时回显验证码（`auth.py` 内 `_DEBUG` 分支）；生产非 DEBUG 下无短信渠道将 503 | **高**：生产无短信即无法 OTP 登录/合同签署验证码 |
| **Word 转 PDF** | 半成品 + 仅外部依赖 | 转换代码完整、前端有 `PDF_CONVERT_DISABLED` 提示；`GOTENBERG_URL` 为空；`docker-compose.yml` 有 gotenberg，**`docker-compose.prod.yml` 未包含 gotenberg 与 GOTENBERG_URL** | 低 |
| **通勤地铁** | 仅外部依赖 | `services/commute.py` 完整（`:54-58` 检查凭据，`:166-171` 无 Key 返回 `no_key` 不返回假数据）；三端详情页均有通勤卡片；实测 `no_key`；"地铁"入口仍 `notAvailable`；无独立地铁线路库（仅依赖 Routes API 的 transit 结果） | 中 |

---

## 5. 与两份文档的差异（三类）

### 5.1 文档滞后（代码已完成，文档仍写"未做"）

| 文档位置 | 文档说法 | 代码事实 |
|---|---|---|
| `pending-features-plan-2026-11-17.md` §3.1（"没有任何通勤/路径/地铁实现"） | 无通勤实现 | `services/commute.py` + `/public/listings/{id}/commute` + `CommuteCache` + 三端通勤卡片均已存在 |
| 同文档 §11.1（"没有设备 token 表，也没有注册接口"） | 无推送设备表 | `DevicePushToken` 表 + `/devices/push-token` 已存在（缺 EAS projectId） |
| `remaining-work.md:470-471`（§13.3 把地图/通勤/地铁、排行榜/成交价列为「即将上线」） | 待做 | 通勤接口与三端卡片已实现（仅缺 Key）；榜单接口与三端卡片已实现，仅因 `sample_count=0` 未发布 |
| `remaining-work.md:473`（§13.3 实名认证「置灰并提示未接入」） | 未接入 | 三端实名已完成；同文 §14.1 批次 7 与 `:511` 已自述完成，13.3 表未同步 |

### 5.2 文档超前 / 与代码不符（文档说已完成，实际有缺口）

| 文档位置 | 文档说法 | 代码事实 |
|---|---|---|
| `remaining-work.md:496` | "App 登录后自动注册（`src/lib/push.ts`）" | 登录**不**自动注册；只有进入通知设置页才调用 `registerPushToken`（`NotificationPrefsScreen.tsx:33`） |
| `remaining-work.md:475,494` | "docker-compose 增加 gotenberg" | 仅 `docker-compose.yml` 有；`docker-compose.prod.yml` 无 gotenberg、无 `GOTENBERG_URL` |
| `remaining-work.md` §3.1（地图） | "分类页「地图」可跳 `/map`" | 实际：Web 仅酒店/土地可跳 `/map`，租房/二手房仍 `notAvailable`，其余分类页无地图入口；App 租房/二手房仍占位；小程序租房/二手房已跳 `/pages/public/map/index` |

### 5.3 真未完成（代码中确实没有）
- 会员权益（已决策不做）
- 房屋评估报告（已决策不做）
- C 端经纪人公开目录（无 `/public/brokers`、无经纪人详情页）
- 独立地铁线路库
- Web 侧经纪人管理后台入口（页面在，入口无）
- 房源核验（verifications）三端页面

### 5.4 半成品（有页面无数据 / 有接口无页面 / 只有一端）
- 有接口无页面：`/verifications/*`、`/public/developers`、`/billing/integrations`、`/operations/trend`、`/uploads/gc`、`/auth/logout`、`/commissions/{id}/approve`、`/ai/*`
- 有页面无入口：Web `/sale-deals`、`/distribution`、`/market-intelligence`、`/tenant/my-listings`；App `OwnerHome`、`MyContracts`、`Documents`、`Test`；小程序 `admin/partners`、`staff/contract`
- 只有部分端：推送（仅 App）；通勤（三端有卡片，但入口仍占位）

---

## 6. 真正需要开发的工作清单（按优先级）

| 优先级 | 工作项 | 依据 |
|---|---|---|
| P0 | 接入支付渠道凭据（至少连连 + PromptPay 目标账户），打通创建支付/回调/订单状态 | 31 渠道 / 6 真实 / 25 占位，且 6 个真实渠道凭据全空；服务下单、押金、租赁支付均不可用 |
| P0 | 配置短信渠道（Twilio 或国内短信），关闭 `OTP_DEV_CODE_ECHO` | 生产非 DEBUG 下 OTP 请求 503，登录与合同验证码不可用 |
| P1 | 配置微信小程序 AppID/Secret（`WECHAT_APPID`/`WECHAT_SECRET`） | `/auth/wx/login` 当前 503；小程序只能用 OTP 登录 |
| P1 | `docker-compose.prod.yml` 增加 gotenberg 与 `GOTENBERG_URL` | 生产 Word→PDF 不可用 |
| P1 | 配置 EAS `projectId`（或 FCM/APNs），并将 `registerPushToken` 接入登录流程 | 当前无法注册推送，且不进入设置页不注册 |
| P1 | 为 `/distribution`（经纪人/分销）、`/sale-deals`、`/market-intelligence` 补菜单入口 | 4 条死路由，功能完整但不可达 |
| P1 | 配置 Google Maps 服务端 Key 并确认结算生效；修正 `providers/geo` 的假坐标兜底 | `/commute` 实测 `no_key`；创建楼盘会落假坐标 |
| P2 | 开发房源核验（`/verifications/*`）运营页面 | 后端 7 接口，三端 0 调用 |
| P2 | 开发开发商/品牌页面并接入 `/public/developers` | 后端 2 接口，前端 0 调用；分类页"品牌"仍占位 |
| P2 | 开发支付渠道/集成状态页（`/billing/integrations`） | 后端 1 接口，前端 0 调用 |
| P2 | C 端"找经纪人"：公开经纪人目录 + 详情 + 线索入口 | 无 `/public/brokers`，入口仍 `notAvailable` |
| P3 | 分类页"地图/通勤/地铁"入口改为真实跳转（`/map`、通勤卡片） | 三端各 7 个、合计 21 个仍为占位（地图：Web/App 租房+二手房；通勤：租房；地铁：二手房/商铺/厂房/新房，小程序另有酒店/土地） |
| P3 | 接入第三方 TSA（`TSA_URL`）或外部电子签产品 | 当前自签 + 无时间戳（`tsa_status:"not_configured"`） |
| P3 | 清理死页面/死配置：App `OwnerHome`/`MyContracts`/`Documents`/`Test`、小程序 `admin/partners`/`staff/contract`、`FeatureFlag` 表与 `is_enabled`、`DataSubjectRequest`/`PrivacyPolicyVersion` 空表、`Lease.contract_url` 无业务写入 | 无入口或从未写入 |
| P3 | 佣金审批前端入口（`/commissions/{id}/approve`） | 后端有接口，前端 0 调用 |
| P3 | AI 助手页面（或下线 `/ai/*` 与 `aiApi`） | 后端 reserved 占位，前端有方法无页面 |

---

## 7. 无法在本机验证的事项

| 事项 | 原因 |
|---|---|
| Google Maps 结算是否生效 | 前端 Key 已配，但结算状态只能查 Google Cloud 控制台，代码无法判断 |
| 支付回调签名与真实扣款 | 渠道凭据全空，无法发起真实支付 |
| 短信/邮件实际到达 | `TWILIO_*`/`SMTP_*` 为空，仅能验证"未配置即 503" |
| 微信小程序真机登录/支付 | 需微信开发者工具与小程序 AppID，当前无凭据 |
| EAS 推送到达 | 需 EAS projectId 与真机 |
| 电子签在第三方平台的存证效力 | 当前为自签 CA，无第三方存证 |
