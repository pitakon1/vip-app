# 电子签改造施工单（基于《e-sign-gap-analysis.md》）

- **用途**：给熟悉本仓库的开发直接照着改，不是分析报告。每条一个可独立验收的改动。
- **事实基线**：[e-sign-gap-analysis.md](./e-sign-gap-analysis.md)。本文只使用该报告已核实的文件、组件、接口；未核实的一律写「待确认」，不臆造接口名与字段名。
- **约束**：本文档为唯一新增文件，不改业务代码、不加依赖、不提交 git。
- **命名说明**：文中标注「新增（建议名）」的接口是本单提出的命名，落地前需与后端确认，不能当成已存在接口直接调用。

## 字段说明

| 字段 | 含义 |
|---|---|
| 编号 / 优先级 | `C-xx`；P0 必须改 / P1 建议改 / P2 有余力再做 |
| 所属层 | 功能 / 前端 / 前后端交互 |
| 现状 | 现在的实现，指到页面、组件、函数 |
| 问题影响 | 用户看到什么、漏掉什么 |
| 改法 | 页面加哪块、什么顺序、几步完成；接口加什么字段、状态怎么流转、错误码怎么映射 |
| 涉及文件 | 前端组件、后端路由/服务、i18n |
| 依赖 | 纯前端 / 需后端 / 需外部资质 |
| 验收 | 可勾选的短句 |

---

## 第一批可立即开工

### A. 纯前端，可独立完成（不依赖后端改动）

| 编号 | 一句话 | 主要文件 |
|---|---|---|
| C-01 | 签署页右栏加「待签控件清单 + 完成度」 | `pages/Sign/components/SignerAside.tsx`、`pages/Sign/index.tsx` |
| C-02 | 提交按钮不可用时说明原因，并能逐项定位 | `pages/Sign/index.tsx`、`pages/Sign/components/DocumentPanel.tsx` |
| C-03 | 签署失败页给明确出口；联系方式字段未就绪时自动降级为「复制合同链接」 | `pages/Sign/components/StatusViews.tsx` |
| C-04 | 列表状态徽标降噪，补「建议重签」行动 | `pages/Contracts/ContractList.tsx`、`pages/Contracts/index.tsx` |

> 这四条都在已有页面内改，数据都已在现有 props / 接口响应里，不需要新接口、不需要新依赖。建议按 C-01 → C-02 顺序做，二者共享「控件清单」这份数据。C-03 的「联系发起方」数据由 C-03B 提供，未上线时按钮自动降级，不阻塞前端开工。

> **A 组施工记录（2026-11-12）**：C-01 / C-02 / C-03 / C-04 已按本文改法在 `frontend-web` 落地，涉及 14 个前端文件（Sign 页 8 个、Contracts 页 3 个、i18n 3 个）。`cd frontend-web && npx tsc --noEmit` 仅剩 4 条**既有**错误（`pages/Contracts/index.tsx` 引用的 `ContractStatsBar`、`SignOrderModal`、`CallbackModal`、`ShareLinkQrModal` 四个组件在仓库中不存在，且非本轮新增引用），本轮未引入新类型错误。运行态验证（浏览器拖拽、窄屏布局、失效 token 页面）本轮未执行，相关验收项已逐条标注「已改未实测」。App / 小程序另有各自的站内签署台（`mobile-app/src/screens/contracts/MyContractsScreen.tsx`、`miniapp/src/pages/tenant/my-contracts/index.tsx`），本轮未改动，三端口径一致性待后续同步。

### B. 需后端配合（前端可先行，接口/字段到位后联调）

| 编号 | 一句话 | 依赖 |
|---|---|---|
| C-03B | 签署页与站内详情补发起方姓名 + 脱敏电话 | 后端改响应结构（无数据库迁移） |
| C-05 | 合同详情流程时间线 | 后端新增只读审计接口 |
| C-14 | 印章库分组 + 企业章启用/停用 | 后端新增字段、接口、权限模型与审计 |

---

# 一、P0（必须改）

## C-01 签署页加「待签控件清单 + 完成度」 `[纯前端]`

- **优先级**：P0
- **所属层**：前端
- **现状**：`frontend-web/src/pages/Sign/index.tsx` 是单屏签署台：左 `DocumentPanel`、右 `SignerAside`、底部全宽提交按钮。`SignerAside.tsx` 右栏三张卡依次是「签署方信息 / 组件托盘（印章、签名）/ 拒签」。待签控件只以画布上的 `SignFieldBox` 存在，右栏没有清单；`allFields`、`placed`、`page`、`onPageChange` 在 `index.tsx` 与 `DocumentPanel.tsx` 中都已具备。
- **问题影响**：用户签署多页合同时，只能靠翻页找框，不知道「一共要盖几个、还剩几个」；漏放一个框时底部按钮只是置灰，用户会以为页面坏了。
- **改法**：
  1. 右栏卡片顺序调整为：① 签署方/顺位 → ② **待签控件清单** → ③ 签章托盘；「拒签」从独立卡片改为顶部标题行右侧的次要文字按钮，避免误触。
  2. 清单卡结构：标题「待签控件（剩余 N）」→ 列表行 → 每行四段：类型图标（章/签名/日期）+「第 X 页」+ 字段类型文字 + 状态徽标（待放 / 已放 / 已签）。
  3. 行点击行为：调用 `onPageChange(field.page)` 翻到对应页，并给该字段的 `SignFieldBox` 加高亮类（新增 `--focus` 样式，CSS 加一次 300ms 的描边闪烁即可）。
  4. 清单底部加一行汇总「已完成 {placed}/{total}」；`placed` 与字段的匹配沿用 `DocumentPanel.tsx` 里 `isCovered` 的同一判定（页码 + 坐标差 < 1），抽成 `Sign` 目录下的纯函数复用，不要复制第二份。
  5. 清单排序：按页码升序、同页按 y 坐标升序，保证和阅读顺序一致。
- **涉及文件**：`frontend-web/src/pages/Sign/index.tsx`、`pages/Sign/components/SignerAside.tsx`、`pages/Sign/components/DocumentPanel.tsx`、`pages/Sign/components/SignFieldBox.tsx`、`pages/Sign/types.ts`、`pages/Sign/constants.ts`、`i18n/locales/{zh,en,th}.ts`（新增 `contracts.pendingFields`、`contracts.fieldState*`、`contracts.fieldsDone`）
- **依赖**：纯前端。数据来自现有 `allFields` / `placed`。
- **验收**：
  - [x] 打开任一多页合同签署页，右栏能看到全部待签控件及页码。`SignerAside` 的 `PendingFields` 按「页码升序 + 同页 y 升序」渲染全部字段，行内含 `fieldPage` 页码；已改，静态核对通过，浏览器未跑。
  - [ ] 点击清单第 3 页的项，文档自动翻到第 3 页且对应框高亮。**已改未实测**：需在浏览器点第 3 页项，验证 `onPageChange` 翻页与 `kf-field--focus` 1.4s 高亮。
  - [ ] 把一个章拖到文档后，清单状态由「待放」变「已放」，汇总数字同步变化。**已改未实测**：需真实拖章素材 + 拖拽操作，静态代码已按 `placed` 计算 `placed/signed/pending` 三态与 `fieldsDone`。
  - [x] 已签字段显示「已签」且不可再拖动。清单徽标显示「已签」；`DocumentPanel` 改用 `isFieldDone` 判定覆盖，已签字段不再渲染可点击虚线框，从源头避免重复落章。静态核对通过，运行未测。
  - [x] 中文 / 英文 / 泰文三种语言不出现未翻译的 key。**已实测**：`pendingFields`、`fieldsDone`、`fieldStatePending/Placed/Signed`、`fieldPage` 等 27 个新增 key 在 `zh.ts` / `en.ts` / `th.ts` 三文件逐一对齐（各 27 条）。
