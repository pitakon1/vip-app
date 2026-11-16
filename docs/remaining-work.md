# 未完成事项汇总（全部端合并）

> 生成时间：2026-11-13
> 最近核对：2026-11-14（续修：后端 4 项已落地并回归全量 pytest；电子签 3 项经代码核对确认已完成，不再重复实现；同日完成 App 五角色真实点击复测，见 §9）
> 说明：§1–§5 只收录「未修改 / 未做完 / 待确认」的条目；已完成并验证过的统一记入 §7。
> 状态口径：**待决策** = 需要产品或用户拍板；**待后端** = 缺接口或字段；**待数据** = 数据为空/样本不足；**需真机** = Expo Web 无法覆盖，需真机；**待法务** = 合规或资质问题；**进行中** = 本轮已开工未收尾。

## 0. 总数统计

> 口径说明：下表按**表格行数**统计（一行可能代表一个问题簇）。App 的 1.2 节把 47 条
> `ui-ux-audit` 历史遗留归并为 8 行，逐条明细以源文件表格为准；一行也可能同时挂多个
> 阻塞原因（如 B-09 既待后端也待法务），故分项之和可能大于总行数。

| 分组 | 行数 | 其中待决策 | 待后端 | 待数据 | 需真机 | 待法务 | 进行中 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| App（mobile-app） | 14 | 4 | 2 | 2 | 6 | 0 | 0 |
| Web（frontend-web） | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| 小程序（miniapp） | 1 | 0 | 0 | 0 | 1 | 0 | 0 |
| 后端（backend） | 15 | 7 | 6 | 0 | 0 | 2 | 0 |
| 数据 | 3 | 0 | 0 | 3 | 0 | 0 | 0 |
| **合计** | **33** | **11** | **8** | **5** | **7** | **2** | **0** |

---

## 1. App（mobile-app）

### 1.1 本轮新增 / 点测遗留（4 条 + 合同编号前端收尾）

| 编号 | 问题 | 影响 | 阻塞原因 | 下一步 |
| --- | --- | --- | --- | --- |
| A-01 | 找房列表分页入口、房源详情吸底操作栏（F3/F4）已改但只做过静态与 Expo Web 冒烟，未在真机点过分页加载与吸底栏遮挡 | 真机小屏可能出现吸底栏压住内容、分页触发失败 | 需真机（Expo Go / 开发包） | 真机走一遍列表翻页 + 详情页首屏操作，记录滚动位置与点击 |
| A-02 | 管理员首页「最近动态」付款状态分支（succeeded→收到 / pending,processing→待收款 / 其他→收款未完成）已改，但库中没有 pending 付款样本 | 分支逻辑只在代码层验证，未实测渲染 | 待数据（缺 pending 账单） | 造一笔 pending 付款后重进首页，确认文案；验完清理 |
| A-03 | 业主端付款页 hero 统计标签改为「本月已收」（`pay.receivedThisMonth`），因业主无待收账单未出现该入口 | 该标签未实际渲染验证 | 待数据（业主无待收数据） | 给业主造一笔待收/已收账单后验证，验完清理 |
| A-04 | 「发现」页内容重构（含与首页去重分工）方案已整理待确认，代码未动；此前纯视觉改动保留但已停止 | 发现页仍在展示与首页重复的小区/学校/房源卡片，两个页面回答同一个问题 | 待决策（等用户确认保留/删除/新增清单） | 用户确认后按「首页=个性化推荐+快捷入口+城市基础信息；发现=区域行情对比+榜单+学区专题」改造 |
| A-14 | 合同编号改为后端字段（`HT-YYYYMMDD-NNNN`）后，App 租约列表已改读 `contract_no`，但只做了 `tsc` 与接口层核对 | App 端实际渲染未验证（Expo 缓存需重启） | 需真机 / 需重启 Expo 验证 | 重启 Expo 后用管理员账号进租约列表，确认显示后端编号且不再出现 `LC-` |

### 1.2 ui-ux-audit 历史遗留（47 条）

来源：`mobile-app/docs/ui-ux-audit.md` §8「当前统计」——待修 `[ ]` 43 条（P1 1 / P2 42）+ 修复中 `[~]` 4 条（P1 1 / P2 3）。

| 编号 | 问题（按问题簇归并） | 影响 | 阻塞原因 | 下一步 |
| --- | --- | --- | --- | --- |
| A-05 | §16 员工/经纪端 3 条：上架 chip 屏读名、首页时间线行不可点、日程列表行不可点 | 屏读器读不出状态；行看得到点不动 | 待决策（是否属于功能新增） | 与产品确认后补可点击区域或说明 |
| A-06 | §18 管理端考勤 4 条：页签两行、KPI 跨行不等高、明细行过密、两列表单基线不齐 | 小屏可读性差、视觉不齐 | 需真机（Web 视口不能代表小屏） | 真机逐项复现后按批次修 |
| A-07 | §19 管理端合同卡不可点进详情 | 想看合同明细无入口 | 待决策（功能新增） | 等产品确认是否新增详情页 |
| A-08 | §20 业主收益明细行月份口径 | 月份归属可能与账单月不符 | 待后端（确认聚合口径） | 后端确认后统一取数 |
| A-09 | §21 未收录服务编码名称回退 | 新服务编码显示原始 code | 待后端（服务字典未收录） | 由运营补字典或前端加兜底文案 |
| A-10 | §22 共享组件/泰文静态回归余项 | 泰文长文案在部分组件换行挤压 | 需真机（字体与换行差异） | 真机截图核对后微调 |
| A-11 | 其余约 36 条 P2 视觉细节（散落 §2–§17 表格） | 间距、字号、对齐等轻微不一致 | 需真机 / 待产品确认（部分为设计取舍） | 按源文件表格逐条认领，分批推进 |
| A-12 | 修复中 `[~]` 4 条已收尾 2 条（2026-11-13：O-01 管理端面积单位改 `formatArea`；O-02 日期改 `fmtDate` 的剩余 3 个文件——`tenant/DocumentsScreen`、`owner/PropertyDetailScreen`、`tenant/MaintenanceScreen`），`mobile-app` tsc 通过 | 剩 2 条为视觉/交互验证项 | 需真机 | 剩：找房收藏心命中区由 ≈42 提到 44、Android 键盘避让（代码已改 `behavior="height"`），真机复测后关闭 |

