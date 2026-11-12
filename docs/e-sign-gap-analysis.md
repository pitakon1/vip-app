# 以开放签为参照：电子签「功能 / 前端体验 / 前后端交互」三层对比

| 项 | 内容 |
|---|---|
| 分析对象 | 本仓库 `e:\work\app\vip app` 的电子签模块（Web / App / 小程序 / FastAPI 后端） |
| 参照对象 | 开放签（kaifangqian），官方仓库 `kaifangqian/kaifangqian-base`，官方文档站 `docs.kaifangqian.com` |
| 分析目的 | 把开放签当产品样本，找出我方在**功能闭环、界面结构、交互设计、接口契约**上可以直接改进的地方 |
| 资料检索时间 | 2026-11-12 |
| 分析方式 | 只读：读代码 + 读官方文档；未 clone、未新增依赖、未改业务代码、未提交 git |
| 证据口径 | 开放签侧标 `docs:页面名` / `README` / `价格页`；我方侧标文件路径与函数名。仓库与文档没写的写「仓库未说明」，不做推测 |

> 关于「截图位置」：本仓库没有可引用的界面截图资产，下文统一用「页面 → 区块 → 控件」的定位方式代替截图坐标，例如「合同管理页 → 列表上方左侧「生成合同」卡 → 模板切换」。

---

## 0. 结论先行

1. **功能「有没有」不是主要差距，步骤「摆不摆到界面上」才是。** 开放签把一次签约拆成 8 个明确环节、把签署位置设置做成独立一步、把签署页做成「左控件 / 中文件 / 右参数」的三栏工作台；我方功能大多存在，但埋在弹窗和一屏里，用户不知道下一步干什么。
2. **最值得抄的是三件事**：发起侧的多步向导、位置设置的三栏布局、签署页的「检查清单 + 进度反馈」。这三件事都不需要换技术栈，也不需要新增后端能力。
3. **我方有两处比开放签更细**：撤回与作废分离（`/revoke` 与 `/void` 语义不同），以及逐字段签署 + 字段级完成态。这两点应保留，不要为了「对齐」退回去。
4. **真正不能靠界面补齐的只有一条链**：实名核验、可信 CA、可信时间戳、意愿校验。开放签这部分在闭源「云盾」里，界面照抄没有意义（见第 6 节）。
5. **交互层最明显的缺口**：签署定位参数是「前端算百分比 → 后端按百分比换算 PDF 点」，缺少开放签那种「页序 + 归一化偏移 + 关键字」的统一参数；回调事件只有 4 个（开放签 13 个）；错误只靠英文 `detail` 字符串传递，App 端未做映射。

---

## 1. 参照物与我方模块速览

### 1.1 开放签的产品形态（只保留与体验相关的部分）

- **仓库**：`https://github.com/kaifangqian/kaifangqian-base`，AGPL-3.0，Vue3 + Vite 前端、Java/Spring Boot 后端，前端拆成 5 个子应用：`opensign-manage`（管理后台）、`opensign-message`（消息）、`opensign-mobile`（移动端）、`opensign-tenant`（租户）、`opensign-web`（签署主应用）。（`README-代码结构`）
- **核心概念**：业务线 → 合同 → 签署方（可多节点）→ 签署位置（控件）→ 签署流程（9 态）→ 回调事件。
- **三种签署方式**由发起方在发起时选择：CA 数字证书（有法律效力）/ 平台防篡改证书（无）/ 合成签名印章图片（无）。（`docs:发起签署流程`）
- **法律效力相关能力**（实名、CA、时间戳、人脸、短信）预集成在闭源「云盾」中，价格页 FAQ 明确「不可以」自行替换第三方。（`价格页`）

### 1.2 我方对应模块（本次对比的事实来源）

| 层 | 位置 | 说明 |
|---|---|---|
| 合同模型与状态 | `backend/app/models/contract.py` | 9 个状态、`ContractParty`（含 `sign_order` / `sign_token` / `declined_at` / 实名字段）、签署区字段模型 |
| 合同主接口 | `backend/app/api/v1/contracts.py` | 51 个路由：生成、模板库、上传、转换、签署方、签署区、顺序、发送、催办、撤回、作废、拒签、批量签、验签、存证报告等 |
| 免登录签署接口 | `backend/app/api/v1/contract_sign_public.py` | 11 个路由：签署页数据、原文件、页图、验签、发码、实名、意愿码、拒签、提交签署、匿名制章预览 |
| 签章引擎 | `backend/app/services/kaifang_sign_service.py` | 自签 CA、增量 PKCS#7、文字/印章渲染、关键字检索、骑缝章、验签 |
| 模板与合同渲染 | `backend/app/services/esign_service.py` | 三套内置模板、HTML 渲染、全文哈希、HMAC、SVG 签名/公章 |
| 回调 / 通知 / 过期 | `backend/app/services/contract_jobs.py` | 出站 webhook、重投、站内 + 邮件通知、过期扫描 |
| 审计 | `backend/app/services/contract_audit.py` | 创建/发送/续期/签署/拒签/作废/撤回/换链/催办/代签/下载等动作 |
| 文件转换 | `backend/app/services/pdf_convert.py` | PDF 原样、图片转单页、Office 走 Gotenberg（默认关闭） |
| Web 端 | `frontend-web/src/pages/Contracts/`、`frontend-web/src/pages/Tenant/Contracts.tsx`、`frontend-web/src/pages/Sign/` | 三个电子签页面：`/contracts` 管理页、`/tenant/contracts` 租户合同页、`/sign/:token` 签署页（`frontend-web/src/App.tsx` L182/L250、`routes/publicRoutes.tsx` L60） |
| App 端 | `mobile-app/src/screens/contracts/ContractsScreen.tsx` | 管理页 + 列表/详情/生成/追加签署方/作废/拒签/验签/签署工作台等弹窗 |
| 小程序端 | `miniapp/src/pages/staff/contract/index.tsx`、`miniapp/src/pages/tenant/my-contracts/index.tsx` | 员工签署页自带拖拽落章与位置/关键字双模式；租户端只有合同列表 |

---

## 2. 功能层对比

### 2.1 业务闭环：角色 × 环节

开放签的角色来自 `docs:发起签署流程`、`docs:企业版1.0版本功能`；我方角色来自 `ContractParty.role`、`require_employee` 等权限依赖。