- **App / 小程序同步（第二批，仅前端）**：两端复用同一判定 `fieldKey` / `isFieldCovered` / `isFieldDone` / `sortSignFields` / `fieldState`，清单与画布同源；窄屏清单走底部抽屉（不挤压画布），宽屏常驻左栏；已签/已覆盖字段不再渲染可点框。App 侧 `npx tsc --noEmit` 与小程序侧 `npx tsc --noEmit` 均 0 错误。
  - **已实测（App / Expo web 8081，真实账号与接口）**：清单显示「待签控件（剩余 1）」「已完成 0/1」「手写签名 第 1 页 待放」；点清单行后文档出现高亮框，约 2 秒后消失（1.4s 定时）。
  - **未实测**：小程序（需微信开发者工具，本环境无）；「已签」态行（测试合同的当前签署方无已签字段，无法在运行态观察）。

## C-02 提交按钮不可用时说明原因，并能逐项定位 `[纯前端]`

- **优先级**：P0
- **所属层**：前端
- **现状**：`pages/Sign/index.tsx` 底部 `kf-signbar` 的提交按钮，`placed.length === 0 || waitingTurn` 时直接 `disabled`；没有任何文案解释原因，`waitingTurn` 只在页面顶部有一句串行等待提示。
- **问题影响**：用户点不动按钮，不知道是「还没放章」「没轮到我」「合同过期」还是「没实名」，最常见的后果是反复刷新或直接找客服。
- **改法**：
  1. 在按钮上方加一行状态文案（`kf-signbar__hint`），按优先级取第一条命中的原因：
     - 合同不存在/加载失败 → 「签署链接无效，请联系发起方重新发送」；
     - 已过截止时间（用页面已有的截止时间判断）→ 「合同已于 {date} 过期」；
     - `waitingTurn` → 「当前轮到 {对方姓名/角色} 签署，完成后会通知你」；
     - `placed.length === 0` → 「请先放置至少 1 个签章」；
     - 实名未完成（页面已有实名校验状态）→ 「请先完成实名验证」。
  2. 按钮保持可见但禁用；给按钮套一层可点击容器（或把 `disabled` 改为 `aria-disabled` + 拦截点击），点击时把焦点滚到第一个未完成项：无签章→滚到右栏托盘；未实名→打开 `RealNameModal`；有未放置的预置字段→翻到该页并高亮（复用 C-01 的高亮逻辑）。
  3. 文案全部走 i18n，`th.ts` 同步补 key。
- **涉及文件**：`frontend-web/src/pages/Sign/index.tsx`、`pages/Sign/components/StatusViews.tsx`（若把提示抽成组件）、`pages/Sign/constants.ts`、`i18n/locales/{zh,en,th}.ts`
- **依赖**：纯前端。
- **验收**：
  - [x] 未放章时按钮上方显示「请先放置至少 1 个签章」。`kf-signbar__hint` 按 `noContract → expired → waiting → noPlacement → realName` 优先级取第一条，`noPlacement` 命中即显示该句。静态核对通过，浏览器未跑。
  - [ ] 串行模式未轮到时显示对方姓名/角色，而不是空白。**已改未实测**：文案为「请等待第 {{order}} 位签署方完成后再提交」，`order` 取自 `doc.sign_order`。**未达「显示对方姓名/角色」**：签署页接口当前不返回前序签署方姓名，前端不臆造，待 C-03B 类字段到位后再补姓名。
  - [ ] 点击禁用态按钮会定位到问题项，而不是毫无反应。**已改未实测**：按钮由 `disabled` 改为 `aria-disabled` + 点击拦截，`locateBlocker` 分别滚到托盘卡 / 打开实名弹窗 / 翻页并高亮首个未完成字段；需浏览器逐路径验证。
  - [x] 五种原因不会同时出现两条。原因收敛为单一 `hardReason` 枚举（互斥），实名仅在 `hardReason === null` 时作软提示，不会并列。静态核对通过。
- **App / 小程序同步（第二批，仅前端）**：两端同样把原因收敛为单一 `hardReason`（`noContract → expired → waiting → noPlacement`，实名仅在前四者都不命中时作软提示），提交按钮保留可点、点击走 `locateBlocker`（重载 / 打开控件清单或滚到控件区 / 打开实名入口 / 定位首个未完成字段）。
  - **已实测（App）**：未放章时提示「请先放置至少 1 个签章」，点击提交打开「待签控件」面板；把测试合同 `expires_at` 临时置为过去后，提示切换为「合同已于 2026-11-01 08:00 过期」。
  - **未实测**：「未轮到」与「未实名」两档——测试合同为单签署方（`can_sign_now` 恒真），且绑定邮箱的签署方由后端内部认证，本环境无对应可复现数据；小程序同上（无微信开发者工具）。

## C-03 签署失败页给明确出口（主行动：联系发起方） `[纯前端]`

- **优先级**：P0
- **所属层**：前端
- **现状**：`pages/Sign/components/StatusViews.tsx` 提供 `LoadingView` / `FailView` / `DeclinedView` / `SuccessView`。`FailView` 已按 `fail` 分三类（`expired` / `signed` / 其他）显示不同标题，但**只有标题、没有任何操作入口**；`SuccessView` 已有「下载已签文件」按钮；`DeclinedView` 只有两行文案。
- **问题影响**：链接过期、合同被撤回、网络失败都落在同一屏，用户唯一能做的是关掉页面；发起方也收不到「对方打不开」的反馈。
- **改法**：
  1. `FailView` 在标题下加一句说明，再按优先级给行动入口：
     - 主行动「联系发起方」→ 展示 `initiator_name` + `initiator_phone_masked`（如「张*　138****1234」），右侧提供「复制号码」；`initiator_phone_masked` 是脱敏号，不做 `tel:` 拨号。字段由 C-03B 提供。
     - 次行动「复制合同链接」→ `navigator.clipboard` 复制当前签署链接与合同标题，作为联系方式缺失时的兜底。
     - 第三行动「下载合同」→ 仅当 `doc.pdf_available` 为真时显示，复用 `DocumentPanel` 已有的下载地址。
     - 「重新加载」→ `window.location.reload()`，降级为卡片下方文字链接，不与主行动抢位置。
  2. 字段消费规则：`initiator_name`、`initiator_phone_masked` 都按可选处理。两者都为空 → 只显示「复制合同链接」；只有姓名 → 显示姓名 + 复制链接；有脱敏号 → 显示姓名 + 脱敏号 + 复制。**前端不拼接、不猜测完整号码**，也不得用签署方本人信息顶替发起方。
  3. 保留现有 `fail` 三分类，只补说明文案；C-06 完成后再按 `code` 细分（链接无效 / 合同已撤回 / 合同已过期 / 网络异常）。
  4. `DeclinedView` 补一行「如对拒签有异议，请联系发起方」，同样消费上述两个字段；`SuccessView` 保留现有下载按钮，补一个「返回」链接（回合同列表或关闭页面）。
- **涉及文件**：`frontend-web/src/pages/Sign/components/StatusViews.tsx`、`pages/Sign/index.tsx`、`pages/Sign/types.ts`（补两个可选字段类型）、`pages/Sign/hooks/`（错误分流）、`i18n/locales/{zh,en,th}.ts`
- **依赖**：前端骨架纯前端可独立完成；展示联系方式依赖 C-03B 的后端字段。C-03B 未上线时自动降级为「复制合同链接」，不出现空按钮。
- **验收**：
  - [ ] C-03B 上线后，用失效 token 打开可看到「联系发起方 / 复制合同链接」，有 PDF 时多一个「下载合同」。**已改未实测**：C-03B 未上线、无真实 `initiator_*` 数据，只能验证降级路径；「下载合同」条件为 `doc.file_url` 或 `pdf_available`。
  - [ ] 后端返回字段时显示姓名 + `138****1234`，复制结果与显示一致。**后端已上线并实测返回**（站内详情 `initiator_name` / `initiator_phone_masked` 非空且脱敏）；签署页浏览器实测未做，前端按字段渲染的逻辑未改动。
  - [x] 字段缺失时不出现空白按钮，只保留「复制合同链接」。`hasInitiator` 为假时联系卡整块不渲染，「复制合同链接」始终可用（Clipboard API + textarea 降级）。静态核对通过，运行未测。
  - [x] 无 PDF 的合同不显示「下载合同」。渲染条件为 `doc.file_url` 或 `doc.pdf_available` 为真，否则整颗按钮不出现。静态核对通过，运行未测。
  - [x] 拒签后页面能回到可读状态，而不是白屏；成功页能直接下载已签件。`DeclinedView` 补联系卡 / `declineContactHint`，`SuccessView` 保留下载并补「返回」。静态核对通过，运行未测。

