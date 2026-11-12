# 电子签模块交接清单（提交前必读）

> 生成时间：2026-11-12。范围：C-01～C-23 中已落地的部分 + 站内签署台三端同步。
> 本文只记录**已核实**的事实；没有实测的一律写「未实测」，不做推断。
> 相关文档：[e-sign-change-proposal.md](./e-sign-change-proposal.md)（施工单）、[e-sign-gap-analysis.md](./e-sign-gap-analysis.md)（差距报告）。

---

## 1. 已完成

### A 组（P0）

1. **C-01 签署页「待签控件」清单**（Web）：签署页右栏新增清单，按页码 + y 坐标排序，显示「第 X 页 / 类型 / 待放·已放·已签」，顶部剩余数、底部完成度；点击行切到对应页并高亮该框约 1.4s。
2. **C-02 单一原因提示 + 定位**（Web）：提交按钮不可用时只显示一条原因，优先级固定为 链接无效 → 已过期 → 未轮到 → 未放章 → 未实名；点击按原因分别执行重载、滚到控件区、打开实名入口、跳到首个未完成字段。
3. **C-03 失败/已拒签页出口**：`FailView`、`DeclinedView` 增加发起方联系卡（`InitiatorContact`）、复制签署链接、下载已签件等出口动作。
4. **C-04 列表徽标降噪 + 建议重签**：合同列表把 `sign_error` 与 `signature_health === 'invalid'` 收拢到一处提示；详情页对 `invalid` 给出「建议重签」说明。

### 独立条目

5. **四个组件重写（此前被 `.gitignore` 静默忽略）**：
   - `ContractStatsBar.tsx`：报表统计条（总数 / 已作废 / 已拒签 / 终止类含占比）。
   - `SignOrderModal.tsx`：并行/串行切换 + 未签方序号编排，提交口径与 `POST /contracts/{id}/sign-order` 一致（parallel 不传序号；sequential 只传未签方且序号为正整数、互不重复）。
   - `CallbackModal.tsx`：主回调地址 + 多地址订阅（勾选保留/取消）+ 后端生成的一次性密钥只读展示 + 投递记录与人工重投。
   - `ShareLinkQrModal.tsx`：免登录签署链接二维码（`qr_data_url`）+ 复制链接；二维码缺失时降级为仅复制链接。
6. **统计三态**：`ContractStatsBar` 明确区分「加载中（骨架）/ 加载失败（可重试）/ 暂无数据」，失败不伪装成空数据。
7. **回调订阅**：`CallbackModal` 按后端两个接口如实两步提交——`POST /contracts/{id}/callback`（主地址，留空即关闭）与 `POST/DELETE /contracts/{id}/subscriptions`（多地址），并接入 `GET /callbacks` 投递记录与 `POST /callback/retry` 重投。
8. **二维码缺依赖修复**：`_qr_data_url()` 失败不再静默返回空（保留异常信息）；启动自检把 qrcode + Pillow 作为**硬依赖**校验（编码结果必须是有效 PNG），缺失直接拒绝启动并提示安装 `qrcode[pil]`、`Pillow`。当前 venv 已装好，运行日志实测 `startup.selfcheck.sign_dependencies {"qr": "ok"}`。
9. **脏数据清理**：删除测试期间误建的草稿合同，合同总数回到 14；合同 `8fb525be…` 签署方「吕逸俊」残留的 `sign_order` 归 0。
10. **C-03B 发起方信息（后端 + 前端收尾）**：公开签署接口与站内合同详情补充 `initiator_name`、`initiator_phone_masked`；脱敏逻辑抽到 `backend/app/services/contract_privacy.py`，并有单测 `backend/tests/test_contract_privacy.py`。
11. **C-23 启动依赖自检**：`backend/app/main.py` 启动时校验 SECRET_KEY/DEBUG、PII 加密密钥、集成 mock、CORS 通配、支付验签材料、签署依赖（qrcode/Pillow 硬校验、Gotenberg 软告警，失败只告警不阻断）。
12. **App 站内签署台同步（仅前端）**：`MyContractsScreen.tsx` 复用与 Web 同口径的 `fieldKey` / `isFieldCovered` / `isFieldDone` / `sortSignFields` / `fieldState`；宽屏清单常驻左栏、窄屏底部抽屉；单一 `hardReason` 提示 + `locateBlocker`；已签/已覆盖字段不再渲染可点框。
13. **小程序站内签署台同步（仅前端）**：`pages/tenant/my-contracts/index.tsx` 同口径改造，清单走底部抽屉、dock 增加入口与提示、原因收敛为单一 `hardReason`；样式在 `index.scss`（高亮描边 + 两次 0.7s 闪烁）。
14. **三语补齐**：Web `zh/en/th`、App `mobile-app/src/i18n/index.ts`、小程序 `miniapp/src/i18n/index.ts` 均补齐本轮新增 key（待签清单、三种字段状态、页码、五条原因提示）。