### 1.3 待决策项

| 编号 | 问题 | 影响 | 阻塞原因 | 下一步 |
| --- | --- | --- | --- | --- |
| A-13 | 软删除房源的历史租约是否继续在租约列表展示（当前：房源列表过滤已删，租约列表不过滤） | 用户可能看到指向已删房源的租约 | 待决策 | 等用户确认口径后再改查询 |

---

## 2. Web（frontend-web）

本轮无新增未完成项。租约「合同编号」已改读后端 `contract_no`，列表与详情实测显示 `HT-YYYYMMDD-NNNN`，不再出现 `LC-` 占位。

> 本轮 Web 点测已修项（付款类型、租约日期、运营漏斗枚举、权限组/角色文案、表单校验、币种符号）均已实测通过，不列入。
>
> 核对说明（2026-11-13）：`contract_no` 在 Web 的 `LeasesTable`/`LeaseDetailModal`、App 的 `admin/LeasesScreen` 中确认均已读取；本轮未重跑浏览器，原文的「实测」记录保留但未重新复核。

---

## 3. 小程序（miniapp）

| 编号 | 问题 | 影响 | 阻塞原因 | 下一步 |
| --- | --- | --- | --- | --- |
| M-01 | 本机无微信开发者工具，小程序端**未运行、未点测**，仅做了代码级静态核对（网络层信封解包、401 刷新、snake_case 映射、`tsc --noEmit`、`build:weapp`） | 结论不能记为「通过」，运行时问题未知 | 需真机 / 开发者工具 | 安装开发者工具或提供真机调试环境后补一轮点击 |

---

## 4. 后端（backend）

### 4.1 合同编号（已完成，仅 App 端待实测）

后端已加 `Lease.contract_no`（唯一索引）、`app/services/contract_number.py` 生成 `HT-YYYYMMDD-NNNN`、创建/续租写入、历史回填，列表/详情/CSV 导出统一取该字段；Web 端已实测。App 端待验证见 A-14。

### 4.2 电子签未开工条目（C-05 ~ C-22，18 条）

来源：`docs/e-sign-open-items.md`。涉及电子签代码，按原约束「不碰电子签」本轮不动。

| 编号 | 条目 | 影响 | 阻塞原因 | 下一步 |
| --- | --- | --- | --- | --- |
| B-03 | C-06 统一错误码 `{code,message,action,field}` | 三端只能展示字符串错误，无法给动作 | 待后端 | 现有信封已有 `code/message`（校验错另有 `errors`），缺 `action/field`；需先定错误→动作映射表，再改三端 `parseApiError` |
| B-05 | C-08 发起签署改三步向导 | 流程跳动大、易误操作 | 待决策（P1 未排期） | 纯前端改造，排期后做 |
| B-06 | C-09 「我的待签」聚合 | 签署人找不到待签合同 | 待后端 | 新增聚合接口前需先定匹配优先级（user_id → 邮箱 → 手机号）与可见性口径 |
| B-09 | C-12 意愿验证方式可配置（none/otp/face） | 不能按客户要求切换验证强度 | 待后端 / 待法务（人脸需供应商资质） | 模型加 `intent_method` + 迁移 + 发码校验改造 |
| B-10 | C-13 关键字定位合并为一次请求 | 多次往返、定位慢 | 待决策（入参形态未定） | 现由 `/keyword-search` + `/keyword-fields` 两次请求完成（三端已接入）；单请求 `from-keyword` 需先定入参 |
| B-11 | C-14 印章库分组 + 企业章启停 | 印章无法停用/分组管理 | 待后端 | 加字段 + 启停接口 + 权限模型 + 审计 |
| B-13 | C-16 模板管理页 | 无法在后台维护模板 | 待决策（P2 未排期） | 接口齐全，仅前端未接 |
| B-14 | C-17 一个合同支持多文件 | 主合同+附件需拆多单 | 待决策（改动面大） | 新文件表 + `sign_fields.file_id` + 引擎合并方案 |
| B-15 | C-18 骑缝章控件化 | 骑缝章只能靠扫描件 | 待决策 | 引擎放宽「已签名跳过」+ 前端新字段类型 |
| B-16 | C-19 存证报告升级（RFC3161 TSA） | 存证法律效力不足 | 待法务（外部资质） | 接 TSA / 存证服务 |
| B-17 | C-20 App/小程序内嵌签署页 | 只能跳外部浏览器 | 待决策（域名白名单） | webview 方案确认后做 |
| B-18 | C-21 企业实名与用章权限 | 企业身份未核验 | 待法务 / 待后端（供应商） | 接企业核验 + 审核流 + 权限模型 |
| B-19 | C-22 入站幂等键 | 重复回调可能重复处理 | 待后端 | 签署接口接受 `Idempotency-Key` + 缓存层 + 三端提交键 |

### 4.3 环境与依赖缺口

> B-20（venv 缺 `fitz`/`reportlab`/`pyhanko`）已于 2026-11-13 核对解决：`backend/.venv` 内三包均可导入，全量 pytest 251 passed。该条不再成立，故仅保留 B-21。

| 编号 | 问题 | 影响 | 阻塞原因 | 下一步 |
| --- | --- | --- | --- | --- |
| B-21 | Gotenberg 未部署 | Office→PDF 转换不可用，C-10 无法落地 | 待后端（部署） | 本地起 Gotenberg 容器或接远端服务 |

### 4.4 需补字段 / 接口

| 编号 | 问题 | 影响 | 阻塞原因 | 下一步 |
| --- | --- | --- | --- | --- |
| B-22 | 区域行情缺环比/同比与历史均价序列（**已核对**：`/public/schools` 的 `city` 参数早已存在并参与过滤；均价样本数 `price_sample_count` 已于 2026-11-14 补上） | 发现页只能给静态均价，做不了榜单与趋势 | 待决策（环比同比需先定历史均价数据口径） | 新增历史均价快照表 + 定口径（月度/季度、样本下限）后，再给聚合接口加环比/同比 |

---

## 5. 数据