## C-03B 签署页与站内详情补发起方联系方式（后端）

- **优先级**：P0
- **所属层**：前后端交互
- **现状**：已核实 `SignPageOut`（`backend/app/api/v1/contract_sign_public.py` L175–188）与免登录签署页返回体（同文件 L212–252）都不含 `initiator_*`，只有签署方本人的 `party.name` / `party_name_masked`；站内 `ContractDetailResponse`（`backend/app/api/v1/contracts.py` L168）只返回 `created_by` 用户 UUID（L4082），无姓名/电话。数据源已具备：`User.full_name`（`backend/app/models/user.py` L46）、`User.phone`（L42），`Contract.created_by` 在生成/上传/代签等处已赋值（`contracts.py` L222、L489、L771 等）。
- **问题影响**：C-03「联系发起方」没有数据可用，签署方卡在失败页时只能自己找其他渠道；发起方也收不到「对方打不开」的反馈。
- **改法**：
  1. 新增字段（建议名，落地前与后端确认）：`initiator_name: str | null`、`initiator_phone_masked: str | null`。本期不加邮箱，避免扩大暴露面；如后续要加，统一叫 `initiator_email_masked`。
  2. 数据来源：`Contract.created_by` → `User`，取 `full_name`、`phone`；任一为空时对应字段返回 `null`，**不用邮箱/工号/角色名兜底填充姓名**。
  3. 脱敏规则（抽成一个函数，前后端只认可这一份口径）：
     - 手机号：保留前 3 后 4，中间固定 4 个 `*`，`13812341234` → `138****1234`；非 11 位号码（含国际号、座机）→ 只保留后 4 位并前置 `****`；空值 → `null`。
     - 姓名：复用 `contract_sign_public.py` 的 `_mask_name` 规则（保留首尾字符），两字姓名 → 「张*」；单字 → 原样。
  4. 响应位置：公开签署页 `GET /public/contract-sign/{token}`（`SignPageOut` + `get_sign_page`）与站内 `GET /contracts/{id}`（`ContractDetailResponse`）都补这两个字段；**响应体不得出现完整手机号、邮箱或 `created_by` 以外的内部标识**。
  5. 权限边界：公开签署页凭一次性 `sign_token` 返回，仅暴露「该合同发起方」的最小联系信息；站内详情沿用现有合同可见性判断（员工或该合同签署方），不可见返回 404 且不泄露存在性。发起方本人查看自己的合同不受额外限制。
- **涉及文件**：后端 `backend/app/api/v1/contract_sign_public.py`（`SignPageOut`、`get_sign_page`）、`backend/app/api/v1/contracts.py`（`ContractDetailResponse` 与详情组装处）、脱敏工具（建议放 `backend/app/services/`，与 `_mask_name` 合并不保留两份）；前端消费见 C-03。
- **依赖**：需后端改响应；**不需要数据库迁移**（`created_by` 已存在）。
- **验收**：
  - [x] 公开签署页响应含 `initiator_name`、`initiator_phone_masked`，号码形如 `138****1234`。实测 `GET /public/contract-sign/{token}` 返回 `initiator_name=经**明`；发起方有手机号的合同在站内详情实测为 `****1234`（非 11 位口径）。
  - [x] 发起方无手机号时 `initiator_phone_masked` 返回 `null`，前端不报错、不显示空行。实测 `8fb525be…` 发起方无手机号 → `null`；前端 `InitiatorContact` 对空值整行不渲染。
  - [x] 站内详情同样返回两字段；无权限用户请求详情仍返回 404。实测 `GET /contracts/{id}` 两字段有值；可见性判断沿用 `_get_visible_contract`，未改口径。
  - [x] 响应体中检索不到完整手机号、邮箱或其它用户内部字段。公开页响应无 `email` / `created_by` 键；详情页原有 `parties[].email` 属既有员工可见字段，未新增暴露。
  - [x] 脱敏为纯函数并有单测覆盖：11 位、非 11 位、空值、两字姓名。`backend/app/services/contract_privacy.py` + `backend/tests/test_contract_privacy.py`（4 passed）。
  - [x] 签署页浏览器点验（真实 token，`/sign/Ffg79z7…`）：页面正常加载，签署方卡显示「吕逸俊」；**正常签署页没有发起方联系人卡**——该卡只在 `StatusViews` 的 `FailView` / `DeclinedView` 渲染（C-03 设计口径）。另用已过期 token 打开，落到「链接已过期」页，因 `doc` 为 null 也不显示联系人卡。同一 token 接口实测返回 `initiator_name=经**明`。若产品希望正常签署页也展示发起方，需要另开一条前端改动（本轮未做）。

## C-04 列表状态徽标降噪，补「建议重签」行动 `[纯前端]`

- **优先级**：P0
- **所属层**：前端
- **现状**：`pages/Contracts/ContractList.tsx` 状态列在主徽标后最多再叠三个徽标：「已过期」「签章失败」「签名异常」，都用 `marginLeft: 6` 挤在一行；`signature_health`、`sign_error`、`expires_at` 已由 `GET /contracts` 返回（`contracts.py` L3841–L3846）。「签名异常」只有 `title` 提示，没有操作。
- **问题影响**：窄屏下状态列换行、徽标互相挤压；用户看到「签名异常」不知道要重签，只能点进详情碰运气。
- **改法**：
  1. 状态单元格改为两行：第一行只放主状态徽标；第二行放异常徽标（小号、8px 间距）。
  2. `signature_health === 'invalid'` 时，第二行徽标后面追加一个文字按钮「建议重签」→ 复用行点击的 `onOpen(c.id)` 打开详情，并在详情里滚动到签署区。
  3. `sign_error` 保留红色徽标，点击展开 `sign_error_message`（用 `Popover` 而不是 `title`，移动端也能看到）。
  4. 「已过期」从徽标降级为标题下的灰色小字「有效期至 {date} · 已过期」，避免和主状态抢注意力。
- **涉及文件**：`frontend-web/src/pages/Contracts/ContractList.tsx`、`pages/Contracts/index.tsx`（传 `onOpen` 已有）、`i18n/locales/{zh,en,th}.ts`
- **依赖**：纯前端。
- **验收**：
  - [x] 一份同时「已过期 + 签名异常」的合同，状态列只显示 1 个主徽标 + 1 行异常信息。第一行仅主状态徽标；过期降级为标题列灰色小字 `validUntilExpired`，异常徽标与「建议重签」统一落在第二行。静态核对通过，运行未测。
  - [ ] 点「建议重签」能进入详情。**已改未实测**：`onSuggestResign` → `detail.handleOpen(id)`，300ms 后滚到 `#contract-detail-card`；需浏览器点一次确认详情渲染与滚动位置。
  - [ ] 移动端窄屏下状态列不换行、不遮挡操作列。**已改未实测**：异常行独立成行、间距 8px，理论上不挤压主徽标；需窄屏真机或 DevTools 响应式实测。

## C-05 合同详情加「流程时间线」