---

## 2. 未完成 / 未开工（18 项）

| 编号 | 条目 | 依赖 | 当前卡点 |
|---|---|---|---|
| C-05 | 合同详情「流程时间线」 | 后端新增只读审计接口（建议 `GET /contracts/{id}/audit-logs`）；审计写入已存在，无需改表 | 后端接口未实现，后端未开工 |
| C-06 | 统一错误码，界面按 code 给动作 | 后端把 `detail` 改为 `{code,message,action,field}`；三端各加 `parseApiError` 并兼容旧字符串 | 跨端联调，后端未开工 |
| C-07 | 合同列表筛选行 | `GET /contracts` 增加可选筛选参数（纯加法，不改响应结构；分页已定不做） | 后端参数未加，前端未开工 |
| C-08 | 发起签署改三步向导 | 纯前端（`/generate`、`/upload`、`/parties`、`/sign-fields`、`/sign-order`、`/send` 均已存在） | P1，未排期 |
| C-09 | 新增「我的待签」 | 后端新增聚合接口（建议 `GET /contracts/my-pending`），`user_id` / 邮箱匹配优先级待定 | 后端接口未实现 |
| C-10 | 上传后即告知能否签 | `/upload` 响应增加 `pdf_ready` / `pdf_error`，Office 需同步转换；Gotenberg 属部署依赖 | 后端响应未改；未部署 Gotenberg 时只能提示「不可转 PDF」 |
| C-11 | 小程序改「先收集、后一次提交」 | 纯小程序端（`sign-batch` 后端已存在） | 无微信开发者工具，改完也无法实测 |
| C-12 | 意愿验证方式可配置 | 模型加 `intent_method`（none/otp/face）+ Alembic 迁移 + 发码与校验改造；face 需外部供应商资质 | 后端与迁移未做；人脸无供应商 |
| C-13 | 关键字定位合并为一次请求 | 后端新增 `from-keyword` 接口（建议名，入参形态待定） | 后端未开工 |
| C-14 | 印章库分组 + 企业章启用/停用 | `SignAsset` 加 `is_active` / `status_changed_at` / `status_changed_by_user_id` / `disabled_reason` + Alembic；启停接口；权限模型（停用=admin 或创建人，启用仅 admin）；审计（复用 `ContractAuditLog` 参数化 `target_type` 或新建 `SignAssetAuditLog`，二选一） | 模型、迁移、接口、权限、审计全部未做；不能纯前端完成 |
| C-15 | 回调事件补齐与重试窗口拉长 | 后端 `contract_jobs.py` 新增 `party_signed` / `party_declined` / `sign_failed`，退避改 30s/5m/30m/2h/6h（最多 5 次），并补对外文档 | 本轮只做了订阅管理 UI，**事件补齐与退避改造未开工** |
| C-16 | 模板管理页 | 纯前端（`/template-library` 接口齐全，前端未接） | P2，未开工 |
| C-17 | 一个合同支持多文件 | 新增合同文件表 + `sign_fields.file_id` + Alembic + 引擎合并方案 | 改动面大，未开工 |
| C-18 | 骑缝章控件化 | 引擎改造（放宽「已签名跳过」）+ 前端字段类型 | 未开工 |
| C-19 | 存证报告升级 | 外部 RFC3161 TSA / 存证服务与资质 | 未开工 |
| C-20 | App / 小程序内嵌签署页 | 纯前端 webview（需各端域名白名单确认） | 未开工 |
| C-21 | 企业实名与用章权限 | 企业核验供应商 + 审核流 + 权限模型 | 未开工（含外部资质） |
| C-22 | 入站幂等键 | 后端签署接口接受 `Idempotency-Key` + 缓存层；三端提交键 | 未开工 |

---

## 3. 待你决策

1. **正常签署页是否展示发起方联系人入口**
   已实测事实：后端对有效 token 已返回 `initiator_name`（本轮实测 `经**明`，`initiator_phone_masked` 为空）；但 Web **正常签署页不渲染发起方联系人卡**，该卡只存在于 `StatusViews` 的 `FailView` / `DeclinedView`。另外链接过期（410）时 `doc` 为 null，失败页同样拿不到发起方信息。
   需要你定：A）正常签署页也加一张轻量联系卡（前端小改）；B）保持现状（只在失败/拒签态展示），但需补一条——410 时如何仍能拿到发起方信息（后端在 410 响应带字段，或失败页单独请求）。