| 环节 \ 角色 | 发起方（业务员） | 经办人 | 审批人 | 签署方（个人） | 签署方（企业） | 外部联系人 | 管理员 |
|---|---|---|---|---|---|---|---|
| 开放签 | 选业务线、传文件、加签署方、设位置、发起 | 代表企业签字 + 组织签章（一个企业节点最多 1 经办 + 1 组织章） | 有「个人审批」节点（`SUBMIT_APPROVE` / `REFUSAL_APPROVE`） | 链接登录、实名、拖控件、设置签名、意愿验证 | PC 端选企业章，需企业实名 + 个人实名 + 用章权限 | 以「外部个人 / 外部企业」直接加入签署方，无需注册 | 业务线、模板、企业认证审核、证书/印章管理、租户与权限 |
| 我方 | 合同管理页生成或上传、追加签署方、放置签署区、设顺序、发送 | 无独立「经办人」语义，签署方就是签署方 | **无审批节点** | 免登录令牌页或站内页签署 | 无企业实名，企业章由员工在印章库自建 | 令牌链接免登录签署（`sign_token`） | 员工权限 + 印章库；无企业认证审核 |

**结论**：闭环主干齐了，缺的是两端——**发起前的「填写/审批」节点**和**企业主体的准入审核**。

### 2.2 逐项对比（统一四段式）

标注口径：**【我们没有】** = 完全缺失；**【我们有但简化】** = 有对应物但少了关键约束或步骤；**【我们更细】** = 我方做得比开放签细；**【基本对齐】**。

#### 2.2.1 模板管理与变量

- **开放签怎么做**：「自定义签署文档模板，签署过程可使用模板完成多方填写和确认」，并配合「业务线」区分场景。（`README-核心功能`）文档未说明模板设计器的具体交互。
- **我们现在怎么做**：`ContractTemplate` / `ContractTemplateVersion` 模板库，支持 `fields + clauses + {{key}}` 替换与版本快照，接口在 `backend/app/api/v1/contracts.py` 的 `/template-library*`（L811–L1073）。但 Web 端没有独立模板页，生成卡只消费 `/templates` 返回的三套内置模板（`frontend-web/src/pages/Contracts/GenerateContractCard.tsx`）。
- **差在哪**：变量与版本能力在，**但没有「管理模板」的界面**；没有 DOCX 导入，也没有可视化设计器；模板改动只能走接口。
- **建议**：补一个「模板」页（列表 + 版本 + 预览 + 从 DOCX 导入），复用现有 `template-library` 接口。标注：**【我们有但简化】**。

#### 2.2.2 发起方式

- **开放签怎么做**：固定 9 个环节（不含最后的「发起」动作）：业务线 → 基本信息（编号、主题自动生成，签署截止日期）→ 上传 PDF（≤30MB）→ 附件（≤10 个，单个 ≤20MB）→ 添加签署方（外部个人/外部企业，多节点）→ 抄送方 → 签署方式（三选一）→ 签署位置设置 → 发起方填写 → 发起。（`docs:发起签署流程`）
- **我们现在怎么做**：两条入口——「生成合同」（模板 + 字段 + 语言）与「上传合同」（先 `/generate` 建记录再 `/upload` 挂文件，见 `frontend-web/src/pages/Contracts/hooks/useContractUpload.ts`），随后在详情卡里追加签署方（`/parties`）、放置签署区（`/sign-fields`）、设顺序（`/sign-order`）、发送（`/send`）。
- **差在哪**：① 没有「业务线」概念，场景靠模板 kind 区分；② 没有附件与抄送方；③ 没有发起方填写节点；④ 入口是「两张并列卡片 + 一串弹窗」，不是一条流水线。
- **建议**：保留两种入口，但在入口后接一条**三步向导**（文件 → 签署方 → 位置/发送），把现有弹窗内容搬进步骤里。标注：**【我们有但简化】**。

#### 2.2.3 个人实名认证

- **开放签怎么做**：公安部门实名认证锁定身份（`README-核心功能`），并提供实名数据推送接口用于预填（`API:个人实名认证数据推送`）。
- **我们现在怎么做**：`POST /public/contract-sign/{token}/verify-identity`（`backend/app/api/v1/contract_sign_public.py` L464）只校验姓名格式 + 18 位身份证正则 + 邮箱/短信 OTP；通过后写 `real_name_verified_at` 与证件号 SHA-256。未实名签署返回 403 `REAL_NAME_REQUIRED`（同文件 L636）。
- **差在哪**：这是「自填 + 可达性验证」，**不是实名认证**；知道手机号即可冒用他人姓名与证件号。另外 `ContractParty.id_number` 仍是明文字段（`backend/app/models/contract.py`）。
- **建议**：接权威二/三要素或证件 OCR + 活体；证件号改为加密存储；签署页把「实名状态」做成可见的检查项。标注：**【我们没有】**。

#### 2.2.4 企业实名认证

- **开放签怎么做**：提交企业实名信息后由「运营管理端进行信息审核」，平台侧管理企业证书；企业印章有全生命周期与三权分立（管理权/使用权/审计权）。（`docs:企业版1.0版本功能`、`README-核心功能`）
- **我们现在怎么做**：`backend/app/api/v1/sign_assets.py` 支持 `scope=company` + `seal_type`（公章/合同章/法人章），员工可创建任意公司名印章；**没有营业执照核验、没有对公验证、没有审核流**。
- **差在哪**：企业章可以「凭空造」。对内是权限漏洞，对外是伪造印章风险；代签授权只约束「谁代谁」，约束不了「章是否属于该公司」。
- **建议**：最小版=企业资料 + 管理员审核 + 印章启用审批；界面补「企业认证」入口与状态。标注：**【我们没有】**。

#### 2.2.5 意愿认证

- **开放签怎么做**：签署密码、验证码、双重验证（验证码 + 密码）、人脸识别四选一，**由发起方在发起时设定**；不同方式对应不同计费档。（`docs:合同填写与签署环节常见问题`、`价格页`）
- **我们现在怎么做**：`submit_signature` 中「只有客户端主动传 `code` 才校验」（`backend/app/api/v1/contract_sign_public.py` L639–L643）；站内 `_verify_sign_intent` 同样是「未传 code 直接 return」（`contracts.py` L2487–L2501）。小程序端注释写明「签署意愿验证已下线，不再传 code」（`miniapp/src/services/api.ts` L441）；App 端 `sign-batch` 注释写「无需意愿验证码」，但 `sign` 的注释又称「须带 code」，**与后端实现不一致，以代码为准**（`mobile-app/src/services/api.ts` L334/L340）。无人脸、无签署密码。
- **差在哪**：意愿认证实际是「可选、默认关」。纠纷时无法证明是本人操作；而且**发起方无法选择**验证方式。
- **建议**：把「意愿验证方式」做成合同级字段（发起时选），签署页展示并要求完成；至少默认短信 OTP。标注：**【我们有但简化】**。

#### 2.2.6 签署方式与印章