- **优先级**：P0
- **所属层**：前后端交互（+ 前端展示）
- **现状**：`pages/Contracts/ContractDetailCard.tsx` 是「标题 + 状态/串行/有效期徽标 → 风险警告条 → 签署方两列网格 → 已签件/存证报告下载」。审计数据已写库：`backend/app/models/contract.py` L396 `ContractAuditLog`，写入在 `backend/app/services/contract_audit.py`；但**没有读取接口**（全仓库仅 service/model 引用，无路由）。
- **问题影响**：合同为什么被撤回、谁在什么时候催办过、某签署方是看了没签还是根本没打开，界面上都看不到；客服排查只能查库。
- **改法**：
  1. 后端新增（建议名，需确认）`GET /contracts/{contract_id}/audit-logs`：返回按 `occurred_at` 升序的 `[{action, actor_name, actor_role, occurred_at, ip, detail}]`；权限沿用合同可见性判断（员工或该合同签署方），非可见返回 404，不泄露存在性。
  2. 前端在详情卡签署方网格下方加「流程」区块：纵向时间线，节点=创建 → 发送 → 各签署方（签署/拒签）→ 完成/作废/撤回/过期；每个节点显示动作名、操作人、时间；默认展示最近 5 条，底部「展开全部」。（审计中无「查看」动作，看没看不作为节点。）
  3. 节点配色：成功=绿、拒签/失败=红、撤回/作废=灰、其余=中性；不加动画。
  4. 空态：「暂无流程记录」。
  5. **已核实：`ContractAuditLog.action` 真实枚举共 15 个**，所有写入点都使用 `backend/app/services/contract_audit.py` L27–L41 的常量，没有裸字符串：
     `contract.create`、`contract.send`、`contract.renew`、`contract.sign`、`contract.decline`、`contract.void`、`contract.revoke`、`contract.link_rotate`、`contract.remind`、`contract.proxy_sign`、`contract.authorization_grant`、`contract.authorization_revoke`、`contract.download_signed`、`contract.download_evidence`、`contract.permission_denied`。
     写入点共 22 处：`contract_sign_public.py` L300（download_signed）、L599（decline）、L673 / L732（sign）；`contracts.py` L130（permission_denied）、L236 / L1049 / L1851（create）、L496（authorization_grant）、L560（authorization_revoke）、L1950（link_rotate）、L2151（renew 或 send）、L2282（remind）、L2339（void）、L2430（revoke）、L2590（decline）、L3271 / L3389 / L3499（sign）、L3716（proxy_sign）、L4364（download_signed）、L4544（download_evidence）。除 service/model 外无其它直写 `ContractAuditLog` 的路径。
     前端按这 15 个值建「动作名 + 配色」映射；**未命中时不要丢弃节点**，显示原始 `action` 字符串 + 中性灰点，保证后端新增动作时时间线不空白、不漏节点。
- **涉及文件**：后端 `backend/app/api/v1/contracts.py`（新增路由）、`backend/app/services/contract_audit.py`（新增只读查询函数；action 常量已存在）；前端 `frontend-web/src/pages/Contracts/ContractDetailCard.tsx`、`pages/Contracts/types.ts`、`services/api.ts`（`contractsApi`）、`i18n/locales/{zh,en,th}.ts`
- **依赖**：需后端新增只读接口。审计写入已存在，不需要改表。
- **验收**：
  - [ ] 新建 → 发送 → 签署一份合同后，详情时间线依次出现创建、发送、签署三个节点，时间与操作人正确。
  - [ ] 拒签的合同出现红色「拒签」节点并带原因。
  - [ ] 无权限用户请求该接口返回 404。
  - [ ] 超过 5 条时默认折叠，可展开。

## C-06 统一错误码，界面按 code 给动作

- **优先级**：P0
- **所属层**：前后端交互
- **现状**：后端用 `HTTPException(status_code, detail="英文句子")`，例如 `REAL_NAME_REQUIRED`、`NOT_YOUR_TURN`、`Party already signed`、`Invalid field_id`、`Contract PDF not found`。Web 只对 `REAL_NAME_REQUIRED` 做了映射（`pages/Sign/hooks/useSignSubmit.ts`、`pages/Tenant/Contracts.tsx`、`pages/BrokerAgreements/index.tsx`），其余原样透出；App 端（`mobile-app/src`）grep 不到任何 `REAL_NAME_REQUIRED` 处理。
- **问题影响**：同一错误在 Web 是中文引导、在 App 是英文句子；用户看到 `Party already signed` 不知道该刷新还是该联系对方。
- **改法**：
  1. 后端把 `detail` 从字符串改为对象：`{"code": "REAL_NAME_REQUIRED", "message": "...", "action": "verify_identity", "field": null}`。先覆盖签署链路 5 个高频错误：`REAL_NAME_REQUIRED`、`NOT_YOUR_TURN`、`CONTRACT_EXPIRED`（新增，用于已过期仍提交）、`SIGN_FAILED`（签章引擎 502 时）、`TOKEN_INVALID`（链接无效）。
  2. `action` 枚举固定：`verify_identity` / `wait` / `reload` / `retry_sign` / `contact_initiator` / `none`。
  3. 前端三端各加一个 `parseApiError(e)`（Web 放 `frontend-web/src/lib/`，App/小程序放各自 `services/` 或 `lib/`）：优先读 `detail.code`，读不到再按 HTTP 状态兜底，最后才显示 `detail` 原文。
  4. 页面按 `action` 执行：`verify_identity`→打开实名弹窗；`wait`→显示顺位提示；`reload`→刷新；`retry_sign`→回到签署台；`contact_initiator`→跳 C-03 的联系卡。
  5. 保持老字符串兼容一个版本：若 `detail` 是字符串，仍按原逻辑展示。
- **涉及文件**：后端 `backend/app/api/v1/contract_sign_public.py`（`submit_signature`、`verify_identity`）、`backend/app/api/v1/contracts.py`（`sign` / `sign-batch` / `_apply_pdf_signatures` 抛错处）；前端 `frontend-web/src/lib/`（新增解析器）、`pages/Sign/hooks/useSignSubmit.ts`、`pages/Contracts/*`、`services/api.ts`；App `mobile-app/src/services/api.ts`、`mobile-app/src/screens/contracts/ContractsScreen.tsx`；小程序 `miniapp/src/services/api.ts`、`miniapp/src/pages/staff/contract/index.tsx`
- **依赖**：需后端改响应结构（跨端联调）。
- **验收**：
  - [ ] 未实名提交：Web/App/小程序都弹实名引导，不出现 `REAL_NAME_REQUIRED` 英文。
  - [ ] 非本人顺位提交：三端都显示「等待某某」而不是 409 原文。
  - [ ] 断网提交：显示「网络异常，请重试」，不显示堆栈。
  - [ ] 旧格式字符串错误仍能正常展示（兼容未改的接口）。

---

# 二、P1（建议改）

## C-07 合同列表加筛选行

- **优先级**：P1
- **所属层**：前后端交互
- **现状**：`GET /contracts` 不分页、不接收任何筛选参数，一次性返回当前用户可见的全部合同（`contracts.py` L3811–L3852）；前端 `ContractList.tsx` 只有 5 列表格。
- **问题影响**：合同超过一两百条后，用户只能靠浏览器滚动查找；找一份三个月前的合同要翻很久。
- **改法**：
  1. 后端给 `GET /contracts` 加可选查询参数：`status`、`source`、`keyword`（标题/hash 模糊）、`date_from`、`date_to`；不传时行为不变（保持现有返回数组，避免破坏 App/小程序）。
  2. 前端在表格上方加一行筛选条（`rent-card__toolbar`）：状态下拉 → 来源下拉 → 时间范围 → 关键字输入（回车触发）→「重置」。筛选变化后重新请求，加载时只灰化表格不整页转圈。
  3. **分页已定：不做**。`GET /contracts` 继续保持一次性返回数组，不新开 v2 接口、不改响应结构；前端不加分页器、不加「加载更多」、不做虚拟滚动。数据量增大时只靠上面的筛选条件收敛结果。原计划挂在这条上的分页相关前端改动一并取消。
- **涉及文件**：后端 `backend/app/api/v1/contracts.py`（`list_contracts`）；前端 `pages/Contracts/index.tsx`、`pages/Contracts/ContractList.tsx`、`services/api.ts`、`i18n/locales/{zh,en,th}.ts`
- **依赖**：需后端加参数（纯加法，不改响应结构）。
- **验收**：
  - [ ] 选「已签署」后列表只剩已签署合同，计数与统计条一致。
  - [ ] 输入标题关键字回车后结果收敛，清空恢复全量。
  - [ ] 不传参数时接口返回与现在完全一致（App/小程序不受影响）。
  - [ ] 列表页无分页器、无「加载更多」，与「不分页」口径一致。