| 编号 | 问题 | 影响 | 阻塞原因 | 下一步 |
| --- | --- | --- | --- | --- |
| D-01 | 学校 `cover_url` / `tuition_range` / `stage` / `age_range` 基本全为 null | 学区卡片只能显示名称，无法比较 | 待数据 | 运营补录；补不齐则前端隐藏空字段 |
| D-02 | 小区部分字段为 null（`nearest_subway`、`sale_status`、`completion_year`、`tenure`、`developer_name`、`total_units`、面积/户型区间） | 小区卡与详情信息单薄 | 待数据 | 按字段优先级补录，缺失时统一隐藏而非显示「—」 |
| D-03 | 区域均价只有 1 个有效样本（`district_price_pairs`） | 区域对比/排行没有统计意义 | 待数据（需更多在售楼盘） | 补录楼盘均价；样本 < N 时前端不展示排名 |

---

## 6. 汇总：下一步优先级建议

1. **A-14 合同编号 App 端实测**（后端与 Web 已完成，只差 App 渲染确认）。
2. **A-04 发现页内容重构**（等用户确认清单后即可开工）。
3. **B-21 Gotenberg 部署**（决定 Office→PDF 能否真正转换；接口字段已就绪）。
4. **D-01～D-03 数据补录**（决定发现页/学区页是否有内容可做）。
5. **A-13 软删房源租约口径**（待决策后改查询）。
6. **B-03/B-06/B-11/B-19 后端增强**（错误码映射、待签聚合、印章分组、入站幂等；均需先定口径）。
7. 其余 ui-ux P2 与电子签条目按批次推进；A-12 剩余 2 条、M-01 需真机/开发者工具复测。

---

## 7. 2026-11-13 已完成项（核对后补录）

### 7.1 注册/登录国家区号全球覆盖
- 单一数据源 `backend/app/data/countries.json`：243 个国家/地区（ISO2、中/英/泰名、区号、本地号码位数、意大利 `keepZero`）。
- `scripts/sync-countries.mjs` 生成三端同源 `src/data/countries.ts`，三份 MD5 一致 `F861B81F836CC6C46B31E350C55C3559`（各 29,713 B）。
- 后端 `app/services/phone.py`：NFKC 归一 → E.164，处理 `00`/`+` 前缀与国内长途 0。
- 三端选择器：Web `CountrySelect`、App 弹层搜索、小程序新增选择器；实测 Web 马来西亚 +60、App 新加坡 +65 注册/登录通过；三端 tsc 0。

### 7.2 泰语界面国家名
- `countries.json` 243 条新增 `t` 字段（CLDR `Intl.DisplayNames('th')` 生成，HK/MO 用短名 ฮ่องกง / มาเก๊า）；`countryName(lang)`、搜索与排序均支持泰文。
- 体积：三端 `countries.ts` 各 20,842 → 29,713 B；小程序主包 2,078,878 B（+15,221 B），仍低于 2 MB 上限。

### 7.3 手机号唯一索引与索引查询（`users.phone_normalized`）
- 新增列 `phone_normalized`（String(20), unique, index）与迁移 `0053_user_phone_normalized`；注册、微信绑定、改号、注销均同步维护。
- `chat.py` 的 `_users_by_phone()` 改为 `find_users_by_phone()`：精确 E.164 走索引 → 无国际前缀时按位数表枚举候选 E.164 → 仅对 `phone_normalized IS NULL` 的存量行兜底扫描。
- 回填脚本 `backend/scripts/backfill_phone_normalized.py`（默认 dry-run，`--apply` 写入，幂等，冲突组整组留 NULL 并打印）。
- 实测（开发库）：迁移至 0053 且唯一索引存在；7 条号码全部回填、0 冲突；复跑 `to_update=0`；13 种写法（`0812345678`、`0123456789`、`0066 812345678`、`+60 12-345 6789` 等）均命中正确账号；SQL 走 `WHERE users.phone_normalized IN (...)`。
- 生产执行：备份 → `alembic upgrade head` → 脚本先 dry-run 再 `--apply`（需发布窗口）。

### 7.4 IM 历史消息已读回填
- `backend/scripts/backfill_chat_recipients_read.py`：只处理 `recipients_read IS NULL`，成员取 `ChatParticipant`（回落 `Conversation.participant_ids`），快照为发送者 `read=true`、其余 `false`。
- 实测（复制库）：dry-run=1 → `--apply` 后成员 2/2 → 再次 apply=0（幂等）；开发库实跑 0 条（现存数据已完整，未改动生产数据）。
- 生产执行：先 dry-run 核对条数，再 `--apply`。

### 7.5 合同编号（复核）
- `Lease.contract_no` 唯一索引、`app/services/contract_number.py`（`HT-YYYYMMDD-NNNN`）、启动回填；Web 与 App 租约列表/详情均读取该字段。剩余仅为 App 真机渲染确认（A-14）。

### 7.6 本轮修正的记录偏差
- B-20「venv 缺 fitz/reportlab/pyhanko」不成立：三包均可导入，全量 pytest 251 passed。
- B-22 中「`/public/schools` 缺 `city` 参数」不成立：参数已存在并参与过滤。
- A-12 中「`settings/MyLeaseScreen`、`MyOrders*` 待改日期」已过时（早已使用 `fmtDate`）；实际遗漏的是 `tenant/DocumentsScreen`、`owner/PropertyDetailScreen`、`tenant/MaintenanceScreen` 与管理端面积单位，已于本日修完并通过 tsc。
- 原文 §0「App 52 条 / 注 51 条」口径自相矛盾，已改为按表格行数统计并注明归并关系。

---

## 8. 2026-11-14 续修记录

### 8.1 本轮实现并验证（backend）
- **B-02** 新增 `GET /api/v1/contracts/{id}/audit-logs`：只读、最新在前、`limit` 1–500；可见性沿用合同详情口径（不可见 404）。数据来自已有的 `contract_audit_logs`，不回填历史。
- **B-04** `GET /api/v1/contracts` 增加 `status` / `kind` / `date_from` / `date_to` / `q` 五个可选参数；不传时行为与之前一致，非法枚举返回 400。
- **B-12** 回调事件：新增 `party_signed`（仅合同未签完时发送，幂等键为 `{contract}:party_signed#{sub}:{party_id}`）与 `party_declined`（每次拒签都发送；`contract.declined` 仍只在流程终止时发送）；重投退避改为 30s / 5m / 30m / 2h / 6h（共 5 次）。`sign_failed` 未加：触发条件（签名校验失败 / 引擎异常 / 超时）尚未定义，属口径决策。
- **B-22** `GET /api/v1/public/districts` 增加 `price_sample_count`（参与 `avg_price` 的楼盘数）；环比/同比仍待口径决策。