- **开放签怎么做**：手写、印章、印模；骑缝章作为控件，点击后选「批量应用」，再设置应用文件与签署位置（`docs:合同填写与签署环节常见问题`）；企业章全生命周期 + 三权分立。
- **我们现在怎么做**：`signature / hand_stamp / seal / date` 四类签署区（`backend/app/models/contract.py`）；手写画布（Web `frontend-web/src/pages/Sign/`、App `mobile-app/src/components/SignaturePad.tsx`、小程序画布）；印章库与印模抠图（`sign_assets.py`）；骑缝章 `apply_seam_seal`（`backend/app/services/kaifang_sign_service.py` L537）。
- **差在哪**：骑缝章**单页不做、PDF 已有数字签名时直接跳过**，所以上传件、已签件盖不了；没有「控件 → 批量应用 → 选文件/位置」这套交互。
- **建议**：把骑缝章从「生成合同时自动加」改成「位置设置里的一种控件」，支持选页范围与批量应用。标注：**【我们有但简化】**。

#### 2.2.7 多方 / 顺序签署

- **开放签怎么做**：单方、顺序、并行、批量、自动五种模式；节点类型区分个人签字 / 经办人签字 / 法人签字 / 企业签章 / 个人审批。（`README-核心特性`、`docs:回调通知服务`）
- **我们现在怎么做**：`parallel / sequential` + `party.sign_order`；`_can_sign_now` 与 `_ensure_sign_turn` 严格拦截，返回 409 `NOT_YOUR_TURN`；`POST /contracts/{id}/sign-order` 配置；公开签署页返回 `can_sign_now`（`backend/app/api/v1/contracts.py`、`contract_sign_public.py`）。
- **差在哪**：顺序控制对齐；缺「经办人 / 法人 / 审批人」这种角色化节点语义。租赁/买卖/经纪场景暂时用不上。
- **建议**：暂不补角色节点，但在签署方卡片上把「第 N 顺位 / 等待中」表达清楚（现状已有徽标，可增强）。标注：**【基本对齐】**。

#### 2.2.8 撤回 / 作废 / 拒签

- **开放签怎么做**：撤销流程（立即停止、不可再签）、结束流程（不可追加、不可撤销）、拒签（终止且不可恢复）；对应回调 `RECALLED` / `REFUSAL_SIGN` / `REFUSAL_WRITE`。（`API:撤销签署流程`、`docs:企业签署操作指南(PC端)`）
- **我们现在怎么做**：`/void` 作废、`/revoke` 撤回（旧链接失效、通知未签方、写回调）、`/decline` 拒签（记录原因，无剩余未签方则 `rejected`），全部写审计（`contracts.py`、`contract_audit.py`）。
- **差在哪**：**我方更细**——开放签把「撤销」和「结束」分开，我方把「作废」和「撤回」分开，语义同样清晰，且审计动作更多。
- **建议**：保留，不改。标注：**【我们更细】**。

#### 2.2.9 批量

- **开放签怎么做**：批量签署、自动签署、批量下载。（`README-核心特性`、`docs:2.0.5版本更新`）
- **我们现在怎么做**：`/sign-batch` 与公开端 `items[]` 是「单合同内多字段原子提交」（`contracts.py` L3432、`contract_sign_public.py` L655–L699）；没有跨合同的批量签署或批量下载任务。
- **差在哪**：「批量」指的是同一件事的两种含义，我方只覆盖了「一次签多个位置」。
- **建议**：暂不补跨合同批量（业务量未到）；但列表页可加多选 + 批量导出已签件。标注：**【我们有但简化】**。

#### 2.2.10 归档与检索

- **开放签怎么做**：全流程操作记录可追溯，操作日志与原文哈希实时保全（`docs:2.0.5版本更新`）；合同列表/查询的具体筛选维度文档未说明。
- **我们现在怎么做**：`GET /contracts` 列表 + `/stats` 统计；列表只有标题/来源/语言/状态/操作五列（`frontend-web/src/pages/Contracts/ContractList.tsx`），没有筛选器、没有全文检索、没有归档分区。
- **差在哪**：合同一多就找不到；没有「按签署方 / 时间 / 状态 / 关键词」的检索入口。
- **建议**：列表上方加一行筛选（状态、时间范围、签署方、关键字），后端 `GET /contracts` 扩参数即可。标注：**【我们有但简化】**。

#### 2.2.11 存证出证与验签

- **开放签怎么做**：签署完成自动生成《电子文件签署记录报告》，含文件基本信息、签署流程、签署主体认证信息、有效性验证；用户端「文档验签」可验证是否篡改并展示签章与证书信息。（`docs:2.0.5版本更新`、`docs:企业版1.0版本功能`）
- **我们现在怎么做**：`GET /contracts/{id}/evidence-report` 动态生成 PDF（合同信息、原文哈希复算、签署方、逐条签名留痕、PDF 内嵌签名验签、结论，见 `contracts.py` L4526 起）；`build_verify_report` 同时服务站内 `/verify` 与公开 `/{token}/verify`。
- **差在哪**：内容项接近，但**没有第三方锚点**（可信时间戳令牌、存证编号、司法链/公证）；报告本质是「系统自述」。另外所有签署方共用一把引擎证书（`sign_pdf` 固定 `signer=self.signer`），验签只能证明「文件没被改」，证明不了「是谁签的」。
- **建议**：报告附时间戳令牌与证书链，验签页展示证书主体；长期接第三方存证回写编号。标注：**【我们有但简化】**。

#### 2.2.12 通知与待办

- **开放签怎么做**：签署邀请、催办、过期等消息由消息子应用统一推送（`opensign-message`）；API 提供「获取待办任务」。（`README-代码结构`、`docs:API 快速入门`）
- **我们现在怎么做**：`notify_party` 只发「站内 + 邮件」两种通道（`backend/app/services/contract_jobs.py` L142–L202），无短信、无微信模板消息；签署方视角没有「待我签署」聚合接口，只有员工审核待办 `/review-center/todos`（聚合外勤/请假/报修/服务单/合同，`backend/app/api/v1/review_center.py` L101）。
- **差在哪**：外部签署方只能在邮件里找链接；没有「我的待签」入口。
- **建议**：补 `GET /contracts/my-pending`（按 `party.user_id` / 邮箱归属）+ 首页待办卡片；通知加短信通道。标注：**【我们有但简化】**。

#### 2.2.13 外部联系人与签署方管理

- **开放签怎么做**：签署方可直接添加为「外部个人 / 外部企业」，企业节点下挂经办人与组织签章，无需对方注册。（`docs:发起签署流程`）
- **我们现在怎么做**：`ContractParty` + 一次性 `sign_token` 免登录签署；支持追加签署方、换链、催办、代签授权（`/authorizations`）。
- **差在哪**：没有联系人簿（每次重填）、没有「企业节点 = 经办人 + 组织章」的结构。
- **建议**：加「常用签署方」快捷选择（存姓名/手机/邮箱），发起时一键带入。标注：**【我们有但简化】**。

### 2.3 功能层三类汇总