2. **`.gitignore` 另外 11 条无前导斜杠规则是否收紧**
   已修：`contracts/` → `/contracts/`（否则 `frontend-web/src/pages/Contracts/` 下的新组件被静默忽略）。
   仍无前导斜杠、会被 git 解释为「匹配任意层级同名目录」的项目自有目录规则共 11 条：`env/`、`ENV/`、`secrets/`、`sign-engine/`、`contract-templates/`、`logs/`、`tmp/`、`_tmp_old/`、`anthropics-skills/`、`ui-ux-pro-max-skill/`、`taste-skill/`。
   是否统一加前导斜杠（只匹配仓库根目录），需要你拍板；不加也不会立刻出问题，但将来在子目录里创建同名目录会被忽略。

3. **是否补齐测试依赖让 e2e 能跑**
   已核实：`backend/.venv` 中 `fitz`（PyMuPDF）、`reportlab`、`pyhanko` **均未安装**；`backend/tests/test_contract_sign_flow_e2e.py` 直接 import 这些包且没有 skip 保护，当前跑必失败。Gotenberg 是外部服务（`GOTENBERG_URL` 未配则关闭 Office 转换）。
   需要你定：是否本轮补齐 Python 测试依赖；Gotenberg 是走本机容器还是继续留空。

---

## 4. 已改未实测

| 项 | 为什么没测到 |
|---|---|
| 跨页定位（Web 清单点第 2/3 页、App 翻页） | 当前可签合同均只有 1 页（`157586c…` 1 个字段；`8fb525be…` 2 个字段但同在第 1 页），没有跨页数据 |
| 「未轮到」（`can_sign_now === false`） | 测试合同为单签署方，sequential 下 `_can_sign_now` 恒为 true；无多签署方顺序数据 |
| 「链接无效」（`noContract` / 404 token） | 只构造过「已过期」（410），未构造无效 token 的页面态 |
| 已签字段不渲染成可点框 | 代码已按 `signed || covered → 不渲染` 实现，但当前签署方没有已签字段，运行态无法观察 |
| 小程序全端（清单、抽屉、高亮、原因提示） | 本环境无微信开发者工具，无法运行 Taro 小程序；仅有 `tsc` 与静态核对，不算实测 |
| 投递记录与人工重投（`CallbackModal`） | 未用真实回调地址发起过投递，`GET /callbacks` 记录与 `POST /callback/retry` 未在界面走通 |
| 串行序号校验（`SignOrderModal`） | 未在浏览器提交过 sign-order 表单（测试期间只直接改过数据库） |
| 订阅全空提示（`CallbackModal`） | 未打开过「零订阅」合同的弹窗 |
| C-04「建议重签」提示 | 需要 `signature_health === 'invalid'` 的已签件数据，未构造 |
| App 390 宽度小屏布局（抽屉、画布不被挤压） | 浏览器实测在桌面宽度下进行（宽屏内联清单），未按 390 宽度跑窄屏 |
| 统计三态（加载骨架 / 失败重试 / 空数据） | 只做了实现与静态核对，未逐一构造三种数据态 |
| App / 小程序「未实名」「未轮到」两档定位动作 | 与上同理：单签署方且绑定邮箱由后端内部认证，无对应可复现数据 |

已实测通过（供对照）：App 清单渲染、点击高亮（约 2 秒消失，定时 1.4s）、未放章提示与点击打开清单、过期提示切换；Web 正常签署页加载、无发起方联系人卡、未放章提示。

---

## 5. 提交前必须注意

### 5.1 关键提醒

- **`.gitignore` 必须和 4 个新组件一起提交**。`contracts/` 已改为 `/contracts/`；若只提交组件不改 `.gitignore`，`git status` 里它们会再次消失（被静默忽略），上线后 `Contracts/index.tsx` 又会引用不到组件。
- 新增的 4 个组件目前是**未跟踪文件**（`??`），`git add` 时需要显式加入。
- 三端 i18n 都要提交，否则会出现未翻译 key。

### 5.2 本轮电子签相关 · 已修改（tracked，`M`）

后端与配置：
- `.gitignore`
- `backend/app/api/v1/contract_sign_public.py`
- `backend/app/api/v1/contracts.py`
- `backend/app/main.py`

Web：
- `frontend-web/src/i18n/locales/zh.ts`、`en.ts`、`th.ts`
- `frontend-web/src/pages/Contracts/index.tsx`、`ContractDetailCard.tsx`、`ContractList.tsx`、`contractTypes.ts`、`contracts.css`
- `frontend-web/src/pages/Contracts/hooks/useContractDetail.ts`、`useContractList.ts`
- `frontend-web/src/pages/Sign/index.tsx`、`sign.css`、`types.ts`、`utils.ts`
- `frontend-web/src/pages/Sign/components/DocumentPanel.tsx`、`SignFieldBox.tsx`、`SignerAside.tsx`、`StatusViews.tsx`