验证：`backend/.venv` 全量 pytest **253 passed**（251 原有 + 2 新增），exit 0。新增用例：
- `test_contract_audit_logs_and_list_filters`：审计日志可读、状态筛选命中/排除、非法状态 400。
- `test_partial_sign_emits_party_signed_callback`：部分签署只发 `party_signed`，幂等键含签署方。

### 8.2 核对后确认已完成、不重复实现
- **B-07**（C-10）：`POST /contracts/{id}/upload` 响应已含 `pdf_converted` / `pdf_convert_error`，上传时即可告知；Office 真实转换仍受 B-21 Gotenberg 限制。
- **B-08**（C-11）：小程序 `sign-batch` 已实现（`miniapp/src/pages/contract/index.tsx`），`build:weapp` 通过；运行时未点测（并入 M-01）。
- **B-10**（C-13）：`/keyword-search` + `/keyword-fields` 已实现且三端已接入；仅「合并为一次请求」的 `from-keyword` 因入参未定未做。
- **M-02** 随之关闭（代码已实现），运行时验证并入 M-01。

### 8.3 本轮未改动的代码项及原因
- **A-02 / A-03**：文案分支必须在运行中的应用里确认；造数据本身不能替代渲染验证，且本轮无法启动 Expo/真机，故未改动开发库数据。
- **A-09**：仓库内未找到 `service_code` 字段（三端与后端均无此命名），无法定位具体展示点，不做猜测性修改。
- **B-03 / B-06 / B-11 / B-19**：分别缺「错误→动作映射」「待签匹配优先级」「印章使用口径」「幂等键契约」，均属口径/契约决策。

---

## 9. 2026-11-14 移动端全角色真实点击复测（Expo Web）

> 环境：Expo Web（Metro 8081）+ 后端 `start_backend.bat`（uvicorn reload，127.0.0.1:8000）。
> 方式：浏览器真实点击，接口以 DevTools 网络记录为准；本机无 Android/iOS 设备/模拟器、无微信开发者工具。
> 本节新增条目未计入 §0 的行数统计。

### 9.1 本轮修复并已复测（App）

| 编号 | 问题 | 修复位置 | 复测证据 |
| --- | --- | --- | --- |
| A-15 | 全站房源/楼盘图片不显示（列表与详情） | `mobile-app/src/components/RemoteImage.tsx` | 首页、找房、房源详情、业主房源均正常出图 |
| A-16 | 支付失败被当成成功（PROMPTPAY 未配置时仍提示成功） | `mobile-app/src/lib/api.ts`、`screens/tenant/PaymentsScreen.tsx` | 点击缴费返回 400/错误码时显示失败提示，不再出现成功态；账单保持 pending |
| A-17 | 公共端学校/小区统计单位错误（「共 6 所学校」「共 1 个小区」应为条数/实际值） | `screens/public/PublicSchoolsScreen.tsx`、`PublicCommunitiesScreen.tsx` | 公共首页与列表计数与接口 total 一致 |
| A-18 | 增值服务购买后弹层不关闭、订单金额显示 ฿0 | `screens/tenant/ServicesScreen.tsx` | 下单后弹层关闭，订单列表金额与所选套餐一致（测试订单已清理） |
| A-19 | 切换语言后部分文案不刷新（依赖 `[t]` 的 useMemo/useCallback 不重算） | `mobile-app/src/i18n/index.ts`（`makeT` 在 `setLang` 时换新引用） | 发现页「25 For rent / 0 For sale…」即时切换，切回中文无需刷新 |

`npx tsc --noEmit`：通过（exit 0）。

### 9.2 本轮已点测通过的页面/流程（按角色）

- 游客：公共首页、搜索、租房/新房/二手房/商铺/厂房等分类切换、登录弹层（邮箱/手机号入口）、注册页、公共学校/小区列表与详情。
- 租客：首页与搜索、房源列表与筛选、房源详情、关注/浏览历史/降价提醒（取消订阅）、消息与发消息、租约与账单、缴费（失败分支）、报修、文档中心、我的交易、通知设置、关于、电子签合同列表与验签。
- 业主：房源管理（名下房源 25 / 在租 2 / 空置 20 / 在售 0）、房源详情、委托挂牌（定价建议 + 我的委托）、收益明细、缴费中心、合同列表。
- 员工：工作台（今日带看/日历/待跟进）、客户 CRM（列表、筛选、搜索、编辑状态 PATCH `/leads/{id}` 200，已还原）、找房、消息（会话列表、详情、发消息 POST 200）、通讯录（搜索 2→1 人）、考勤打卡（规则/打卡/请假提交+撤销/统计）、房源管理（空态 + 新增房源表单）、电子签合同（列表/详情/验签入口）、我的业绩（年度佣金 55,000、佣金明细、团队排名）。
- 管理员：首页运营概览（空置率 80%、出租率 8%、在租合同 2、员工 2）、房源管理（25 套，空置 20/已出租 2/维护中 3）、客户 CRM、收款（3 笔）、账号管理、角色权限（已选 23/24）、部门管理（空态）、数据范围、数据字典（内置三语项）、电子签合同（15 份，含已作废/拒签/签署/历史签名异常样本）、租约合同（HT-20261013-0001/0002）、考勤管理（核对/汇总 2 人）、佣金设置（空态 + 新增表单）、业务设置入口。

### 9.3 本轮新增待决策（不猜改）