| 标注 | 项目 |
|---|---|
| **我们没有** | 个人权威实名、企业实名与审核、填写/审批节点、抄送方、附件 |
| **我们有但简化** | 模板管理界面、发起向导、意愿认证可配置、骑缝章批量应用、归档检索、第三方存证锚点、签署方待办、联系人簿、跨合同批量 |
| **我们更细** | 撤回/作废语义分离、逐字段签署与字段级完成态、审计动作粒度 |
| **基本对齐** | 顺序/并行签署、拒签、验签入口、批量多字段签署 |

---

## 3. 前端层对比

### 3.1 信息架构与导航

| 维度 | 开放签 | 我方 |
|---|---|---|
| 应用划分 | 5 个子应用：管理后台 / 消息 / 移动端 / 租户 / 签署主应用（`README-代码结构`） | Web 有 3 个电子签路由：`/contracts`（员工/管理）、`/tenant/contracts`（租户）、`/sign/:token`（公开签署）（`frontend-web/src/App.tsx`、`routes/publicRoutes.tsx`） |
| 一级入口 | 合同、模板、印章、签署记录、企业管理、应用管理 | 合同管理一个页面承担「生成 + 上传 + 统计 + 列表 + 详情 + 全部操作」 |
| 模板 | 独立模板管理 | 无独立页面，只有生成卡里的 Segmented |
| 印章 | 企业章库 + 生命周期 + 三权分立 | 弹窗 `SignAssetLibraryModal`（个人/企业 Segmented + 资产网格 + 上传） |
| 签署记录 | 独立签署记录页 | 合同列表的「状态」列 + 详情卡签署方网格 |

**差在哪**：我方是「一个页面装下所有事」，开放签是「按对象分页面」。前者的代价是新用户找不到入口，后者代价是页面多。对租赁业务，建议折中：**保留单页，但把「发起」抽成独立向导页**。

### 3.2 发起签署：开放签 9 环节 vs 我方「两卡 + 弹窗」

**开放签（PC，文档顺序）**
1. 业务线选择；
2. 基本信息：合同编号、合同主题（自动生成）、签署截止日期；
3. 上传签约文件：PDF ≤30MB；
4. 附件：≤10 个，单个 ≤20MB；
5. 添加签署方：外部个人 / 外部企业，可多节点；企业节点最多 1 经办人签字 + 1 组织签章；
6. 抄送方；
7. 签署方式：CA 数字证书 / 平台防篡改证书 / 合成签名印章图片，三选一并标注法律效力；
8. 签署位置设置：左「签署模式 + 签约方 + 控件列表」、中「文件（多文件下拉切换、拖拽落控件、点控件跳页定位）」、右「模板参数填写方」；
9. 发起方填写 → 发起。

> `docs:发起签署流程` 按环节描述，**未说明**这些环节是分屏向导还是同页分区；无论哪种，信息的出现顺序是固定的。

**我方（Web）**
页面：`frontend-web/src/pages/Contracts/index.tsx`
1. 顶部标题 + 副标题；
2. 左卡「生成合同」：模板 Segmented（3 个）→ 范本预览 → 字段表单（3 列网格）→ 语言下拉 → 「生成」按钮（`GenerateContractCard.tsx`）；
3. 右卡「上传合同」：选文件上传（`UploadContractCard.tsx`）；
4. 统计条（`ContractStatsBar`）；
5. 合同列表（5 列，`ContractList.tsx`）；
6. 点行 → 详情卡（签署方两列网格 + 行内按钮，`ContractDetailCard.tsx`）；
7. 依次打开弹窗：追加签署方 → 放置签署区（880px，`PlaceFieldsModal.tsx`）→ 设置顺序（`SignOrderModal`）→ 发送。

**差在哪**
- 开放签是「一条线往下走」，我方是「先建记录、再回列表、再进详情、再开弹窗」，**从进入到发出至少 7 步、跨 3 个弹窗**，且没有任何进度提示。
- 开放签把「签署方式（法律效力）」和「签署位置」作为发起的一等公民；我方「位置」藏在详情页弹窗里，「签署方式」干脆没有。
- 开放签有附件与抄送方；我方没有对应区域。

**建议改成什么样**
- 新增 `/contracts/new` 向导页，3 步：**① 文件**（生成 or 上传 + 附件）→ **② 签署方**（列表 + 添加 + 顺序）→ **③ 位置与发送**（左配置 / 中文件 / 右已放置列表 + 发送按钮）。
- 生成卡与上传卡保留为向导第 1 步的两种 Tab，不再平铺在列表页顶部。
- 每步底部固定「上一步 / 下一步」，最后一步显示「将发送给 N 位签署方」的确认摘要。

### 3.3 模板页

- **开放签**：模板是独立管理对象，配合业务线使用（`README-核心功能`）；设计器交互仓库未说明。
- **我方**：接口齐全（`/template-library` 增删改查、版本、生成），**Web 端完全没接**（grep `template-library` 在 `frontend-web/src` 无命中）；用户只能在生成卡里切换三套内置模板。
- **差在哪**：能力在后端，界面缺位。
- **建议**：模板页最小版=列表（名称/场景/版本/更新时间）+ 预览 + 「用此模板发起」；版本对比可后置。

### 3.4 印章页

- **开放签**：企业章全生命周期（新增、编辑、章面变更、停用、激活、收缴、销毁）+ 三权分立（`README-核心功能`、`docs:企业版1.0版本功能`）。
- **我方**：`SignAssetLibraryModal` 一个弹窗：顶部「个人/企业」Segmented（仅员工可见企业）→ 资产 3 列网格（缩略图 + 名称 + 类型/来源/章别 + 删除）→ 下方「新增」区（手写/印章 Segmented + 名称 + 上传/制作）。
- **差在哪**：没有「停用 / 启用 / 使用记录 / 谁有权用」；企业章和私人章混在同一视觉层级。
- **建议**：印章独立成页，按「企业章 / 个人签名」两个 Tab；每张章卡加状态徽标（启用/停用）与「最近使用」；企业章卡显示「有使用权的人」。

### 3.5 签署记录与签署详情

- **开放签**：独立签署记录页；完成后自动生成签署记录报告（`docs:2.0.5版本更新`）。
- **我方**：列表 5 列（标题含 hash 前缀 / 来源 / 语言 / 状态 / 操作），状态列叠加「已过期」「签章失败」「签名异常」三个徽标（`ContractList.tsx`）；详情卡是「标题 + 状态/串行/有效期徽标 → 风险警告条 → 签署方两列网格（姓名、已签/第 N 顺位/等待中、角色、邮箱电话、拒签原因、复制链接/二维码/换链/催办/拒签）→ 已签件下载 / 存证报告下载」（`ContractDetailCard.tsx`）。
- **差在哪**：**没有时间线**。开放签的报告把「签署流程」作为一节；我方审计数据在库里（`contract_audit.py`），但界面没展示成流程。
- **建议**：详情卡加「流程」区，纵向时间线：创建 → 发送 → 各签署方查看/签署/拒签 → 完成/作废；每条带时间、操作人、IP。数据现成，只需一个查询接口 + 一个列表组件。