## C-08 发起签署改三步向导

- **优先级**：P1
- **所属层**：前端（复用现有接口，不新增后端能力）
- **现状**：`pages/Contracts/index.tsx` 把「生成合同」卡、`UploadContractCard`、统计条、列表平铺在一页；发起要经过「建记录 → 回列表 → 进详情 → 追加签署方 → 放置签署区 → 设顺序 → 发送」，跨 3 个弹窗。
- **问题影响**：新用户不知道从哪开始；中途关掉弹窗后不知道进行到哪一步；「发送」按钮藏在详情卡里，容易漏。
- **改法**：
  1. 新增路由 `/contracts/new`（沿用现有布局与权限守卫），页面顶部放三步条：**① 文件 → ② 签署方 → ③ 位置与发送**。
  2. 第 1 步：Tab 切换「用模板生成 / 上传文件」；生成侧复用 `GenerateContractCard` 的表单区，上传侧复用 `UploadContractCard`；成功后停留本步，底部「下一步」。
  3. 第 2 步：左侧已添加签署方列表（姓名、角色、邮箱/电话、顺序），右侧「添加签署方」表单（复用 `AddPartyModal` 的字段）；支持上下移动调整顺序，写回 `sign_order`。
  4. 第 3 步：三栏布局——左侧字段类型/签署方/关键字，中间文档画布（复用 `PlaceFieldsModal` 的画布与拖放逻辑），右侧「已放置控件列表」+ 底部「发送给 N 位签署方」主按钮；发送成功跳详情页。
  5. 列表页顶部入口从两张卡改为一个主按钮「发起签署」+ 次按钮「上传合同」（可直接进入向导第 1 步的上传 Tab）。
  6. 草稿保存本次不做，记为 P2。
- **涉及文件**：`frontend-web/src/App.tsx`（路由）、`pages/Contracts/index.tsx`、`pages/Contracts/GenerateContractCard.tsx`、`UploadContractCard.tsx`、`PlaceFieldsModal.tsx`、`hooks/useSignFields.ts`、`services/api.ts`、`i18n/locales/{zh,en,th}.ts`
- **依赖**：纯前端（`/generate`、`/upload`、`/parties`、`/sign-fields`、`/sign-order`、`/send` 均已存在）。
- **验收**：
  - [ ] 从列表点「发起签署」到发送成功，最多经过 3 个屏幕，不需要回列表。
  - [ ] 第 2 步调整顺序后，详情页签署方顺序与之一致。
  - [ ] 第 3 步能完成放置、删除、翻页、关键字定位。
  - [ ] 任一步失败停留在当前步并给出可读错误，不丢已填内容。

## C-09 新增「我的待签」

- **优先级**：P1
- **所属层**：功能 + 前后端交互
- **现状**：签署方只能从邮件/短信里的 `sign_token` 链接进入；`GET /contracts` 按可见性返回，但没有「待我签」聚合。员工侧 `/review-center/todos` 会把 `draft` / `sent` / `partially_signed` 的合同列进「待处理合同」（`review_center.py` L77–L79、L131–L133），但那是**员工视角的待处理**，不是「当前登录人作为签署方轮到他签」的列表。
- **问题影响**：签署方漏签、重复找链接；发起方无法确认对方是否看到。
- **改法**：
  1. 后端新增（建议名）`GET /contracts/my-pending`：筛选 `ContractParty` 归属当前用户（`user_id` 或邮箱匹配）+ 合同状态 `sent` / `partially_signed` + `_can_sign_now` 为真，返回合同 id、标题、发起方、截止时间、签署链接；发起方姓名与脱敏电话复用 C-03B 的 `initiator_name` / `initiator_phone_masked` 口径。
  2. **已核实挂载点**：`frontend-web/src/pages/Home/` 下只有 `index.tsx` 与 `home.css`，且 `index.tsx` 是面向匿名访客的 C 端找房门户，区块顺序为：顶栏 `rent-portal__header`（L159）→ `home-hero` 横幅（L194）→ `home-search` 搜索卡（L223）→ `rent-goldnav` 七入口（L248）→ `rent-section` 精选房源（L265，`useCachedQuery('/public/listings')` + `DataState`）→ `rent-cta`（L411）→ 页脚（L432）。登录后「进入系统」按角色跳 `/tenant/dashboard`（业主/租客）、`/employee/dashboard`（员工）、`/dashboard`（管理层）。因此「待我签署（N）」卡片抽成一个组件，主挂载点为 `pages/Employee/Dashboard.tsx`、`pages/Tenant/Dashboard.tsx`、`pages/Dashboard/index.tsx`；`pages/Home/index.tsx` 仅在 `token` 存在时条件渲染同一组件，匿名态不显示。
  3. 小程序租户端 `pages/tenant/my-contracts` 顶部加同一入口。
- **涉及文件**：后端 `backend/app/api/v1/contracts.py`；前端新增 `pages/Contracts/PendingSignCard.tsx`，挂载 `frontend-web/src/pages/Employee/Dashboard.tsx`、`pages/Tenant/Dashboard.tsx`、`pages/Dashboard/index.tsx`，并在 `pages/Home/index.tsx` 登录态条件渲染（L96 起的 `Home` 组件已能拿到 `useAuthStore` 的 `token`/`user`）、`pages/Contracts/*`、`services/api.ts`；App `mobile-app/src/screens/contracts/ContractsScreen.tsx`、`services/api.ts`；小程序 `miniapp/src/pages/tenant/my-contracts/index.tsx`、`services/api.ts`
- **依赖**：需后端新增接口；首页挂载点已核实（见上），无需再等前端确认。
- **验收**：
  - [ ] 被指定为签署方的账号登录后能看到待签数量。
  - [ ] 已签/已过期/未轮到的合同不出现在待签列表。
  - [ ] 点「去签署」能直接进入签署页并带正确 token。

## C-10 上传后即告知能否签（PDF 可用性）

- **优先级**：P1
- **所属层**：前后端交互
- **现状**：上传与转换是两个接口：`POST /contracts/{id}/upload` 与 `POST /contracts/{id}/convert-pdf`（`contracts.py` L1806、L1871）。`pdf_convert.py` 中 Office 依赖 `GOTENBERG_URL`，默认为空即关闭；无 OFD。
- **问题影响**：用户上传 Word 后看到「上传成功」，走到签署页才发现没有 PDF 可落章，只能签名留痕；错误发现得太晚。
- **改法**：
  1. 后端 `/upload` 响应增加 `pdf_ready: bool` 与 `pdf_error: string | null`；对 Office 文件在请求内触发转换（或在响应前同步转换），失败时 `pdf_ready=false` 并给出原因（如 `GOTENBERG_DISABLED`、`UNSUPPORTED_FORMAT`，均为新增建议值，需与后端确认）。
  2. 前端上传成功后按 `pdf_ready` 分流：`true` → 进入下一步；`false` → 卡片内红色提示「当前文件无法转 PDF，只能进行签名留痕」+「重试转换」按钮，不允许静默继续。
  3. 部署文档把 `GOTENBERG_URL` 标为签署功能必配项（配置项在 `backend/app/config.py`）。
- **涉及文件**：后端 `backend/app/api/v1/contracts.py`、`backend/app/services/pdf_convert.py`、`backend/app/config.py`；前端 `pages/Contracts/hooks/useContractUpload.ts`、`UploadContractCard.tsx`、`services/api.ts`、`i18n/locales/{zh,en,th}.ts`
- **依赖**：需后端改响应；Gotenberg 属于部署依赖（非资质）。
- **验收**：
  - [ ] 上传 PDF：直接 `pdf_ready=true`。
  - [ ] 上传 Word 且未配 Gotenberg：立即提示不可转 PDF，并提供重试。
  - [ ] 上传图片：转单页 PDF 后 `pdf_ready=true`。
  - [ ] 上传失败不会留下「上传成功但签不了」的中间态。

## C-11 小程序改「先收集、后一次提交」