App / 小程序：
- `mobile-app/src/screens/contracts/MyContractsScreen.tsx`
- `mobile-app/src/screens/contracts/contracts/styles.ts`
- `mobile-app/src/i18n/index.ts`
- `miniapp/src/pages/tenant/my-contracts/index.tsx`
- `miniapp/src/pages/tenant/my-contracts/index.scss`
- `miniapp/src/i18n/index.ts`

### 5.3 本轮电子签相关 · 未跟踪新文件（`??`，共 8 个 + 本文档）

- `backend/app/services/contract_privacy.py`
- `backend/tests/test_contract_privacy.py`
- `frontend-web/src/pages/Contracts/ContractStatsBar.tsx`
- `frontend-web/src/pages/Contracts/SignOrderModal.tsx`
- `frontend-web/src/pages/Contracts/CallbackModal.tsx`
- `frontend-web/src/pages/Contracts/ShareLinkQrModal.tsx`
- `docs/e-sign-change-proposal.md`
- `docs/e-sign-gap-analysis.md`
- `docs/e-sign-open-items.md`（本文档）

### 5.4 工作区里同时存在、但不属于本轮电子签的改动（同为 `M`，提交前请确认是否要一起提交）

`mobile-app/src/` 下：`components/ListingsFeed.tsx`、`theme/colors.ts`、`theme/filterStyles.ts`、`screens/admin/{AdminUsers,AttendanceManage,CRM,CommissionRules,DataScopes,Home,Leases,Payments,ProjectCreate,PropertyEdit}Screen.tsx`、`screens/attendance/AttendanceScreen.tsx`、`screens/employee/CRMScreen.tsx`、`screens/owner/{Income,Properties}Screen.tsx`、`screens/public/{PublicFilterChip,PublicListingsScreen}.tsx`、`screens/tenant/{Documents,Maintenance,Payments,PropertyDetail}Screen.tsx`。

这些改动与本轮电子签改造无关（不在本清单的验收范围内），是否随本次提交由你决定。

---

## 6. 数据库与环境状态

### 6.1 本轮对 `backend/rental.db` 的改动（非代码，不随 git 带走）

- 删除测试期间误建的草稿合同 1 份，合同总数回到 **14**。
- 合同 `8fb525be…` 签署方「吕逸俊」残留的 `sign_order` 归 **0**（该合同 `sign_order_type` 仍为 `parallel`）。
- 测试期间临时改过、**已全部还原**的字段（合同 `157586c…`）：
  - `contracts.status`：`sent` → 还原为 `draft`
  - `contracts.expires_at`：临时改为过去时间（用于验证过期提示）→ 还原为 `NULL`
  - `contract_parties(d3890150…).email`：临时改为 `tenant@viprental.com` → 还原为 `''`
  - `contract_parties(d3890150…).sign_token_expires_at`：临时延长 → 还原为原值 `2026-10-22 10:00:00.011133`
  - `signed` / `declined_at` 全程未改动
- 复核结果：合同总数 14；`157586c…` = `draft` / `expires_at` 空 / 签署方 email 空、`sign_order` 空、未签未拒；`8fb525be…` = `draft` / `parallel` / 签署方 `sign_order = 0`。

### 6.2 不会随 git 带走的其它非代码变更

- `backend/rental.db` 本身（`.gitignore` 有 `*.db`）。
- `backend/.venv/` 里安装的依赖（qrcode、Pillow 等；`.gitignore` 有 `.venv/`）。
- `backend/uploads/`（签名图、合同文件等运行时产物，已被忽略）。
- `node_modules/`、Expo/Vite 缓存等。

### 6.3 当前在跑的端口实例（2026-11-12 实测可达）

| 端口 | 实例 | 说明 |
|---|---|---|
| 3000 | Vite 前端开发服务器 | `rental-web`；`vite.config.ts` 里 `/api` 代理到 `http://localhost:8000` |
| 8000 | uvicorn —— 房地产租赁管理系统 API 1.0.0 | Vite 代理目标；公开签署接口实测 200 |
| 8001 | uvicorn —— 同一 API 1.0.0（第二个实例） | 本轮启动自检日志出自该实例；公开签署接口实测与 8000 一致 |
| 8081 | Expo web（App 实测环境） | 本轮 App 实测入口（`npx expo start --port 8081`） |

数据库配置：`backend/.env` 为 `DATABASE_URL=sqlite:///./rental.db`，相对启动目录；仓库内只有 `backend/rental.db` 一个库文件。