### 3.6 PC 签署页：单屏工作台 vs 三栏工作台

**我方现状**（`frontend-web/src/pages/Sign/index.tsx`，193 行）
- 顶部：标题 + `v2` 角标 + 签署截止时间 + 串行等待提示；
- 主体 `kf-layout`：左文档区（`DocumentPanel.tsx`）+ 右托盘（`SignerAside.tsx`）；
- 右托盘三张卡：① 签署方信息（当前方 + 「待签署」徽标）② 组件托盘（印章 / 签名；未制作整行可点→弹制作窗；已制作可拖→落到文档；右侧小「重做/更换」）③ 拒签按钮；
- 文档区：上传件无 PDF 时 iframe；有 PDF 时「页码 + 上一页/下一页」工具栏 + 页图背景 + 预置签署区（`SignFieldBox`）+ 已落章（`PlacedBox`）+ 底部「拖拽落章」提示；HTML 合同直接渲染正文 + 字段；
- 底部：全宽提交按钮，`placed.length === 0 || waitingTurn` 时置灰；
- 状态视图：`LoadingView` / `FailView` / `DeclinedView` / `SuccessView`；
- 弹窗：`SignModal`、`SealModal`、`SealCropperModal`、`RealNameModal`（两步：发码/校验）、`DeclineModal`。

**开放签现状**（`docs:发起签署流程` 的位置设置 + `docs:企业签署操作指南(PC端)`）
- 三栏：左「签署模式 / 签约方 / 控件列表」，中「文件」，右「模板参数填写方」；
- 控件从左侧拖到文件上，点控件可跳转到所在页；
- 多文件用下拉切换；
- 签署模式三选一：必须签可新增 / 必须签不可新增 / 非必须签。

**差在哪**
- 我方缺「控件列表」这一栏——用户看不到「一共有几个章要盖、还剩几个」；
- 缺「点控件跳页」；
- 缺「签署模式」概念，无法表达「必须签但允许新增」；
- 提交按钮只有一个「置灰」状态，没有说明**为什么不能提交**。

**建议改成什么样**
- 右栏改三块：**签署方/顺位** → **待签控件清单**（类型 + 页码 + 状态 + 点击定位）→ **签章托盘**；拒签移到顶部次要位置。
- 底部提交按钮上方加一行状态文案：「还需放置 2 个签章（第 3 页公章、第 5 页签名）」，点击可逐项定位。
- 文档区工具栏加「控件页码下拉」，点清单项自动翻页并高亮。

### 3.7 移动端签署页

**开放签（手机端，`docs:个人签署操作指南` 口径）**
1. 打开链接 → 合同基本信息页；
2. 点【去查看】；
3. 手机验证码登录；
4. 选择个人 / 企业身份；
5. 实名检查（不通过则提示去认证）；
6. 拖拽签署控件、点控件设置手写签名；
7. 【提交签署】；
8. 意愿验证（密码 / 验证码 / 双重 / 人脸）；
9. 可【拒签】填原因，终止后不可恢复。

**我方**
- 小程序员工签署页 `miniapp/src/pages/staff/contract/index.tsx`：自带拖拽落框、位置/关键字双模式、印章/签名切换、逐字段签署；是四端里**最接近开放签**的签署页。
- App：`ContractsScreen` 里通过 `SignFieldStudio` + `SignMakeModal` 完成放置与签署（`mobile-app/src/screens/contracts/contracts/`）。
- 外部签署方：App 与小程序都把免登录签署页**托管到 Web**（`mobile-app/src/lib/api.ts`、`miniapp/src/lib/api.ts` 注释），点链接跳出 App。

**差在哪**
- 三端三套签署 UI（Web 单屏、小程序拖拽、App 弹窗内工作台），交互不一致；
- 外部签署人被迫离开 App/微信环境，微信内还可能触发外链限制；
- 没有开放签那种「身份 → 实名 → 签署 → 意愿」的显式步骤感。

**建议**
- 短期：小程序用 webview 内嵌 Web 签署页，App 同理；先把「跳浏览器」消掉。
- 中期：统一成一套「步骤条 + 文档 + 底部主按钮」的移动端签署页，复用小程序已有的拖拽逻辑。

### 3.8 签署控件交互

| 能力 | 开放签 | 我方 | 差距 |
|---|---|---|---|
| 拖拽落控件 | 支持（左栏拖到文件） | 支持（托盘拖到文档；小程序按下拖动） | 对齐 |
| 坐标定位 | 页序 + 归一化偏移（`docs:签署位置计算说明`） | 页序 + 页面百分比 `x/y/w/h`（`upsert_sign_fields`，`contracts.py` L1446–L1453） | 对齐，单位不同 |
| 关键字定位 | `keyword + offset` 一次请求 | 两步：`/keyword-search` 拿命中列表 → `/keyword-fields` 按 index 建字段（`contracts.py` L2610、L2637） | 我方多一次往返 |
| 骑缝章 | 控件 + 批量应用 + 选文件/位置 | 生成合同时自动加，单页不做、已签跳过（`apply_seam_seal`） | 交互缺失 |
| 控件列表 | 左栏有清单，可点定位 | 无清单，只有画布上的框 | 缺失 |
| 已签态 | 控件显示已签 | `SignFieldBox` / `PlaceFieldsModal` 显示 ✓ | 对齐 |

**建议**：把「关键字定位」合并成一个接口（传 keyword + party + type，直接返回创建好的字段），前端少一次往返；位置设置弹窗右栏补「已放置控件列表」。

### 3.9 状态表达、空态、失败态、引导

| 场景 | 开放签 | 我方 |
|---|---|---|
| 状态 | 9 态；完成后生成签署记录报告 | 9 态；列表状态列 + 三个叠加徽标（过期/签章失败/签名异常） |
| 串行等待 | 有节点顺序表达 | 有「第 N 顺位 / 等待中」徽标 + 签署页 `waitingTurn` 提示 |
| 空态 | 文档未说明 | `DataState`（loading / error / empty 三态，`frontend-web/src/components/DataState.tsx`） |
| 失败态 | 文档未说明 | 签署页 `FailView`；列表有 `sign_error` 徽标与 tooltip；后端 502 不推进状态 |
| 引导 | 实名不通过提示「去认证 / 申请权限」 | `RealNameModal` 两步引导；`REAL_NAME_REQUIRED` 触发重签 |

**差在哪**：我方空/错态做得不差，缺的是**「下一步做什么」的引导**——尤其签署页失败后只有一段错误文案，没有「重新获取链接 / 联系发起方 / 换设备打开」的出口。

**建议**：`FailView` 改成三选一行动卡（重新加载 / 联系发起方 / 下载合同），并显示失败原因码（如 `TOKEN_EXPIRED`）。