- **优先级**：P1
- **所属层**：前后端交互
- **现状**：`miniapp/src/pages/staff/contract/index.tsx` 是「点一个框、签一个框」，每个字段调用一次 `contractsApi.sign`；Web 免登录页则收集全部后一次 `items[]` 提交（`pages/Sign/hooks/useSignSubmit.ts`）。后端 `POST /contracts/{id}/sign-batch` 支持批量。
- **问题影响**：同一合同在小程序上产生 N 次 PDF 修订与 N 次状态流转，中途退出会留下「部分已签」；弱网下容易一半成功一半失败。
- **改法**：
  1. 小程序把「确认签署」改为：先在本地收集所有已放置字段 → 校验无遗漏 → 一次 `sign-batch`。
  2. 提交中禁用按钮并显示「正在签署（N 个位置）」，失败整批回滚提示，不做部分重试。
  3. 单字段快速签署（只有一个框）仍走原接口，减少改动面。
- **涉及文件**：`miniapp/src/pages/staff/contract/index.tsx`、`miniapp/src/services/api.ts`
- **依赖**：纯小程序端改动（后端接口已存在）。
- **验收**：
  - [ ] 一份有 3 个签署框的合同，提交时网络面板只出现 1 次签署请求。
  - [ ] 任一框未放置时不允许提交。
  - [ ] 提交失败后所有框恢复可编辑，不出现「已签一半」。

## C-12 意愿验证方式可配置

- **优先级**：P1
- **所属层**：功能 + 前后端交互
- **现状**：公开端 `submit_signature` 只有客户端传 `code` 才校验（`contract_sign_public.py` L639–L643）；站内 `_verify_sign_intent` 未传 code 直接 return（`contracts.py` L2487–L2501）。小程序注释「意愿验证已下线」，App 注释前后矛盾。无人脸、无签署密码。
- **问题影响**：默认无意愿校验，纠纷时无法证明是本人操作；发起方也无法要求「必须短信验证」。
- **改法**：
  1. 合同表加 `intent_method` 枚举：`none` / `otp` / `face`，默认 `otp`；由发起方在发起时选择（C-08 第 3 步加一个下拉）。**不含 `password`（已定：不做签署密码独立体系）**。
  2. `/sign-code` 按 `intent_method` 决定是否发码；提交时若 `intent_method != none` 且无有效 code，返回 `SIGN_INTENT_REQUIRED`（新增 code，建议名；走 C-06 的错误结构）。
  3. 签署页在提交前插入「意愿验证」一步：`otp`→输入短信验证码；`face`→调第三方（**需外部资质**，没有供应商时该选项置灰并提示「暂未接入人脸核验」）。不设计签署密码的设置/找回/重置入口。
- **涉及文件**：后端 `backend/app/models/contract.py`、`backend/app/api/v1/contracts.py`、`backend/app/api/v1/contract_sign_public.py`、Alembic 迁移；前端 `pages/Contracts/*`（发起选择）、`pages/Sign/*`（验证步骤）；App/小程序签署页同步
- **依赖**：需后端 + 数据库迁移；人脸需外部供应商与资质；不涉及密码体系。
- **验收**：
  - [ ] 发起时选「短信验证」，签署提交前必须输入正确验证码。
  - [ ] 选「无」时可跳过，界面明确提示「本合同未启用意愿校验」。
  - [ ] 未配置人脸供应商时该选项不可选并提示，不报错。
  - [ ] 发起与签署界面都找不到「签署密码」相关入口或文案。
  - [ ] 旧合同默认按 `otp` 处理，行为可预期。

## C-13 关键字定位合并为一次请求

- **优先级**：P1
- **所属层**：前后端交互
- **现状**：`PlaceFieldsModal.tsx` 先调 `POST /contracts/{id}/keyword-search` 拿命中列表，用户再点某条命中调 `POST /contracts/{id}/keyword-fields` 传 `index` 建字段（`contracts.py` L2610、L2637）。
- **问题影响**：两次往返；第二次失败时用户已离开搜索态，命中列表丢失，只能重搜。
- **改法**：
  1. 后端新增（建议名）`POST /contracts/{id}/sign-fields/from-keyword`：入参 `keyword`、`index`（或 `page`+`x`+`y`）、`party_id`、`field_type`；一次完成定位与建字段，返回新字段与最新字段列表。旧接口保留。
  2. 前端 `PlaceFieldsModal` 命中项点击改为调用新接口；成功后直接在当前页显示框并高亮，无需重新搜索。
  3. 搜索无命中、命中但建字段失败，分别给不同文案。
- **涉及文件**：后端 `backend/app/api/v1/contracts.py`；前端 `pages/Contracts/PlaceFieldsModal.tsx`、`pages/Contracts/hooks/useSignFields.ts`、`services/api.ts`
- **依赖**：需后端新增接口。
- **验收**：
  - [ ] 点一条命中后只发 1 次请求即出现签署框。
  - [ ] 失败时保留搜索结果，可直接重试。
  - [ ] 旧接口仍可用（App/小程序未升级时不报错）。

## C-14 印章库分组、信息层级与企业章启用/停用

- **优先级**：P1
- **所属层**：前端 + 前后端交互
- **现状**：`pages/Contracts/SignAssetLibraryModal.tsx` 是「个人/企业」Segmented + 资产三列网格 + 下方新增区；企业章与个人签名混在同一网格，卡片只有名称/类型/来源/删除。后端 `SignAsset`（`backend/app/models/contract.py` L235–250）只有 `scope` / `seal_type`，**没有启用状态、操作人、操作时间字段**；`GET /sign-assets` 的 `_serialize`（`backend/app/api/v1/sign_assets.py` L39–49）也不返回状态。删除是硬删除（同文件 L237–259），企业章仅创建人或 `admin` 可删。
- **问题影响**：印章一多就分不清哪个是公章、哪个是合同章；无法「临时停用」一个章，只能删掉重建，删除又会丢失历史；离职或换章期间没有可审计的停用记录。
- **改法**：
  1. **数据模型**（需 Alembic 迁移）：`SignAsset` 增加 `is_active: bool = True`（索引）、`status_changed_at: datetime | null`、`status_changed_by_user_id: uuid | null`、`disabled_reason: str | null`（≤200 字）。不引入软删除，删除语义保持不变。
  2. **接口形态**（建议名，需后端确认）：
     - `POST /sign-assets/{asset_id}/disable`，body `{"reason": "..."}`（可选），幂等；
     - `POST /sign-assets/{asset_id}/enable`，幂等；
     - 两者返回序列化后的资产（含新状态字段），不存在的资产按现有可见性规则返回 404。
     - `GET /sign-assets` 返回体补 `is_active`、`status_changed_at`、`status_changed_by_name`、`disabled_reason`；默认仍返回全部（含已停用），由前端筛选，避免旧客户端拿不到已停用项的困惑。
  3. **权限**（建议）：停用 = `admin` 或该章创建人（与现有删除权限对齐）；**启用仅 `admin`**，避免创建人自行恢复绕过管理。接口内按 `SignAsset.scope == company` 分支校验，个人签名不提供启停。
  4. **审计**：复用现有审计表（`ContractAuditLog`），把 `record_contract_audit` 的 `target_type` 从写死 `"contract"` 改为可选参数（默认值不变），新增两个动作常量 `sign_asset.disable` / `sign_asset.enable`，写 `target_type="sign_asset"`、`target_id=asset_id`、`detail={"reason": ...}`。若不愿改动合同审计表语义，则新增独立 `SignAssetAuditLog`，二选一后固定。
  5. **停用后的影响边界**（必须写进接口文档）：停用只影响**后续选择**——签署页/位置设置的签章托盘不再出现或置灰该章，已经应用到文件上的签名与已签 PDF 不回滚、不重签；已发出但未签署的合同不自动作废，签署方仍可用个人签名或其它可用章完成签署。若合同要求必须使用某企业章，需由发起方人工改用其它方式或重新发起。
  6. **界面**：顶部两个 Tab「企业印章 / 个人签名」，企业 Tab 内按 `seal_type` 分组；卡片增加状态徽标（「启用中」/「已停用」），已停用卡片整体降透明度、缩略图打灰；「⋯」菜单增加「停用 / 启用」（按权限显示），停用弹二次确认，文案明确「停用后新签署不可再选此章，已签文件不受影响」，可选填原因；分组标题显示「已停用 N」，顶部加「显示已停用」开关（默认开）。