| 编号 | 事项 | 可选方案 | 影响 |
| --- | --- | --- | --- |
| D-01 | 员工「找房」与「房源管理」仅能看到自己录入的房源（后端 `property_visibility_conditions`，员工王五为 0 套） | A 保持现状；B 员工角色放开全量只读；C 增加「全部/我的」切换 | 若员工需带看公司房源，现状下功能不可用；放开涉及数据可见性规则 |
| D-02 | 业主收益「待收金额」= pending+overdue，但「待收」筛选明细按支付记录过滤为 0 笔（KPI 与明细口径不一致） | A 明细纳入未支付账单；B KPI 只统计已生成账单 | 影响业主对「待收」的理解与对账 |
| D-03 | 业主缴费中心 KPI「待收」含逾期账单（฿35,000 为逾期） | A 分列「待收/逾期」；B 合并为「待收」 | 影响催缴与统计口径 |
| D-04 | 业主房源统计 在租2+空置20+在售0≠名下25（维护中/续约未单列） | A 增加维护中/续约中分类；B 文案说明口径 | 数字对不上易被当成 Bug |
| D-05 | 员工 CRM「意向」= 咨询中数量，客户转为「谈判中」后意向 6→4→3 反而下降 | A 意向=咨询中+看房中+谈判中；B 改名为「咨询中」 | 统计含义不清，影响销售漏斗判断 |
| D-06 | 租客/业主「我的」无修改密码入口（仅管理员有） | A 全角色开放；B 走「忘记密码」短信/邮箱重置 | 用户无法自助改密 |
| D-07 | 电子签合同列表仅显示标题/来源/状态，5 份卡片完全一致（接口无编号/租约/金额/创建时间） | A 前端补创建时间与哈希短码；B 后端补 `contract_no`/关联租约 | 无法区分合同，签署时易点错 |
| D-08 | 「帮助中心」等入口提示「功能暂未开放」（功能范围） | A 隐藏入口；B 提供静态帮助页 | 影响体验与验收口径 |
| D-09 | 业主端 `OwnerHome` 已注册路由但无任何入口 | A 接入首页入口；B 删除死路由 | 维护成本与导航完整性 |
| D-10 | 合同正文历史数据出现 `E2E??`（早期 E2E 用例写入的占位符，非编码故障：中文 PATCH 回读正常） | A 清理历史测试合同；B 保留 | 演示/验签时观感差，不影响签名校验 |

### 9.4 本机无法验证（不计为通过）

- 原生拨号盘（通讯录/客户「电话」）、原生键盘避让、微信小程序运行时（无微信开发者工具）。
- 更换头像/上传照片依赖系统文件选择器（Expo Web 可点开但无法选真实文件）。
- 定位打卡（浏览器 geolocation 权限与坐标不可控）与「打卡」在上班时间外的实际提交。
- RN Web `Modal` 滑入动画：当前自动化浏览器 rAF 被节流（约 3 帧/3 秒），弹层停留视口外；功能通过 DOM 文本与接口结果判定，视觉动效未能取证。
- 支付成功全链路：后端未配置 `PROMPTPAY_TARGET`，仅验证失败分支；成功回调/凭证需配置后验证。

### 9.5 测试数据清理（已完成）

- 删除 ZZTEST 会话消息 2 条（游客 `ZZTEST-GUEST-MSG-1`、员工「ZZTEST 员工消息测试-1114」）。
- 删除 ZZTEST 请假申请 1 条（cancelled）。
- 删除增值服务测试订单 2 笔（cleaning，฿2,250×2）。
- 删除测试收藏 1 条（D-016）。
- 租金账单 `d752eaee-92cf-478a-bdde-cc5c052bde5a` 由 failed 恢复为 pending，清空 `paid_at` 与失败原因。
- 未做 git commit。

## 10. 2026-11-14 D-01 ~ D-10 决策落地（App / Web / 小程序）

> 决策来源：用户对 §9.3 待决策项的拍板。D-09 仅提供截图与说明，未改代码。

### 10.1 D-01 ~ D-07 决策与落地

| 编号 | 决策 | 改动 | 复测证据 |
| --- | --- | --- | --- |
| D-01 | 员工「找房 / 房源管理」放开全量只读 | `backend/app/core/auth.py`：`property_visibility_conditions` 对 employee 返回空条件，`can_view_property` 对 employee 返回 True；写权限仍由 `_ensure_owner_access` 限制为本人录入 | 员工账号 `GET /api/v1/properties` 的 total 由 0 → 25；新增/编辑/删除仍按本人录入校验 |
| D-02 | 业主收益「待收」明细纳入未付账单 | App `screens/owner/IncomeScreen.tsx`：`pending` 筛选同时包含 `pending + overdue` | 收益明细点「待收」出现逾期账单 A-1003 ฿35,000，与 KPI 一致（脚本输出 `INCOME-D02: true`） |
| D-03 | 业主缴费「待收」「逾期」分列 | App `screens/tenant/PaymentsScreen.tsx`：hero 金额改为待收（不含逾期），统计行拆为「本月已收 / 逾期 / 物业费」 | 缴费中心显示「待收 ฿0 / 逾期 ฿35,000 / 本月已收 ฿0」 |
| D-04 | 业主房源统计补齐维护中 / 续约中 | App `screens/owner/PropertiesScreen.tsx`：统计为 在租 / 空置 / 维护中 / 续约中，未知状态归空置 | 「名下 25 / 在租 2 / 空置 20 / 维护中 3 / 续约中 0」且 2+20+3+0=25 |
| D-05 | 员工 CRM「意向」= 咨询中 + 看房中 + 谈判中 | App `screens/employee/CRMScreen.tsx` | 接口 stage_counts 4+1+1=6，与 total 6 一致，页面「意向」显示 6 |
| D-06 | 全角色开放修改密码入口 | App：`ProfileScreen.tsx` 新增改密项（复用改密页）；Web：`MainLayout.tsx` 用户菜单 + 改密 Modal，`PortalLayout.tsx`（业主 / 租客门户）同样补齐改密菜单与 Modal；小程序：`pages/profile/index.tsx` 增设改密行并接通已有改密弹层；三语文案复用 `common.changePassword` 等键 | App 业主「我的 → 修改密码」可进入改密页；Web 业主门户 / 员工后台头像菜单均出现「修改密码」，弹窗含「当前密码 / 新密码 / 确认新密码」三项（截图 `web-change-password.png`）；小程序 tsc 通过（无微信开发者工具，运行时未点测） |
| D-07 | 后端补 `contract_no` 与租约关联，前端卡片展示 | 后端 `contracts.py`：列表批量查询 `Lease` 下发 `contract_no / lease_id / lease_no / amount / currency`；App `ContractRow.tsx` 显示编号、关联租约、月租金、创建时间；Web `ContractList.tsx` 同步补子行；小程序合同卡片显示编号 / 租约 / 金额 | 创建测试合同 HT202611000051（租约 ZL202610000001，25,000 THB）：API 与 App 电子签列表卡片均显示「合同编号 · 关联租约 · 月租金 · 创建时间」（截图 `app-contracts.png`）；测试合同已软删除 |