### 3.10 多端一致性

| 端 | 管理合同 | 放置签署区 | 签署 |
|---|---|---|---|
| Web | `/contracts` 单页 | `PlaceFieldsModal`（880px 弹窗，左配置 + 右文档） | `/sign/:token` 单屏 |
| App | `ContractsScreen` + 详情弹窗 | `SignFieldStudio` | 跳 Web |
| 小程序 | 员工 `staff/contract`、租户 `my-contracts` | 签署页内直接落框 | 员工页原生 / 外部跳 Web |

**差在哪**：同一件事三种布局。用户跨端会重新学习；截图/客服话术也无法统一。

**建议**：先统一「放置签署区」的视觉语言（左配置卡 + 中画布 + 底部主按钮），三端共用一套设计稿；签署页统一成「顶部步骤条 + 文档 + 底部主按钮」。

---

## 4. 前后端交互层对比

### 4.1 API 资源如何划分

| 资源 | 开放签（`docs:API 快速入门`） | 我方 |
|---|---|---|
| 业务线 | 有（列表/配置） | **无** |
| 合同 | 发起、详情、结束、撤销、下载 | `/contracts` 生成、列表、详情、改、上传、转换、发送、催办、作废、撤回 |
| 签署方 | 追加签署方（v3.2+） | `/{id}/parties`、`/{id}/authorizations`（代签授权） |
| 签署位置 | 随发起传入 / 位置设置 | `/{id}/sign-fields`（增删改）、`/keyword-search`、`/keyword-fields` |
| 文件/附件 | 上传签约文件、上传附件 | `/{id}/upload`、`/{id}/convert-pdf`；**无附件资源** |
| 短链 | 获取短链接 | `/{id}/share-link` |
| 待办 | 获取待办任务 | **无（签署方视角）**；只有员工 `/review-center/todos` |
| 回调 | 13 事件 | `/{id}/callback`、`/callbacks`、`/callback/retry`、`/subscriptions` |
| 印章 | 企业章全生命周期 | `/sign-assets`（个人/企业、公章/合同章/法人章） |
| 验签 | 用户端验签，公开 API 未列出 | `/{id}/verify`、公开 `/{token}/verify` |
| 模板 | 模板 + 业务线 | `/templates`、`/template-library*`（含版本与生成） |

**结论**：资源粒度基本对得上，缺三类：**附件、业务线、签署方待办**。

### 4.2 状态机

| 开放签 | 我方 | 差异 |
|---|---|---|
| `DRAFT` | `draft` | 对齐 |
| `WRITING` / `REFUSAL_WRITE` | — | **缺「填写」阶段** |
| `SIGNING` | `sent` + `partially_signed` | 我方把签署中拆成「已发未签」与「部分已签」，更利于列表表达 |
| `REFUSAL_SIGN` | `rejected` | 对齐 |
| `RECALLED` | `revoked` | 对齐（我方另有 `voided` 作废） |
| `EXPIRED` | `expired` | 对齐 |
| `COMPLETE` | `signed` / `completed` | **语义重复**：代码里「全部签完」写 `signed`（`contracts.py` L3150–L3152），`completed` 只在终态集合与查询里出现，未见写入路径 |
| `DELETED` | `deleted_at` 软删 | 实现方式不同，不影响体验 |

**建议**：合并 `signed` / `completed`（或明确 `completed` = 已归档），否则前端状态徽标会长期存在两种「已完成」。

### 4.3 为什么用回调而不是轮询

- **开放签**：13 个事件（`SEND_SIGNING / SUBMIT_WRITE / REFUSAL_WRITE / SUBMIT_SIGN / REFUSAL_SIGN / SUBMIT_APPROVE / REFUSAL_APPROVE / RECALLED / DELETE / COMPLETE / EXPIRED / SIGN_FAILED / DOCUMENT_DELAY`）；POST JSON；成功必须返回字符串 `"success"`；失败**立即重试 3 次**，之后按 **30 分钟 / 2 小时 / 24 小时**退避，24 小时后不再推送。（`docs:回调通知服务`）
- **我方**：`emit` + `attempt_callback`（`backend/app/services/contract_jobs.py` L79–L135），事件只有 4 个：`contract.signed / voided / revoked / expired`；HMAC `X-Contract-Signature` + `X-Idempotency-Key`；退避 **30 秒 / 2 分钟 / 10 分钟**，最多 4 次；支持多订阅、人工重投、投递记录落库。

**差在哪**
1. 事件粒度太粗：缺「单方已签」「单方拒签」「签署失败」「文档延迟」——外部系统无法做过程态展示，只能等最终态。
2. 重试窗口太短（10 分钟内 4 次），对方系统夜间维护时容易丢事件。
3. 开放签要求返回 `"success"` 字符串，我方按 HTTP 2xx 判定；对外文档要写清楚，否则对接方返回 200 空体也算成功。

**建议**：补 `contract.party_signed`、`contract.party_declined`、`contract.sign_failed`；退避改成 30 秒 / 5 分钟 / 30 分钟 / 2 小时 / 6 小时；对外文档注明「2xx 且响应体为 `{"ok":true}`」或直接对齐开放签的 `"success"` 约定。

### 4.4 签署定位参数怎么传

| 项 | 开放签（`docs:签署位置计算说明`） | 我方 |
|---|---|---|
| 坐标 | `pageConfig + offsetX/offsetY`，**归一化 0–1** | `page + x/y/w/h`，**页面百分比 0–100**（`upsert_sign_fields`） |
| 关键字 | `keyword + offsetX/offsetY`，一次调用完成定位 | `POST /keyword-search` 返回命中列表 → `POST /keyword-fields` 传 `index` 建字段 |
| 页序 | 从 1 开始 | 从 1 开始（`page = max(1, ...)`） |
| 尺寸兜底 | 文档未说明 | 缺省/0 时 `w=20, h=8`（`contracts.py` L1450–L1453），避免 0×0 隐形框 |
| 坐标系翻转 | 文档未说明 | 引擎把百分比换算成 PDF 点并做 y 轴翻转（`backend/app/services/kaifang_sign_service.py` → `sign_pdf`，L434–L439）；旋转页直接报错 |

**差在哪**：归一化 vs 百分号只是单位差异，不算问题；真正的问题是**关键字定位要两次往返**，且第二次失败时前端已经离开搜索态，用户看不到命中列表。

**建议**：新增 `POST /contracts/{id}/sign-fields/from-keyword`，一次完成「搜索 + 建字段」，返回新字段与新列表；旧接口保留兼容。

### 4.5 文件上传与转 PDF