- **涉及文件**：后端 `backend/app/models/contract.py`（`SignAsset`）、`backend/app/api/v1/sign_assets.py`（列表序列化、启停路由）、`backend/app/services/contract_audit.py`（`target_type` 参数化 + 两个新常量）、Alembic 迁移；前端 `frontend-web/src/pages/Contracts/SignAssetLibraryModal.tsx`、`services/api.ts`、`i18n/locales/{zh,en,th}.ts`
- **依赖**：需后端（模型、迁移、接口）+ 权限模型；**不能纯前端完成**。
- **验收**：
  - [ ] 管理员可停用任意企业章，创建人可停用自己创建的章，普通员工无停用入口。
  - [ ] 停用后签署页签章托盘不再可选该章；已签 PDF 与已应用签名不受影响。
  - [ ] 已停用章在印章库显示「已停用」并从默认选择中排除，可切换查看。
  - [ ] 停用/启用各写一条审计，含操作人、时间、原因，可在审计查询中看到。
  - [ ] 非 `admin` 无法启用已停用的企业章；个人签名没有启停菜单。
  - [ ] 对同一章重复调用停用/启用接口，状态不变，结果一致。

## C-15 回调事件补齐与重试窗口拉长

- **优先级**：P1
- **所属层**：前后端交互
- **现状**：`backend/app/services/contract_jobs.py` 只发出 4 个事件：`contract.signed / voided / revoked / expired`；退避 30 秒 / 2 分钟 / 10 分钟，最多 4 次。开放签为 13 事件、失败立即重试 3 次后 30 分钟 / 2 小时 / 24 小时。
- **问题影响**：外部系统看不到「某方已签」「某方拒签」「签章失败」，只能等最终态；对方系统夜间维护时容易丢事件。
- **改法**：
  1. 新增事件：`contract.party_signed`（单方签完）、`contract.party_declined`（单方拒签）、`contract.sign_failed`（引擎 502 且已记录 `last_sign_error`）。
  2. 退避改为 30 秒 / 5 分钟 / 30 分钟 / 2 小时 / 6 小时，最多 5 次；保留人工重投。
  3. 对外文档写明成功判定：HTTP 2xx 且响应体为 `{"ok":true}`（或对齐开放签的 `"success"`，二选一后固定）。
- **涉及文件**：`backend/app/services/contract_jobs.py`、`backend/app/api/v1/contracts.py`（`emit` 调用点）、对外接口文档
- **依赖**：需后端；不影响前端。
- **验收**：
  - [ ] 两位签署方的合同，第一方签完后订阅端收到 `contract.party_signed`。
  - [ ] 拒签触发 `contract.party_declined`，含拒签原因。
  - [ ] 模拟订阅端连续失败，重试时间间隔符合新退避序列。
  - [ ] 重投仍可手动触发。

---

# 三、P2（有余力再做）

## C-16 模板管理页

- **优先级**：P2｜**所属层**：功能
- **现状**：模板库接口齐全（`/template-library` 列表、seed、创建、更新、详情、版本、按版本生成，`contracts.py` L811–L978），但 `frontend-web/src` 里 grep 不到 `template-library`，界面只消费 `/templates` 的三套内置模板。
- **问题影响**：运营改模板只能走接口；新场景要开发介入。
- **改法**：新增 `/contracts/templates` 页：左侧模板列表（名称/场景/版本/更新时间），右侧预览 + 变量说明 +「用此模板发起」（跳 C-08 第 1 步）；顶部「新建模板」先只做从现有模板复制。
- **涉及文件**：`frontend-web/src/App.tsx`、新增 `pages/Contracts/Templates/*`、`services/api.ts`、i18n
- **依赖**：纯前端。
- **验收**：能列出模板与版本；能基于选中模板进入发起向导；复制模板后列表出现新条目。

## C-17 一个合同支持多文件

- **优先级**：P2｜**所属层**：功能 + 前后端交互
- **现状**：合同模型是单 `pdf_path` / `signed_pdf_path`（`backend/app/models/contract.py`），签署区带 `page`，没有文件维度。
- **问题影响**：主合同 + 附件都要签时，只能拆成多份合同分别发起。
- **改法**：新增合同文件表（`contract_id`、`file_id`、`sort`），签署区加 `file_id`；签署页与位置设置加「文件下拉切换」；PDF 合并或逐文件签章二选一（需后端定方案）。
- **涉及文件**：`backend/app/models/contract.py`、`contracts.py`、`kaifang_sign_service.py`、Alembic；前端 `PlaceFieldsModal`、`DocumentPanel`
- **依赖**：需后端改模型与迁移，改动面大。
- **验收**：一个合同挂 2 个文件，签署区能分别落在不同文件；签署完成后两份都有签章。

## C-18 骑缝章控件化

- **优先级**：P2｜**所属层**：功能
- **现状**：`backend/app/services/kaifang_sign_service.py` → `apply_seam_seal`：单页不做，PDF 已有数字签名时跳过；没有界面入口。
- **问题影响**：上传件、已签件盖不了骑缝章；用户以为系统不支持。
- **改法**：位置设置里加「骑缝章」字段类型；选择后弹「选页范围 + 应用文件」；后端放宽「已签名跳过」限制（需评估增量签名方案），单页文件给出明确不支持提示。
- **涉及文件**：`kaifang_sign_service.py`、`contracts.py`、`PlaceFieldsModal.tsx`
- **依赖**：需后端引擎改造。
- **验收**：10 页 PDF 可对 1–10 页盖骑缝章；单页文件提示不支持而不是静默失败。

## C-19 存证报告升级

- **优先级**：P2｜**所属层**：功能
- **现状**：`GET /contracts/{id}/evidence-report` 动态生成报告，含原文哈希复算、签署方、签名留痕、内嵌签名验签；TSA 默认关闭（`TSA_URL` 为空则 `_make_timestamper` 返回 None）；所有签署方共用一把引擎证书。
- **问题影响**：报告是系统自述，缺少第三方时间锚点与证书主体，对外证明力弱。
- **改法**：报告附 RFC3161 时间戳令牌与证书链；验签页展示证书主体；接入第三方存证后回写存证编号（需商务与资质）。
- **涉及文件**：`backend/app/api/v1/contracts.py`（`build_verify_report`）、`kaifang_sign_service.py`、`backend/app/config.py`
- **依赖**：需外部 TSA / 存证服务与资质。
- **验收**：报告能看到时间戳序列号与证书主体；验签失败时能指出失败原因。

## C-20 App / 小程序内嵌签署页

- **优先级**：P2｜**所属层**：前端
- **现状**：App 与小程序把免登录签署页托管在 Web（`mobile-app/src/lib/api.ts`、`miniapp/src/lib/api.ts` 注释），外部签署人会跳出应用。
- **问题影响**：跳出后回不来；微信内打开外链体验差。
- **改法**：App 用 WebView、小程序用 `web-view` 组件加载同一签署页，登录态与 token 通过 URL 传递；保留「在浏览器打开」兜底。
- **涉及文件**：`mobile-app/src/screens/contracts/*`、`miniapp/src/pages/staff/contract/index.tsx`
- **依赖**：纯前端（需确认各端 webview 域名白名单）。
- **验收**：从 App/小程序点签署不再跳出应用；返回键能回到合同详情。

## C-21 企业实名与用章权限

- **优先级**：P2｜**所属层**：功能
- **现状**：`backend/app/api/v1/sign_assets.py` 支持 `scope=company` + `seal_type`，员工可创建任意公司名印章；无营业执照核验、无审核流、无用章权限。
- **问题影响**：企业章可凭空造，存在伪造风险。
- **改法**：企业资料提交 → 管理员审核 → 审核通过才允许创建企业章；用章按角色授权。审核队列可复用现有后台权限体系。
- **涉及文件**：`sign_assets.py`、`backend/app/models/*`（企业/审核表）、后台页面
- **依赖**：需后端 + 运营流程 + 企业核验供应商（外部资质）。
- **验收**：未审核企业无法创建企业章；审核记录可追溯。