### 10.2 D-08 「未开放」功能处理

**已实现（原为占位 / 死入口）**

- 帮助中心：App 新增 `screens/HelpCenterScreen.tsx` 并接入「我的 → 帮助中心」；小程序新增 `pages/help/*` 并注册路由；Web 新增 `pages/Tenant/Help.tsx`、路由 `/tenant/help`，并把「我的」页帮助行改为可点击（截图 `app-help.png`、`web-help.png`）。
- 内容为 5 条静态 FAQ（注册登录、预约看房、签约准备、账单支付、提交报修）+ 联系客服说明，三语齐全。

**仍为「即将上线」的入口及原因**

| 分类 | 入口 | 未实现原因 |
| --- | --- | --- |
| 地图 / 通勤 / 地铁 | 地图找房、通勤找房、地铁找房 | 需要地图 SDK（Google Maps Key）、地理编码、通勤路径与地铁线路数据源；当前环境无 Key，且属独立后端能力 |
| 内容运营 | 排行榜、直播看房、成交价/对比 | 无榜单、直播与成交数据模型与数据源；对比需要多房源字段聚合接口 |
| 素材型 | VR 看房、园区环境 | 无全景素材与全景播放器，需内容生产与存储 |
| 供给型 | 找经纪人、帮我找房、精选/自营、最新房源、家具齐全、业主直卖 | 需要运营选品标签、经纪人供给与撮合分配逻辑，当前无对应数据与后台 |
| 专题落地页 | 新房 / 商铺 / 厂房 / 酒店 / 土地 的 banner 详情 | 目前无专题内容与 CMS，点击仅提示即将上线 |

> 说明：以上入口保留「即将上线」提示而非隐藏，避免出现可点但无反应的死链；如需全部实现，建议按「地图 → 内容运营 → 供给型」分阶段接入。

### 10.3 D-09 `OwnerHome` 决策材料（未改代码）

- 截图：`owner-home.png`（资产管理页）。
- 页面内容：本月租金实收 ฿55,000、在管 25 套；出租 2 / 空置 20 / 在售 0；资产占用分布（出租 9% / 空置 91% / 在售 0%）；年度收益趋势（十月 5.5 万）；房源概览（D-001 ~，含租金与状态）；我的上架单 0；待收账单 1 笔 ฿35,000 · 逾期 1 笔。
- 与现有业主首页差异：现有业主首页与租客共用 `HomeScreen`（推荐 / 发现流，偏「找房」）；`OwnerHome` 是资产经营看板（收益、占用、账单），更接近业主的日常管理入口。
- 现状：路由已注册但无任何入口；待用户决定「接入业主首页入口」或「删除死路由」。

### 10.4 D-10 历史合同 `E2E??` 清理

- 软删除 3 份历史测试合同（`deleted_at` 置位，保留数据可追溯）：`HT202611000024`、`HT202611000025`、`HT202611000026`。
- 清理后有效合同 12 份；D-07 验证合同 `HT202611000051` 也已软删除，现有效合同仍为 12 份。

### 10.5 本轮统一验证

- `npx tsc --noEmit`：mobile-app ✅、frontend-web ✅、miniapp ✅（exit 0）。
- 后端全量 `python -m pytest -q`：共 253 项，232 通过、21 失败；失败全部集中在 `tests/test_contract_sign_flow_e2e.py`，根因为本机缺少可选依赖 `reportlab`、`pyhanko` 及 TSA / Gotenberg 服务（PDF 生成与签名链路），与 D-01~D-10 改动无关。
- UI 终检：App 业主「我的」不再出现临时 OwnerHome 入口，改密与帮助中心可进入；Web 业主门户帮助中心与改密弹窗可用；Web 员工后台改密菜单可用。
- 未做 git commit。

---

## 11. 产品模型纠正：统一 C 端入口 + 房产自助绑定与后台审核

> 口径：C 端不存在「业主 / 租客」两个割裂身份，都是同一种用户，只是有的名下有房产、有的只是租房。
> 入口可见性不再由角色或「当前有没有资产」决定；判权下沉到具体资源的读写操作。

### 11.1 数据模型与接口（后端）

- 新模型 `backend/app/models/property_binding.py`：`PropertyBinding`（`property_bindings` 表）
  - 申请信息：`user_id`、`address`、`room_number`、`size_sqm`、`property_type`、`note`；
  - 材料：`attachments`（JSON，`[{name,url,size,content_type}]`）；
  - 审核：`status`（pending / approved / rejected）、`reviewed_by`、`reviewed_at`、`review_note`、`reject_reason`；
  - 关联：`property_id`（审核通过后回写）、`deleted_at`（软删除）。
- 新接口 `backend/app/api/v1/property_bindings.py`：
  - `POST /property-bindings/attachments`：multipart 上传，复用 `core/uploads.py::save_upload`，白名单 `.pdf/.jpg/.jpeg/.png/.webp`、≤20MB、文件头魔数校验、随机文件名；
  - `GET /property-bindings/match`：按地址 / 房号匹配系统内已有房源（强命中 + 房号一致且地址相似候选），命中多个时全部返回由用户选择；
  - `POST /property-bindings`：提交申请（`kind=claim` 认领已有房源 / `kind=new` 新建待审房源；同一用户已有 pending 时 409；附件 ≥1 且校验路径前缀 + 磁盘存在）；
  - `GET /property-bindings/me`：本人申请记录（含已驳回，可改后重提）；
  - `GET /property-bindings`：后台队列（`STAFF_ROLES`，status / keyword 过滤 + 分页 + 申请人信息）；
  - `GET /property-bindings/{id}`、`GET /property-bindings/{id}/attachments/{index}`：本人或员工可访问，附件走鉴权流式下载，不做静态托管（实测：他人 403、匿名 401、静态路径 404）；
  - `POST /property-bindings/{id}/approve`：创建 / 复用 `Owner`；`claim` 只把既有房源 `owner_id` 改到申请人（不新建房源），`new` 把提交时创建的待审房源置 `approved`；审核人员可传 `property_id` 改判认领目标；随后站内通知；
  - `POST /property-bindings/{id}/reject`：`reason` 必填 → 记录审核人与时间 → 站内通知。