- **开放签**：签约文件**仅 PDF，≤30MB**；附件支持 doc/docx/wps/jpg/png/pdf/xls/xlsx/zip/rar，≤20MB；2.0.5 起支持非 A4 与缩放。（`docs:API 快速入门`、`docs:2.0.5版本更新`）
- **我方**：`backend/app/services/pdf_convert.py` — PDF 原样；图片用 reportlab 转单页；doc/docx/xls/xlsx 走 Gotenberg（`GOTENBERG_URL` 默认空=关闭）；无 OFD。
- **差在哪**：默认配置下 Word/Excel **上传成功但签不了**（没有 PDF 可落章，只能走签名留痕）；上传与转换是两个接口（`/upload` 后还有 `/convert-pdf`），前端要自己串。
- **建议**：① `/upload` 内部自动触发转换并在响应里返回 `pdf_ready`；② 转换失败时上传接口直接返回可读错误，而不是「上传成功、后面才发现」；③ 生产把 `GOTENBERG_URL` 列为部署必配项。

### 4.6 幂等与重复提交

- **我方现状**：合同行锁 `_lock_contract_row`（`contracts.py` L2917，PostgreSQL `SELECT ... FOR UPDATE`）+ 锁内复核 `_assert_party_unsigned`（L2936）；同一签署方重复提交返回 409 `Party already signed`；出站回调带 `X-Idempotency-Key`。
- **缺什么**：**入站接口没有幂等键**。公开 `POST /{token}` 在网络重试/用户连点时，只能靠「已签」状态兜底；如果第一次成功但响应丢失，第二次会拿到 409，前端无法区分「已成功」与「真的冲突」。
- **建议**：公开签署与站内签署接受可选 `Idempotency-Key` 请求头，服务端缓存「键 → 上次响应」，重复请求直接回放；前端提交时生成一次键并在重试时复用。
- **粒度不一致（同一件事不同端做法不同）**：Web 免登录签署页收集全部落框后，用 `items[]` 一次原子提交（`frontend-web/src/pages/Sign/hooks/useSignSubmit.ts` L70–L99）；小程序员工签署页是「点一个框、签一个框」，每个字段发一次 `contractsApi.sign`（`miniapp/src/pages/staff/contract/index.tsx` L154–L166）。结果是同一份合同在 Web 上只产生 1 次 PDF 修订，在小程序上产生 N 次，中间还会短暂出现「部分已签」状态。建议小程序也改成「先收集、后一次 `sign-batch`」。

### 4.7 错误码与失败提示怎么落到界面

- **我方现状**：后端全部用 `HTTPException(status_code, detail="英文句子")`，例如 `REAL_NAME_REQUIRED`、`NOT_YOUR_TURN`、`Party already signed`、`Invalid field_id`、`Contract PDF not found`。前端只在 Web 端对 `REAL_NAME_REQUIRED` 做了映射（`frontend-web/src/pages/Sign/hooks/useSignSubmit.ts` L121、`frontend-web/src/pages/Tenant/Contracts.tsx` L132、`frontend-web/src/pages/BrokerAgreements/index.tsx` L133），其余错误直接把英文透出；App 端 grep 不到任何 `REAL_NAME_REQUIRED` 处理。
- **差在哪**：没有稳定的机器可读错误码，界面无法给出「下一步动作」；中英文混杂。
- **建议**：响应体统一为 `{code, message, action, field}`，例如 `{code:"REAL_NAME_REQUIRED", action:"verify_identity"}`；前端按 `code` 决定弹哪个窗，`message` 只做兜底展示。

### 4.8 长流程如何做进度反馈

- **开放签**：发起是线性环节，签署是「控件完成度」驱动；文档未说明是否展示百分比进度。
- **我方**：签署页只有一个底部按钮，「没放章」和「没轮到你」都表现为置灰，没有文案；发送后没有「已通知 N 人 / M 人已签」的即时反馈，只能回列表刷新。
- **建议**：① 签署页底部按钮上方加「已完成 1/3 个签章」；② 发送后用现有 `stats` 接口轮询一次（或直接读响应）展示「已通知 2 人」；③ 长流程（批量签、转换 PDF）加 toast + 步骤文案，而不是转圈。

### 4.9 接口层面缺什么 / 哪些字段与顺序值得改

| 问题 | 现状 | 建议 |
|---|---|---|
| 缺「我的待签」 | 只能靠邮件链接 | 新增 `GET /contracts/my-pending`，按 `party.user_id` / 邮箱归属 |
| 缺附件资源 | 无 | `POST /contracts/{id}/attachments`（≤10 个、≤20MB） |
| 关键字两步走 | `/keyword-search` + `/keyword-fields` | 合并为一个接口 |
| 上传后不保证可签 | `/upload` 与 `/convert-pdf` 分离 | 上传接口返回 `pdf_ready` 与失败原因 |
| 事件粒度 | 4 个最终态 | 补单方签署/拒签/失败 |
| 错误不可编程 | 英文 `detail` | 加 `code` + `action` 字段 |
| 状态语义重复 | `signed` / `completed` | 合并或明确归档语义 |
| 签署方式不可选 | 无合同级字段 | 加 `intent_method`（otp / password / face / none），发起时设定 |
| 顺序字段 | `sign_order` + `sign_order_type` | 保持；补「第 N 顺位」在详情响应里直接给出 |
| 定位参数 | 百分比 0–100 | 保持；在 OpenAPI 里写明「页面百分比，原点左上」 |

---

## 5. 优先借鉴清单（按「改动成本低、体感提升明显」排序）

> 全部不涉及更换技术栈；只改前端编排与少量接口字段。

**P0（一次迭代内可做，纯前端或单接口）**
1. **签署页加「待签控件清单」**：右栏新增一张卡，列出类型 + 页码 + 状态，点击翻页并高亮；底部按钮上方显示「还需放置 N 个」。——只需把已有的 `sign_fields` 渲染成列表，`DocumentPanel` 已有 `onPageChange`。
2. **提交按钮给出原因**：把「置灰」改成「置灰 + 文案」（未放置 / 未轮到 / 未实名 / 合同已过期），点击时定位到问题项。
3. **签署失败页给出口**：`FailView` 改成三张行动卡（重新加载 / 联系发起方 / 下载合同），并显示原因码。
4. **合同详情加流程时间线**：用 `contract_audit` 的动作记录渲染纵向时间线，替换现在只有签署方网格的信息密度。
5. **列表页加筛选行**：状态、时间范围、签署方、关键字四个筛选，后端 `GET /contracts` 加参数。

**P1（需要新页面或接口小改）**
6. **发起改三步向导**：`/contracts/new` = 文件 → 签署方 → 位置与发送；复用现有 `GenerateContractCard` / `UploadContractCard` / `AddPartyModal` / `PlaceFieldsModal` 的内容。
7. **签署方式选择卡**：发起时选意愿验证方式（短信 / 密码 / 人脸 / 无），签署页展示并要求完成；后端加合同级字段。
8. **「我的待签」**：新增接口 + 首页待办卡；外部签署方也能看到自己所有待签合同。
9. **印章独立页**：企业章 / 个人签名两个 Tab，章卡带启用状态与最近使用时间。
10. **关键字定位一次完成**：合并搜索与建字段接口，减少一次往返和一次失败态。