## C-22 入站幂等键

- **优先级**：P2｜**所属层**：前后端交互
- **现状**：公开 `POST /public/contract-sign/{token}` 与站内签署无幂等键，靠行锁 + 「已签」状态兜底；出站回调已有 `X-Idempotency-Key`。
- **问题影响**：网络重试时第二次拿到 409，前端无法区分「上次其实成功了」与「真的冲突」。
- **改法**：签署接口接受可选 `Idempotency-Key` 请求头，服务端缓存「键 → 上次响应」一段时间；重复请求直接回放原响应。前端提交时生成一次键，重试复用。
- **涉及文件**：`backend/app/api/v1/contracts.py`、`contract_sign_public.py`、缓存层；前端 `Sign/hooks/useSignSubmit.ts`、App/小程序签署调用
- **依赖**：需后端加缓存/存储。
- **验收**：同一键连续提交两次，第二次返回与第一次相同的成功响应，不产生第二条签署记录。

---

# 四、已定决策与未决项

## 4.1 已定决策（按结论执行，不再讨论）

| 项 | 结论 | 状态 |
|---|---|---|
| 发起方联系方式 | **要做**。公开签署页与站内详情都补 `initiator_name` + `initiator_phone_masked`，只暴露脱敏号，不返回邮箱；实现见 C-03B，前端见 C-03 | 已定 |
| 合同列表分页 | **不做**。`GET /contracts` 保持一次性返回数组，不新开 v2、不改响应结构；前端无分页器/「加载更多」，数据量大靠 C-07 筛选收敛 | 已定 |
| 签署密码体系 | **不做**。`intent_method` 只保留 `none` / `otp` / `face`；`face` 无供应商前置灰；不建设置/找回/重置入口 | 已定 |
| 企业印章启用/停用 | **要做**。后端补状态、操作人、时间、原因与审计，接口与权限见 C-14；依赖后端与权限模型 | 已定 |

## 4.2 已核实事实（技术基线）

| 项 | 结论 | 状态 |
|---|---|---|
| 签署页当前响应 | `SignPageOut`（`backend/app/api/v1/contract_sign_public.py` L175–188）与 `get_sign_page`（L212–252）无 `initiator_*`；站内详情仅 `created_by` UUID（`backend/app/api/v1/contracts.py` L168、L4082） | 已核实 |
| `ContractAuditLog.action` | 15 个真实值，全部常量写入，22 处调用点，清单见 C-05 | 已核实 |
| Web 首页组件 | `frontend-web/src/pages/Home/` 仅 `index.tsx` + `home.css`，为匿名 C 端门户；业务首页为 `/employee/dashboard`、`/tenant/dashboard`、`/dashboard` | 已核实 |

## 4.3 仍未决的技术项（落地前与后端确认命名/形态，不臆造）

| 项 | 待确认内容 |
|---|---|
| C-03B 字段命名 | `initiator_name` / `initiator_phone_masked` 为建议名，需后端确认；脱敏函数放 `services/` 还是 `core/` |
| C-05 审计查询接口 | `GET /contracts/{id}/audit-logs` 为建议名；是否分页、`detail` 是否原样返回需定 |
| C-09 待签聚合接口 | `GET /contracts/my-pending` 为建议名；`user_id` 与邮箱匹配的优先级需定 |
| C-10 上传响应字段 | `pdf_ready` / `pdf_error` 为建议名；Office 转换同步还是异步需定 |
| C-13 关键字建字段 | `POST /contracts/{id}/sign-fields/from-keyword` 为建议名；入参用 `index` 还是 `page+x+y` 需定 |
| C-14 印章启停 | `POST /sign-assets/{id}/disable` 与 `/enable` 为建议名；审计复用 `ContractAuditLog` 还是新建表需定 |
| C-06 错误结构 | `{code, message, action, field}` 的三端兼容窗口需确认 |

---

# 五、不建议照抄的部分

以下设计依赖闭源能力、资质或运营流程，**只做界面形式没有收益**，本单不安排：

1. **「CA 证书 / 平台防篡改 / 图片章」三选一及其法律效力文案**：开放签能这样标注是因为背后有对应证书体系。我方只有自签 CA，照抄会构成误导；要么先换 CA，要么只写「本系统签名仅证明文件未被篡改」。
2. **实名检查、人脸识别、短信验证码**：开放签预集成在闭源云盾里，且价格页明确不允许自行替换第三方。界面上的「实名检查」步骤可以做，但底层核验必须自己接供应商，抄弹窗不提升法律效力。
3. **企业实名人工审核与三权分立**：属于运营后台 + 审批流程 + 权限模型，不是组件；没有审核人和规则，界面做了也没用。
4. **13 个回调事件的事件名**：这是服务端契约，每个事件都要有真实触发点与幂等保证；只改文档或抄名字会制造对接事故。
5. **司法链 / 公证 / 第三方存证编号**：开放签文档未说明是否对接（仓库未说明），且需要资质与商务合同，不是代码问题。

---

# 六、新增待办

## C-23 启动依赖自检（静默失效型依赖） `[已实现 2026-11-12]`

- **优先级**：P1｜**所属层**：后端（启动期）
- **现状**：电子签链路有两类「缺失就静默降级」的依赖，没有任何启动期校验：
  1. `qrcode` + Pillow：`backend/app/api/v1/contracts.py` 的 `_qr_data_url()` 在导入失败时返回 `None`，`share-link` 照常 200，但 `qr_data_url` 为空、前端走「二维码生成失败」降级（本轮环境 venv 未装 `qrcode` 即复现）。
  2. Gotenberg：`backend/app/services/pdf_convert.py` 未配置/不可连通时，Office 上传件不转 PDF，只回 `pdf_converted=false`，上传本身仍成功。
- **问题影响**：部署漏装依赖或容器没起，功能悄悄少一块，只有用户点到才发现；排查时要翻请求日志才能定位。
- **改法**（已按此实现）：
  1. 在现有启动自检 `_run_startup_selfcheck()` 末尾新增 `_check_signing_dependencies()`，复用既有 `lifespan` 钩子，未引入配置框架。
  2. 硬依赖（`qrcode` 可导入、Pillow 可导入且能编码出 `%PNG` 头）：缺失时抛 `RuntimeError`，**应用启动失败**，日志含异常类型/消息与 `requirements.txt` 安装提示。
  3. 可选依赖（Gotenberg）：`GOTENBERG_URL` 为空视为「不启用」，静默跳过；配置了但 `{url}/health` 探测失败（超时上限 5 秒）时打 **WARNING**（含 URL、异常类型与影响说明），不阻断启动。
  4. 成功路径只打一条 `startup.selfcheck.sign_dependencies`（`qr=ok`），不产生噪音。
- **涉及文件**：`backend/app/main.py`（`_check_signing_dependencies()`）
- **依赖**：需后端改动；不改数据库、不改接口响应结构、不需前端配合。Gotenberg 自检需要该依赖已部署时才生效。
- **验收**：
  - [x] 在未安装 `qrcode` 的环境启动，进程启动失败或明确报错，日志含依赖名与安装建议。验证：用 `sitecustomize` 屏蔽 `qrcode` 导入后启动，进程退出码 3，`RuntimeError: qrcode/Pillow 不可用（ImportError: …）。请先安装 requirements.txt 中的 qrcode[pil] 与 Pillow，再重启服务。`
  - [x] `GOTENBERG_URL` 留空时启动无告警；配置为不可达地址时启动成功但打 WARNING，日志含 URL 与失败原因。验证：留空启动无 Gotenberg 日志；设 `http://127.0.0.1:9` 后启动成功，日志打 `startup.selfcheck.gotenberg_unreachable`（`ConnectError` + URL）。
  - [x] 依赖齐备时启动日志只有一行汇总，不产生噪音。验证：正常启动仅 `{"qr": "ok", "event": "startup.selfcheck.sign_dependencies"}`。