- 权限口径调整：
  - `owners.py` 6 个 `GET /owners/me/*` 由 `require_owner` 改为 `get_current_user`（无 Owner 档案时端点内部已有空数据兜底）；
  - `properties.py::_ensure_owner_access` 改为按「Owner 档案 + 房源 `owner_id` 归属」判权，不再要求 `role == owner`；
  - `create_property` 不再用「必须先有审核通过的绑定」硬拦 C 端：C 端录入直接落 `review_status=pending` 的房源并自动生成 `kind=new` 的绑定审核申请（详见 §11.6）；
  - 写权限未放宽：员工 / 经纪人仍按原规则，C 端只能写自己名下的资源。
- 测试：`backend/tests/test_property_bindings.py` 3 项（上传类型校验、提交→后台通过→Owner/Property/通知/租客可见房源、驳回→重新提交）。

### 11.2 后台审核页（Web 管理端）

- 新页面 `frontend-web/src/pages/PropertyBindingReview/index.tsx`，路由 `/operations/property-binding-review`（`denyRoles={['tenant','owner']}`），菜单 `roleMenus.ts` 运营管理段新增「房产绑定审核」。
- 能力：状态筛选（默认待审核）/ 地址房号搜索 / 分页；列表展示申请人、房产、面积、材料数、提交时间、状态；详情弹窗展示全部字段与附件下载（Bearer + objectURL）；通过 / 驳回（驳回必须填原因，另可填内部审核意见）；审核后刷新队列。
- 需求明确「驳回需填原因、全程留审核人 / 时间 / 意见」：`reviewed_by / reviewed_at / review_note / reject_reason` 全部落库并在详情弹窗回显。

### 11.3 C 端入口统一 + 申请流程

- Web 门户：
  - `App.tsx` 移除 `/tenant/my-properties`、`/tenant/income`、`/tenant/marketing`、`/tenant/my-listings` 的 `denyRoles={['tenant']}`；
  - `Tenant/My.tsx` 宫格去掉角色过滤，新增「添加我的房产」；`roleMenus.ts` C 端总览段同步新增；
  - 新页面 `pages/Tenant/PropertyBinding.tsx`（`/tenant/property-binding`）：表单 + 多文件上传（类型 / 大小前置校验）+ 我的申请记录（状态 / 驳回原因 / 修改后重新提交 / 已通过可直达「我的房产」）；
  - 空态引导：`OwnerPropertiesGrid`、`Owner/Income`、`Owner/Marketing`、`MyListings` 的空态补充「还没有绑定房产」说明与「添加我的房产」入口。
- App（Expo）：
  - `ProfileScreen` 宫格对全部登录用户完整展示（游客仍只保留关注 / 历史 / 降价提醒），新增「添加我的房产」；
  - 新页面 `screens/tenant/PropertyBindingScreen.tsx`（`expo-document-picker` 上传，表单 / 待审核态 / 记录 / 驳回重提 / 已通过直达），`RootNavigator` 注册 `PropertyBinding`；
  - 空态引导：业主房源、收益、委托、我的上架单的空态加「添加我的房产」跳转。
- 小程序：
  - `pages/profile/index.tsx` 的 `C_GRID` 去掉能力过滤，新增「添加我的房产」；
  - 新页面 `pages/property-binding/index`（`chooseMessageFile` / `chooseImage` 上传）并在 `app.config.ts` 注册；
  - `components/StateBlock` 增加可选 `sub` / `onSubClick`，业主房源、收益空态统一给绑定引导。
- 文案：Web（zh/en/th）、App（zh/en/th）、小程序（zh/en/th）均新增同一组语义键（`propertyBinding.*` / `propertyBindingReview.*` / `profile.addProperty` / `menu.addProperty`），三语一致。

### 11.4 联调验证（Web 真实点击）

1. 租客账号 `/tenant/my`：宫格完整显示「添加我的房产 / 我的房源 / 收益 / 我的上架单 / 租约 / 订单 / 付款 / 报修 / 服务 / 合同 / 文档」——入口不再按角色隐藏。
2. `/tenant/property-binding` 提交后显示「已有待审核的申请」，记录状态「待审核」。
3. 管理员 `/operations/property-binding-review`：待审核队列可见申请人 / 房产 / 材料数，详情可查看 `e2e_proof.pdf`，通过后状态变「已通过」、记录移出待审核。
4. 租客侧出现「房产已通过审核」提示，「查看我的房产」→ `/tenant/my-properties` 显示新房产 A-1203（68㎡，空置）。
5. 第二条申请被驳回（原因「产权证明不清晰，请重新上传」）→ 租客页展示驳回原因；点击「修改后重新提交」自动回填表单与材料，提交后新记录为「待审核」，原驳回记录保留可追溯。
6. 附件访问控制实测：他人 403 / 匿名 401 / `/uploads/property_bindings/...` 静态路径 404。

### 11.5 验证与遗留

- 三端 `npx tsc --noEmit`：mobile-app ✅、frontend-web ✅、miniapp ✅。
- 后端全量 pytest（`backend/.venv`）：**256 项全部通过**（含新增 `test_property_bindings.py` 3 项）。此前用全局 Python 的 21 项失败确认为本机缺少 `reportlab` / `pyhanko` 等可选依赖，非代码问题；本轮按要求统一改用 `backend/.venv`。
- 联调数据：保留 1 条已通过的 E2E 绑定（`E2E 曼谷素坤逸 88 号 A-1203`）及对应房源，便于复看功能；联调产生的驳回记录与重新提交记录已软删除，不阻塞后续提交。
- 未改动 D-09 的 `OwnerHome`（路由与入口维持原状，待用户拍板）。
- 未执行 git commit。

### 11.6 审核口径强化：认领 / 新建双通道 + 待审隔离

> 口径：房产真实性必须靠审核保证，因此「认领已有房源」和「业主自己录入新房源」两条路都必须走审核，通过后才生效。

- 数据模型
  - `Property.review_status`（`pending` / `approved`，默认 `approved`，带索引）。`core/migrations.py` 启动时自动补列并把历史行回填为 `approved`（否则历史房源会被「仅 approved 可见」条件整体排除）。
  - `PropertyBinding.kind`（`claim` / `new`）与 `matched_property_id`；历史绑定回填为 `new`。