**P2（体验加分，依赖后端或第三方）**
11. **小程序 / App 内嵌 Web 签署页**（webview），消除「跳浏览器」。
12. **骑缝章控件化**：位置设置里加「骑缝章」类型，支持选页范围与批量应用。
13. **多文件签署**：位置设置支持多文件下拉切换（开放签已有，我方一合同一文件）。
14. **签署记录报告升级**：附时间戳令牌、证书链、证书主体。

---

## 6. 受限说明（照抄形式没用的部分）

- **实名 / CA / 时间戳 / 人脸 / 短信**：开放签这五项预集成在闭源「云盾」里，价格页 FAQ 明确「不可以」自行替换第三方（`价格页`）。界面上的「实名检查」「意愿验证」可以照做，**背后的核验能力必须自己找供应商**；只抄弹窗不会提升法律效力。
- **「三种签署方式」的法律效力文案**：开放签能区分「CA 证书 = 有法律效力 / 平台防篡改 = 无 / 图片章 = 无」，是因为背后有对应证书体系。我方若只有自签 CA，照抄这段文案会构成误导。
- **企业实名人工审核**：这是运营流程 + 后台审核队列，不是前端组件；没有审核人和规则，界面做了也没用。
- **企业章三权分立**：依赖组织架构、角色权限与用章审批流；我方当前是「员工可建任意公司名印章」，先把权限收紧比做界面更重要。
- **13 个回调事件**：这是服务端契约，不能只抄事件名；每个事件都要有真实的触发点与幂等保证。
- **司法链 / 公证 / 第三方存证**：开放签仓库与文档均未说明是否对接（**仓库未说明**）；即使对接，也需要资质与商务合同，不是代码问题。

---

## 7. 备注：迁移 / 工作量 / AGPL（压缩，不作重点）

- 开放签是 Java + Vue 的 monorepo，整套替换意味着技术栈切换、模型映射、历史合同迁移（**仓库未说明**有批量导入能力），量级远大于界面改造；本报告不建议走这条路。
- 成本口径（`价格页`）：系统源码免费但签署按次计费（快捷/密码/短信 1 元/次，人脸 2 元/次，非实名防篡改 0.5 元/次，100 元起充）；闭源商用授权 5 万元起；部署 1000/1500 元；LOGO 2000 元。
- 许可：开放签为 **AGPL-3.0**，网络提供服务需公开修改后的完整源码；我方 `backend/requirements.txt` 中 `PyMuPDF==1.28.2` 同为 AGPL，商用前需替换或取得商业授权。这两件事都与「抄界面」无关，但都会影响上线。

---

## 8. 事实边界与索引

### 8.1 已确认
- 开放签仓库地址、License、目录结构、技术栈（GitHub API 与 `README`）。
- 发起 8 环节、个人/企业签署步骤、意愿认证四方式、骑缝章批量应用、9 态、13 回调事件与重试节奏、坐标/关键字定位、签署记录报告、在线验签、按次计费与云盾闭源（`docs:*`、`价格页`）。
- 我方所有结论均来自静态代码阅读，路径已在正文标注。

### 8.2 仓库 / 文档未说明（不猜测）
- 开放签发起环节是否分屏、模板设计器的具体交互、多文件签署的界面上限。
- 开放签是否对接司法链/公证/第三方存证；CA 机构名称、时间戳服务商与资质编号。
- 开放签是否提供 App SDK / 小程序 SDK（只确认有 `opensign-mobile` 与 H5/小程序口径）。
- 我方 `completed` 状态的写入路径与业务含义。

### 8.3 我方未验证项
- 未启动服务、未跑测试、未对已签 PDF 做实际验签；界面行为来自组件代码，不代表线上实际渲染结果。

### 8.4 资料索引

**开放签**
| 用途 | 地址 |
|---|---|
| 仓库 | https://github.com/kaifangqian/kaifangqian-base |
| README | https://raw.githubusercontent.com/kaifangqian/kaifangqian-base/master/README.md |
| 发起签署流程 | https://docs.kaifangqian.com/docs/ |
| 回调通知服务 | https://docs.kaifangqian.com/docs/API%E5%8F%82%E8%80%83%E6%96%87%E6%A1%A3/%E5%9B%9E%E8%B0%83%E9%80%9A%E7%9F%A5%E6%9C%8D%E5%8A%A1 |
| 签署位置计算 | https://docs.kaifangqian.com/docs/API%E5%8F%82%E8%80%83%E6%96%87%E6%A1%A3/%E7%AD%BE%E7%BD%B2%E4%BD%8D%E7%BD%AE%E8%AE%A1%E7%AE%97%E8%AF%B4%E6%98%8E |
| 企业版 1.0 功能 | https://docs.kaifangqian.com/docs/product/opening-sign-enterprise-v1-features |
| 2.0.5 版本更新 | https://docs.kaifangqian.com/docs/news/version-2.0.5-update/ |
| 价格说明 | https://docs.kaifangqian.com/docs/pricing/pricing-details |
| 安全与合规 | https://docs.kaifangqian.com/docs/security-compliance |

**我方代码**
| 主题 | 位置 |
|---|---|
| 合同状态与签署方模型 | `backend/app/models/contract.py` |
| 合同主接口（51 路由） | `backend/app/api/v1/contracts.py` |
| 免登录签署接口（11 路由） | `backend/app/api/v1/contract_sign_public.py` |
| 签署区批量落库 | `contracts.py` → `upsert_sign_fields` |
| 关键字定位 | `contracts.py` → `keyword_sign_search` / `keyword_sign_fields` |
| PDF 落章与原子替换 | `contracts.py` → `_apply_pdf_signatures` / `_pdf_signature_stamp` |
| 签章引擎 | `backend/app/services/kaifang_sign_service.py` |
| 回调 / 通知 | `backend/app/services/contract_jobs.py` |
| 审计 | `backend/app/services/contract_audit.py` |
| 文件转换 | `backend/app/services/pdf_convert.py` |
| Web 合同管理页 | `frontend-web/src/pages/Contracts/index.tsx` 及同目录组件 |
| Web 签署页 | `frontend-web/src/pages/Sign/index.tsx`、`components/SignerAside.tsx`、`components/DocumentPanel.tsx` |
| App 合同页 | `mobile-app/src/screens/contracts/ContractsScreen.tsx` |
| 小程序员工签署页 | `miniapp/src/pages/staff/contract/index.tsx` |
| 公开签署页托管在 Web | `mobile-app/src/lib/api.ts`、`miniapp/src/lib/api.ts` |
| 员工审核待办 | `backend/app/api/v1/review_center.py` |
