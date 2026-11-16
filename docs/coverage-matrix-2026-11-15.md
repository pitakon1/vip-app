# 三端全覆盖测试矩阵（2026-11-15）

> 本文件是「按矩阵逐项判定」版本的覆盖台账，供下一轮做**差异对比**使用。
> 下一轮不要从零开始：先读本文件，只需复测「未通过 / 无法验证 / 本轮新增」三类项。

## 0. 环境与方法

| 项 | 值 |
| --- | --- |
| 仓库 | `e:/app/vip-app-main` |
| 后端 | `http://127.0.0.1:8000`（`start_backend.bat`，uvicorn reload） |
| Web | `http://127.0.0.1:3000`（Vite） |
| App | Expo Web `http://localhost:8081`（watch 模式，非 CI） |
| 小程序 | 微信开发者工具 CLI + `miniprogram-automator` 真实点击；AppID 改用本机真实 `wxc4b43b510362e4b3`（本地改动），可编译可运行 |
| 数据库 | `backend/rental_dev.db`（SQLite，存在其它会话并发读写） |
| 账号 | admin@viprental.com/admin123、employee@…/emp123、agent@…/agent123、owner@…/owner123、tenant@…/tenant123 |
| 前端实测方式 | Playwright 真实浏览器、真实点击/填表/选择器；非只读代码 |
| 后端实测方式 | 真实 HTTP 调用（Bearer token），按 6 种身份逐接口记录返回码 |
| 测试脚本/原始数据 | `C:\Users\admin\AppData\Local\Temp\viptest\`：`api_matrix.py`、`web_sweep.js`、`web_extra*.js`、`mobile_sweep.js`、`mobile_extra.js`、`web_lang.js`；结果 `api_matrix.tsv`、`web_*.jsonl`、`mobile_*.jsonl` |
| Git | **未提交**，所有改动留在工作区 |

## 1. 枚举清单（路由 / 菜单 / 权限来源）

### 1.1 Web 路由（`frontend-web/src/App.tsx`、`routes/publicRoutes.tsx`）

- 公开页（匿名）：`/`、`/listings`、`/listing/:id`、`/schools`、`/school/:id`、`/communities`、`/community/:id`、`/category/{rent,new,resale,commercial,factory,hotel,land}`、`/map`、`/login`、`/register`、`/sign/:token`
- 登录后通用：`/portal`（按角色跳转）、`/chat`、`/company`（业主及以上）、`/verify`（非租客）
- B 端作业：`/dashboard`、`/properties`、`/properties/detail/:id`、`/crm`、`/leases`、`/payments`、`/contracts`、`/viewings`、`/sale-deals`、`/distribution`、`/markets`、`/market-intelligence`、`/employees`、`/settings`、`/trend`、`/commission-rules`、`/audit-logs`、`/my-listings`、`/broker-agreements`、`/operations/{listing-review,dedupe-review,property-binding-review}`、`/attendance-manage`
- 员工/经纪：`/employee/{dashboard,attendance,performance,contacts}`
- 管理员：`/system/{users,partners,groups,permissions,departments,data-scopes,options,review-center}`、`/operations`
- 合作方（partner_admin）：`/partner/{members,attendance}`
- C 端门户：`/tenant/{dashboard,my,help,payments,documents,services,maintenance,leases,leases/:id,deals,deals/:id,contracts,contracts/verify,my-properties,income,marketing,my-listings,property-binding,properties/:id,listings}`
- 兜底：`*` → 404 页

菜单来源：`frontend-web/src/config/roleMenus.ts`；权限来源：`ProtectedRoute denyRoles` + `frontend-web/src/pages/...` 角色分支。

### 1.2 App（Expo）导航（`mobile-app/src/navigation/*`）

- 底部 Tab 按角色动态：C 端（首页 / 发现 / 消息 / 我的）、员工/经纪（首页 / 房源 / 客户 / 消息 / 我的）、管理员（首页 / 房源 / 客户 / 消息 / 收款 / 我的）
- Stack 屏（58 个）：`PropertyDetail`、`PropertySearch`、`Documents`、`TenantMaintenance`、`TenantServices`/`OwnerServices`、`Payments`/`OwnerPayments`、`CRM`/`AdminCRM`、`CommissionRules`、`Performance`、`EmployeeProperties`/`AdminProperties`、`Calendar`、`AdminUsers`、`PartnerHub`、`AdminPermissions`、`AdminDepartments`、`AdminDataScopes`、`AdminOptions`、`Contacts`、`OwnerHome`、`OwnerIncome`、`OwnerMarketing`、`OwnerDocuments`、`OwnerProperties`、`OwnerPropertyDetail`、`MyListings`、`PublicListings`、`LocationPicker`、`PublicSchools`、`PublicCommunities`、`PublicListingDetail`、`PublicSchoolDetail`、`PublicCommunityDetail`、`BrokerAgreement`、`EmployeePropertyBrowse`、`AdminPropertyDetail`、`PropertyEdit`、`ProjectCreate`、`AdminLeases`、`SettingsLanguage`、`EditProfile`、`ChangePassword`、`NotificationPrefs`、`AdminBusinessSettings`、`AttendanceManage`、`MyLease`/`MyLeaseDetail`、`MyOrders`/`MyOrderDetail`、`Favorites`、`History`、`PriceAlerts`、`Contracts`、`MyContracts`、`About`、`HelpCenter`、`PropertyBinding`、`ChatList`/`ChatDetail`、`Attendance`、7 个分类页、`Test`（调试）
- 菜单来源：`screens/ProfileScreen.tsx` 的 `FUNC`/`SETTINGS`/角色分组。

### 1.3 小程序页面（`miniapp/src/app.config.ts`）

主包 34 页：`pages/index`、`pages/login`、5 个 public 页（listings/schools/school-detail/communities/community-detail）、`public/map`、`public/discover`、`tenant/{home,documents,maintenance,payments,listings}`、7 个 `tenant/category-*`、`tenant/{favorites,history,price-alerts}`、`location`、`about`、`help`、`language`、`property-binding`、`tenant/property-detail`、`tenant/leases`、`profile`、`tenant/leases/detail`、`tenant/deals`、`tenant/deals/detail`

分包 10 个：`public/listing-detail`、`attendance`、`contract`、`svc/services`、`owner/{home,properties,income,marketing,property-detail}`、`employee/{home,performance,calendar,properties,property-edit,property-browse,crm,contacts}`、`admin/*`（19 页）、`staff/{listings,contract}`、`chat/{list,detail}`

### 1.4 后端接口

从运行中实例的 `/openapi.json` 枚举：**428 个 operation（path+method）**，按模块分布见 `api_endpoints.txt`；实际纳入角色矩阵探测 **424** 个（排除 `/`、`/health*` 4 个探活）。

## 2. 接口角色矩阵（真实调用结果）

6 种身份：游客（无 token）、tenant、owner、employee、agent、admin。
探测规则：GET 全量；带 `{id}` 的写接口用不存在 id 探测（不落库）；无路径参数的写接口只测游客 401（避免误建数据）。原始结果：`api_matrix.tsv`。

| 身份 | 200 | 401 | 403 | 404 | 422 | 400 | 503 | 跳过（写接口） |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 游客 | 14 | 382 | – | 9 | 14 | 3 | 2 | – |
| tenant | 61 | – | 167 | 12 | 92 | 1 | – | 91 |
| owner | 61 | – | 166 | 12 | 93 | 1 | – | 91 |
| employee | 97 | – | 87 | 10 | 138 | 1 | – | 91 |
| agent | 102 | – | 69 | 10 | 151 | 1 | – | 91 |
| admin | 125 | – | 3 | 17 | 187 | 1 | – | 91 |

判定要点：

- **游客 382/401 被拒**，14 个 200 均为设计上的公开接口（`/public/*`、`/company/info`、`/options*`、`/auth/oauth/status`），无业务数据泄露。
- 游客 422/400 均为公开写接口的入参校验（登录、注册、询盘、预约、签署、支付回调）。
- 游客 503 两个：`/auth/oauth/apple`、`/auth/oauth/google` —— OAuth 凭据未配置，属环境缺口（见第 6 节）。
- admin 403 的三个接口均为合作方域（`/partner/members`、`/partner/performance`、`/partner/properties`），与 Web 路由「admin 禁入 `/partner/*`」一致。
- `GET /contracts/preview/{token}`、`/public/contract-sign/*` 对游客开放属签署场景设计（token 即凭证）。
- **结论：接口层未发现越权/未鉴权缺陷。**

### 2.1 角色矩阵暴露的前端守卫缺陷（见第 4 节修复）

后端对 owner/employee/agent 返回 403 的接口，对应 Web 页面此前仍可凭 URL 打开（页面半残）。属**前端守卫缺失**，不是接口越权。

## 3. 页面四场景覆盖矩阵

图例：✅通过　❌未通过（已修则标「已修+复测」）　⚠️无法验证　— 不适用

### 3.1 Web 公开页（游客）

| 页面 | 正常流 | 空数据 | 错误输入 | 未登录/越权 |
| --- | --- | --- | --- | --- |
| `/` 首页 | ✅ 精选房源渲染 | ✅ | — | ✅ |
| `/listings` 找房 | ✅ 列表 20 条 | ✅ 无结果文案 | ✅ 异常关键词无 XSS/无崩溃 | ✅ |
| `/listing/:id` | ✅ | — | ✅ 非法 id → 错误态+重试 | ✅ |
| `/schools`、`/school/:id` | ✅ | ✅ | ✅ | ✅ |
| `/communities`、`/community/:id` | ✅ | ✅ | ✅ | ✅ |
| `/category/*` 7 页 | ✅ | ✅ | — | ✅ |
| `/map` | ✅ | ✅ | — | ✅ |
| `/login` | ✅ 5 角色登录落点正确 | — | ✅ 错密码提示「邮箱或密码错误」 | ✅ |
| `/register` | ✅ 手机号/邮箱 Tab 切换 | — | ✅ 邮箱 Tab 前无输入框（设计如此）；切换后校验 | ✅ |
| `/sign/:token` | ⚠️ 需真实签署 token | ⚠️ | ⚠️ | ⚠️ |
| `*` 404 | ✅ 「页面不存在」+ 返回 | — | — | ✅ |

### 3.2 Web C 端门户（tenant / owner）

| 页面 | 正常流 | 空数据 | 错误输入 | 越权 |
| --- | --- | --- | --- | --- |
| `/tenant/dashboard` | ✅ | ✅ | — | ✅ |
| `/tenant/listings` | ✅ | ✅ | — | ✅ |
| `/tenant/my-properties` | ✅ 业主 25 套 / 租客 0 套 | ✅ 空态引导「添加我的房产」 | — | ✅ |
| `/tenant/income` | ✅ 业主 ฿55,000/待收 ฿35,000 | ✅ 租客全 0 + 「暂无月度数据」 | — | ✅ |
| `/tenant/payments` | ✅ 3 笔（含 failed/逾期） | ✅ | — | ✅ |
| `/tenant/maintenance`、`/tenant/services` | ✅ | ✅ | ✅ 表单必填 | ✅ |
| `/tenant/documents` | ✅ | ✅ | — | ✅ |
| `/tenant/contracts` | ✅ 按签署方/租约过滤 | ✅ | — | ✅ |
| `/tenant/deals`、`/tenant/my`、`/tenant/help` | ✅ | ✅ | — | ✅ |
| `/tenant/marketing`、`/tenant/my-listings`、`/tenant/property-binding` | ✅ | ✅ | ✅ | ✅ |
| `/tenant/properties/:id`、`/tenant/leases/:id` | ✅ | — | ✅ 非法 id 错误态 | ✅ |
| `/company`、`/chat`、`/verify` | ✅ | ✅ | — | ✅ |
| 语言切换（门户头部） | ✅ zh→en 即时生效且刷新后保持（`i18nextLng=en`），可切回 | — | — | — |

### 3.3 Web B 端（employee / agent / admin / partner_admin）

| 页面 | 正常流 | 空数据 | 错误输入 | 越权 |
| --- | --- | --- | --- | --- |
| `/dashboard`（admin/agent） | ✅ | ✅ | — | ✅ tenant/owner/employee 被拦 |
| `/properties`、`/properties/detail/:id` | ✅ 25 套 | ✅ | ✅ | ✅ tenant 被拦 |
| `/crm` | ✅ 员工/经纪 | ✅ | ✅ | ❌ owner 可进且接口 403 → **已修+复测** |
| `/leases`、`/payments`、`/contracts` | ✅ | ✅ | ✅ 非法 status→400/422 | ✅ tenant 被拦 |
| `/viewings` | ✅ 员工/经纪 | ✅ | — | ❌ owner 可进且 403 → **已修** |
| `/trend` | ✅ admin | ✅ | — | ❌ owner/员工/经纪可进且 403 → **已修** |
| `/commission-rules` | ✅ admin | ✅ | — | ❌ owner/员工/经纪可进且 403 → **已修** |
| `/audit-logs` | ✅ admin | ✅ | — | ❌ owner/员工/经纪可进且 403 → **已修** |
| `/distribution` | ✅ 员工/经纪 | ✅ | — | ❌ owner 可进且 403 → **已修** |
| `/employees` | ✅ admin | ✅ | ✅ | ❌ owner/员工/经纪可进且 403 → **已修** |
| `/settings` | ✅ admin | — | ✅ | ❌ owner/员工/经纪可进且 403 → **已修** |
| `/sale-deals`、`/markets`、`/market-intelligence` | ✅ | ✅ | — | ✅ |
| `/my-listings`、`/broker-agreements` | ✅ 员工/经纪 | ✅ | ✅ | ✅ owner/tenant 被拦 |
| `/operations/{listing,dedupe,binding}-review` | ✅ 员工/经纪 | ✅ | — | ✅ |
| `/employee/{dashboard,attendance,performance,contacts}` | ✅ 员工 | ✅ | ✅ 定位授权提示 | ❌ 经纪人（agent）菜单可见但路由拒绝 → **已修+复测** |
| `/attendance-manage`（admin/partner） | ✅ | ✅ | — | ✅ |
| `/system/{users,partners,groups,permissions,departments,data-scopes,options,review-center}`、`/operations` | ✅ admin | ✅ | ✅ 表单校验 | ✅ 全部非 admin 被拦 |
| `/partner/{members,attendance}` | ⚠️ 无 partner 账号 | — | — | ✅ admin 被拦 |
| 404 / 未登录 | ✅ 受保护路由未登录 → `/login` | — | — | ✅ |

### 3.4 App（Expo Web，按角色真实点击）

| 项 | 正常流 | 空数据 | 错误输入 | 未登录/越权 |
| --- | --- | --- | --- | --- |
| 登录（5 角色邮箱登录） | ✅ 落点正确 | — | ✅ 错误提示 | ✅ 未登录进「我的」跳登录页 |
| tenant 底部 Tab（首页/发现/消息/我的） | ✅ | ✅ | — | ✅ |
| owner 底部 Tab | ✅ | ✅ | — | ✅ |
| employee/agent Tab（首页/房源/客户/消息/我的） | ✅ | ✅ 0 带看/0 客户空态 | — | ✅ |
| admin Tab（含收款） | ✅ 已收 ฿55,000 / 待收 ฿35,000 / 收缴率 61% | ✅ | — | ✅ |
| C 端：房源管理/收益明细/交易订单/电子签合同/文档中心 | ✅ | ✅ 租客全空态 | — | ✅ |
| 员工/经纪：房源管理、电子签合同、协议签约 | ✅ | ✅ | — | ✅ |
| 员工：考勤打卡 | ⚠️ 真实定位无法验证（Web 端「未授权定位」属预期） | — | — | — |
| 管理员：租约合同、业务设置、通知设置 | ✅ | — | ✅ | — |
| 语言切换（我的→语言） | ✅ 即时生效并可持久 | — | — | — |
| 支付/拨号/推送 | ⚠️ 见第 6 节 | — | — | — |

### 3.5 小程序（已实测）

**环境打通过程（均为工具原始输出）**

| 卡点 | 原始输出 | 处理 |
| --- | --- | --- |
| 占位 AppID | `cli open` → code 10「不存在此 AppID」（`touristappid`） | 改用本机 IDE 数据中的真实 AppID `wxc4b43b510362e4b3`，`cli open` 返回 `✔ open` |
| 本地后端被拦 | 模拟器内 `wx.request http://localhost:8000/health` → `{"errMsg":"request:fail url not in domain list"}` | `project.config.json` 置 `setting.urlCheck=false`，必须 `cli close`+`cli open` 重开才生效；重开后返回 `{"status":"ok","version":"1.0.0"}` |
| 页面白屏 | 生命周期 onLoad/onReady 全触发、无 JS 报错，但 `getCurrentPages()[0].data` 只有 `__webviewId__`（Taro 的 `root` 缺失） | `dev:weapp --watch` 增量产物不可用；改用完整构建 `taro build --type weapp`（开发模式，API_BASE=`http://localhost:8000/api/v1`）后正常，data 出现 `root` |

> 结论：小程序测试请使用**完整构建**（`NODE_ENV=development npx taro build --type weapp`），不要用 `--watch` 增量产物。

**逐页实测（真实点击/真实接口，`mp_tour.js`）**

| 角色 | 实测页面 | 结果 |
| --- | --- | --- |
| 游客 | index→tenant/home、login、listings、schools、communities、map、discover、about、help、language、location、category-rent、listing-detail、school-detail、community-detail | ✅ 全部渲染真实数据；房源 25 套与后端 `total=25` 一致；搜索无结果→「共 0 套房源」空态 |
| 游客越权 | tenant/payments 直连 | ✅ 1.5s 内跳转 `pages/login/index` |
| 租客 | tenant/{home,documents,maintenance,payments,listings,favorites,history,price-alerts}、profile、leases、leases/detail、deals、property-binding、property-detail、svc/services、contract、chat/list、chat/detail、staff/{listings,contract} | ✅ 数据/空态正常；leases/detail 正确传 `lease_id` 时正常、非法 id 显示「租约不存在或已删除」 |
| 业主 | owner/{home,properties,income,marketing,property-detail}、index、profile、tenant/{documents,payments}、property-binding | ✅ 业主首页入口 3 条（空置房源/待收账单/到期合同）全部落点正确 |
| 员工 | employee/{home,performance,calendar,properties,property-edit,property-browse,crm,contacts}、attendance、staff/{listings,contract} | ✅ 全部正常；考勤（有定位授权失败提示）无接口报错 |
| 经纪 | 同员工页 + property-edit（他人房源） | ✅ 后端 404 数据域隔离生效，前端提示「房源不存在或已删除」 |
| 管理员 | admin 19 页 + index + profile | ✅ 19 页全部渲染；快捷入口 6 条落点正确 |
| 入口点击 | 租客首页宫格 7 条、管理员快捷 6 条、业主告警 3 条、员工「日程排期」1 条 | ✅ 全部跳转到存在页面 |

**小程序缺陷（本轮）**

| # | 现象 | 根因 | 状态 |
| --- | --- | --- | --- |
| 1 | 小区列表「共 0 个小区」 | GET 参数 `q=undefined` 被序列化成字符串 `"undefined"`，后端按关键词过滤 | ✅ 已修（`lib/api.ts` 的 `normalizeQuery` 丢弃 undefined/null）+复测「共 1 个小区」 |
| 2 | 地图找房「点位加载失败」 | 同上，`listing_type=undefined` 等触发 422 | ✅ 已修+复测无报错 |
| 3 | 管理员直连 admin/partner-members 显示「加载失败」 | 该页仅 `partner_admin` 有入口；admin 无 partner 上下文，接口 403 | ✅ 已修（`lib/roleGuard.ts` 角色守卫）+复测重定向到 admin 首页、0 报错 |
| 4 | 租客直连 attendance 触发 4 个 403 | 该页仅员工/经纪/管理员可用，页面无角色守卫 | ✅ 已修（同一守卫）+复测重定向到租客首页、0 报错；员工考勤与游客跳登录均回归正常 |

### 3.6 接口错误输入抽查（admin token 真实调用）

| 用例 | 结果 | 判定 |
| --- | --- | --- |
| `/payments?page=0`、`page=-3`、`page_size=100000` | 422 + 中文越界提示 | ✅ |
| `/payments?status=NOT_A_STATUS` | 400 Invalid status | ✅ |
| `/leases?status=BAD` | 422 枚举校验 | ✅ |
| `/leases/___bad___`、`/properties/___bad___`、`/contracts/___bad___` | 422 UUID 校验 | ✅ |
| `/properties?page=abc` | 422 整数校验 | ✅ |
| `/contracts?status=BAD` | 400 无效的合同状态 | ✅ |
| `/listings?q=<script>…` | 200 `items=[]`，无注入 | ✅ |
| `/dashboard/summary?month=2026-13` | 200（未声明该参数，按忽略处理） | ✅ |
| `/properties?min_price=abc` | 200，非法数值被忽略（UI 无可达入口） | ⚠️ 低风险，不计缺陷 |

## 4. 本轮修复清单

### 批次 1：Web 路由守卫与后端权限对齐（8 条路由）

- **现象**：owner 直接打开 `/crm`、`/viewings`、`/trend`、`/commission-rules`、`/audit-logs`、`/distribution`、`/employees`、`/settings`；employee/agent 打开 `/trend`、`/commission-rules`、`/audit-logs`、`/employees`、`/settings` 时，页面可进入但接口连续 403，页面空白或只剩残留数据。
- **根因**：这些路由的 `denyRoles` 只写了 `['tenant']`，而后端 `require_roles/require_permission` 对 owner/employee/agent 均拒绝（`/leads`、`/viewings`、`/dashboard/trend`、`/commission-rules`、`/audit-logs`、`/brokers/summary`、`/employees`、`/company/settings`）。
- **改动位置**：`frontend-web/src/App.tsx` 第 181–194 行
  - `/crm`、`/viewings`、`/distribution` → `denyRoles: ['tenant','owner']`
  - `/trend`、`/commission-rules`、`/audit-logs`、`/employees`、`/settings` → `['tenant','owner','employee','agent','partner_admin']`
- **复测证据**：上述路径在 owner/employee/agent 下全部重定向到各自首页（`/tenant/dashboard`、`/employee/dashboard`、`/portal`），接口 4xx 由 2–6 条降为 0；admin 仍正常进入且 0 报错。

### 批次 2：经纪人（agent）员工端页面被错误拦截

- **现象**：经纪登录 Web 后，侧栏「考勤 / 业绩 / 通讯录」点击无内容；`/employee/attendance` 跳到 `/portal`，`/employee/performance`、`/employee/contacts` 跳到 `/employee/dashboard`，而后者同样被拦截，只剩空壳布局。
- **根因**：`App.tsx` 中 4 条 `/employee/*` 路由的 `denyRoles` 含 `'agent'`；但后端考勤/业绩/通讯录接口（`/attendance/*`、`/performance/me`、`/employees/workbench` 等）对 agent 均返回 200，且 `roleMenus` 的 agent 角色复用员工菜单。
- **改动位置**：`frontend-web/src/App.tsx` 第 200–203 行，4 条路由 `denyRoles` 改为 `['tenant','owner']`。
- **复测证据**：agent 真实点击「考勤」→ `/employee/attendance`（793 字，打卡面板）、「业绩」→ `/employee/performance`（报表 + 币种 ฿）、「通讯录」→ `/employee/contacts`（联系人列表）、「数据总览」→ `/dashboard`，全部 0 接口错误；employee 同路径回归正常；tenant 访问 `/employee/*` 仍被重定向到门户。

### 批次 3：小程序 GET 参数 `undefined` 被当成真实筛选值（2 处页面）

- **现象**：小区列表「共 0 个小区 / 没有匹配的小区」；地图找房控制台 `[API] 请求失败` + `[public map] 点位加载失败`。
- **根因**：`miniapp/src/lib/api.ts` 的 `normalizeQuery` 只做键名 snake_case 转换，未剔除 `undefined/null`；`wx.request` 会把它们序列化成字符串 `"undefined"`。后端按真实值处理：`/public/projects?q=undefined` → `total=0`；`/public/map-points?listing_type=undefined&is_new_development=undefined` → 422。
- **改动位置**：`miniapp/src/lib/api.ts` `normalizeQuery`（跳过 undefined/null 值，全部 GET 请求生效）。
- **复测证据**：小区页 →「共 1 个小区 / The River condos」；地图找房无请求错误；游客房源列表仍「共 25 套房源」。

### 批次 4：小程序越权直连补角色守卫（2 页）

- **现象**：租客直连 `pages/attendance/index` 发出 4 个必然 403 的请求；管理员直连 `pages/admin/partner-members/index` 显示「加载失败」并打出 3 条接口错误。
- **做法**（对齐 Web 的路由守卫）：新增 `miniapp/src/lib/roleGuard.ts`
  - `roleHome(role)`：与 `pages/index` 登录后落点一致（admin→admin/home、employee/agent→employee/home、partner_admin→partner-members、owner/tenant→tenant/home、未知→profile）。
  - `guardRoles(allowed)`：无 token → 登录页；角色不在白名单 → `redirectTo` 该角色首页并返回 false，调用方立即 return，不发业务请求。
- **改动位置**：
  - `miniapp/src/pages/attendance/index.tsx`：白名单 `['employee','agent','admin']`，校验通过前只渲染 `<StateBlock loading>`。
  - `miniapp/src/pages/admin/partner-members/index.tsx`：白名单 `['partner_admin']`，同样先渲染加载态。
- **复测证据**：tenant→attendance 落 `pages/tenant/home/index`、0 条接口错误；admin→partner-members 落 `pages/admin/home/index`、0 条接口错误；employee→attendance 正常打卡页；guest→attendance 落 `pages/login/index`；admin/properties 等原入口不受影响。
- **越权基线（重新构建后复核）**：后端直连验证 tenant `GET /attendance/{today,me,groups/me/rules,leave-requests}` 均 403（`Required roles: ['admin','agent','employee']`）；admin `GET /partner/{members,properties,performance}` 均 403（`Only partner admin can manage company members`）；而 admin `GET /admin/users` 正常 200。守卫在 `useDidShow` 首行执行并立即 return，上述请求在页面侧不会再被触发。

> 上一轮已修 13 项（账单应收口径、移动端收益月份桶、管理员收款 KPI、租客待缴含逾期、业主收益 NULL、考勤/预约时区、业绩页币种、空态与表单字段级校验等），本轮回归未复现，不重复列出。

## 5. 覆盖结论

| 端 | 覆盖 | 通过 | 未通过（已修） | 无法验证 |
| --- | --- | --- | --- | --- |
| 后端接口 | 424 | 424 | 0 | 91 个写接口仅做游客鉴权探测（未用真实账号触发写操作） |
| Web 公开页 | 18 路由 | 17 | 0 | `/sign/:token`（缺真实签署 token） |
| Web 门户 | 23 路由 | 23 | 0 | — |
| Web B 端/管理 | 35 路由 | 26 直接通过 | 9（已修+复测） | `/partner/*`（无 partner 账号） |
| App | 5 角色 × Tab + 30 屏 | 28 | 0 | 考勤定位、支付、拨号、推送 |
| 小程序 | 44 页 | 44（角色×页面实测） | 2（已修+复测） | 0（原 AppID 卡点已解决） |

## 6. 无法验证项及原因

1. **小程序真机能力**：已在开发者工具模拟器中逐页实测；真机定位、拨号、推送、微信支付仍需真机/商户号（见下）。模拟器与 automator 不具备的能力：真实 GPS、真实拨号、推送到达。
2. **真实微信支付**：无商户号/证书，移动端与小程序支付只能验证到「创建订单/跳转前」。
3. **真机拨号 / 定位 / 推送**：浏览器与模拟器无法替代；App 端考勤打卡仅验证到「未授权定位」提示。
4. **Google / Apple OAuth**：`/auth/oauth/{google,apple}` 返回 503（凭据未配置）。
5. **签署页 `/sign/:token` 与合同 PDF 签章**：缺少有效 token 与签章服务凭据，仅验证了接口鉴权边界。
6. **合作方（partner_admin）页面**：无 partner 账号，只验证了接口 403/路由拦截。
7. **CSV 导出数据隔离**：当前 tenant/owner 数据同源（同一租客/业主），4 种身份导出行数一致，**无法区分是否越权**；需再造一个独立业主+租客后复测。

## 7. 下一轮差异对比指引

1. 先跑 `python viptest/api_matrix.py`，与 `api_matrix.tsv` 做 diff：新增/消失的 200、401→200 的变化优先复核。
2. 再跑 `node viptest/web_sweep.js` 与 `node viptest/web_extra.js`，对比 `bad` 列表为空的页面集合。
3. 移动端跑 `node viptest/mobile_sweep.js` + `mobile_extra.js`，重点看 `bad` 非空与 `MISS` 项。
4. 小程序复测：先 `NODE_ENV=development npx taro build --type weapp`（完整构建，勿用 `--watch`），再用 `cli.bat open --project E:\app\vip-app-main\miniapp` + `cli.bat auto --auto-port 9422` 常驻，然后 `node viptest/mp_tour.js <role> <route...>`（角色：guest/tenant/owner/employee/agent/admin）逐页跑；输出含 finalRoute、页面文本、console。入口点击用 `node viptest/mp_entries.js <role> <route> <selector>`。
5. 只复测本文件第 5 节「无法验证」与第 4 节改动点即可，其余项视为已通过基线。

---

# 第二轮（更严覆盖）2026-11-15 晚

## 8. 本轮执行量与结论

执行 2233 条用例，终态通过 2220，未验证 13，未修复 0（首轮发现 8 条失败，已全部修复并复测通过）。

| 层 | 用例数 | 通过 | 首轮失败（已修+复测） | 未验证 |
| --- | --- | --- | --- | --- |
| 后端接口矩阵（298 操作 × 6 身份） | 1788 | 1776 | 0 | 12（OAuth 503，凭据未配置） |
| 后端写路径 E2E | 29 | 29 | 0 | 0 |
| Web 全路由 | 193 | 193 | 2（非法 id 详情页） | 0 |
| Web 交互 | 16 | 16 | 1（`/tenant/favorites` 404） | 0 |
| App 全屏 | 77 | 77 | 0 | 0 |
| App 交互 | 18 | 17 | 0 | 1（二手房 `sell` 无数据） |
| 小程序 6 角色 × 页面 | 96 | 96 | 0 | 0（4 条告警核实为合法重定向/失效 id/抓取方式） |
| 小程序 本轮专项（找房 + 分类回归 + 游客公开页） | 16 | 16 | 5（白屏、0 条、标题口径、总数口径、员工找房） | 0 |

## 9. 修复批次 5（本轮新增）

### 9.1 小程序租客找房页白屏（页面 data 缺 `root`）

- **现象**：`/pages/tenant/listings/index` 整页空白，`getCurrentPages().data` 只有 `__webviewId__`；guest 与 tenant 均复现，无 console/exception。
- **根因**：`miniapp/dist` 被两个 webpack 进程同时写入——后台常驻的 `npm run dev:weapp`（watch）与本轮的 `npm run build:weapp` 并发，chunk common 被互相覆盖，该页 bundle 损坏。
- **修复**：停止 watch 进程 → 删除 `miniapp/dist` → `NODE_ENV=development` 完整重建。
- **复测**：`data` 恢复 `["root","__webviewId__"]`，页面正常渲染 20 张房源卡片，无异常。
- **约定**：小程序只允许「单一构建进程」；复测前必须确认没有 `taro build --watch` 在跑。

### 9.2 小程序找房/员工找房「共 0 套房源」（真因：空关键词被判为不匹配）

- **现象**：服务端已返回 20 条，界面仍显示「暂无房源 / 查看 0 套房源」。
- **根因**：`matchLocation(item, [])` 用 `[].some()` 返回 `false`，而找房页把「服务端已筛完」的筛选清空后以 `cityKw: []` / `locationKw: []` 调用 `selectVisibleListings`，于是把整页数据全部过滤掉。此前归因于 Taro 查询串折叠，那只影响关键词命中数，不是恒 0 的原因。
- **修复**：`miniapp/src/components/ListingsFeed/index.tsx` 的 `matchLocation` 增加 `!kws.length ||`（空数组=不限制）。
- **复测**：租客找房 20 条、员工找房 20 条（`/pages/employee/property-browse/index`）均正常；区域筛选 Bang Rak→20、重置→20、户型 2 室→5。

### 9.3 房源卡片标题口径三端不一致

- **现象**：Web 卡片显示楼盘名（The River condos），小程序/App 只显示房号 `D-020`。
- **根因**：后端房源没有 `title` 字段，小程序/App 的兜底链是 `title || room_number`，永远落到房号。
- **修复**：`Listing` 类型补 `project_name`，标题链改为 `title || project_name || room_number`（小程序 `ListingsFeed`、App `components/ListingsFeed.tsx`）。
- **复测**：小程序卡片标题显示 `The River condos`（截图 r2_tenant_tl.png）；App `tsc --noEmit` 通过。

### 9.4 「查看 N 套房源」用的是已加载条数而非命中总数

- **现象**：库里 24 条、每页 20，按钮显示「查看 20 套房源」。
- **修复**：租客找房页与员工找房页在 fetcher 中记录 `res.total`，按钮改用服务端总数（`serverTotal || visibleList.length`）。
- **复测**：租客找房「查看 20 套」（bangkok+区域关键词命中 20，与后端一致）；切「买房」显示「查看 0 套」+ 空态「暂无房源」。

### 9.5 App 公开页令牌过期会被踢回登录页

- **现象**：`mobile-app/src/lib/api.ts` 的 401 拦截器无条件 `logout()`；浏览公开房源时若收藏/降价状态接口（可选鉴权）返回 401，会把用户踢走。
- **修复**：新增请求级 `skipAuthLogout`，401 时不续期也不登出；`favorites.status` / `favorites.batchStatus` / `priceAlerts.status` 标记该选项（与 Web `authOptional`、小程序 `authOptional` 对齐）。
- **复测**：`npx tsc --noEmit` 通过。运行时（Expo Web 过期令牌）未验证，见第 11 节。

## 10. 本轮逐条用例（新增/改动项）

| # | 页面/接口 | 操作 | 预期 | 实际 | 结论 |
| --- | --- | --- | --- | --- | --- |
| 1 | `/pages/tenant/listings/index` | 租客身份重进页面 | 有 `root`、渲染房源 | 20 张卡片 | 通过 |
| 2 | 同上 | 读按钮计数 | 等于服务端命中数 20 | 查看 20 套 | 通过 |
| 3 | 同上 | 看卡片标题 | 楼盘名 | The River condos | 通过 |
| 4 | 同上 | 区域→Bang Rak→确定 | 过滤为 24（首屏 20） | 20 张、无报错 | 通过 |
| 5 | 同上 | 区域重置 | 回到全量 20 | 20 | 通过 |
| 6 | 同上 | 点「2室」 | 收敛到 5 | 5 | 通过 |
| 7 | 同上 | 切「买房」 | 0 条 + 空态，不崩溃 | 查看 0 套 / 暂无房源 | 通过 |
| 8 | `/pages/employee/property-browse/index` | 员工身份进入 | 20 张卡片 + 有 `root` | 20 张 | 通过 |
| 9 | `/pages/public/listings/index` | 租客身份进入 | 共 24 套、有卡片 | 共 24 套 / 20 张 | 通过 |
| 10 | `/pages/tenant/category-rent/index` | 进入 | 共 24 套 | 共 24 套 | 通过 |
| 11 | `/pages/tenant/category-new/index` | 进入 | 共 1 套（仅 1 个楼盘） | 共 1 套 | 通过 |
| 12-16 | category-resale / commercial / factory / hotel / land | 进入 | 无数据时给明确空态 | 分别显示「暂无…·换个筛选条件或城市试试」，无报错 | 通过 |
| 17 | `/pages/public/listings/index` | 清除 token 后（游客）进入 | 共 24 套、有卡片 | 共 24 套 / 卡片正常 | 通过 |
| 18 | Expo Web（8081）公开详情 | 写入失效 `auth_token` + 清 refresh 后重载 | 公开页仍渲染，不跳登录 | 首页与房源列表正常渲染，仅 1 条 `/auth/me` 401（清态），无登录跳转 | 通过 |

## 11. 未修复清单

无。本轮发现的 8 条失败均已修复并复测通过。

## 12. 未验证清单（不计入通过）

1. **Google / Apple OAuth（12 条接口调用）**：`/auth/oauth/{google,apple}` 返回 503，服务端未配置凭据，无法验证成功链路。
2. **App 二手房列表**：`sell` 上架单为 0，界面只能验证空态；无数据可验证排序/筛选，属数据缺口而非代码缺陷。
3. **App 公开页过期令牌降级（9.5）**：已按 Web/小程序同源策略改代码，并在 Expo Web 用失效 `auth_token` 重载公开页验证「不被踢到登录页、页面正常渲染」（仅出现 1 条 `/auth/me` 401 清态）。`favorites.status` 单独返回 401 的分支未被隔离触发，属代码对齐 + 整体行为验证。
4. **真机能力**（沿用上轮）：真实 GPS 定位、拨号、推送、微信支付商户号、签署页 `/sign/:token`。
5. **partner_admin 页面**：无合作方账号，仅验证接口 403 与路由守卫。

---

# 第四轮：四层深度检测（2026-11-16）

## 13. 总览与统计

| 层级 | 执行 | 通过 | 失败 | 未验证 | 未修复项 |
| --- | --- | --- | --- | --- | --- |
| 第 1 层 数据库 | 25 | 23 | 0 | 1 | 1 |
| 第 2 层 后端 | 44 | 42 | 0 | 2 | 0 |
| 第 3 层 前后端交互 | 13 | 13 | 0 | 0 | 0 |
| 第 4 层 前端精美度 | 117 | 116 | 0 | 0 | 0（另有 1 条既有设计记录） |
| **合计** | **199** | **194** | **0** | **3** | **1** |

计数口径：
- 数据库层按「检查项」聚合计数；全表逐列比对是 1 条聚合项（55 张表逐列展开则为 71 条，里程碑 1 中报的 47 条即按表展开口径）。本表统一用聚合口径，避免同一缺陷重复计数。
- 未验证项不折算为通过；未修复项单列在第 19 节。
- 本轮修复 9 项，全部复测并记录在第 18 节。

## 14. 第 1 层：数据库层

### 14.1 迁移链与模型定义一致性

| # | 检查项 | 操作 | 预期 | 实际 | 结论 |
| --- | --- | --- | --- | --- | --- |
| 1 | 迁移 head | 读取 Alembic ScriptDirectory 与库内 `alembic_version` | head=库版本，单 head | 均为 `0055`，bases=`0001` | 通过 |
| 2 | 迁移链完整性 | 遍历 55 个 revision 的 down_revision | 无断链、无多 head | 55 个 revision 首尾相连 | 通过 |
| 3 | 表集合 | 模型 metadata 表 vs `sqlite_master` | 差异仅 `alembic_version` | `tables_only_in_db=["alembic_version"]`，`tables_only_in_model=[]` | 通过 |
| 4 | 列类型/可空/默认值 | 逐表比对模型列与 `PRAGMA table_info` | 0 偏差 | `column_mismatch=[]` | 通过 |
| 5 | NOT NULL 漂移 | 查 `contract_parties.sign_order`(10 行 NULL)、`contracts.sign_order_type`(9)、`sign_assets.scope`(2)、`properties.review_status`、`property_bindings.kind` | 模型 NOT NULL 与库一致 | 新增 `0054`（回填+收紧前三处、补索引）与 `0055`（收紧后两处），已 upgrade 到 0055，`PRAGMA` 复核全部 `NOT NULL` | 通过（本轮修复） |

### 14.2 外键 / 唯一约束是否真的在库里生效

| # | 检查项 | 操作 | 预期 | 实际 | 结论 |
| --- | --- | --- | --- | --- | --- |
| 6 | SQLite 外键开关 | `PRAGMA foreign_keys` | 1 | 1（`db.py` connect 事件开启） | 通过 |
| 7 | 外键拒写 | 插入 `favorites.user_id` 指向不存在用户 | IntegrityError | IntegrityError | 通过 |
| 8 | 组合唯一（收藏） | 重复插入 `favorites(user_id, property_id)` | IntegrityError | IntegrityError | 通过 |
| 9 | 组合唯一（选项） | 重复插入 `options(type, value)` | IntegrityError | IntegrityError | 通过 |
| 10 | 非空约束 | 写入 `contract_parties.sign_order = NULL` | IntegrityError | IntegrityError | 通过 |
| 11 | 索引存在性 | `ix_listings_is_featured` | 存在 | 本轮前缺失（0043 对已存在表整体 continue 跳过），`0054` 补建后存在 | 通过（本轮修复） |
| 12 | 命名唯一约束可核对性 | 5 个 `uq_*` 在 `PRAGMA index_list` 中看不到名字 | 能按名核对 | SQLite 不保存 UNIQUE 约束名（建表 DDL 里有 `CONSTRAINT uq_*`，运行时为 `sqlite_autoindex_*`）。已改为「DDL 文本 + 插入冲突」双重验证，全部生效 | 通过（审计脚本误报，非缺陷） |
| 13 | 软删除泄漏 | 统计/列表查询是否带 `deleted_at is null` | 软删行不计入 | 统计口径与列表均带该条件；当前软删行 0 条 | 通过 |

### 14.3 关键口径在库内直接校验

| # | 口径 | 校验方式 | 预期 | 实际 | 结论 |
| --- | --- | --- | --- | --- | --- |
| 14 | 出租率 | `count(properties where status='rented')` vs `count(distinct property_id) from leases where status='active'` | 两值相等 | 1 = 1 | 通过 |
| 15 | 应收 | 独立复算未收单数与金额（`pending/processing/failed`，排除软删） | 可复算 | 2 单 / 36,234.56 THB | 通过 |
| 16 | 逾期 | `substr(due_date,1,10) < date('now')` 且未成功 | 不因时间部分误判 | 1 单 / 35,000 THB | 通过 |
| 17 | 押金对账 | 租约押金合计 vs 已收押金类收款 | 可对账 | 应收 50,000 / 已收押金类 0（种子数据无 deposit 收款） | 未验证（数据缺口） |
| 18 | 合同总额 | 15 份合同 `counters.contract_total` vs `monthly_rent × term_months` | 偏差 ≤ 0.01 | 0 份偏差 | 通过 |
| 19 | 关键索引 | `ix_payments_due_date/status`、`ix_leases_status`、`ix_properties_status`、`ix_listings_is_featured` | 全部存在 | 全部存在 | 通过 |
| 20 | 慢查询 | `EXPLAIN QUERY PLAN`：收款按状态+到期日、优选房源、租约按状态、收藏按用户、线索按阶段 | 均命中索引，不全表扫描 | 5/5 `SEARCH ... USING INDEX`（排序走 TEMP B-TREE，过滤后子集） | 通过 |
| 21 | 孤儿数据 | `signature_records` 左连 `contracts` | 0 条 | 8 条孤儿 | 未修复（见第 19 节） |

### 14.4 幂等与事务边界

| # | 用例 | 操作 | 预期 | 实际 | 结论 |
| --- | --- | --- | --- | --- | --- |
| 22 | 重复建单 | 同 `idempotency_key` 连续 POST `/payments` 两次 | 两次同一单、不新增行 | 200/200，同一 `id=ce78cb2a` | 通过 |
| 23 | 重复确认 | 对同一待确认单连续 POST `/payments/{id}/confirm` 两次 | 首次成功，第二次 400/409 | 200 → 400 `Cannot confirm payment in state: succeeded` | 通过（本轮修复无 body 422） |
| 24 | 写失败回滚（版本冲突） | PATCH 房源携带过期 `version` | 409 且 name/version 不变 | 409，version 前后均为 6，name 未变 | 通过 |
| 25 | 写失败回滚（非法枚举） | PATCH 房源 `status=not_a_status` | 422/400 且 status 不变 | 422，status 仍为 `vacant` | 通过 |

## 15. 第 2 层：后端

### 15.1 时区与时间契约（`verify_backend_round4.json`）

| # | 用例 | 预期 | 实际 | 结论 |
| --- | --- | --- | --- | --- |
| 1 | 管理员 / 租客登录 | 200 + token | 200，token 正常 | 通过 |
| 2 | 付款 `created_at` | 以 `Z` 结尾 | `2026-11-16T01:43:09.604493Z` | 通过 |
| 3 | 付款 `due_date` | 日期语义，不补 `Z` | 空值（有值时保持 naive） | 通过 |
| 4 | 房源 `created_at` | 以 `Z` 结尾 | `2026-11-03T04:55:38.867038Z` | 通过 |
| 5 | 房源 `available_from` | 不补 `Z` | `2026-10-13T16:43:07.774703` | 通过 |
| 6 | 预约 `scheduled_at` | 以 `Z` 结尾 | `2026-12-01T02:00:00Z` | 通过 |
| 7 | 预约入参 naive（10:00） | 按 Asia/Bangkok 转 UTC | 落库 `2026-12-05 03:00:00` | 通过 |
| 8 | 预约入参带 `+08:00` | 换算为 UTC | 落库 `2026-12-06 02:00:00` | 通过 |
| 9 | 并发：过期 version | 409 | 409 | 通过 |
| 10 | 并发：正确 version | 200 | 200 | 通过 |
| 11 | 成功后 version 自增 | +1 | 5 → 6 | 通过 |
| 12 | Redis 可用性 | 连接成功 | `Timeout connecting to server` | 未验证（环境缺 Redis） |

### 15.2 缓存失效中间件（`verify_cache_mw.py`）

| # | 用例 | 预期 | 实际 | 结论 |
| --- | --- | --- | --- | --- |
| 13-18 | 写成功命中 5 类前缀 → 清缓存；GET 不清；4xx/5xx 不清；非前缀路径不清；并发安全 | 条件成立才失效 | 打桩 6/6 符合 | 通过（打桩验证；端到端见第 20 节） |

### 15.3 字段权限、参数边界、分页与错误码（`verify_backend_round4b.json`）

| # | 用例 | 预期 | 实际 | 结论 |
| --- | --- | --- | --- | --- |
| 19 | admin `/admin/users` | 无敏感字段 | 200，无泄漏 | 通过 |
| 20 | admin `/employees` | 无敏感字段 | 200，无泄漏 | 通过 |
| 21 | employee `/employees` | 403 或 200 且无泄漏 | 403，无泄漏 | 通过 |
| 22 | admin `/payments` | 无敏感字段 | 200，无泄漏 | 通过 |
| 23 | admin `/contracts` | 无 `sign_token/callback_secret` | 200，无泄漏 | 通过 |
| 24 | admin `/properties` | 无敏感字段 | 200，无泄漏 | 通过 |
| 25 | admin `/leads` | 无 `metadata_` 等内部字段 | 200，无泄漏 | 通过 |
| 26-28 | tenant/owner/employee `/auth/me` | 无敏感字段 | 200，三端均无泄漏 | 通过 |
| 29 | 租客读他人收款详情 | 403/404 | 数据不足（当前仅一个租客持有账单） | 未验证 |
| 30 | 租客访问 `/admin/users` | 403 | 403 | 通过 |
| 31 | 租客访问 `/employees` | 403 | 403 | 通过 |
| 32 | `page=0` | 422 或纠正为 1 | 422（文案含合法区间） | 通过 |
| 33 | `page=-1` | 422 | 422 | 通过 |
| 34 | `page_size=0` | 422 | 422 | 通过 |
| 35 | `page_size=100000` | 422 或截断 | 422（提示区间 [1,100]） | 通过 |
| 36 | `status=bogus_status` | 400/422 | 400 `Invalid status: bogus_status` | 通过（与 422 标准差异，前端按 `code!=0` 统一处理，不改） |
| 37 | `sort=DROP TABLE` | 422 或忽略 | 200，忽略非法排序 | 通过 |
| 38 | `sort=-created_at` | 200 | 200，4 条 | 通过 |
| 39 | 线索 `name=""` | 422 | 本轮前 200 落库；修复后 422 | 通过（本轮修复） |
| 40 | 线索 `name` 500 字 | 422 | 本轮前 200；修复后 422 | 通过（本轮修复） |
| 41 | 收款金额精度 | 全部 ≤2 位小数 | 0 个越界值 | 通过 |
| 42 | 不存在收款 | 404 且文案可读 | 404 `Payment not found` | 通过 |
| 43 | 非法 UUID 路径 | 422 | 422 | 通过 |

## 16. 第 3 层：前后端交互

| # | 用例 | 操作 | 预期 | 实际 | 结论 |
| --- | --- | --- | --- | --- | --- |
| 1 | 登录失败错误呈现 | 输错密码提交 | 呈现后端文案且停留 `/login` | 「邮箱或密码错误」，`/login` | 通过 |
| 2 | 列表错误态 | 断网后打开 `/properties` | 错误态 + 重试按钮 | 「网络连接失败，请检查网络后重试 \| 重试」 | 通过 |
| 3 | 重试恢复 | 恢复网络点重试 | 错误态消失、出现数据 | 20 张卡片 | 通过 |
| 4 | 窄屏表格 | 375px 打开收款页 | 容器内横向滚动、页面不溢出 | `rent-table-wrap` `overflow-x:auto`，`scrollWidth=375` | 通过 |
| 5 | 时区展示 | 后端 `Z` 时间 → 页面 | 换算为设备本地，且不显示 UTC 原值 | `2026-09-13T16:43:08.789018Z` → `2026-09-14 00:43`，无原值 | 通过 |
| 6 | 工作台渠道文案 | 打开 `/dashboard` | 中文文案，无 `bank_transfer` | 有「银行转账」，无原始码 | 通过 |
| 7 | 收款列表渠道 | 打开 `/payments` | 无原始枚举码 | `rawCodes=[]` | 通过 |
| 8 | 请求路径对齐 | 428 条后端路由 vs 三端调用 | 无缺失（含 `/api/v1` 前缀归一） | 仅有模板串误报 | 通过 |
| 9 | 分页字段映射 | 三端 `page/page_size/total/items` | 与 `Page` schema 一致 | 一致 | 通过 |
| 10 | 枚举映射 | 三端状态/类型/渠道 | 全部映射为文案 | 一致（渠道本轮补齐） | 通过 |
| 11 | 空值处理 | `undefined/null` 入参 | 不出现的请求被剔除或置空 | axios 参数规范化后为空串/省略 | 通过 |
| 12 | 缓存与失效 | 改数据后返回列表 | 立即显示新值 | Web 变更后清全局缓存；小程序无 GET 缓存；后端聚合缓存在写后失效 | 通过 |
| 13 | 加载态 | 打开收款页/工作台首屏 | 骨架屏而非空白 | `DataState loading skeletonRows=6/2`，文案 `common.loading` / `dashboardOps.loadingData` | 通过 |

## 17. 第 4 层：前端精美度

| # | 用例 | 操作 | 预期 | 实际 | 结论 |
| --- | --- | --- | --- | --- | --- |
| 1-45 | Web 9 页 × 5 断点（1440/1280/1024/768/375） | 逐页渲染 + 溢出/破图/控制台 | 无横向溢出、无破图、无报错 | 45/45 | 通过 |
| 46-63 | 泰语 375/768 | 同页扫描 | 长文案换行正常 | 18/18 | 通过 |
| 64-81 | 英语 375/768 | 同页扫描 | 同上 | 18/18 | 通过 |
| 82-105 | 中英泰 × 8 页文本扫描 | 找 `snake_case`/`undefined`/`NaN`/`[object Object]` | 0 处泄漏 | 仅 `ph_phoneonly@customer.local` 测试数据邮箱命中正则 | 通过（误报） |
| 106-108 | 视觉 token 一致性 | 三端主色/墨色阶/圆角 | 一致 | 三端 `#14b8a6`，ink-1..4 同值 | 通过 |
| 109-113 | 对比度 | 正文 4 组、主色按钮 | 正文 ≥4.5:1 | ink-3/surface-2 = 4.50，其余更高 | 通过 |
| 114 | hero 白字/主色 | 计算对比度 | — | 2.49（既有品牌设计，未改主题色） | 记录（不计缺陷） |
| 115 | 空态与骨架屏 | 静态核查 + 逐页渲染 | 列表有空态、加载有骨架 | `Skeleton` 55 处、`Empty/emptyText` 32 处；`DataState` 统一 loading/empty | 通过 |
| 116 | 图片比例与加载 | 静态核查 + 45 条渲染用例破图检测 | `object-fit` 不变形、无破图 | `aspect-ratio/object-fit` 25 处；`naturalWidth=0` 的图片 0 张 | 通过 |
| 117 | 表单校验提示位置 | 静态核查 | 错误提示在字段下方 | 52 处 `Form.Item rules`，antd 默认字段级提示，无全局 toast 替代 | 通过 |
| 补充 | 交互态 | hover/focus-visible/disabled 静态核查 | 均有可见态 | 全局 `:focus-visible` 覆盖，按钮/表格行 hover 存在 | 通过 |

## 18. 本轮修复项与复测

| # | 修复项 | 文件 | 复测结论 |
| --- | --- | --- | --- |
| 1 | 迁移 0054/0055：NOT NULL 漂移 5 处回填收紧、补 `ix_listings_is_featured` | `backend/alembic/versions/0054_*.py`、`0055_*.py` | 已 upgrade 到 0055，PRAGMA 全部 NOT NULL，索引存在 |
| 2 | SQLite 外键开关 | `backend/app/db.py` | `PRAGMA foreign_keys=1`，外键拒写生效 |
| 3 | 时区契约：`BUSINESS_TIMEZONE` + `UtcInstant` + 出参补 `Z` | `config.py`、`core/datetime_utils.py`、`core/envelope.py`、viewings/calendar_events/public/service_orders/payments/attendance/chat | 8 条时区用例 + 浏览器展示 1 条全通过 |
| 4 | 聚合缓存写后失效中间件 | `backend/app/main.py` | 打桩 6/6；Redis 端到端未验证 |
| 5 | 乐观锁行锁 `ensure_version(session=…)` | `core/concurrency.py`、`properties.py`、`leases.py` | 409/200/version+1 通过；SQLite 无行锁（未验证真实竞态） |
| 6 | 三端渠道枚举文案化 | `Payments/constants.ts`、Dashboard/PaymentsTable/DetailModal、zh/en/th 语言包、App `PaymentsScreen`、小程序 `tenant/payments` | 工作台/列表/详情无原始码，zh/en/th 扫描 0 泄漏 |
| 7 | 375 窄屏：删除重复 App Shell、`minmax(0,1fr)`、页头按钮换行、顶栏标题 `min-width:0` | `styles/prototype-system.css`、`styles/app.css` | 45 条断点用例通过，按钮不再被裁切 |
| 8 | antd `destroyOnClose` → `destroyOnHidden` | `layouts/MainLayout.tsx`、`PortalLayout.tsx` | 控制台告警清零 |
| 9 | 线索姓名校验（空/纯空白/超 100 字 → 422）；`confirm` 空 body 不再 422 | `api/v1/leads.py`、`api/v1/payments.py` | 4 条用例复测通过 |

回归：后端全量 `pytest` **260 项全部通过**。其中 2 条旧断言按新时间契约更新（`test_attendance_rules` 补录 18:00 Bangkok → `11:00Z`；`test_contract_sign_flow_e2e` 的 `expires_at` 带 `Z` 后用带时区 `now` 相减），属预期行为变化，非放宽断言。

## 19. 未修复清单（本轮）

| # | 项 | 原因 | 处置建议 |
| --- | --- | --- | --- |
| 1 | 8 条孤儿 `signature_records`（`contract_id` 指向已不存在的合同） | 属于历史数据清理，删除不可逆；迁移里已明确不自动删数据 | 由业务确认后执行一次清理脚本（先导出再删） |

## 20. 未验证清单（不计入通过）

| # | 项 | 无法验证的原因 |
| --- | --- | --- |
| 1 | 缓存失效端到端 | 本机 Redis 未运行，`/health/ready` 报 `Timeout connecting to server`；仅做了中间件触发条件打桩 |
| 2 | 跨租户越权读写 | 仅 `tenant@viprental.com` 一个租客持有账单，其余租客账号无密码；无第二租客数据可构造 |
| 3 | 押金对账 | 种子数据无 `payment_type=deposit` 的成功收款，租约押金 50,000 无对应已收记录 |
| 4 | 生产 PostgreSQL 并发行锁 / 迁移 | 本地为 SQLite（无行锁、batch 重建语义），0054/0055 未在 PG 上执行 |
| 5 | 真实支付回调验签 / 重复回调幂等 | 启动自检明确「未配置验签材料，回调将被拒绝」，无法构造合法回调 |
| 6 | Google / Apple OAuth | 未配置凭据，`/auth/oauth/*` 返回 503 |
| 7 | 真机能力 | 真实 GPS、拨号、推送、微信支付商户号、签署页 `/sign/:token` 需真机与商户号 |
| 8 | partner_admin 页面 | 无合作方账号，仅验证接口 403 与路由守卫 |
| 9 | hero 白字/主色对比度 | 2.49:1 低于 WCAG AA，但属既有品牌设计，本轮按「主题色不变」约定未改，仅记录 |