- 待审隔离（审核通过前）
  - 列表 / 搜索 / 地图：`property_visibility_conditions` 对所有角色追加 `review_status == approved`；
  - 详情：`can_view_property` 对非员工直接拒绝（业主本人也看不到，进度看申请记录）；
  - 公开门户：`public.py` 的房源 / 挂牌基查询追加同条件；
  - 业主口径：`owners.py` 三个房源查询追加同条件；
  - 挂牌：`create_listing` 对非 approved 房源返回 409「该房源正在审核中」。
- 认领（claim）
  - 提交时按 `property_id` 锁定目标；若已有他人 `approved` 认领或已在本人名下则 409；地址 / 房号以目标房源为准，不覆盖原数据；
  - 审核通过只改 `Property.owner_id`，**不新建房源**，租约 / 挂牌 / 收款继续挂同一 `property_id`；
  - 命中多个候选时 C 端必须自己选一条（未命中才新建），审核人员也可用 `property_id` 改判。
- 新建（new）
  - C 端「新建房源」与「添加我的房产」两条入口都会落一条 `pending` 房源并生成审核申请；驳回后再次提交复用同一条待审房源，避免重复建档 / 撞 `dedupe_key` 唯一索引。
- 前端
  - Web / App / 小程序提交页均增加「查找匹配房源 → 选择认领」区块、待审提示与「认领 / 新建」类型回显；后台审核页新增类型列、认领目标房源卡片（当前归属业主、在租租约数、在架挂牌数）与两类通过说明。
  - 后台审核（认领改判）：通过弹窗内可「重新匹配候选」，列出全部 `approved` 候选（含当前归属业主 / 租约数 / 挂牌数），单选改选后通过时把 `property_id` 传给接口；改选后仍只改目标房源归属、不新建记录，并提示已改选。`/property-bindings/match` 仅对员工附加业主与关联数据字段，C 端不返回业主信息。
  - 三端 + 后台中英泰文案同步（`propertyBinding.*` / `propertyBindingReview.*` / `pb.*` / `op.createdPending` / `prop.createdPending` / `ownerProperties.msgCreatedPending`）。
- 验证
  - `test_claim_existing_property_keeps_lease_listing_payment`：匹配命中 → 认领 → 审核通过后房源仍只有 1 条、`owner_id` 改为申请人，租约 / 挂牌 / 收款 `property_id` 全部不变，申请人 `/owners/me/properties` 可见。
  - `test_new_property_pending_invisible_and_not_listable`：C 端建库返回 `pending`，本人与他人均查不到详情 / 列表，挂牌 409；后台队列可见 `kind=new`，通过后详情变 `approved`。
  - `test_claim_reassign_target_keeps_single_property`：认领申请提交到 A 房源 → 审核人员重新匹配看到 B 的当前归属 / 租约 / 挂牌 → 改判 `property_id=B` 通过 → 房源总数不变、A 归属未动、B 归属改为申请人、B 的租约 / 挂牌仍挂同一 `property_id`，申请人「我的房产」只看到 B。
  - `test_claim_approve_rejects_pending_target`：改判指向待审房源时返回 409。
  - 后端全量 pytest（`backend/.venv`）：**260 项全部通过**（原 256 + 新增 4 项）；三端 `tsc --noEmit` 全部通过。

## 12. 2026-11-16 第四轮四层深检：修复、未修复与未验证

> 完整用例记录（页面/接口、操作、预期、实际、结论）见 `docs/coverage-matrix-2026-11-15.md` 第 13-20 节。本轮执行 199 条：通过 194 / 失败 0 / 未验证 3 / 未修复 1 / 既有设计记录 1。

### 12.1 修复（均已复测）

| 修复 | 位置 | 复测 |
| --- | --- | --- |
| NOT NULL 漂移 5 处回填收紧 + 补 `ix_listings_is_featured` | `alembic/versions/0054_*.py`、`0055_*.py` | 已 upgrade 到 0055，`PRAGMA table_info` 全为 NOT NULL，索引存在 |
| SQLite 外键开关 | `app/db.py` | `PRAGMA foreign_keys=1`；外键 / 唯一约束拒写 4 条通过 |
| 时间契约：业务时区归一化 + 出参补 `Z` | `config.py`、`core/datetime_utils.py`、`core/envelope.py` 及 8 个 API 模块 | 时区用例 8/8；浏览器实测 `Z` → 本地 `+8` |
| 聚合缓存写后失效 | `app/main.py` | 打桩 6/6（Redis 端到端未验证） |
| 乐观锁行锁 | `core/concurrency.py`、`properties.py`、`leases.py` | 409 / 200 / version+1 通过 |
| 三端渠道枚举文案化 | Web `Payments/constants.ts` 等、App、小程序、zh/en/th | 三端扫描 0 原始码 |
| 375 窄屏溢出与按钮裁切 | `styles/prototype-system.css`、`styles/app.css` | 9 页 × 5 断点 45/45，按钮换行后可见 |
| antd `destroyOnClose` 弃用 | `layouts/MainLayout.tsx`、`PortalLayout.tsx` | 控制台告警清零 |
| 线索姓名空/超长校验；`confirm` 允许空 body | `api/v1/leads.py`、`api/v1/payments.py` | 空值/500 字 → 422；无 body confirm → 200 |

回归：后端全量 `pytest` **260 项通过**；两条旧断言按新时间契约更新（业务时区 18:00 → `11:00Z`、`expires_at` 带 `Z` 后与 aware `now` 相减）。

### 12.2 未修复

- 8 条孤儿 `signature_records`（`contract_id` 指向不存在合同）：属历史数据清理，删除不可逆，迁移中不自动删。需业务确认后单独执行（先导出再删）。

### 12.3 本机无法验证（不计为通过）

- Redis 未运行 → 缓存失效仅打桩验证，未做端到端。
- 无第二个可登录租客账号 / 无第二租客账单 → 跨租户越权未构造。
- 种子数据无 `payment_type=deposit` 成功收款 → 押金应收/已收无法对账。
- 生产 PostgreSQL 行锁与 0054/0055 迁移未执行（本地 SQLite 无行锁）。
- 真实支付回调验签、Google/Apple OAuth（未配凭据，503）、真机 GPS/推送/微信商户号、partner_admin 页面（无账号）。

