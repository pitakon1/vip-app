# App 端逐元素体验体检清单

> 范围：`mobile-app`（Expo / React Native）
> 做法：逐页逐元素核对「显示内容」与「跳转链路」，每条给出当前表现 → 期望表现 → 是否一致。
> 本文件是长期任务的唯一追踪表：修复后在「处理状态」勾选。

## 使用约定

**问题等级**

| 等级 | 含义 |
| --- | --- |
| P0 | 影响可用性：功能走不通、白屏、死链、重复提交、数据错到会导致错误决策 |
| P1 | 明显不顺手：状态缺失、反馈缺失、三语缺失/漏翻、跳转语义错、点按区过小到易误触 |
| P2 | 观感细节：间距、文案润色、次要格式、可选的体验增强 |

**处理状态**：`[ ]` 待修 · `[~]` 修复中 · `[x]` 已修 · `[—]` 不改/已一致

**修复批次（初拟，全量铺完后在第六节定稿）**

| 批次 | 范围 |
| --- | --- |
| B1 | 跨页共性 P1 + 主路径 P1（三态与重试、展示口径、i18n、分页、表单反馈、导航标题） |
| B2 | 页面级 P1（详情吸底、搜索历史、空态清空、买房卡、跳转语义、未登录意图、点击区） |
| B3 | P2 全部 |

**口径编号**：`O-xx` 指第五节「展示口径问题」总表中的条目；页面表内只写编号，不重复描述。

### §0 本批实测记录（Expo Web）

| 项 | 结果 |
| --- | --- |
| 运行方式 | 本机已运行的 Expo Web dev server（`http://localhost:8081`，页面标题 VIP Rental），后端 `127.0.0.1:8000` 可连通 |
| 真机/模拟器 | **未使用**。浏览器工具无法切换 390×844 视口，实测窗口 960×632；「小屏挤压 / 键盘遮挡 / 安全区」仍以代码与布局参数判断，未做真机验证 |
| 已实走 | 租客首页 → 搜索进入「房源搜索」→ 打开「价格」面板 → 点 A-1005 进详情 |
| 实测原始值 | 城市「曼谷」；卡片「A-1005 / 123 Charoenkrung Rd, Unit A-1005, Bangkok / 2室 · 65㎡ / 空置 / ฿45,000 /月」；按钮「查看 1 套房源」；价格预设「≤3万 / 3-5万 / 5-8万 / ≥8万」；详情「฿45,000/月、折合 ¥8,654/月、单价 ฿692.31/㎡ · ≈ ¥133/㎡、2 BED · 1 BATH、押金 ฿90,000、房源编号 FY202609000005」 |
| 未覆盖 | 登录态拦截、提交反馈、键盘行为、深色模式、字体放大，后续用真机/模拟器补 |

**补测记录（F37，2026-11-10，视口恢复正常后）**

| 项 | 结果 |
| --- | --- |
| 视口 | 首次快照仍为 0×0，等待 2 秒后恢复 **960×632**，应用正常渲染（此前阻塞原因已消失） |
| 环境 | 租客账号登录态，界面切泰文 |
| 聊天列表 | PASS：底部导航与列表无截断/挤压/重叠 |
| 聊天详情 | FAIL（已修）：底部输入区泰文占位正常，但发送按钮为单字小圆钮，观感过小 → 当页改高 44 / `minWidth 64` 胶囊（`ChatDetailScreen.tsx`），未再复测截图 |
| 我的 | PASS：宫格布局在 960×632 下无截断/重叠 |
| 设置 | PASS：纵向表单与「บันทึก」按钮无截断/重叠 |
| 员工端 | **未实测**：需切换员工账号，本轮租客态无法进入 |
| 管理端 | **未实测**：需管理员账号，本轮无法进入 |
| 仍待补测清单 | 员工端首页/日程/房源/CRM/业绩、管理端考勤/合同/客户/首页、聊天详情修复后的发送按钮、小屏 390×844 与键盘遮挡 |

**账号与实测记录（F38–F39，2026-11-10）**

| 项 | 结果 |
| --- | --- |
| 测试账号 | **有**：`TEST_ACCOUNTS.md` 列出 admin@viprental.com / admin123、employee@viprental.com / emp123（另有 agent / owner / tenant） |
| 员工端（泰文） | PASS：登出租客账号后用 employee 账号登录成功，底部为员工工作台；首页「เวิร์กเบนช์วันนี้」、日程「ปฏิทินของฉัน」、客户 CRM、房源/搜索、Profile 均正常，无截断/重叠（截图 employee-home / employee-crm / employee-properties / employee-profile） |
| 管理端（泰文） | 部分 PASS：admin 登录后首页「หน้าหลักผู้ดูแล · ภาพรวมทั้งระบบ」与经营指标、菜单均为泰文，无截断/重叠；**考勤管理 / 合同 / CRM 未实测**（浏览器步数预算耗尽，未进入） |
| 小屏 390×844 | **未实测**：浏览器工具无法改视口（仍为 960×632），需真机/模拟器验证 |
| 键盘遮挡 | **未实测**：需真机/模拟器验证（代码侧预约弹层已用 KAV） |
| 聊天发送按钮复测 | **未实测**：F37 改后未再截图确认；代码为高 44 / `minWidth 64` |

**登录/注册与管理端分批实测（F40，2026-11-10）**

| 项 | 结果 |
| --- | --- |
| 账号 / 环境 | admin@viprental.com（`TEST_ACCOUNTS.md`），Expo Web 960×632 |
| 管理端第 1 批（泰文） | PASS：考勤管理「จัดการการลงเวลา」、合同管理「จัดการสัญญา」；筛选器、统计卡、员工/合同列表与状态徽标均无截断、重叠 |
| 管理端第 2 批（中文） | CRM「客户」PASS（6 条客户、筛选/统计/操作按钮正常、底部「没有更多了」）；房源管理 **FAIL（观察项，未修）**：卡片地址单行省略，第三套显示为「…Bangkok 65㎡ · 2...」；权限/账号 **BLOCKED**：当前导航无「权限/账号」入口，无法进入 |
| 未验证 | 管理端权限/账号（无入口）；管理端其余页面；小屏 390×844；键盘遮挡（含 F40 的 Android `behavior="height"`）；注册成功 Toast 实际弹出；登录失败字段红字与密码眼睛的真实点击 |
| 说明 | 第 2 批进入时界面已被切为简体中文，故该批未覆盖泰文；房源卡地址省略属现有单行策略，归详情/列表批次处理，本轮只记录不改 |

**列表卡片与账号入口复核（F41，2026-11-10）**

| 项 | 结果 |
| --- | --- |
| 管理端房源卡字段 | **PASS（更正 F40 误报）**：卡片地址、规格「65㎡ · 2 卧 · 1 浴」、价格「฿45,000/月」各自独立成行，四字段完整、无省略号；F40 的「65㎡ · 2...」是报告文本跨行拼接所致，非 UI 截断 |
| 同款列表卡（员工/管理员态） | PASS：两套卡片的面积、卧室、租金完整；标题与地址为单行省略，属现有设计，本轮未改 |
| 我的上架单 / 收藏 | 代码核对：两处均不渲染面积/户型（接口未返回该字段），不存在被截断；价格单行完整 |
| 权限/账号入口 | **PASS（更正 F40 BLOCKED）**：管理员「我的 → 系统管理」内确有「账号管理」「角色权限」，两页均可打开；但「角色权限」页内容区未显示预期角色列表（结构异常）→ 记为观察项，未修 |
| 未验证 | F41 改动（学校/小区列表搜索、到底提示、相册页码、地图点遮罩）未逐项点击实测；小屏 390×844 与键盘遮挡仍需真机 |


---

## §1 通用问题组（跨页根因，修复时按组收敛）

> 先定性共性根因，避免同一处改两遍。页面表只引用编号，不重复归因。

| 编号 | 通用问题 | 根因定位 | 受影响页面 | 等级 | 批次 |
| --- | --- | --- | --- | --- | --- |
| G1 | 加载/空/失败三态混同，失败被当成「暂无数据」，缺重试 | `DataState`/`ListState` 使用不一致；详情页把网络失败与 404 同一文案 | 租客首页、找房、详情、分类页、聊天、学校/小区、员工/管理端列表 | P1 | B1 |
| G2 | 首屏加载整页替换，页头/筛选栏消失、页面高度跳动 | 页面级 `return <LoadingState/>`，而非只替换列表区 | 找房、详情、分类页、聊天列表、员工端列表 | P2 | B3 |
| G3 | 硬编码中文/漏翻：栈页标题、Loading 文案、BED/BATH、英文默认值、中文标点 | `RootNavigator` 的 `title`、`LoadingState` 默认文案、页面内 JSX 直写 | 全站 | P1 | B1 |
| G4 | 日期/金额/面积/距离口径不统一（见 O-01…O-20） | 页面各自 `slice`、手拼单位、默认币种 | 全站 | P1 | B1 |
| G5 | 可点区域 < 44pt | 定位行 22、居室快选 32、收藏心 42、悬浮返回 36、筛选 chip 24 | 首页、找房、详情、筛选面板、后续列表页 | P2 | B3 |
| G6 | 未登录拦截后意图丢失 | 跳 Login 前未记录 pending 动作，返回不续做 | 收藏、联系经纪人、预约、降价提醒、委托上架 | P2 | B2 |
| G7 | 分页/到底提示缺失或只加载一页 | 调用方未传 `hasMore/onLoadMore`；接口 page_size 截断 | 找房、买房、聊天、学校、小区、员工/管理端列表 | P1 | B1 |
| G8 | 表单缺键盘避让、缺校验、缺 loading/成功反馈 | 弹层未用 KeyboardAvoidingView；只判空；提交仅禁用无 loading | 登录注册、预约看房、委托上架、合同签署、支付、个人资料 | P1 | B1 |
| G9 | 搜索输入无清除、不收键盘、历史面板不收起 | 无清除按钮；`onSubmitEditing` 未 dismiss；`searchFocused` 从不置 false | 找房、学校选择器、聊天搜索、员工端搜索 | P2 | B2 |
| G10 | 路由标题与页面内标题重复 / 二级页缺返回入口 | `RootNavigator` 统一 header + 页面内自绘标题 | 聊天、我的上约、我的房源、设置类 | P2 | B3 |
| G11 | 失败提示位置错乱或不可读 | 错误写进不相关状态变量；长文本塞 toast | 详情-联系经纪人、翻译、多处提交类 | P1 | B1 |
| G12 | 同类列表卡片口径不一致 | 买房卡无收藏、忽略 photos；员工卡与管理卡字段不同 | 找房、分类页、收藏、员工房源 | P2 | B3 |
| G13 | 无障碍标签缺失/把整卡当按钮但无可读名称 | 图标按钮无 `accessibilityLabel`；卡片无 `accessibilityRole` | 全站 | P2 | B3 |
| G14 | 列表项无稳定 key / 点击无按下态 | 部分 `keyExtractor` 用 index；`TouchableOpacity` 无 `activeOpacity` 变化 | 聊天、学校、小区、员工列表 | P2 | B3 |

---

## §2 租客首页（`src/screens/tenant/HomeScreen.tsx`）

| 页面/位置 | 元素或跳转 | 类型 | 当前表现 | 期望表现 | 证据 | 等级 | 批次 | 状态 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 首页/左上角 | 定位行「当前城市 · {cityLabel}」 | 显示 | 未定位只显示「当前城市」，无引导；行高固定 22 | 未定位显示「选择城市」+ 下拉箭头 | `locationRow` height 22 | P2 | B3 | [x]（F33：未定位改显示「选择城市」） |
| 首页/左上角 | 定位行 → `LocationPicker` | 跳转 | 可点，命中区仅 22pt | 命中区 ≥44pt | `locationRow` height 22 | P1 | B2 | [x]（G5，F5：加 hitSlop 12，实际命中 ~46pt） |
| 首页/搜索条 | placeholder「搜索小区 / 地址 / 地铁」 | 显示 | 三语正常 | — | 实测占位文案 | — | — | [—] |
| 首页/搜索条 | 右侧圆形箭头 | 显示 | 像独立按钮，实际整条同一点击区 | 去掉独立按钮观感或单独可点 | `searchArrow` 无独立 onPress | P2 | B3 | [x]（F38：去掉填充圆钮，改纯箭头图标，整条搜索条为唯一点击区） |
| 首页/搜索条 | 点击 → `PropertySearch` | 跳转 | 跳转正确，但进去无关键词 | 直达搜索并聚焦输入框 | `navigation.navigate('PropertySearch')` 无参 | P2 | B2 | [x]（F38：带 `autoFocus` + `focusTs`，找房页自动聚焦搜索框，重复进入也生效） |
| 首页/黄金导航 | 7 个分类磁贴 | 显示 | 三语齐全；320dp 下 4 字标签不截断 | — | `BIZ_ITEMS` 7 项 labelKey | — | — | [—] |
| 首页/黄金导航 | 磁贴点击 → 对应分类页 | 跳转 | 同时切 rail，返回保持同分类 | — | `setBizKey` + `target` | — | — | [—] |
| 首页/房源区块 | 区块标题 +「更多」 | 显示 | 「更多」复用 `list.filterMore` | 术语与列表页统一 | `t('list.filterMore')` | P2 | B3 | [x]（F33：改 `discover.viewAll`「查看全部」） |
| 首页/房源区块 | 「更多」→ 当前分类页 | 跳转 | 不带细分类型，进入默认全部 | 可接受 | `bizItem.target` | — | — | [—] |
| 首页/房源卡 | 封面图 | 显示 | 无图显示灰底图标，无文字 | 可选「暂无图片」 | `PropertyCard` 占位分支 | P2 | B3 | [x]（F38：房源卡/二手房卡占位补「暂无图片」文案） |
| 首页/房源卡 | 类型徽标 | 显示 | 未知类型回退「房源」 | 可接受 | `typeText` default | — | — | [—] |
| 首页/房源卡 | 标题 / 地址 | 显示 | 空值回退「未命名房源」「暂无地址」，单行省略 | — | `list.unnamed`、`prop.noAddress` | — | — | [—] |
| 首页/房源卡 | 户型·面积 | 显示 | `㎡` 硬编码，不随语言 | 共享面积格式化 | `HomeScreen:379,460` | P2 | B3 | [x]（O-01，F1 已改 `formatArea`） |
| 首页/房源卡 | 房态标签 | 显示 | `status` 空/未知时被显示成「已出租」 | 未知不渲染 | `HomeScreen:384` `\|\| t('prop.status.rented')` | P1 | B1 | [x]（O-09，F1） |
| 首页/房源卡 | 租金 | 显示 | 空值显示「—」仍拼「/月」 | 空值不渲染单位或「面议」 | `formatMoney` + `/月` | P2 | B3 | [x]（F33：`monthly_rent` 为空不渲染 /月） |
| 首页/房源卡 | 卡片点击 → 详情 | 跳转 | 带 `{id}`；未判空 | id 空不跳并提示 | `PropertyCard onPress` | P2 | B2 | [x]（F38：id 为空不跳转，Toast「该房源暂不可打开」） |
| 首页/二手房卡 | 二手标签/标题/地址/面积/总价 | 显示 | 正常；id 空时 disabled 无提示 | 禁用可感知 | `SaleCard` | P2 | B3 | [x]（F38：去掉静默 disabled，可点但 id 为空时 Toast 提示，不再「点了没反应」） |
| 首页/新房 rail | 楼盘卡点击 | 跳转 | 全部 `navigate('NewHouse')`，点 A 楼盘进的是分类页 | 带 `projectId` 直达楼盘详情 | `ProjectRailCard onPress` | P1 | B2 | [x]（F18：目标页 `PublicCommunityDetail` 已支持 `{ id }`，改为直达该楼盘详情） |
| 首页/学校区块 | 学校卡信息 | 显示 | 学段未知回退「国际学校」；学费原样直出 | 未知不臆造；学费统一区间格式 | `HomeScreen:543` `tuition_range` | P1 | B1 | [x]（O-10，F5：学段空值显示「未知」，不再冒充学校类型；学费仍为后端预格式化串） |
| 首页/学校区块 | 学校卡 → 找房 + 学校筛选 | 跳转 | 正确带 `schoolId/schoolName/schoolKm/schoolTs`，找房页接收 | — | 实测/`ListingsScreen` 接收 | — | — | [—] |
| 首页/学校区块 | 「更多」→ `PropertySearch` | 跳转 | 不带学校参数，语义变「去全部找房」 | 带学校或改文案 | `goListings()` | P2 | B3 | [x]（F38：改「全部学校」→ `PublicSchools`，文案与落地页一致，不再误入找房） |
| 首页/最近动态 | 账单/工单行 | 显示 | 图标、标题、副文案、状态徽标齐全 | — | 三语 `ticket.status.*` | — | — | [—] |
| 首页/最近动态 | 行点击 | 跳转 | 行不可点，无法进账单/工单 | 进入对应详情 | 行无 onPress | P1 | B2 | [x]（F5：账单行→`Payments`，工单行→`TenantMaintenance`） |
| 首页/最近动态 | 日期 | 显示 | `slice(0,10)` 直出后端串 | 统一本地时区 | `HomeScreen:275` `formatDay` | P1 | B1 | [x]（O-02，F1 改走 `fmtDate`） |
| 首页/最近动态 | 「到期日 {date}」 | 显示 | 无 `due_date` 显示「—」 | 「待确认」或隐藏 | `home.dueDate` | P2 | B3 | [x]（F38：无到期日显示「到期日待确认」`home.dueTbd`） |
| 首页/整体 | 公开数据失败 | 状态 | 失败后各区块显示「暂无…」，像没数据 | 区分失败并整页重试 | `publicQ.isError` 未消费 | P1 | B1 | [x]（G1，F5：失败且无缓存时显示「加载失败 + 重试」，不再当空数据） |
| 首页/整体 | 首屏骨架 | 状态 | 只有房源骨架，其他区块数据到位才出现，页面跳动 | 三区块都占位 | `bodySections` loading 分支 | P2 | B3 | [x]（F38：房源/学校/动态三块同时渲染骨架，数据到位逐块替换） |
| 首页/整体 | 12s 超时兜底 | 状态 | 强制结束 loading 后若仍空，只能看到空态 | 提示下拉刷新 | `setTimeout` 兜底 | P2 | B3 | [x]（F38：兜底时若无本地缓存，Toast「加载较慢，可下拉刷新重试」`home.slowHint`） |
| 首页/整体 | 下拉刷新 | 交互 | RefreshControl 正常 | — | `RefreshControl` | — | — | [—] |

**跳转覆盖**：定位→LocationPicker ✅；搜索条→PropertySearch ✅；7 磁贴→7 分类页 ✅；rail 更多→分类 ✅；房源卡→详情 ✅；学校卡→找房(带学校) ✅；学校更多→找房(无参) ⚠️；新房卡→新房分类 ⚠️；动态行→无 ❌。无死链；首页全公开，无拦截需求。

---

## §3 找房列表 + 筛选（`src/screens/tenant/ListingsScreen.tsx` + `src/components/ListingsFeed.tsx`）

| 页面/位置 | 元素或跳转 | 类型 | 当前表现 | 期望表现 | 证据 | 等级 | 批次 | 状态 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 列表/导航栏 | 标题「房源搜索」 | 显示 | `RootNavigator` 硬编码中文，英/泰界面仍中文 | 走 i18n | `RootNavigator.tsx:252` | P1 | B1 | [x]（O-17，F6：栈页标题全量改 `nav.*` 三语） |
| 列表/hero | 大标题 + 城市胶囊 | 显示 | 城市空显示「当前城市」，最长 120 单行省略 | 未定位显示「选择城市」 | `heroCity` maxWidth 120 | P2 | B3 | [x]（F33：空值显示「选择城市」） |
| 列表/hero | 城市胶囊 → `LocationPicker` | 跳转 | 正确 | — | 实测 | — | — | [—] |
| 列表/hero | 搜索输入框 | 交互 | `returnKeyType=search` 但提交不收起键盘；无清除按钮 | 提交 dismiss；有值显示 × | `onSubmitEditing` 仅写历史 | P2 | B2 | [x]（G9，F1：提交收起键盘面板 + 有值时显示清除） |
| 列表/hero | 最近搜索面板 | 交互 | 仅 `onFocus` 置 true，从不置 false，历史一直挂着 | 失焦/选择/提交后收起 | `ListingsFeed:1175` 无 onBlur | P1 | B2 | [x]（G9，F1：失焦延后收起 + 选择/提交即收起） |
| 列表/hero | 最近搜索「清空」 | 交互 | 点击即清空，无确认无 toast | 清空反馈 | `clearRecent` | P2 | B3 | [x]（F33：清空后 Toast「已清空搜索记录」） |
| 列表/hero | 「附近」按钮 | 交互 | 高约 32pt；权限拒绝有 toast | 命中区 ≥44 | `nearbyBtn` padding | P2 | B3 | [x]（F33：加 hitSlop 12，命中区 ≈44） |
| 列表/hero | 居室快选 4 项 | 交互 | 高 32pt，单选态清晰 | 命中区 ≥44 | `heroBedItem` minHeight 32 | P2 | B3 | [x]（G5，F5：加 hitSlop 6/4 并补 a11y 选中态） |
| 列表/hero | 主按钮「查看 {n} 套房源」 | 显示 | `n` 取已加载条数，实测「查看 1 套房源」；数据多时永远 50 | 用接口 `total` | `ListingsFeed:1128,1253` | P1 | B1 | [x]（O-08，F1：父级取服务端 total 传入） |
| 列表/hero | 主按钮点击 | 交互 | 只收起面板+滚顶，无 loading | 请求中轻量 loading | `handleViewResults` | P2 | B3 | [x]（F34：`loading` 时按钮转圈并禁用） |
| 列表/hero | 「去地图看」→ 地图弹层 | 跳转 | 正确；无定位时静默不显示距离 | 提示未开定位 | `ListingsMapModal` | P2 | B3 | [x]（F34：权限拒绝/定位失败 Toast `list.mapNoLocation`） |
| 列表/hero | 业务分段 Tab「整租 / 买房」 | 显示 | 固定「整租」；商铺/厂房/土地进入同页仍写整租 | 按业务显示 | 实测「整租」 | P2 | B3 | [ ]（**待产品确认**：商用/厂房/土地进入找房页时的 Tab 文案与业务口径） |
| 列表/筛选栏 | 区域/类型/价格/更多/排序 | 显示 | 高 44 ✅、下划线 ✅、角标 ✅ | — | `filterTab` minHeight 44 | — | — | [—] |
| 列表/区域面板 | 区/街道 label | 显示 | 直接拼英文半角括号 `区 (12)` | 括号/计数走格式 | `label + ' (' + n + ')'` | P2 | B3 | [x]（F34：`list.districtCount`，中文全角括号、英泰半角） |
| 列表/区域面板 | 不限/重置/确认、点外部收起 | 交互 | 正常 | — | `PanelBackdrop` | — | — | [—] |
| 列表/类型面板 | 物业类型单选 | 交互 | 正常 | — | `TYPE_OPTIONS` | — | — | [—] |
| 列表/价格面板 | 预设 + 自定义 | 显示 | 泰铢预设标「≤3万/3-5万/5-8万/≥8万」（人民币口径） | 千泰铢/月或纯 THB | 实测面板文案；`PRICE_PRESETS` | P1 | B1 | [x]（O-05，F3：三语统一 `≤฿30,000` 等） |
| 列表/价格面板 | 自定义最小/最大 | 交互 | 仅数字；最小>最大无校验，结果空 | 校验+错误提示 | `onChangeText` 无比较 | P2 | B3 | [x]（F34：最低>最高时就地红字并禁用「确定」） |
| 列表/更多面板 | 户型/押金/入住/房龄/交房/朝向/楼层/装修/配套/面积/学校 | 显示 | 内容可滚动，分组清晰 | — | `morePanel` | — | — | [—] |
| 列表/空态 | 筛选无结果 | 状态 | C 端只显示「暂无房源」，无清空入口 | 提供「清空筛选」 | `isEmployee && activeChips` 条件 | P1 | B2 | [x]（F3：C 端同样显示清空筛选） |
| 列表/空态 | 加载失败 | 状态 | 空态有重试 ✅；有数据时顶部错误条 ✅ | — | `ListState onRetry` | — | — | [—] |
| 列表/卡片 | 封面/类型/收藏心/标题/地址/户型面积/房态/价格 | 显示 | 结构完整；收藏心 18+hitSlop12≈42 | 面积 i18n；命中区 ≥44 | `ListingsFeed:489,1094`；心 18 | P2 | B3 | [~]（F1 已改面积走 `formatArea`；收藏心命中区待 G5/B3） |
| 列表/卡片 | 卡片点击 → 详情 | 跳转 | 正确带 `{id}` | — | 实测 | — | — | [—] |
| 列表/卡片 | 收藏（未登录） | 跳转 | 跳 Login；返回不续做收藏 | 记录 pending 意图 | `fav` 分支 | P2 | B2 | [x]（G6，F5：登录返回后补做收藏） |
| 列表/卡片 | 收藏失败 | 反馈 | toast「操作失败/请稍后重试」✅ | — | `toast.show` | — | — | [—] |
| 列表/卡片 | 买房卡封面 | 显示 | `renderSaleItem` 忽略 `photos`，永远占位图标 | 有图显示封面 | `renderSaleItem` 无 RemoteImage | P1 | B2 | [x]（G12，F1：有 photos 时渲染封面） |
| 列表/卡片 | 买房卡收藏 | 交互 | 无收藏按钮 | 与租房卡一致 | 同上 | P2 | B3 | [ ]（**待产品确认**：买卖挂牌收藏以 `listing.id` 还是 `property_id` 落库，涉及接口口径） |
| 列表/分页 | 加载更多/到底提示 | 交互 | 未传 `hasMore/loadingMore/onLoadMore`，只显示第一页 50 条 | 接入分页+到底 | `ListingsScreen` 未传 props | P1 | B1 | [x]（G7，F3：首屏 50 条 + 上拉翻页 + 按 total 判到底；未实测滚动加载） |
| 列表/加载 | 首次加载 | 状态 | 整页被 LoadingState 替换，hero/筛选消失 | 只替换列表区 | `if (loading) return <LoadingState/>` | P2 | B3 | [x]（F34：页头/搜索卡/筛选栏保留，仅列表区 Loading） |
| 列表/翻译 | 「翻译」按钮 | 交互 | 仅语言不同才显示 ✅；结果长文本用 toast 不可滚动/复制 | 可滚动弹层 | `translate` + `toast` | P2 | B3 | [x]（F34：改可滚动弹层，右上关闭 + 文本可长按复制） |

**跳转覆盖**：城市→LocationPicker ✅；卡片→详情 ✅；地图点位→详情 ✅；未登录收藏→Login ✅（返回无续做 ⚠️）；翻译→接口 ✅；面板开合 ✅。无死链。

---

## §4 房源详情（`src/screens/public/PublicListingDetailScreen.tsx` + `PublicListingRow.tsx`）

| 页面/位置 | 元素或跳转 | 类型 | 当前表现 | 期望表现 | 证据 | 等级 | 批次 | 状态 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 详情/相册 | 横向分页大图 | 显示 | 可滑；无页码/张数 | 右下「1/8」 | 仅 ScrollView 分页 | P2 | B3 | [x]（F41：右上角浮动页码「当前/总数」，随滑动更新，仅多于 1 张时显示） |
| 详情/相册 | 无图占位 | 显示 | 灰底 +「暂无图片」✅ | — | `pub.noPhoto` | — | — | [—] |
| 详情/标题 | 楼盘名/房号/兜底 | 显示 | 兜底文案「房源列表」（语境错） | 「房源详情」/「未命名房源」 | `pub.listingsTitle` 兜底 | P2 | B3 | [x]（F33：兜底改 `list.unnamed`「未命名房源」） |
| 详情/标题 | 租/售类型标签 | 显示 | 三语 ✅ | — | `listingTypeLabel` | — | — | [—] |
| 详情/价格 | 主价格 +「/月」 | 显示 | 实测 `฿45,000/月`；空价格仍渲染「— /月」 | 空值不渲染单位 | 实测；`price ? … : '—'` | P2 | B3 | [x]（F33：无价格不渲染 /月） |
| 详情/价格 | 折合人民币 | 显示 | 实测 `≈ ¥8,654/月`；无汇率时间/来源；汇率异步前用兜底 | 标注仅供参考；不闪变 | 实测；`RATES` | P2 | B3 | [x]（F39：价格下补提示「按参考汇率折算，实际以成交价为准」`pub.fxHint`） |
| 详情/价格 | 单价 | 显示 | 实测 `฿692.31/㎡ · ≈ ¥133/㎡`；租赁未标 /月；小数位不一致 | 标注 /㎡/月，小数统一 | 实测 | P2 | B3 | [x]（F33：租赁补 /月，沿用 `formatUnitPrice` 两位小数） |
| 详情/整体 | 主操作可达性 | 布局 | 实测 960×632 首屏只到关键参数；预约/联系在长滚动后，无吸底栏 | 底部吸底双按钮 | 实测 | P1 | B2 | [x]（F4：吸底栏「收藏图标 + 联系经纪人 + 预约看房」，正文底部按栏高+安全区留白） |
| 详情/操作 | 「我的关注」 | 显示 | 文案=关注、图标=收藏心；busy 仅禁用无 loading | 文案统一「收藏」+ loading | `favBusy` | P2 | B3 | [x]（F39：文案改「收藏 / Save / บันทึก」，busy 时补小号 loading） |
| 详情/操作 | 收藏失败 | 反馈 | 红字「操作失败」✅ | — | `favMsg` | — | — | [—] |
| 详情/操作 | 「降价提醒」 | 交互 | 未登录提示+跳 Login ✅；订阅失败只 `console.warn` 无提示 | toast + 状态回滚 | `catch(console.warn)` | P1 | B1 | [x]（G11，F6：失败改 toast「操作失败 + 原因」） |
| 详情/操作 | 降价提示行 | 显示 | 与按钮文案重复 | 改说明文案或隐藏 | `priceAlertOn` | P2 | B3 | [x]（F39：已订阅改说明文案「已开启降价提醒，价格变动会通知你」`pub.priceAlertOnHint`） |
| 详情/参数 | KV 网格 | 显示 | 空值 KV 返回 null，可能半边空洞 | 允许留白或显示「—」 | `KV` null 分支 | P2 | B3 | [—]（F39 复核：空值行直接不渲染，网格自动重排，无固定空洞） |
| 详情/参数 | 户型 `x BED · y BATH` | 显示 | 实测中文界面直出 `2 BED · 1 BATH` | 走 i18n | 实测；`PublicListingDetailScreen:460` | P1 | B1 | [x]（O-03，F1 改 `prop.bedBath`） |
| 详情/参数 | 面积/押金/编号 | 显示 | 面积 `㎡` 走 i18n ✅；押金金额/月数二选一 ✅；实测押金 ฿90,000 | — | 实测 | — | — | [—] |
| 详情/小区 | 开发商/户数/交房/交通 | 显示 | 用中文全角冒号「：」硬编码 | i18n 模板 | `:487,492,497,503` | P1 | B1 | [x]（O-04，F5：冒号走 `common.colon`，三语） |
| 详情/小区 | 物业费 | 显示 | `{x} THB/㎡/月` 再拼人民币，币种重复、硬编码 THB | 统一金额/单价格式 | `:526-528` | P2 | B3 | [x]（F33：改 `currencySymbol(data.currency)`） |
| 详情/小区 | 均价 | 显示 | 固定「THB」 | 用数据 `currency` | `:533` | P2 | B3 | [x]（F33：改 `data.currency`） |
| 详情/小区 | 「查看小区详情」 | 跳转 | 正确带 `{id}` | — | `PublicCommunityDetail` | — | — | [—] |
| 详情/学校 | 学校行 | 显示 | 名称/英文名/距离；距离原样小数 | 统一 1 位小数 | `:576`；`PublicListingRow:115` | P2 | B3 | [x]（F39：距离统一 `toFixed(1)`） |
| 详情/学校 | 学校行点击 | 跳转 | 有 id 才可跳；无 id 仍像可点但无反馈 | 无 id 去可点样式 | 条件 onPress | P2 | B3 | [x]（F39：无 id 时 `disabled` + 无按下态 + 不声明 button role） |
| 详情/描述 | 长描述 | 显示 | 全文展开，无展开/收起 | 超 6 行折叠 | `description` 直出 | P2 | B3 | [x]（F39：默认 6 行折叠，超 120 字给「展开/收起」+ 箭头） |
| 详情/经纪人 | 公司/姓名/锁定横幅 | 显示 | 未登录显示锁定提示 ✅ | — | `lockBanner` | — | — | [—] |
| 详情/经纪人 | 「联系经纪人」 | 跳转 | 成功→`ChatDetail{conversationId}` ✅；未登录→Login ✅；失败提示写进预约消息变量（用户看不到） | 独立 toast/错误行 | `:767` 同变量 `bookingMsg` | P1 | B1 | [x]（G11，F1 改 `notify` toast） |
| 详情/经纪人 | 电话行 | 交互 | 未登录 disabled +「登录后拨打」✅；登录后 `tel:` ✅ | 禁用态视觉再弱化 | `dialDisabled` | P2 | B3 | [x]（F39：未登录整行 `opacity 0.55`、图标转灰，禁用态可感知） |
| 详情/经纪人 | 微信/LINE/WhatsApp | 显示 | 未登录追加「(登录后可见)」✅ | — | `loginToView` | — | — | [—] |
| 详情/预约 | 预约按钮 + 弹层 | 交互 | 3 个快捷时间；未登录补称呼/手机号；防抖 ✅；成功 toast ✅ | — | 实测未登录不可见 | — | — | [—] |
| 详情/预约 | 弹层输入框 | 布局 | 无 KeyboardAvoidingView，小屏键盘盖「提交」 | 键盘上移 | 无 KAV | P1 | B1 | [x]（G8，F5：弹层改 KAV；未真机验证） |
| 详情/预约 | 手机号 | 校验 | 只判空，任意字符可提交 | 格式校验+错误文案 | `bookingPhone` 仅 trim | P1 | B1 | [x]（G8，F5：允许 +/空格/括号/连字符，至少 6 位数字） |
| 详情/预约 | 预约失败 | 反馈 | 「预约失败，请稍后重试」✅ | — | `bookingMsg` | — | — | [—] |
| 详情/留资 | `PublicInquiryForm` | 显示 | 未逐元素审，下一批补 | — | `PublicInquiryForm.tsx` | — | — | [—]（F39 逐元素审：标签/占位/`maxLength`/手机号格式校验/提交 loading/成功清空/编辑即清旧提示均齐备，无需改） |
| 详情/推荐 | 相似房源列表 | 显示 | 结构同列表页；`BED/BATH` 英文 | 走 i18n | `PublicListingRow:38-39` | P1 | B1 | [x]（O-03，F1 改 `prop.bedBath` + `formatArea`） |
| 详情/推荐 | 卡片 → 详情 | 跳转 | 正确 push；栈持续增长 | 可接受 | `navigation.push` | — | — | [—] |
| 详情/悬浮 | 返回/回主页 | 交互 | 功能正确；按钮 36×36 | 命中区 ≥44 | `circleBtn` 36 | P1 | B2 | [x]（G5，F4：44×44） |
| 详情/异常 | 加载中 | 状态 | 全屏 spinner 无骨架，返回按钮消失 | 保留返回+骨架 | `loading` 分支 | P2 | B3 | [x]（F39：加载态保留右上悬浮返回；未加骨架，详情多为秒级） |
| 详情/异常 | 加载失败/不存在 | 状态 | 都显示「房源不存在」+返回，无重试 | 失败可重试；404 才不存在 | `!data` 单一分支 | P1 | B1 | [x]（G1，F1：失败态「加载失败 + 重试」，404 仍为不存在） |

**跳转覆盖**：返回 ✅；回主页 ✅；小区详情 ✅；学校详情 ✅；联系经纪人→会话/登录 ✅（失败反馈位置错 ❌）；电话 `tel:` ✅；预约→接口→toast ✅；相似房源→详情 ✅；留资→接口（待审）。

---

## §5 展示口径问题总表（首批）

> 修复原则：只往共享格式化方法收敛（`src/utils/format.ts`、`src/lib/publicSite.ts`），禁止页面内再写 `slice` 或手拼单位。

| 编号 | 字段/类型 | 出现位置 | 当前渲染 | 期望渲染 | 证据 | 影响页面 | 等级 | 批次 | 状态 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| O-01 | 面积单位 | `ListingsFeed:489,1094`；`tenant/HomeScreen:379,460`；`admin/PropertyDetailScreen:279`；`owner/HomeScreen`（`propMeta`） | 手拼 `㎡` | `formatArea()` 数值+i18n 单位 | 实测 `65㎡` | 首页/找房/详情/管理端/业主首页 | P2 | B3 | [~]（F1：共享 `formatArea` + 首页/找房已换；F20：业主资产首页已换；管理端待 B3） |
| O-02 | 日期（日期精度） | `tenant/HomeScreen:275`；`admin/LeasesScreen:67`；`admin/PaymentsScreen:115`；`admin/PropertyDetailScreen:107`；`owner/MarketingScreen:117`；`settings/MyLeaseDetailScreen:16`；`admin/AttendanceManageScreen:805` | `slice(0,10)` 直出后端串，空值 `'-'` | `fmtDate()` 本地时区，空值 `—` | `formatDay` 等 | 首页动态/账单/租约/考勤/营销 | P1 | B1 | [~]（F1：共享 `fmtDate` 改本地时区，已替换首页/管理端合同·收付款·房源·首页/业主营销/我的租约；考勤日期段为纯日期无需换算；`settings/MyLeaseScreen`、`MyOrders*`、`tenant/DocumentsScreen`、`owner/PropertyDetailScreen` 待 B1 续） |
| O-03 | 户型文案 | `PublicListingDetailScreen:460`；`PublicListingRow:38-39` | `2 BED · 1 BATH` 英文硬编码 | i18n 模板 | 实测 | 详情/学校/小区/相似房源 | P1 | B1 | [x]（F1） |
| O-04 | 中文标点 | `PublicListingDetailScreen:487,492,497,503` | `开发商：` 等 JSX 直写 | `t(...)` 模板 | 代码 | 详情-小区 | P1 | B1 | [x]（F6：小区参数已用 `KV` + `t()`；另清掉 5 处 `}：{` 直写，统一 `t('common.colon')`） |
| O-05 | 价格单位 | `ListingsFeed:1541,1561` | 泰铢输入框标「万/月」 | 「千泰铢/月」或纯 THB | 实测「≤3万」 | 找房-价格 | P1 | B1 | [x]（F3：预设改 `≤฿30,000` 等三语口径） |
| O-06 | 币种/小数 | `PublicListingDetailScreen:526-534` | `THB/㎡` 硬编码；`฿692.31` vs `¥133` | 统一金额/单价格式 | 实测 | 详情-小区/价格 | P2 | B3 | [x]（F33：物业费/均价改走数据币种，单价沿用 `formatUnitPrice`） |
| O-07 | 距离 | `PublicListingDetailScreen:576`；`PublicListingRow:115`；`ListingsMapModal:156` | 两处原样小数，地图 `toFixed(1)` | `formatDistance()`：<1km 用米 | 代码 | 详情学校/列表/地图 | P2 | B3 | [ ] |
| O-08 | 计数 | `ListingsFeed:1128,1253` | 「查看 50 套」用已加载数 | 接口 `total` | 实测「查看 1 套」 | 找房 hero | P1 | B1 | [x]（F1：父级传入服务端 total） |
| O-09 | 房态兜底 | `tenant/HomeScreen:384` | 未知/空 → 「已出租」 | 未知不显示 | 代码 | 首页卡片 | P1 | B1 | [x]（F1） |
| O-10 | 学费区间 | `tenant/HomeScreen:543` | `tuition_range` 原样 | 结构化金额区间 | 代码 | 首页学校 | P1 | B1 | [x]（F5：学段空值不再冒充类型；学费为后端预格式化区间串，按既定口径直接展示） |
| O-11 | 时间精度 | `utils/format.ts:55` | `fmtDate` `slice(0,16)`，与 `fmtDateTime` 两套 | 复用 `fmtDateTime` | 代码 | 全站 | P1 | B1 | [x]（F1） |
| O-12 | locale 依赖 | `components/SignAssetPicker:403` | `toLocaleDateString()` | 统一 `fmtDate` | 代码 | 签署资产 | P2 | B3 | [ ] |
| O-13 | 时区 | `employee/CalendarScreen:341,356,372,387` | `new Date('...T10:00:00')` 无 Z | 明确后端口径，UTC 补 Z | 代码 | 员工日历 | P1 | B1 | [ ]（待后端：带看 `scheduled_at` 由 App 以本地 naive 提交，后端回传是否带 Z 未知；贸然补 Z 会把 10:00 显示成 17:00，需后端口径确认后再改，本期不动） |
| O-14 | 硬编码中文 | `admin/HomeScreen:420` | `p.description \|\| '租金'` + `slice(0,10)` | i18n + `fmtDate` | 代码 | 管理端首页 | P1 | B1 | [x]（F1：`admHome.*` 三语 + `fmtDate`） |
| O-15 | 空值符号 | `admin/*` 多处 `'-'` vs `'—'` | 同屏两种符号 | 统一 `—` | 代码 | 管理/业主端 | P2 | B3 | [ ] |
| O-16 | 币种默认 | `utils/format.ts:14` | 未传 currency 一律 THB | 显式传数据币种 | 代码 | 全站 | P2 | B3 | [ ] |
| O-17 | 裸中文标题 | `RootNavigator:252,281` 等 | 标题硬编码；找房列表标题叫「上架房源」 | 全走 i18n | 代码 | 全站栈页 | P1 | B1 | [x]（F6：新增 `nav.*` 41 键 × 三语，栈页标题全部走 `t()`） |
| O-18 | 英文默认值 | `PublicListingDetailScreen:767` | `Inquiry: ...` | i18n | 代码 | 详情-留资 | P2 | B3 | [x]（F33：新增 `pub.inquiryDefault` 三语） |
| O-19 | 枚举漏翻 | `PublicListingRow:38-39` 等 | 局部英文残留 | 三语覆盖 | 同 O-03 | 详情/列表 | P1 | B1 | [x]（F1，同 O-03） |
| O-20 | 未知枚举 | `ListingsFeed:493` vs `HomeScreen:384` | 一处 `—`、一处编造 | 统一「未知不渲染/—」 | 代码 | 列表/首页 | P1 | B1 | [x]（F1：首页未知房态不再编造） |

**下一批口径扫描**：金额负数/区间、百分比小数、电话格式、编号截断、HTML 直出、相对时间；App 与 Web/小程序同字段对照。

---

## §6 登录 / 注册（`LoginScreen.tsx`、`RegisterScreen.tsx`、`OAuthButtons.tsx`、`OAuthMockModal.tsx`、`useOtp.ts`、`useOAuth.ts`）

| 页面/位置 | 元素或跳转 | 类型 | 当前表现 | 期望表现 | 证据 | 等级 | 批次 | 状态 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 登录/方式选择 | 页面整体 | 导航 | 从收藏/消息等受保护动作 push 进来，选择方式页**没有可见返回/关闭**，只能系统返回 | 左上角关闭，明确「稍后再说」 | `stage==='choose'` 无返回按钮 | P1 | B2 | [x]（F5：左上角 44×44 关闭，可返回上一页） |
| 登录/方式选择 | 品牌 Logo | 显示 | 168×168 纯图形，无产品名/一句价值说明 | 补产品名与一句定位 | 仅 `<Image>` + a11y | P2 | B3 | [x]（F40：图形下补产品名 `HaoFang.World` + 一句定位 `login.brandTagline` 三语） |
| 登录/方式选择 | 语言切换按钮 | 交互 | 40×40 + hitSlop 6 ✅；3 语可切 ✅ | — | 实测可点 | — | — | [—] |
| 登录/方式选择 | Google / Apple / 手机号 / 邮箱 四个入口 | 显示 | 原为硬编码中文 | 走 i18n | `OAuthButtons.tsx` | P1 | B1 | [x]（F2：`oauth.*` 三语） |
| 登录/方式选择 | Apple 按钮（Android/Web） | 交互 | 原按钮照常显示，点击必然提示「Apple 登录仅 iOS 支持」 | 非 iOS 隐藏该按钮 | `OAuthButtons` | P1 | B1 | [x]（F2：仅 iOS 渲染；未真机验证） |
| 登录/方式选择 | OAuth 进行中 | 交互 | 只禁用 Google/Apple，手机号/邮箱入口仍可点，可能双开流程 | loading 时四个入口统一禁用 | `OAuthButtons` 仅传 oauthLoading 给两个 | P2 | B3 | [x]（F40：手机号/邮箱补 `disabled`，四入口 loading 时统一变淡 `btnDisabled`） |
| 登录/方式选择 | OAuth 失败/未配置 | 反馈 | 原为硬编码中文 | i18n + 用户可懂的原因 | `useOAuth.ts` | P1 | B1 | [x]（F2：`oauth.*` 三语） |
| 登录/方式选择 | 页脚「还没有账号？去注册」 | 跳转 | 正确进 `Register` ✅；点击区只有文字高度（约 20pt） | 整行可点，≥44 | 文本 Pressable | P2 | B3 | [x]（F33：整行 Touchable + minHeight 44） |
| 登录/邮箱表单 | 返回按钮 | 交互 | 36×36 + hitSlop 12 ✅ | — | `hitSlop` | — | — | [—] |
| 登录/邮箱表单 | 标题「欢迎回来」 | 显示 | 三语 ✅ | — | `login.welcomeBack` | — | — | [—] |
| 登录/邮箱表单 | 邮箱 / 密码输入框 | 显示 | 原 placeholder 用的是错误文案「请输入邮箱」「请输入密码」，不是示例值 | 「you@example.com」「至少 8 位」 | 源码 placeholder 复用 error 文案 | P2 | B3 | [x]（F2：`login.emailPlaceholder` / `login.passwordPlaceholder` 三语） |
| 登录/邮箱表单 | 邮箱 / 密码校验 | 校验 | 只判空，格式错误要等后端 400；错误无字段定位（除空值） | 失焦即校验 + 字段下方错误 | `validate` 仅 trim | P2 | B3 | [x]（F40：邮箱失焦校验格式 `login.emailInvalid`、密码失焦判空；错误均显示在对应字段下方） |
| 登录/邮箱表单 | 密码可见性 | 交互 | 无显示/隐藏切换 | 眼睛图标 | 无 `secureTextEntry` 切换 | P2 | B3 | [x]（F40：密码框右侧眼睛切换明文/密文，含 `login.showPassword`/`hidePassword` 屏读名） |
| 登录/邮箱表单 | 「记住我」 | 交互 | 勾选框 18pt + 上下 padding，整行约 26pt | 整行 ≥44 | `rememberRow` paddingVertical 4 | P2 | B3 | [x]（F33：加 hitSlop 10 与 checkbox a11y） |
| 登录/邮箱表单 | 「忘记密码？」 | 跳转 | 原为 Alert 静态文案，App 内无落地路径 | 客服电话/邮件入口 | `Alert.alert` | P2 | B3 | [x]（F4：底部弹层拉取公司客服电话/邮箱，`tel:`/`mailto:`；无渠道时给说明） |
| 登录/邮箱表单 | 提交按钮 | 交互 | 登录中 disabled + 菊花 ✅；成功后由导航切换 ✅ | — | `loginBusy` | — | — | [—] |
| 登录/邮箱表单 | 登录失败 | 反馈 | 一律 toast，表单底部无红字；用户不知道是账号还是密码错 | 字段级错误 + 保留输入 | `notifyError` | P2 | B3 | [x]（F40/G11：400/401 改为密码字段下方「邮箱或密码错误」红字，已输入内容保留，不再弹 toast） |
| 登录/手机表单 | 国家码默认值 | 显示 | 原先固定 `+86`，泰国用户每次都要手动切 | 按设备 locale/当前城市默认 | `useOtp.ts` | P1 | B1 | [x]（F4：优先级 上次手动选择 → locale → 定位城市 → +66，并持久化） |
| 登录/手机表单 | 国家码选项文案 | 显示 | 9 个选项全中文 | 三语国家名 | `useOtp.ts` | P1 | B1 | [x]（F2：`country.*` 三语） |
| 登录/手机表单 | 手机号输入 | 校验 | 只判空，无位数/数字校验 | 按国家码校验位数 | `validate` | P2 | B3 | [x]（F40：`useOtp` 增国家码位数表 + `isValidPhone`，失焦/发码/登录前校验纯数字与位数，错误回填字段下方） |
| 登录/手机表单 | 验证码发送按钮 | 交互 | 倒计时显示「59s」纯数字，没有「重新发送」语义；disabled 变淡 ✅ | 「重新发送(59s)」 | `secondsLeft > 0 ? \`${secondsLeft}s\`` | P2 | B3 | [x]（F33：改 `login.resendCountdown` 三语） |
| 登录/手机表单 | 验证码发送成功 | 反馈 | toast 文案原为硬编码「验证码已发送」 | i18n | `useOtp.ts` | P1 | B1 | [x]（F2） |
| 登录/手机表单 | 验证码发送失败 | 反馈 | toast 原为硬编码 | i18n + 原因 | `useOtp.ts` | P1 | B1 | [x]（F2） |
| 登录/两种表单 | 协议与政策 | 显示 | 原无用户协议/隐私政策入口 | 底部「登录即表示同意《用户协议》《隐私政策》」可点 | 源码无相关节点 | P1 | B2 | [x]（F4：底部可点入口 → `Agreement` 占位页，可返回） |
| 登录/两种表单 | 键盘避让 | 布局 | iOS 用 padding，Android `behavior` 未设，小屏键盘可能盖提交按钮 | Android 用 height/KeyboardAvoidingView | `behavior={Platform.OS==='ios'?'padding':undefined}` | P2 | B3 | [~]（F40/G8：Android 改 `behavior="height"`；**需真机验证**键盘弹起后提交按钮是否可见，浏览器 960×632 无法复现） |
| 注册/方式选择 | 页面整体 | 导航 | 同登录：无可见返回/关闭 | 左上关闭 | `stage==='choose'` | P1 | B2 | [x]（F6：左上角 44×44 关闭，两阶段常驻，无历史时回 Main） |
| 注册/表单 | 全部字段文案 | 显示 | 原为标题/字段名/placeholder/按钮/页脚全部硬编码中文 | 全部走 i18n | `RegisterScreen.tsx` | P1 | B1 | [x]（F2：`register.*` 三语） |
| 注册/表单 | 表单错误 | 反馈 | 错误统一显示在角色选择下方（页面底部），且同时 toast + 红字重复 | 定位到出错字段，单一提示 | `error` 单变量 + `notifyError` | P1 | B1 | [x]（G8/G11，F6：出错字段红框 + 只保留一条行内错误，去掉重复 toast） |
| 注册/表单 | 密码规则 | 显示 | 无长度/强度说明，提交后才知道不合规 | 常驻规则提示 | 源码无规则文案 | P2 | B3 | [x]（F40：邮箱模式下密码框下常驻 `register.pwdRule`；**占位文案，正式密码规则待法务/产品确认**） |
| 注册/表单 | 角色选择（租客/房东） | 显示 | 两个选项无明显说明；无经纪/员工入口（业务设定可接受） | 各加一句结果说明 | 仅 label | P2 | B3 | [x]（F40：两胶囊改两行卡片，各补一句结果说明 `register.tenantHint`/`register.ownerHint`，选中态同步高亮） |
| 注册/表单 | 注册成功 | 反馈 | 直接进入对应角色首页，无欢迎/引导 | 轻量欢迎提示 | `applySession` 后导航 | P2 | B3 | [x]（F40：成功后 Toast「注册成功 / 欢迎加入，{name}」，不拦截跳转） |
| 注册/表单 | 协议与政策 | 显示 | 原无勾选、无链接 | 勾选 + 可点入口 | 源码无 | P1 | B2 | [x]（F4：新增勾选框与两个可点入口；未勾选提交时提示） |
| 注册/表单 | 无障碍标签 | 显示 | 原 `accessibilityLabel` 硬编码中文 | 走 i18n | `RegisterScreen` | P2 | B3 | [x]（F2） |
| 注册/表单 | 提交按钮 | 交互 | 注册中禁用 + 菊花 ✅ | — | `busy` | — | — | [—] |
| OAuth mock 弹窗 | 弹窗整体 | 布局 | 居中卡片，点遮罩关闭；无「取消」按钮；无键盘避让 | 补取消与键盘避让 | `OAuthMockModal.tsx` | P2 | B3 | [ ] |
| OAuth mock 弹窗 | 邮箱校验/错误 | 反馈 | 只判空，错误文案已 i18n | 补充格式校验 | `useOAuth.ts` | P1 | B1 | [x]（F2：文案三语；格式校验仍缺） |

**跳转覆盖**：登录↔注册 ✅；登录关闭入口 ❌；忘记密码 ❌（无落地页）；OAuth→系统授权/mock 弹窗 ✅；注册成功→角色首页 ✅；员工/房东注册入口 ❌（业务未开放，可接受）。

**本组小结**：登录/注册本身可用，最大问题是**三语在注册页几乎完全缺失**（用户切到英/泰后看到整页中文）、**默认国家码 +86 与泰国市场不符**、**无协议入口**、**选择方式页无法关闭**。

---

## §7 我的与设置（`ProfileScreen` + `settings/*` + `AboutScreen`）

| 页面/位置 | 元素或跳转 | 类型 | 当前表现 | 期望表现 | 证据 | 等级 | 批次 | 状态 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 我的/未登录卡 | 整卡「登录/注册」 | 跳转 | 整卡可点进登录 ✅ | — | `guestCard` | — | — | [—] |
| 我的/右上客服 | 未登录→Login；已登录开客服会话 | 跳转 | 正确；失败仅 Alert | 失败走 toast | `openSupport` | P2 | B3 | [x]（F33：失败改 `notifyError`，Web 也有反馈） |
| 我的/用户卡 | 无手机号时回退邮箱 | 显示 | 邮箱也空时显示 `'-'` | 与全站统一 `—` | `ProfileScreen:766` | P2 | B3 | [x]（F33：`'-'` → `—`） |
| 我的/设置行 | 行尾 `›` | 显示 | 是普通 Text，屏读会念箭头 | 装饰性字符对无障碍隐藏 | `renderSettingItem:638` | P2 | B3 | [ ] |
| 我的/设置行 | 行点击区 | 交互 | 13pt 上下留白 + 30 图标盒，行高约 56 ✅ | — | `settingRow` | — | — | [—] |
| 我的/账户三行 | 绑定手机 / 绑定邮箱 / 账号与安全 | 跳转 | 三行都进同一个 EditProfile，页面不定位到对应字段 | 进页聚焦对应字段 | `handleSettingPress:352` | P2 | B3 | [ ] |
| 我的/清除缓存 | 点击 | 反馈 | 仅 `Alert.alert`；Web 下是空实现，等于无反馈 | 统一 `notify` | `ProfileScreen:374` | P1 | B2 | [x]（F8：改 `showInfo`，Web 走 `window.alert`） |
| 我的/权限设置 | Web 点击 | 反馈 | 同样用 `Alert.alert`，Web 无任何反应 | 统一 `notify` | `ProfileScreen:364` | P1 | B2 | [x]（F8） |
| 我的/客服会话 | 打开失败 | 反馈 | `Alert.alert`，Web 无反馈 | 统一 `notifyError` | `ProfileScreen:652` | P2 | B3 | [x]（F8） |
| 我的/退出登录 | 二次确认 | 交互 | 原生 Alert，Web 用 `confirm` ✅ | — | `handleLogout` | — | — | [—] |
| 编辑资料/整页 | 字段与按钮文案 | 显示 | 姓名/手机号/验证码/邮箱/发送验证码/保存全为硬编码中文，英泰界面整页中文 | 走 i18n | `EditProfileScreen:71-124` | P1 | B1 | [x]（F7：`settings.profile*` 三语） |
| 编辑资料/手机号与邮箱 | 提交校验 | 校验 | 只判「改手机号是否填了验证码」，不校验号码位数与邮箱格式 | 提交前校验格式 | `EditProfileScreen:42-58` | P1 | B1 | [x]（F7：手机号 6-15 位数字、邮箱正则；发送验证码前同样校验） |
| 编辑资料/发送验证码 | 重复点击 | 交互 | 仅请求期间禁用，无倒计时，可连点 | 60s 倒计时 | `sendingCode` | P2 | B3 | [ ] |
| 编辑资料/返回 | 有未保存修改 | 交互 | 直接离开无提示 | 可选二次确认 | 无 | P2 | B3 | [ ] |
| 修改密码/整页 | 字段与按钮文案 | 显示 | 当前密码/新密码/确认新密码/确认修改全硬编码中文 | 走 i18n | `ChangePasswordScreen:51-85` | P1 | B1 | [x]（F7：`settings.password*` 三语，含校验提示） |
| 修改密码/成功 | 反馈时序 | 交互 | 先 `logout()` 再 `notify()`，提示可能随页面卸载丢失 | 先提示或由登录页兜底提示 | `ChangePasswordScreen:40-41` | P2 | B3 | [x]（F7：改为先 toast 再退出） |
| 通知设置/时区 | 输入 | 交互 | 自由文本，须手输 `Asia/Bangkok`，无格式校验 | 选择器或格式校验 | `NotificationPrefsScreen:79` | P2 | B3 | [ ] |
| 通知设置/保存 | 反馈 | 交互 | toast「已保存」✅，停留本页 | 可接受 | `NotificationPrefsScreen:54` | — | — | [—] |
| 通知设置/读取失败 | 空态 | 状态 | 有失败态 + 重试 + 阻止覆盖 ✅，副文案硬编码中文 | i18n | `NotificationPrefsScreen:68` | P2 | B3 | [x]（F7：`settings.loadPrefsFailed` / `settings.noOverwritePrefs`） |
| 语言设置/选择行 | 选择后 | 交互 | 注释写「即时生效并返回」，实际只 `setLang` 不返回；无选中态 a11y | 选择后返回 + `accessibilityState` | `SettingsLanguageScreen:27` | P2 | B3 | [ ] |
| 业务设置/读取失败 | 空态 | 状态 | 同通知设置，副文案硬编码中文 | i18n | `AdminBusinessSettings:84` | P2 | B3 | [x]（F7：`settings.loadBizFailed` / `settings.noOverwriteBiz`） |
| 业务设置/天数 | 校验 | 校验 | 0-180 / 0-365 + toast ✅ | — | `save:53-60` | — | — | [—] |
| 我的租约/状态徽标 | 显示 | 状态 | 四种状态硬编码中文；未知状态被当成「待生效」 | i18n；未知显示「未知」 | `MyLeaseScreen:18-23,121` | P1 | B1 | [x]（F7） |
| 我的租约/标题回退 | 显示 | 显示 | `租约 #xxxx` 硬编码 | i18n | `MyLeaseScreen:26` | P1 | B1 | [x]（F7：`lease.idPrefix`） |
| 我的租约/失败与空态 | 状态 | 状态 | 「租约加载失败 / 重试 / 签约后…」硬编码 | i18n | `MyLeaseScreen:65,84,90` | P1 | B1 | [x]（F7） |
| 我的租约/日期 | 显示 | 显示 | 页内自写 `slice(0,10)`，未走 `fmtDate` | 统一 `fmtDate` | `MyLeaseScreen:15` | P2 | B3 | [x]（F7：改用 `utils/format` 的 `fmtDate`） |
| 我的租约/分页 | 交互 | 交互 | 业主分支 `page_size 50` 无翻页 | 分页或「仅显示最近 50 条」说明 | `MyLeaseScreen:56` | P2 | B3 | [ ] |
| 租约详情/明细 | 押金 / 租期开始 / 结束 / 电子合同 / 特殊条款 | 显示 | 全部硬编码中文 | i18n | `MyLeaseDetailScreen:110-141` | P1 | B1 | [x]（F7） |
| 租约详情/查看合同 | 交互 | 交互 | 有 `contract_url` 时以主色显示「查看合同」，却不可点（假链接） | 可点打开合同；无 URL 不渲染 | `MyLeaseDetailScreen:132-137` | P1 | B1 | [x]（F7：改为可点，WebBrowser 打开并降级 `Linking`） |
| 租约详情/已过天数 | 显示 | 显示 | 「已过 x / 共 y 天」硬编码 | i18n 带参数 | `MyLeaseDetailScreen:103` | P1 | B1 | [x]（F7：`lease.passedOf`） |
| 租约详情/加载与失败 | 状态 | 状态 | 加载中/失败都直接渲染空 View（白屏），无重试 | 三态 + 重试 | `MyLeaseDetailScreen:60-62` | P1 | B1 | [x]（F7：`ListState` 加载/失败重试） |
| 租约详情/状态 | 显示 | 状态 | 未知状态回落「待生效」 | 未知显示「未知」 | `MyLeaseDetailScreen:64` | P1 | B1 | [x]（F7） |
| 我的订单/状态徽标 | 显示 | 状态 | 7 种状态硬编码中文；未知回落「洽谈中」 | i18n；未知「未知」 | `MyOrdersScreen:18-26,129` | P1 | B1 | [x]（F8） |
| 我的订单/标题与日期 | 显示 | 显示 | `交易订单 xxxx` 硬编码；`slice(0,10)` | i18n + `fmtDate` | `MyOrdersScreen:15,139` | P1 | B1 | [x]（F8） |
| 我的订单/失败与空态 | 状态 | 状态 | 硬编码中文 | i18n | `MyOrdersScreen:69,88,97` | P1 | B1 | [x]（F8） |
| 我的订单/分页 | 交互 | 交互 | 只取第一页（`DETAIL_PAGE_SIZE`），无翻页 | 同我的租约 | `MyOrdersScreen:44` | P2 | B3 | [ ] |
| 订单详情/状态与节点 | 显示 | 显示 | 状态、交易节点、创建订单/签约时间/过户日期全硬编码 | i18n | `MyOrderDetailScreen:18-26,63-97` | P1 | B1 | [x]（F8） |
| 订单详情/加载与失败 | 状态 | 状态 | 加载中/失败白屏，无重试 | 三态 + 重试 | `MyOrderDetailScreen:55-57` | P1 | B1 | [x]（F8：`ListState`） |
| 订单详情/未知状态 | 显示 | 状态 | 未知回落「洽谈中」 | 未知「未知」 | `MyOrderDetailScreen:59` | P1 | B1 | [x]（F8） |
| 关于我们/注册号 | 显示 | 显示 | `注册号：xxx` 用全角冒号 | `common.colon` | `AboutScreen:142` | P2 | B3 | [ ] |
| 关于我们/缺失字段 | 显示 | 显示 | 后端空字段整行不渲染，不编造 ✅ | — | `AboutScreen` | — | — | [—] |

**本组小结**：结构完整、跳转无死链，主要问题是**四个二级页整页中文未国际化**（编辑资料、修改密码、我的租约/详情、我的订单/详情），以及**未知枚举被猜成某个状态**、**租约详情「查看合同」是假链接**、**详情页缺加载/失败态**。

---

## §8 进度

- [x] 第 1 批：租客首页、找房列表+筛选、房源详情（逐元素+逐跳转）
- [x] 第 1 批：展示口径全站扫描（日期/面积/币种/距离/枚举）
- [x] 表格增加「证据」「修复批次」列；建立通用问题组 G1–G14
- [x] 第 2 组：登录 / 注册（36 条，P1 14 / P2 17 / 一致 5）
- [x] 修复批次 F1（口径根因 + 低风险通用件，13 条，`tsc --noEmit` 通过）
- [x] 第 3 组：我的与设置（41 条，P1 19 / P2 16 / 一致 6）
- [x] 第 4 组：聊天（列表+详情，17 条，P1 10 / P2 6 / 一致 1）
- [x] 第 5 组：分类页（新房/二手房/厂房/商业/酒店/土地，13 条，P0 1 / P2 10 / 一致 2）
- [x] 第 6 组：地图与区域选择（18 条，P1 3 / P2 11 / 一致 4）
- [x] 第 7 组：学校与小区（4 页，20 条，P1 5 / P2 13 / 一致 2）
- [x] 第 8 组（上）：预约留资 + 支付账单（14 条，P1 4 / P2 7 / 一致 3）
- [x] 第 8 组（下·合同签署）：我的合同（16 条，P1 1 / P2 11 / 一致 4）
- [x] 第 8 组（下·委托上架）：业主委托（`owner/MarketingScreen`）+ 我的上架单（`listing/MyListingsScreen`）（23 条，P1 4 / P2 12 / 一致 7）
- [x] 第 9 组：员工/经纪端（首页、日程、房源管理、CRM、业绩、通讯录、房源浏览、员工合同、经纪协议，30 条，P1 15 / P2 12 / 一致 3）
- [ ] 第 10 组：管理端
- [ ] 全量总览 + B1/B2/B3 定稿
- [x] 开始修 B1（F1 完成：O-02/O-03/O-08/O-09/O-11/O-14/O-19/O-20、G9、G11、G12 子集、G1 详情、G3 Loading 文案）
- [x] 修复批次 F4（四项产品决策落地 + 详情点击区，6 条，`tsc --noEmit` 通过）
- [x] 修复批次 F5（首页失败态/动态行可点、点击区与登录意图、预约弹层键盘与校验，10 条，`tsc --noEmit` 通过）
- [x] 修复批次 F6（栈页标题全量三语、注册页关闭与字段级校验、降价提醒失败反馈、全角冒号收敛，6 条，`tsc --noEmit` 通过）
- [x] 修复批次 F7（我的与设置：编辑资料/修改密码三语与格式校验、租约列表与详情三语与三态、查看合同可点，15 条，`tsc --noEmit` 通过）
- [x] 修复批次 F8（我的订单列表与详情三语与三态、未知状态不猜、「我的」原生 Alert 在 Web 失效改 `showInfo`，9 条，`tsc --noEmit` 通过）
- [x] 修复批次 F15（委托上架：失败态、Web Alert 失效、表单键盘避让与校验、命中区与屏读，10 条，`tsc --noEmit` 通过）
- [x] 修复批次 F16（员工端：首页/日程失败态、日程删除 Web 失效、保存失败反馈、页头与加载三语、命中区与屏读，8 条，`tsc --noEmit` 通过）
- [x] 修复批次 F17（员工端 Alert 根因：CRM/业绩/通讯录/房源浏览/房源上架全改 Toast，业绩补录改行内字段错误，经纪协议失败态与「无身份」分离，7 条，`tsc --noEmit` 通过）
- [x] 修复批次 F18（员工首页 + 日程页整页三语：~130 条 `emp.*`；顺带修为首页新房 rail 直达楼盘详情，3 条，`tsc --noEmit` 通过）
- [x] 修复批次 F19（i18n 推广 A 组第 1 页：经纪协议页整页三语，`broker.*` 31 键 × 三语，含失败页/无身份页/协议卡/签署弹层/toast；泰文长文案换行回归，1 条，`tsc --noEmit` 通过）
- [x] 修复批次 F20（i18n 推广 A 组第 2 页：业主资产首页整页三语，`ownerHome.*` 42 键 × 三语；户型面积改 `formatArea`、区块标题补 `flexShrink`；记 1 条共享图表「万」后缀残留待 B 组，3 条，`tsc --noEmit` 通过）
- [x] 修复批次 F21（① 数字缩写跨页收口：`formatCompactNumber` + `BarChart` + `DiscoverScreen`（zh 万 / en·th K·M）；② i18n 推广 A 组第 3 页：管理端考勤管理整页三语，`attAdm.*` 163 键 × 三语，四页签 + 四弹窗 + 全部反馈；泰文回归 6 处小修；记 5 条待修（1 P1 共享 feedback 兜底 / 4 P2 泰文布局），`tsc --noEmit` 通过）
- [x] 修复批次 F22（① 共享反馈兜底一次收口：`getErrorMessage` 默认兜底改走 `errorText` 分类三语，`notify`/`notifyError` 默认标题与重试按钮入 i18n，并扫描 `errorText`/`Toast`/`LoadingState`/`ListState`/`EmptyState`/`services/api.ts` 确认无其他中文兜底；② i18n 推广 A 组第 4 页：管理端合同管理整页三语，`leaseAdm.*` 15 键 × 三语，泰文回归 2 处小修；记 1 条 P2 待产品确认（合同卡不可点进详情），3 条，`tsc --noEmit` 通过）
- [x] 修复批次 F23（i18n 推广 A 组第 5 页：业主收益页整页三语，`income.*` 19 键 × 三语，含本地 `N月` 轴标签改走 `common.monthN`；泰文回归 3 处小修（chips 换行、Hero 环比可收缩、区块标题可收缩）；记 1 条 P2 明细月份原串待定，4 条，`tsc --noEmit` 通过）
- [x] 修复批次 F24（i18n 推广 A 组第 6 页：租客服务商城整页三语，`svc.*` 47 键 + `common.notice` × 三语，含 5 个服务编码名称映射、规格/单位/数量、SKU 弹层与结算条；`Alert.alert` 反馈改 `notify`/`notifyError`（Web 不再静默）；泰文回归 3 处小修；记 1 条 P2 未知编码名称回退待补，5 条，`tsc --noEmit` 通过）
- [x] 修复批次 F25（B 组共享组件 + 管理端长尾收口 + C 组泰文静态回归：`categoryCards` 单位、合同目录死兜底、`BeikeHeader` 屏读名、`admin/HomeScreen` 25 键、`admin/CRMScreen` 4 处兜底 + 徽标收缩、`admin/PartnerHubScreen` 2 标签、收藏页月租单位、`stores/auth.ts` 登录失败兜底；新增 13 条（10 P1 + 3 P2）、已修 12、已一致 3，另记 1 条 P1「7 个页面整页仍未 i18n」，`tsc --noEmit` 通过、i18n 键数 2998 全平）

### 修复批次记录

| 批次 | 范围 | 改动文件 | 验证 |
| --- | --- | --- | --- |
| F1 | 共享 `fmtDate` 本地时区化 + 新增 `formatArea`；首页面积/房态兜底；列表搜索收起与清除、买房卡封面、查看 N 套用服务端 total；详情 BED/BATH i18n、失败态可重试、联系经纪人失败改 toast；LoadingState 默认文案三语；管理端/业主/我的租约日期统一 | `utils/format.ts`、`i18n/index.ts`、`components/LoadingState.tsx`、`components/ListingsFeed.tsx`、`tenant/HomeScreen.tsx`、`tenant/ListingsScreen.tsx`、`public/PublicListingDetailScreen.tsx`、`public/PublicListingRow.tsx`、`admin/{LeasesScreen,PaymentsScreen,PropertyDetailScreen,HomeScreen}.tsx`、`owner/MarketingScreen.tsx`、`settings/MyLeaseDetailScreen.tsx` | `npx tsc --noEmit` 0 错误；Expo Web 未逐页复测，小屏/键盘/安全区未实测 |
| F2 | 登录/注册三语收敛：`register.*` / `oauth.*` / `country.*` / `login.*Placeholder` 新增 3 语键；RegisterScreen 14+ 处中文、OAuthButtons 入口文案、useOAuth 全部错误提示、useOtp 国家码与验证码 toast 改 i18n；非 iOS 隐藏 Apple 登录；登录邮箱/密码 placeholder 换成示例值 | `i18n/index.ts`、`screens/RegisterScreen.tsx`、`screens/LoginScreen.tsx`、`components/OAuthButtons.tsx`、`hooks/useOAuth.ts`、`hooks/useOtp.ts` | `npx tsc --noEmit` 0 错误；三语切换与 Apple 隐藏未在真机/模拟器验证 |
| F3 | 找房分页接入（首屏 50 + 上拉翻页 + 去重 + 按 total 判到底）；C 端筛选空态加「清空筛选」；价格预设去掉「万」改为 ฿ 实际金额（三语） | `screens/tenant/ListingsScreen.tsx`、`components/ListingsFeed.tsx`、`i18n/index.ts` | `npx tsc --noEmit` 0 错误；滚动加载与到底提示未实测 |
| F4 | 详情吸底操作栏（收藏图标 / 联系经纪人 / 预约看房，正文留白避开栏+安全区）；详情未登录点击收藏/联系/降价提醒/预约均先登录并在返回后继续执行；悬浮返回/主页 36→44；默认国家码按「上次手动选择 → locale → 定位城市 → +66」并持久化；忘记密码改为客服电话/邮箱弹层；新增 `Agreement` 占位页，登录页底部与注册页勾选旁均可进入 | `screens/public/PublicListingDetailScreen.tsx`、`hooks/useOtp.ts`、`screens/LoginScreen.tsx`、`screens/RegisterScreen.tsx`、`screens/legal/AgreementScreen.tsx`（新增）、`navigation/RootNavigator.tsx`、`i18n/index.ts` | `npx tsc --noEmit` 0 错误；真机小屏/键盘/安全区与 `tel:`/`mailto:` 实际拉起未实测 |
| F5 | 首页公开数据失败态（失败且无缓存时「加载失败 + 重试」，不再当空数据）；首页最近动态账单/工单行可点进对应页；学校学段空值显示「未知」不再冒充类型；首页定位行、找房居室快选补 hitSlop 与 a11y 选中态；找房未登录收藏登录后自动续做；详情预约弹层加 KeyboardAvoidingView、手机号格式校验、全角冒号改 i18n `common.colon`；登录选择屏补左上关闭 | `screens/tenant/HomeScreen.tsx`、`components/ListingsFeed.tsx`、`screens/tenant/ListingsScreen.tsx`、`screens/public/PublicListingDetailScreen.tsx`、`i18n/index.ts` | `npx tsc --noEmit` 0 错误；键盘避让、hitSlop 实际手感、登录返回续做未实测 |
| F6 | `RootNavigator` 40+ 栈页标题全量改 `nav.*` 三语（G3/O-17）；注册页两阶段统一左上关闭；注册校验改为「出错字段红框 + 单条行内错误」，去掉重复 toast；详情降价提醒订阅/退订失败给 toast；清掉 5 处 `}：{` 全角冒号，统一 `common.colon` | `navigation/RootNavigator.tsx`、`i18n/index.ts`、`screens/RegisterScreen.tsx`、`screens/public/PublicListingDetailScreen.tsx`、`screens/public/PublicCommunitiesScreen.tsx`、`screens/contracts/MyContractsScreen.tsx`、`screens/contracts/contracts/components/SignFieldCard.tsx`、`screens/contracts/contracts/components/SignFieldStudio.tsx` | `npx tsc --noEmit` 0 错误；三语实际渲染、注册校验描边位置、toast 文案未实测 |
| F7 | 「我的与设置」P1 收敛：编辑资料/修改密码整页三语 + 手机号/邮箱格式校验；我的租约列表与详情状态、押金、租期、空态/失败态三语，未知状态不再猜成「待生效」；租约详情补加载/失败重试，`contract_url` 的「查看合同」改为真实可点；我的租约日期改用共享 `fmtDate`；修改密码先提示再退出；通知/业务设置失败副文案三语 | `i18n/index.ts`、`settings/EditProfileScreen.tsx`、`settings/ChangePasswordScreen.tsx`、`settings/MyLeaseScreen.tsx`、`settings/MyLeaseDetailScreen.tsx`、`settings/NotificationPrefsScreen.tsx`、`settings/AdminBusinessSettingsScreen.tsx` | `npx tsc --noEmit` 0 错误；未在真机/模拟器验证三语渲染、合同外链打开与表单校验提示 |
| F8 | 我的交易订单列表与详情：7 种状态与交易节点/空态/失败态全量三语，未知状态显示「未知」不再猜成「洽谈中」，详情补加载/失败重试，日期改用共享 `fmtDate`；「我的」里清除缓存/权限设置/客服/头像的原生 `Alert.alert` 在 Web 是空实现，统一改 `showInfo`（Web 走 `window.alert`） | `i18n/index.ts`、`settings/MyOrdersScreen.tsx`、`settings/MyOrderDetailScreen.tsx`、`ProfileScreen.tsx` | `npx tsc --noEmit` 0 错误；未在真机/模拟器验证三语渲染与 Web 提示弹窗 |
| F9 | 聊天列表与详情三语收敛：访客引导、会话兜底名、失败/空态、发送按钮与无障碍名、加载/发送失败 toast 全走 i18n（新增 `chat.*` 13 键 × 三语）；发送失败回填输入内容（用户已重新输入时不覆盖）；消息列表在首次加载/发送/实时接收后自动滚到最新 | `i18n/index.ts`、`screens/chat/ChatListScreen.tsx`、`screens/chat/ChatDetailScreen.tsx` | `npx tsc --noEmit` 0 错误；未真机验证键盘弹起后的滚动位置与 WS 实时消息定位 |
| F10 | 分类页共用壳：修掉新房页默认筛选值引用不稳导致的**首屏无限重拉（P0）**（改为默认值序列化依赖）；顶栏搜索补清除按钮与提交收键盘、输入框补无障碍名；纯文字 Tab 命中区补到 44；Tab/筛选触发/快捷标签/方块选项补 `role` 与 `selected/expanded`；上拉翻页失败补 toast；列表到底补「没有更多了」 | `screens/category/CategoryShell.tsx` | `npx tsc --noEmit` 0 错误；未在浏览器/真机验证新房页是否恢复单次请求（需看 Network）与长列表翻页到底提示 |
| F11 | 定位选择页整页三语（新增 `location.*` 12 键 × 三语），选完城市自动返回来源页；区域筛选器触发块/选项补命中区与 a11y、「全部」补选中态；地图弹层 `{n} BED` 改 `prop.bedroomN`、行与关闭按钮补 a11y、重试按钮补到 44、加载加文案 | `i18n/index.ts`、`screens/LocationPickerScreen.tsx`、`components/RegionPicker.tsx`、`components/ListingsMapModal.tsx` | `npx tsc --noEmit` 0 错误；未在真机验证选城返回、区域面板长列表手感与地图弹层三语渲染 |
| F12 | 学校/小区：筛选无结果从「重试」改为「清空筛选」并真的清空条件（副文案区分筛选空与真空）；小区搜索补请求序列守卫，避免旧响应覆盖新关键字；两个详情区分 404 与网络失败（失败可重试、`id` 缺失不再永远转圈），加载态换 `LoadingState`（新增 `pub.clearFilters` × 三语） | `i18n/index.ts`、`screens/public/PublicSchoolsScreen.tsx`、`screens/public/PublicCommunitiesScreen.tsx`、`screens/public/PublicSchoolDetailScreen.tsx`、`screens/public/PublicCommunityDetailScreen.tsx` | `npx tsc --noEmit` 0 错误；未实测网络失败/404 两种分支与小区连续输入竞态 |
| F13 | 预约留资补宽松手机号格式校验（新增 `pub.inquirePhoneInvalid` × 三语）、编辑字段即收旧提示、输入补 maxLength/autocorrect/a11y；业主账单失败不再显示「暂无账单」而是可重试的错误态、账单日期改用 `fmtDate`、筛选 chip 补 a11y；租客收银台关闭后自动刷新账单，避免付完仍显示「待缴」 | `i18n/index.ts`、`screens/public/PublicInquiryForm.tsx`、`screens/tenant/PaymentsScreen.tsx` | `npx tsc --noEmit` 0 错误；未实测真实支付回跳时延、错误态重试、手机号边界（+66 带空格）与 iOS 键盘遮挡 |
| F14 | 合同签署：列表/详情的加载态不再误用「加载失败」文案；合同行、详情返回、签署台返回/关闭、签名制作/拒签弹窗关闭、印章删除、托盘重做补命中区到 44 与无障碍名；预置签署区虚线框补 `role/state/label`（屏读可识别「签名 · 点击完成签署」）；拒签原因输入补 `maxLength` 与无障碍名 | `screens/contracts/MyContractsScreen.tsx` | `npx tsc --noEmit` 0 错误；未实测屏读顺序、签署台落章与 PDF 多页滚动 |
| F15 | 委托上架：四个接口任一失败时显示失败条并可重试，不再把失败渲染成「暂无数据」；「设置带看时段」与表单校验从 Web 空实现的 `Alert` 改为 Toast / 行内错误；委托表单加 `KeyboardAvoidingView`、售价 >0 校验与 `maxLength`、逐字段无障碍名；双委托 Tab 与房源选项补命中区/role/选中态；出售估价在无售价时显示「待定价」而不是「฿0」 | `screens/owner/MarketingScreen.tsx`、`i18n/index.ts` | `npx tsc --noEmit` 0 错误；未实测 iOS 键盘遮挡、失败条重试与三语渲染 |
| F16 | 员工端：员工首页任一核心接口失败显示失败条 + 重试，`loadAll` 外层 `Alert` 改 Toast；日程页失败不再渲染成「本月暂无安排」，删除自定义日程在 Web 走 `confirm`（原生 `Alert` 在 Web 是空实现，此前点垃圾桶无反应），保存失败补 Toast；日程页页头/加载文案与月份切换、添加按钮补三语与屏读名，切换按钮补命中区 | `screens/employee/HomeScreen.tsx`、`screens/employee/CalendarScreen.tsx`、`i18n/index.ts` | `npx tsc --noEmit` 0 错误；未实测 Web 删除确认、失败条重试与三语渲染 |
| F17 | 员工端 `Alert.alert` 根因清理：CRM 8 处、业绩补录 8 处、通讯录 2 处、房源浏览 1 处、房源上架 4 处全部改 `notify`/`notifyError`/`toast`（Web 不再静默）；业绩补录校验改为日期/金额字段旁红字，Toast 只报提交结果；删除补录与上架确认在 Web 走 `confirm`；上架校验/成功/失败与房源列表尾文案入三语；经纪协议请求失败不再落入「暂无经纪人身份」，新增失败页 + 重试并保留身份缺失分支 | `screens/employee/CRMScreen.tsx`、`screens/employee/PerformanceScreen.tsx`、`screens/employee/ContactScreen.tsx`、`screens/employee/PropertyBrowseScreen.tsx`、`screens/employee/PropertiesScreen.tsx`、`screens/broker/BrokerAgreementScreen.tsx`、`i18n/index.ts` | `npx tsc --noEmit` 0 错误；未实测 Web Toast、`window.confirm`、字段红字定位与经纪协议失败页重试 |
| F18 | 员工首页 + 日程页整页三语：新增 ~130 条 `emp.*`（概览问候、工作台/日历/业绩/线索区块标题、带看与线索状态徽标、日程类型图例、月份 1–12、星期 0–6、日期口径、租金/合同到期文案、空态与添加事件弹层），`AGENDA_META`/`VIEWING_STATUS_META`/`LEAD_STAGE_META` 改存 `labelKey`，月份/星期按当前语言用 `useMemo` 生成；顺带把租客首页新房 rail 从 `NewHouse` 改为 `PublicCommunityDetail({ id })` 直达楼盘详情 | `screens/employee/HomeScreen.tsx`、`screens/employee/CalendarScreen.tsx`、`screens/tenant/HomeScreen.tsx`、`i18n/index.ts` | `npx tsc --noEmit` 0 错误；未实测英/泰渲染、长文案换行与楼盘详情直达 |
| F19 | i18n 推广 A 组第 1 页「经纪协议」：新增 `broker.*` 31 键 × 三语，覆盖页头/页副标题、加载失败页与重试、无经纪人身份提示、两份协议卡（标题/说明/状态/使用中/签署说明）、激活提示（仅上架/仅分销/两者）、页脚说明、签署弹层（标题/说明/签名区/取消/确认/未签名提示）与全部 toast；泰文长文案回归：状态行补 `flexWrap`，签署按钮由固定 `height:46` 改 `minHeight:46 + paddingVertical` 防两行截断 | `screens/broker/BrokerAgreementScreen.tsx`、`i18n/index.ts` | `npx tsc --noEmit` 0 错误；未实测英/泰实际渲染与 320dp 窄屏下按钮换行 |
| F20 | i18n 推广 A 组第 2 页「业主资产首页」：新增 `ownerHome.*` 42 键 × 三语（页头/资产总览/出租中与空置/待办/账单与工单/快捷入口/文档入口），户型面积改走共享 `formatArea`，区块标题补 `flexShrink` 防泰文挤压；记录 1 条共享图表「万」后缀残留到 B 组 | `screens/owner/HomeScreen.tsx`、`i18n/index.ts` | `npx tsc --noEmit` 0 错误；未实测英/泰渲染与首页各卡窄屏表现 |
| F21 | ① 数字缩写口径统一：新增共享 `formatCompactNumber(value, lang)`（zh 用「万」，en/th 用 K/M，千位以下不缩写并保留千分位），`BarChart` 柱值改调该方法，`DiscoverScreen` 区域均价删除本地 `compact` 收口到共享方法；`admin/HomeScreen`、`owner/IncomeScreen`、`owner/HomeScreen` 三处 BarChart 随组件自动生效（轴标签分别来自 `common.monthN` / 页面自带月份标签）。② i18n 推广 A 组第 3 页「管理端考勤管理」：新增 `attAdm.*` 163 键 × 三语，覆盖四页签（核对/考勤组/请假审批/异常报表）、汇总与明细、四个弹窗（校准/考勤组表单/成员/审批）、全部 toast/Alert/placeholder/空态；状态、假种、审批状态元数据改存 key 渲染期解析；泰文回归：页签文字居中 + 行高、`cardTitle`/`chipText` 可收缩、`primaryBtn` 固定高改 `minHeight`、`kpiLabel` 行高、`sheetTitle` 让位关闭按钮 | `utils/format.ts`、`components/charts/BarChart.tsx`、`screens/tenant/DiscoverScreen.tsx`、`screens/admin/AttendanceManageScreen.tsx`、`i18n/index.ts` | `npx tsc --noEmit` 0 错误；未实测：三语（尤其泰文）实渲染、切语言即时刷新、页签两行后的栏高与 KPI 跨行高度 |
| F22 | ① 共享反馈兜底 i18n 收口：`getErrorMessage` 去掉中文默认值，未命中分类时由 `errorText` 返回网络/权限/不存在/冲突/限流/服务端/校验/未知三语文案；`notify` 默认标题 `common.done`、`notifyError` 默认标题 `common.actionFailed` 与重试按钮 `common.retry`（新增 2 键 × 三语），组件外用 `useI18n.getState().t()`；扫描 `lib/errorText.ts`、`components/Toast.tsx`、`LoadingState`、`ListState`、`EmptyState`、`services/api.ts` 无其他中文兜底。② i18n 推广 A 组第 4 页「管理端合同管理」：新增 `leaseAdm.*` 15 键 × 三语，状态徽标与筛选 chip 复用 `lease.status.*`/`common.all`，覆盖搜索占位与清除、统计四格、列表标题、空态/无结果、房源兜底名、即将到期天数、日期区间、月租；泰文回归：统计标签 `numberOfLines=1`、状态徽标 `flexShrink` + 单行 | `utils/feedback.ts`、`i18n/index.ts`、`screens/admin/LeasesScreen.tsx` | `npx tsc --noEmit` 0 错误；未实测：三语实渲染、切语言后已弹出的 Toast/已加载的错误条是否即时换语、泰文统计格与徽标窄屏表现 |
| F23 | i18n 推广 A 组第 5 页「业主收益」：新增 `income.*` 19 键 × 三语（加载/失败/刷新失败、本月收入、环比、年累计、待收金额、趋势标题与近 6 个月、月度空态、收入明细与笔数、明细空态、租金收入兜底、三种到账状态）；`statusMap`/`FILTERS` 改存 `labelKey`，本地 `monthLabel` 的 `N月` 改走 `common.monthN`（zh 保留「月」，en/th 纯数字）；泰文回归：筛选 chips 补 `flexWrap` 防四项溢出、Hero 左侧与环比 pill 补 `flexShrink`、区块标题补 `flexShrink` | `screens/owner/IncomeScreen.tsx`、`i18n/index.ts` | `npx tsc --noEmit` 0 错误；未实测：三语渲染、英文/泰文四 chips 在两行时的间距、BarChart 轴标签切语言后的宽度 |
| F24 | i18n 推广 A 组第 6 页「租客服务商城」：新增 `svc.*` 47 键 + `common.notice` × 三语（页头/区块、加载与空态、订单状态 5 种、规格 3 种与单位、5 个服务编码名称、登录/无租约提示、购买成功与失败、SKU 弹层规格与数量、单价/小计/税费/应付、按钮）；`orderStatusMeta`/`MODEL_OPTIONS` 改存 `labelKey`，`MODEL_UNIT_LABEL` 改 `MODEL_UNIT_KEY` + `unitOf()`；服务名称按 code 映射 i18n，未命中回退 `label_zh || code`；`Alert.alert` 全部改 `notify`/`notifyError`；泰文回归：商品名 `numberOfLines=2`、标签单行、区块标题/提示可收缩 | `screens/tenant/ServicesScreen.tsx`、`i18n/index.ts` | `npx tsc --noEmit` 0 错误；未实测：三语实渲染、泰文商品卡两行名与网格高差、SKU 弹层长文案换行、Web Toast 替代 Alert 后的实际表现 |
| F25 | ① B 组共享组件收口：`categoryCards` 面积单位 `kg/㎡` 改 `t('category.floorLoading')` + `t('pub.sqm')`；`ContractsScreen` 死兜底 `label` 改 `t('pub.loading')`；`BeikeHeader` 返回/主页按钮屏读名改 `t('common.back')`/`t('common.backHome')`；`PublicListingRow` 复核为已全量 i18n（无改动）；`contracts/constants.ts` 的 `简体中文/English/ไทย` 为语言原生名、`CommissionRulesScreen` 的 `{zh,en,th}` 为自带三语数据，均属正常。② 管理端长尾残留中文：`admin/HomeScreen` 新增 `admHome.*` 25 键（页签/统计卡/风险条/图表头/最近动态），`admin/CRMScreen` 客户名与会话标题兜底、无联系方式/拨号失败改 `notify`、catch 改 `notifyError`，`admin/PartnerHubScreen` 的「营收/早退」改 `partner.revenue`/`partner.attEarly`。③ 跨页小残留：收藏页 `/月` 改 `pub.perMonth`，`stores/auth.ts` 登录失败兜底改 `login.failedTitle`。④ C 组泰文静态回归：`admin/CRMScreen` 阶段徽标 `flexShrink` + 单行、联系方式/跟进行可收缩，`admin/PartnerHubScreen` 列表标题可收缩 | `screens/category/categoryCards.tsx`、`screens/contracts/ContractsScreen.tsx`、`components/BeikeHeader.tsx`、`screens/admin/{HomeScreen,CRMScreen,PartnerHubScreen}.tsx`、`screens/tenant/FavoritesScreen.tsx`、`stores/auth.ts`、`i18n/index.ts` | `npx tsc --noEmit` 0 错误；i18n 键数校验 2998 键全部 3 语齐平；未实测：三语实渲染、泰文徽标/跟进行窄屏表现、Web 端 CRM 删除确认（仍为 `Alert.alert`，Web 空实现） |
| F26 | 新增全局命令式确认弹窗通用件 `src/components/ConfirmDialog.tsx`（`confirm(options): Promise<boolean>` + `<ConfirmProvider>`，支持标题/说明/自定义确认取消文案/`destructive` 危险样式；`Modal transparent` + 遮罩点击取消，Web 与原生同一套行为），挂在 `App.tsx` 的 `ToastProvider` 内层；替换范围：`admin/CRMScreen` 删除客户、`employee/CalendarScreen` 删除自定义日程、`employee/PerformanceScreen` 删除补录、`employee/PropertiesScreen` 上架确认（含原 `window.confirm` 分支），删除类全部 `destructive: true`；页面结构与其他 `Alert` 未动，遇到再逐步替换 | `components/ConfirmDialog.tsx`（新增）、`App.tsx`、`screens/admin/CRMScreen.tsx`、`screens/employee/{CalendarScreen,PerformanceScreen,PropertiesScreen}.tsx` | `npx tsc --noEmit` 0 错误；未实测：Web 端点击遮罩/取消/确认后的 Promise 结算与弹窗动画，原生端 `onRequestClose`（Android 返回键）行为 |
| F27 | i18n 推广第 1–3 页（按用户触达顺序）：① `attendance/AttendanceScreen` 新增 `att.*` 约 100 键 × 三语，`CHECKIN_TABS`/`STATUS_META`/`LEAVE_TYPE_LABEL`/`LEAVE_STATUS_META` 改存 key，星期与「月/日」按语言用 `useMemo` 生成，定位授权/失败从 `Alert` 改 `notify`，销假确认走 `confirm`；② `employee/PropertiesScreen` 新增 `eprop.*` 44 键 × 三语，`STATUS_META`/`TYPE_META`/`STATUS_FILTERS`/`SORTS` 改存 `labelKey`，修复 `const { total: t }` 遮蔽 i18n `t`、`tags.map((t)=>` 遮蔽，结果统计恢复「总数加粗 + 空置强调」双层样式；③ `employee/CRMScreen` 复用既有 `crm.*` 并新增 3 键（`editStatus`/`customerStage`/`pullUpMore`），阶段元数据改存 `labelKey`、未收录阶段展示后端原值；三页泰文静态回归：徽标/跟进行/联系方式/操作按钮补 `flexShrink` 与 `numberOfLines` | `screens/attendance/AttendanceScreen.tsx`、`screens/employee/{PropertiesScreen,CRMScreen}.tsx`、`i18n/index.ts` | `npx tsc --noEmit` 0 错误；i18n 键数校验全部 ×3；残留中文扫描：Attendance 1 处（外勤 `reason` 落库）、Properties 0、employee/CRM 1 处（会话标题落库）；未实测：三语实渲染、切语言后日期/阶段即时换语、泰文徽标与操作行窄屏表现 |
| F28 | i18n 推广第 4 页「租客报修」：新增 `maint.*` 27 键 × 三语（优先级 4 档、工单状态 5 种、页签、统计「N 个」、折叠/展开、工单列表与详情弹层、无描述兜底、服务评价与星级、无生效租约提示）；`PRIORITY_OPTIONS`/`statusMeta`/`STATUS_TABS` 改存 `labelKey`，渲染期 `t()`；修正 `openDetail`/`canRate`/`filter`/`map` 四处 `t` 参数遮蔽 i18n `t`；`notify('提示', …)` 改 `t('common.hint')` | `screens/tenant/MaintenanceScreen.tsx`、`i18n/index.ts` | `npx tsc --noEmit` 0 错误；i18n 键数校验全部 ×3；残留中文扫描该页清零；未实测：三语实渲染、泰文优先级按钮四等分换行、详情弹层长文案 |
| F29 | i18n 推广第 5 页「物业文档」：新增 `doc.*` 13 键 × 三语（上传入口、统计两格与「N 份本月新增/文件」、存储使用与主要来源占比、筛选 chips、区块标题与份数、空态、未命名兜底、加载态）；`TYPE_META` 改存 `labelKey` 并复用既有 `docType.*`；4 处 `Alert.alert`（加载失败、缺文件、会话失效、不支持类型、上传失败）改 `notify`/`notifyError`，Web 不再静默 | `screens/tenant/DocumentsScreen.tsx`、`i18n/index.ts` | `npx tsc --noEmit` 0 错误；i18n 键数校验全部 ×3；残留中文扫描该页清零；未实测：三语实渲染、泰文统计格与来源行换行、Web Toast 替代 Alert |
| F30 | i18n 推广第 6 页「同事通讯录」：新增 `contact.*` 14 键 × 三语（搜索占位、刷新失败条与重试、加载失败空态与重新加载、搜索无结果/真空态、分组人数、同事/未登记电话兜底、其他部门分组名、加载态）；未归类部门改用 `OTHER_DEPT` 标记、渲染期 `t('contact.otherDept')`，避免分组键随语言漂移 | `screens/employee/ContactScreen.tsx`、`i18n/index.ts` | `npx tsc --noEmit` 0 错误；i18n 键数校验全部 ×3；残留中文扫描该页清零；未实测：三语实渲染、泰文部门名与人数徽标窄屏挤压 |
| F31 | i18n 推广第 7 页「员工业绩」：新增 `perf.*` 10 键 × 三语（已审批状态、佣金/费率两种口径、租赁成交与房源兜底、月租、年月口径、单/次单位）；`STATUS_META` 复用 `perf.stPending`/`perf.stPaid` + 新增 `statusApproved` 并改存 `labelKey`；`rateLabel`/`titleOf`/`periodLabel`/Hero 与年度单位改走 `t`；删除补录已走 F26 `confirm`（保留） | `screens/employee/PerformanceScreen.tsx`、`i18n/index.ts` | `npx tsc --noEmit` 0 错误；i18n 键数校验全部 ×3；残留中文扫描该页清零；未实测：三语实渲染、泰文「佣金 (N 个月租金)」行宽、Hero 四格单位后缀换行 |
| F33 | P2 打磨第 1 批（按用户触达：首页 → 找房 → 详情 → 登录 → 我的）＋C 组泰文实测续跑：① 首页未定位改显示「选择城市」、两处「更多」改 `discover.viewAll`「查看全部」、租金空值不再渲染 `/月`；② 找房 hero 未定位显示「选择城市」、最近搜索清空后 Toast「已清空搜索记录」（新增 `search.cleared`）、附近按钮 `hitSlop` 至 ≈44；③ 详情标题兜底改「未命名房源」、无价格不渲染 `/月`、租赁单价补 `/月`、物业费/均价改走 `data.currency` + `currencySymbol`、留资默认文案改 `pub.inquiryDefault`（新增三语）；④ 登录页「还没有账号？去注册」整行可点且 ≥44、记住我 `hitSlop` + checkbox a11y、验证码倒计时改 `login.resendCountdown`（新增三语）；⑤ 我的页用户卡空值 `'-'` → `—`、客服打开失败改 `notifyError`；聊天发送按钮 `minWidth 44` + `hitSlop`。共 18 条 P2 | `screens/tenant/HomeScreen.tsx`、`components/ListingsFeed.tsx`、`screens/public/PublicListingDetailScreen.tsx`、`screens/LoginScreen.tsx`、`screens/ProfileScreen.tsx`、`screens/chat/ChatDetailScreen.tsx`、`i18n/index.ts` | `npx tsc --noEmit` 0 错误；i18n 键 3249 全部 ×3；**Expo Web 泰文实测**：租房分类页（筛选栏 + 房源卡）、房源详情页（价格/单价行、相册、返回、底部吸底栏）正常，无截断/溢出/遮挡；聊天、我的与设置、员工端、管理端实测被浏览器视口 0×0 阻塞，改为静态检查并如实标注未实测 |
| F32 | 城市/国家/地铁线名称三语化（数据层）：新增 `data/locationNames.ts` 作为译名覆盖层，按稳定 key 提供 34 城 / 9 国 / 36 条线的 en+th 名称与四个统一取数方法（`cityDisplayName` / `countryDisplayName` / `metroLineDisplayName` / `metroLineFullName`）和搜索别名 `citySearchText`；**原数据字段不动**——`cityLabel`、`country`、`name` 继续作为身份值（后端 `region`/`city` 参数、`useOtp` 国别拨号映射、employee/PropertiesScreen 的 `cityLabel === region.city` 比对），展示一律走译名，请求口径零改动；搜索保留中文原值 + 英/泰译名 + 国家三语，中文输入仍命中。受影响页面：`LocationPickerScreen`（当前城市块、热门城市、国家 chips、城市行、搜索匹配）、`RegionPicker`（三列选项改 `{value,label}`，国家列宽按当前语言计算，汇总行）、`ListingsFeed`（线路下拉 / 已选线路 / 城区后缀）、`ListingsScreen`、`tenant/HomeScreen`、`tenant/DiscoverScreen`、`employee/PropertyBrowseScreen`、`admin/PropertiesScreen`（国家列、城市头、城市 chips、线路 chips）、7 个分类页（`RentCategory`/`NewHouse`/`Resale`/`Commercial`/`Land`/`Factory`/`Hotel`） | `data/locationNames.ts`、`screens/LocationPickerScreen.tsx`、`components/{RegionPicker,ListingsFeed}.tsx`、`screens/{tenant/HomeScreen,tenant/DiscoverScreen,tenant/ListingsScreen,employee/PropertyBrowseScreen,admin/PropertiesScreen}.tsx`、`screens/category/*Screen.tsx` | `npx tsc --noEmit` 0 错误；残留中文扫描无新增（`locationArea/locationMetro` 的中文为身份值，保留）；**Expo Web 实测**（localhost:8081，租客账号，界面切泰文）：登录页、首页、城市选择器、`เช่า` 分类页均正常；首页定位行显示「เมืองปัจจุบัน · กรุงเทพฯ」，选择器国家/城市/热门城市全为泰文，搜索「曼谷」与「Bangkok」都能命中 Bangkok（19 เขต），未观察到 chips 裁剪、行挤压或重叠；分类页列表头已截图，细节扫描因浏览器步数预算用尽未做完（部分验证）；另实测发现首页底部「关于我们」区的「房地产租赁管理系统 API v1.0.0」来自后端 `APP_NAME`（`backend/app/config.py`）与种子用户名，属后端数据，不在本轮改动范围 |
| F34 | P2 第 2 批「找房列表 + 分类页」：① 区域面板区/街道计数改 `list.districtCount`（中文全角括号、英泰半角）；② 自定义价格最低>最高时就地红字 + 禁用「确定」（`list.priceRangeInvalid`）；③ 「去地图看」无定位/权限拒绝补 Toast `list.mapNoLocation`；④ 翻译结果从 toast 改可滚动弹层（右上关闭、文本可长按复制、限高 70%）；⑤ 列表首屏加载不再整页替换，页头/搜索卡/筛选栏保留，仅列表区 Loading，主按钮请求中转圈并禁用；⑥ 分类页首屏加载保留宫格/Tab/筛选骨架，仅列表区 Loading，加载中隐藏结果计数；⑦ 分类卡片六类行 + 楼盘卡/rail 卡补 `accessibilityRole/Label`；⑧ 住宅/商业/厂房/酒店/土地租金为空时不再拼 `/月` | `screens/tenant/ListingsScreen.tsx`、`components/ListingsFeed.tsx`、`screens/category/{CategoryShell,categoryCards}.tsx`、`i18n/index.ts` | `npx tsc --noEmit` 0 错误；i18n 新增 3 键 × 三语；**本轮无实测**（浏览器视口 0×0，未做泰文渲染验证） |
| F35 | P2 第 3 批「员工端」：① 首页今日工作台时间线行改可点 → 我的日程，并补 role/label；② 「去跟进」带 `leadName` 进 CRM 并预填搜索定位该客户；③ 预算币种缺失时只显示数字不猜 ฿；④ 日程「列表」视图事件行补操作：催收类给「去催收」、自定义事件给删除按钮；⑤ 今日待跟进标题实际覆盖未来 7 天，三语文案改「近 7 天待跟进」；⑥ 房源管理首屏加载改为只替换列表区（搜索/筛选保留），标签走 `eprop.loading` 三语 | `screens/employee/{HomeScreen,CalendarScreen,CRMScreen,PropertiesScreen}.tsx`、`i18n/index.ts` | `npx tsc --noEmit` 0 错误；i18n 新增 `common.delete` 1 键 × 三语 + 改 3 处 `emp.todayFollowUps`；**本轮无实测** |
| F36 | P2 第 4 批「管理端考勤」泰文布局：① 四页签由 `flex:1` 均分改横向滚动 + 文案限单行，泰文长标签不再折成两行；② KPI 卡加 `minHeight:96`，跨行卡片等高；③ 明细行右侧状态徽标 + 「校准」按钮包 `dayRowRight` 固定不压缩，窄屏余量留给日期/备注；④ 考勤组两列表单：`Field` 支持 `style`，两列各 `flex:1`、标签预留两行高度、输入框 `width:100%`，泰文长标签下输入基线对齐 | `screens/admin/AttendanceManageScreen.tsx` | `npx tsc --noEmit` 0 错误；**本轮无实测**（视口 0×0） |
| F37 | 视口恢复后的泰文补测（960×632，租客账号）：聊天列表、我的、设置在泰文下 PASS；聊天详情发送按钮为单字小圆钮 → 改为高 44 / `minWidth 64` 胶囊，问题当页修掉。员工端与管理端仍因需切换员工账号未补测 | `screens/chat/ChatDetailScreen.tsx` | `npx tsc --noEmit` 0 错误；Expo Web 实测（见 §0 补测记录） |
| F38 | P2 第 5 批「租客首页」：① 搜索条右侧填充圆钮改纯箭头，整条搜索条为唯一点击区，点击带 `autoFocus/focusTs` 直达找房并聚焦；② 房源卡/二手房卡无图占位补「暂无图片」；③ 房源卡 id 为空不再静默无反应，改 Toast `list.itemUnavailable`；二手房卡去掉静默 `disabled`，同样给提示；④ 学校区块「更多」改「全部学校」→ `PublicSchools`，不再误入无参找房；⑤ 账单无到期日显示「到期日待确认」；⑥ 首屏骨架由「仅房源一块」扩到房源/学校/动态三块；⑦ 12s 兜底且本地无缓存时 Toast「加载较慢，可下拉刷新重试」 | `screens/tenant/HomeScreen.tsx`、`i18n/index.ts` | `npx tsc --noEmit` 0 错误；i18n 新增 4 键 × 三语；**本轮无实测**（首页泰文回归未做） |
| F41 | P2 第 8 批「公开页（学校/小区/详情/地图）」：① 学校/小区搜索框补清除 ×、提交收键盘、a11y 名，小区框高 42→44；② 学校筛选 Tab 与选项补 role/expanded/selected；③ 两个列表卡片补 role+名称；④ 第 2 页起失败补 toast；⑤ 取满 total 时显示「没有更多了」；⑥ 学校列表补下拉刷新；⑦ 学校详情电话/官网 hitSlop+a11y，两详情返回 36/42→44；⑧ 小区详情 0 数量徽标不渲染；⑨ 管理费改 `fmtMoney`；⑩ 房源相册补「当前/总数」页码；⑪ 地图弹层点遮罩关闭；⑫ 学区筛选距离统一 1 位小数 | `PublicSchoolsScreen`、`PublicCommunitiesScreen`、`PublicSchoolDetailScreen`、`PublicCommunityDetailScreen`、`PublicListingDetailScreen`、`PublicListingsScreen`、`ListingsMapModal`、`i18n/index.ts` | `npx tsc --noEmit` 0 错误；i18n 新增 1 键 × 三语（3273 唯一键全部 ×3）；**实测**：管理端房源卡字段完整（更正 F40 误报）、账号管理/角色权限入口存在且可打开；本批改动本身未逐项点击 |
| F40 | P2 第 7 批「登录/注册」：① 品牌区补产品名 `HaoFang.World` + 一句定位 `login.brandTagline`；② OAuth 进行中 Google/Apple/手机号/邮箱 四入口统一 `disabled` + 变淡；③ 邮箱失焦校验格式、密码失焦判空，错误落在对应字段下方；④ 密码框加眼睛切换明文/密文（三语屏读名）；⑤ 登录 400/401 改为密码字段下「邮箱或密码错误」红字，保留输入、不再弹 toast；⑥ `useOtp` 增国家码位数表 + `isValidPhone`/`phoneLengthHint`，手机号在失焦/发码/登录前三处校验纯数字与位数（+55 允许 10–11 位）；⑦ 登录/注册 KAV 的 Android `behavior` 由 undefined 改 `height`（**需真机验证**）；⑧ 注册邮箱模式密码框下常驻规则提示（**占位文案，待法务/产品确认**）；⑨ 角色两胶囊改两行卡片，各补一句结果说明；⑩ 注册成功补轻量欢迎 Toast | `screens/LoginScreen.tsx`、`screens/RegisterScreen.tsx`、`components/OAuthButtons.tsx`、`hooks/useOtp.ts`、`i18n/index.ts` | `npx tsc --noEmit` 0 错误；i18n 新增 10 键 × 三语（3272 唯一键全部 ×3）；**实测**：admin 账号实走管理端考勤/合同（泰文）与 CRM（中文）PASS；房源管理「地址省略」与权限/账号「无入口」两项已在 F41 复核为**误报**（字段完整、入口在「我的 → 系统管理」）；登录/注册改动本身未实测 |
| F39 | P2 第 6 批「详情页」：① 价格下补参考汇率提示 `pub.fxHint`；② 收藏按钮文案统一「收藏」并补 busy loading；③ 已订阅降价提醒改说明文案 `pub.priceAlertOnHint`，不再与按钮重复；④ 周边学校距离统一 1 位小数、无 id 时去可点态；⑤ 长描述默认 6 行折叠 + 展开/收起；⑥ 未登录电话行整行弱化；⑦ 加载态保留悬浮返回；⑧ `PublicInquiryForm` 逐元素复核（校验/loading/成功清空/旧提示清除均齐备，无需改）；KV 空值行为复核为可接受（空值行不渲染、网格自动重排） | `screens/public/PublicListingDetailScreen.tsx`、`screens/public/PublicInquiryForm.tsx`（仅复核）、`i18n/index.ts` | `npx tsc --noEmit` 0 错误；i18n 新增 5 键 × 三语；**本轮无实测** |

### 当前统计

| 范围 | 条目 | P0 | P1 | P2 |
| --- | --- | --- | --- | --- |
| 全量清单（表内 P0+P1+P2） | 317 | 1 | 130 | 186 |
| 已修 [x]（F1–F41） | 269 | 1 | 128 | 140 |
| 修复中 [~] | 4 | 0 | 1 | 3 |
| 待修 [ ] | 43 | 0 | 1 | 42 |
| 已一致 [—]（另计） | 69 | — | — | — |

> 注：本节数字在 F41 后按表内实际行重算；F41 共清 P2 13 条。

> 注：旧表「全量 261」是历次累加的算术漂移（1+95+154=250），本节起按表内实际行数重算。

### 近期最值得关注

1. ~~找房只加载第一页且无分页入口~~（F3 已接入分页，待实测）。
2. ~~详情主操作（预约/联系）不在首屏、无吸底栏~~（F4 已加吸底操作栏，待实测）。
3. ~~C 端筛选无结果没有清空入口~~（F3 已加清空筛选）。
4. ~~首页/列表把「加载失败」渲染成「暂无数据」~~（F16 已修员工首页/日程，F17 已修经纪协议）。
5. ~~价格筛选把泰铢标成「万」~~（F3 已改 ฿ 实际金额）。
6. ~~员工端 15+ 处 `Alert.alert` 在 Web 是空实现~~（F17 已清完 CRM / 业绩 / 通讯录 / 房源浏览 / 房源上架）。
7. ~~仍有 7 个整页未接 i18n~~（F26–F31 已全部清零，见 §22 末条；保留的 3 处为已确认落库文案）。
8. ~~城市/国家名仍是纯中文数据~~（F32 已修：展示走 `data/locationNames.ts` 三语覆盖层，中文原值继续作后端参数与比对键）。
9. 后端种子数据中文人名（如「租客李小姐」）与 `APP_NAME` 版本串「房地产租赁管理系统 API v1.0.0」属后端数据，**待后端多语言**，本轮前端打磨不动。

---

## §9 聊天（`src/screens/chat/ChatListScreen.tsx` + `ChatDetailScreen.tsx`）

| 页面/位置 | 元素或跳转 | 类型 | 当前表现 | 期望表现 | 证据 | 等级 | 批次 | 状态 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 会话列表/访客态 | 标题「登录后查看消息」 | 显示 | 硬编码中文，英泰界面仍中文 | i18n | `ChatListScreen:70` | P1 | B1 | [x]（F9：`chat.guestTitle`） |
| 会话列表/行标题 | 无标题回退「会话」/「未命名会话」 | 显示 | 两处硬编码中文，且同一兜底两个说法 | 统一 i18n 单一兜底 | `ChatListScreen:96,105` | P1 | B1 | [x]（F9：`chat.sessionFallback` / `chat.untitled`） |
| 会话列表/空与失败态 | 加载失败 / 无会话 | 状态 | 标题、副文案、重试全硬编码中文 | i18n | `ChatListScreen:126-140` | P1 | B1 | [x]（F9） |
| 会话列表/失败 toast | 提示标题 | 反馈 | `notifyError('加载失败')` 硬编码 | i18n | `ChatListScreen:46` | P1 | B1 | [x]（F9：`t('loadFailed')`） |
| 会话列表/首屏加载 | 整页 LoadingState | 状态 | loading 直接替换整页，页头消失、高度跳动 | 只替换列表区 | `ChatListScreen:111-113` | P2 | B3 | [ ]（G2） |
| 会话列表/顶部 | 安全区 | 布局 | `headerShown: true` 已由栈页头处理安全区，容器又加 `paddingTop: insets.top` | 去掉重复内边距 | `ChatListScreen:116`；`RootNavigator:261` | P2 | B3 | [ ] |
| 会话列表/行 | 无障碍 | 交互 | 行可点但无 `accessibilityRole/Label`，屏读只念标题文本 | 行声明 button + 会话名 | `ChatListScreen:91-100` | P2 | B3 | [ ]（G13） |
| 会话列表/行 | 最后一条摘要/未读 | 显示 | 只有标题与创建时间 | 显示最后消息与未读数 | `chatApi.conversations` | — | — | [—]（后端未返回 `last_message`/`unread`，前端不臆造） |
| 会话详情/失败与空态 | 加载失败 / 无消息 | 状态 | 标题、副文案、重试、空态全硬编码中文 | i18n | `ChatDetailScreen:172-197` | P1 | B1 | [x]（F9：`chat.loadMsgFailSub` / `chat.msgEmpty*`） |
| 会话详情/发送按钮 | 文案与无障碍名 | 显示 | 「发送」「发送消息」硬编码 | i18n | `ChatDetailScreen:215-220` | P1 | B1 | [x]（F9：`chat.send` / `chat.sendA11y`） |
| 会话详情/失败 toast | 加载/发送失败标题 | 反馈 | 「加载失败」「发送失败」硬编码 | i18n | `ChatDetailScreen:62,132` | P1 | B1 | [x]（F9：`t('loadFailed')` / `chat.sendFail`） |
| 会话详情/发送失败 | 输入内容 | 交互 | 先清空输入再发送；失败回滚气泡但用户刚打的字丢了 | 失败时恢复原文 | `ChatDetailScreen:116-135` | P1 | B1 | [x]（F9：失败回填输入框，用户已重新输入时不覆盖） |
| 会话详情/消息列表 | 新消息定位 | 交互 | 列表停在历史顶部，首次加载/发送/实时接收后都看不到最新一条 | 自动滚到最新 | `FlatList` 无 `scrollToEnd` | P1 | B1 | [x]（F9：`listRef` + 消息数变化滚到底；未真机验证键盘弹起时的滚动） |
| 会话详情/首屏加载 | 裸 spinner | 状态 | 只有居中 ActivityIndicator，无加载文案 | 带文案的 LoadingState | `ChatDetailScreen:150-156` | P2 | B3 | [ ]（G3） |
| 会话详情/发送按钮 | 命中区 | 交互 | 高 40pt；泰文下为单字圆钮，观感偏小 | ≥44pt 且胶囊宽度稳定 | `sendBtn height 40` | P2 | B3 | [x]（F37：高 44、`minWidth 64`、圆角 22，泰文「ส่ง」也呈稳定胶囊） |
| 会话详情/实时通道 | WebSocket 断开 | 状态 | 断开/建连失败静默，消息不再刷新，用户无感知 | 断线提示或自动重连 | `ws.onclose` 未处理 | P2 | B3 | [ ] |
| 会话详情/输入框 | 长度 | 交互 | 无 `maxLength` | 设上限并提示 | `TextInput` 无 maxLength | P2 | B3 | [ ] |

**跳转覆盖**：访客→Login/Register ✅；会话行→ChatDetail ✅；支持会话（`chatApi.support`）→ChatDetail ✅；发送→REST ✅；实时接收→WS ✅。无死链。

**本组小结**：链路完整，主要问题是**列表与详情的中文文案整组未国际化**（访客引导、空/失败态、发送按钮、toast），以及**发送失败丢输入**与**新消息不自动滚到最新**两个影响手感的交互缺口；P2 集中在首屏整页 loading、重复安全区、a11y 与命中区。

### §9 统计

| 范围 | 条目 | P0 | P1 | P2 | 一致/不改 |
| --- | --- | --- | --- | --- | --- |
| 聊天（列表+详情） | 17 | 0 | 10 | 6 | 1 |

---

## §10 分类页（`src/screens/category/*`）

> 覆盖：租房 `RentCategoryScreen`、新房 `NewHouseScreen`、二手房 `ResaleScreen`、商铺办公 `CommercialScreen`、厂房 `FactoryScreen`、酒店 `HotelScreen`、土地 `LandScreen`，共用壳 `CategoryShell.tsx`（顶栏 / 宫格 / 胶囊 / Tab / 筛选 / 列表 / 卡片）。

| 页面/位置 | 元素或跳转 | 类型 | 当前表现 | 期望表现 | 证据 | 等级 | 批次 | 状态 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 全部/首屏 | 数据请求 | 状态 | 新房页内联 `defaultFilterValues={{ sort: 'hot' }}`，壳里 `baseValues` 以对象引用为依赖 → `query`→`load` 每次渲染都换引用，`useEffect([load])` 死循环重复拉取，列表持续闪烁 | 默认值按内容稳定，首屏只拉一次 | `NewHouseScreen` 传字面量；`CategoryShell:786-831` | **P0** | B1 | [x]（F10：壳内按 `JSON.stringify(defaultFilterValues)` 做依赖，任何页面传内联对象都不再触发循环） |
| 顶栏/搜索框 | 输入与清除 | 交互 | 无清除按钮；提交不收起键盘 | 有值时显示 ×，提交 `Keyboard.dismiss()` | `CategoryShell:147-154` | P2 | B3 | [x]（F10，G9） |
| 顶栏/搜索框 | 无障碍 | 交互 | 输入框无 `accessibilityLabel` | 读占位文案 | 同上 | P2 | B3 | [x]（F10，G13） |
| 纯文字 Tab | 命中区 | 交互 | `paddingVertical: xs`，实际高度约 28pt | ≥44pt | `plainTab` | P2 | B3 | [x]（F10：`minHeight: colors.touch.min` + 居中） |
| 纯文字 Tab / 筛选触发 / 快捷标签 / 方块选项 | 无障碍状态 | 交互 | 可点但未声明 `role/state`，选中态与展开态对屏读不可见 | 声明 `tab/button` + `selected/expanded` | `CategoryShell:272-283,394-402,644-653,680-688` | P2 | B3 | [x]（F10，G13） |
| 列表/上拉翻页 | 失败反馈 | 反馈 | 第 2 页起请求失败被静默吞掉，列表只是停住 | toast 提示 | `CategoryShell:847-851` | P2 | B3 | [x]（F10：`notifyError`） |
| 列表/底部 | 到底提示 | 显示 | 只有加载中转圈，到底后无任何提示 | 显示「没有更多了」 | `ListFooterComponent` | P2 | B3 | [x]（F10：复用 `pub.noMore`） |
| 列表/首屏加载 | 状态 | 状态 | `loading/loadError` 时整块内容区（宫格/胶囊/Tab/筛选）被替换，仅顶栏保留 | 保留骨架、只替换列表区 | `CategoryShell:877-887` | P2 | B3 | [x]（F34：加载时保留宫格/Tab/筛选，仅列表区显示 Loading；结果计数加载中隐藏） |
| 列表/卡片行 | 无障碍 | 交互 | `ResidentialRow/ProjectRow/SaleRow/CommercialRow/FactoryRow/LandRow` 整行可点但无 `accessibilityRole/Label` | 声明 button + 首行标题 | `categoryCards.tsx` 各行 | P2 | B3 | [x]（F34：六类行 + 楼盘卡/rail 卡补 `role=button` + 标题 label） |
| 列表/卡片行 | 计价单位 | 显示 | 租金为空时显示「—/月」，单位仍拼上 | 空值只显示「—」或「面议」 | `categoryCards.tsx` ResidentialRow | P2 | B3 | [x]（F34：住宅/商业/厂房/酒店/土地价格为空时不再拼 `/月`） |
| 宫格/榜单/对比卡 | 「即将上线」入口 | 跳转 | 10 个宫格里多数、以及「查看对比」都进 `FeatureNotAvailable`，入口可见但不可用 | 隐藏未开放入口，或明确标注「即将上线」 | 各页 `onPress` | P2 | B3 | [ ]（**需产品拍板**：是否保留占位入口） |
| 各页文案 | 中文硬编码 | 显示 | 无；页面文案全部走 `t()`（仅代码注释为中文） | — | 全目录 grep | — | — | [—] |
| 卡片/跳转 | 房源/楼盘详情 | 跳转 | 住宅/二手/商业/厂房/土地 → 对应详情 ✅；新房楼盘卡 → `PublicCommunityDetail` ✅（首页新房 rail 未带 `projectId` 的 P1 另见 §2） | — | 各页 `onPress` | — | — | [—] |

**本组小结**：分类页共用壳完成度高（三语、三态、分页、筛选面板齐全），本组最大问题是**新房页默认值引用不稳导致的首屏无限重拉（P0，已修）**；其余 P2 集中在搜索清除、a11y 状态、翻页失败反馈与到底提示。宫格「即将上线」入口涉及产品取舍，未擅自隐藏。

### §10 统计

| 范围 | 条目 | P0 | P1 | P2 | 一致/不改 |
| --- | --- | --- | --- | --- | --- |
| 分类页（壳 + 7 页） | 13 | 1 | 0 | 10 | 2 |

---

## §11 地图与区域选择（`LocationPickerScreen` + `RegionPicker` + `ListingsMapModal`）

| 页面/位置 | 元素或跳转 | 类型 | 当前表现 | 期望表现 | 证据 | 等级 | 批次 | 状态 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 定位页/整页 | 中文硬编码 | 显示 | 搜索占位、搜索结果、无结果、当前定位、「全城」、热门城市、选择国家、城市标题、无城市、区数、括号全为中文，英泰界面整页中文 | 全部走 i18n | `LocationPickerScreen.tsx` | P1 | B1 | [x]（F11：新增 `location.*` 12 键 × 三语） |
| 定位页/城市行 | 选中反馈 | 跳转 | 选中城市只写 store，页面停留，用户还要手动返回 | 选完自动回来源页 | `handleSelect` 无 goBack | P1 | B2 | [x]（F11：`navigation.goBack()`） |
| 定位页/搜索框 | 清除按钮 | 交互 | 无 `accessibilityLabel` | 补「清除」 | `LocationPickerScreen:107` | P2 | B3 | [x]（F11，G13） |
| 定位页/城市行·热门·国家 | 无障碍 | 交互 | 均无 `role/state`，选中态对屏读不可见 | 声明 button + selected | `LocationPickerScreen` 三处 | P2 | B3 | [x]（F11，G13） |
| 定位页/搜索框 | 自动聚焦 | 交互 | 进入页面不弹键盘，默认浏览模式 | — | `TextInput` 无 autoFocus | — | — | [—]（浏览优先，非缺陷） |
| 定位页/热门城市 | 数据口径 | 显示 | 每个国家取第一个城市当地热门 | — | `hotCities` | — | — | [—]（静态数据近似，无热门接口） |
| 区域筛选/触发块 | 命中区 | 交互 | 高约 33pt | ≥44pt | `RegionPicker trigger paddingVertical 7` | P2 | B3 | [x]（F11：hitSlop 5） |
| 区域筛选/选项行 | 命中区 | 交互 | 高约 33pt | ≥44pt | `RegionPicker opt paddingVertical 8` | P2 | B3 | [x]（F11：`minHeight: 44`） |
| 区域筛选/「全部」 | 选中态 | 显示 | 未选任何区域时「全部」无高亮，看不出当前是全部 | 与其它选项一致高亮 | `RegionPicker:204-210` | P2 | B3 | [x]（F11：`allActive`） |
| 区域筛选/触发与选项 | 无障碍 | 交互 | 无 `role/state` | button + expanded/selected | `RegionPicker` | P2 | B3 | [x]（F11，G13） |
| 区域筛选/关闭按钮 | 命中区 | 交互 | 20 + hitSlop 10 ≈ 40pt | ≥44pt | `RegionPicker:141` | P2 | B3 | [x]（F11：hitSlop 12） |
| 区域筛选/列表 | 检索 | 交互 | 三级列只能滚动，无搜索 | 加搜索 | `Column` | — | — | [—]（每列数据量为个位数，搜索无收益） |
| 地图弹层/房型 | 单位 | 显示 | `{n} BED` 硬编码英文，中文界面也显示 BED | i18n「{n}室 / {n}BR / {n} ห้องนอน」 | `ListingsMapModal:129` | P1 | B1 | [x]（F11：`prop.bedroomN`） |
| 地图弹层/行与关闭 | 无障碍 | 交互 | 行可点、关闭按钮均无 a11y | button + 名称 | `ListingsMapModal:78-124` | P2 | B3 | [x]（F11，G13） |
| 地图弹层/重试 | 命中区 | 交互 | 高 38pt | ≥44pt | `mapRetry height 38` | P2 | B3 | [x]（F11：minHeight 44） |
| 地图弹层/加载 | 状态 | 状态 | 裸 spinner，无文案 | 加「加载中」 | `ListingsMapModal:88-92` | P2 | B3 | [x]（F11） |
| 地图弹层/遮罩 | 关闭 | 交互 | 点卡片外遮罩不关闭，只能点右上 × | 点遮罩关闭 | `mapWrap` 无 Pressable | P2 | B3 | [x]（F41：遮罩层补全屏 `TouchableOpacity`，点卡片外区域关闭） |
| 地图弹层/形态 | 地图 | 显示 | 无原生地图，以「视野内房源列表」降级 | — | 文件头注释 | — | — | [—]（Expo Go 无法加载原生地图模块，已明示降级） |

**本组小结**：定位页是**整页未国际化**的重灾区（英泰用户看到全中文），且选完城市不返回；区域筛选与地图弹层结构完整，问题集中在命中区、a11y、选中态与单位口径，均已顺手修掉。

### §11 统计

| 范围 | 条目 | P1 | P2 | 一致/不改 |
| --- | --- | --- | --- | --- |
| 定位 / 区域 / 地图 | 18 | 3 | 11 | 4 |

---

## §12 学校与小区（`PublicSchoolsScreen` / `PublicCommunitiesScreen` / `PublicSchoolDetailScreen` / `PublicCommunityDetailScreen`）

| 页面/位置 | 元素或跳转 | 类型 | 当前表现 | 期望表现 | 证据 | 等级 | 批次 | 状态 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 学校列表/筛选无结果 | 空态按钮 | 状态 | 有筛选条件时底部按钮仍是「重试」，点完还是同一结果 | 改为「清空筛选」并真的清空关键字/学段/课程 | `ListState` 的 `emptyActionLabel` 未传 | P1 | B2 | [x]（F12：按 `hasFilter` 传清空动作，副文案区分「筛选无结果」与「暂无学校」） |
| 小区列表/筛选无结果 | 空态按钮 | 状态 | 同上 | 同上 | `PublicCommunitiesScreen:111-128` | P1 | B2 | [x]（F12） |
| 小区列表/搜索 | 请求竞态 | 状态 | 无请求序列守卫，连续输入时先发后到的旧响应会覆盖新关键字结果 | 丢弃过期响应 | `fetchPage` 无 `requestSeq` | P1 | B1 | [x]（F12：与学校页同款 seq 守卫） |
| 学校详情/失败 | 状态 | 状态 | 网络失败与 404 都显示「未找到该学校」，且无重试 | 失败可重试，404 才显示不存在 | `.catch` 统一 `setSchool(null)` | P1 | B1 | [x]（F12：区分 404，失败态给重试；`id` 缺失不再永远转圈） |
| 小区详情/失败 | 状态 | 状态 | 同上 | 同上 | `.catch` 统一 `setProject(null)` | P1 | B1 | [x]（F12） |
| 学校详情/加载 | 状态 | 状态 | 全屏裸 spinner | 带「加载中」的状态组件 | 原 `ActivityIndicator` | P2 | B3 | [x]（F12：`LoadingState`） |
| 小区详情/加载 | 状态 | 状态 | 全屏裸 spinner | 同上 | 同上 | P2 | B3 | [x]（F12） |
| 学校列表/搜索框 | 清除与键盘 | 交互 | 无清除按钮、提交不收键盘、无 a11y 名 | 同分类页顶栏 | `PublicSchoolsScreen:149-157` | P2 | B3 | [x]（F41：有值时显示清除 ×、提交 `Keyboard.dismiss`、补 a11y 名 `pub.clearSearch`） |
| 小区列表/搜索框 | 清除与键盘 | 交互 | 无清除按钮、提交不收键盘、无 a11y 名；框高 42 | 同上，且 ≥44 | `PublicCommunitiesScreen:91-98` | P2 | B3 | [x]（F41：同学校页；框高 42→44，右侧留出清除位） |
| 学校列表/筛选 Tab 与选项 | 无障碍 | 交互 | 无 `role/state`，展开与选中态对屏读不可见 | button + expanded/selected | `PublicSchoolsScreen:163-204` | P2 | B3 | [x]（F41：Tab 补 `role=button` + expanded/selected；选项补 selected） |
| 两个列表/卡片 | 无障碍 | 交互 | 学校卡、小区卡可点但无 `role/label` | button + 名称 | 两页 `renderItem` | P2 | B3 | [x]（F41：补 `role=button` + 学校/小区名） |
| 两个列表/翻页 | 失败反馈 | 反馈 | 第 2 页起请求失败被静默吞掉 | toast 提示 | 两页 `catch` | P2 | B3 | [x]（F41：`targetPage>1` 失败弹 toast，序号守卫内先判丢包） |
| 两个列表/底部 | 到底提示 | 显示 | 只有加载中转圈，到底无提示 | 「没有更多了」 | `ListFooterComponent` | P2 | B3 | [x]（F41：加载完且已取满 total 时显示 `pub.noMore`） |
| 学校列表/刷新 | 下拉刷新 | 交互 | 无 `RefreshControl`（小区列表有） | 两页一致 | `FlatList` | P2 | B3 | [x]（F41：学校列表补 `RefreshControl`，两页统一） |
| 学校详情/电话与官网 | 命中区/无障碍 | 交互 | 电话行只有一行文字高，官网链接无 a11y 名 | ≥44 或 hitSlop；补 label | `PublicSchoolDetailScreen:136-151` | P2 | B3 | [x]（F41：两处 hitSlop 10，电话补 button+号码名、官网补 `role=link`） |
| 两个详情/返回 | 命中区 | 交互 | 悬浮返回 36pt、空态返回按钮高 42pt | ≥44pt | 两页 `floatBack` / `backButton` | P2 | B3 | [x]（F41：`floatBack` 36→44、空态返回 42→44，均补 hitSlop/role） |
| 小区详情/徽标 | 显示 | 显示 | 在售/在租为 0 时仍显示「在售 0 套」 | 0 时不渲染 | `PublicCommunityDetailScreen:101-102` | P2 | B3 | [x]（F41：数量为 0 时整枚徽标不渲染） |
| 小区详情/管理费 | 单位 | 显示 | 硬编码 `THB/㎡`，与其它金额 `฿` 口径不一致 | 走 `fmtMoney` 或统一符号 | `PublicCommunityDetailScreen:117` | P2 | B3 | [x]（F41：改 `fmtMoney(fee,'THB')/㎡`，与均价口径一致） |
| 学校列表/学费 | 显示 | 显示 | 学费仍为后端预格式化串 | — | `item.tuition_range` | — | — | [—]（同 O-10，后端未给结构化区间） |
| 两个详情/跳转 | 周边房源 | 跳转 | `PublicListingRow` → 房源详情 ✅；学校留资 → 询盘接口 ✅ | — | 实测代码 | — | — | [—] |

**本组小结**：两个列表的三语与翻页已完整，本组 P1 集中在**「筛选无结果」把重试当清空**、**小区搜索的响应竞态**、以及**两个详情把网络失败当 404**；均已修。剩余 P2 主要是搜索框 G9、卡片/Tab 的 a11y、翻页失败反馈与命中区。

### §12 统计

| 范围 | 条目 | P1 | P2 | 一致/不改 |
| --- | --- | --- | --- | --- |
| 学校 / 小区（4 页） | 20 | 5 | 13 | 2 |

---

## §13 表单类（上）：预约留资 + 支付账单（`PublicInquiryForm` + `PaymentsScreen`）

| 页面/位置 | 元素或跳转 | 类型 | 当前表现 | 期望表现 | 证据 | 等级 | 批次 | 状态 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 留资表单/手机号 | 校验 | 校验 | 只判非空，输入 `abc` 也能提交，失败后只给通用错误 | 宽松格式校验（`+`/空格/短横，6-20 位数字）并给明确提示 | `PublicInquiryForm.submit` | P1 | B1 | [x]（F13：新增 `pub.inquirePhoneInvalid` × 三语） |
| 业主账单/失败 | 状态 | 状态 | 请求失败且无缓存时直接显示「暂无账单」，把网络问题说成没数据 | 失败态 + 重试 | `OwnerPaymentsView` 未消费 `q.isError` | P1 | B1 | [x]（F13） |
| 业主账单/日期 | 显示 | 显示 | `String(due_date).replace('T',' ').slice(0,10)` 原样截断 | 统一 `fmtDate` | `PaymentsScreen:571` | P1 | B1 | [x]（F13，O-02） |
| 租客支付/回跳 | 状态 | 交互 | 收银台浏览器关闭后不刷新，刚付完仍显示「待缴」 | 返回后自动刷新账单 | `handlePay` 仅 `openBrowserAsync` | P1 | B1 | [x]（F13：关闭后 `refetch`；未实测真实支付回调时延） |
| 留资表单/提示 | 反馈 | 反馈 | 上一次校验/提交错误在编辑时一直挂着 | 编辑任一字段即收起 | `PublicInquiryForm` | P2 | B3 | [x]（F13） |
| 留资表单/输入 | 交互 | 交互 | 无 `maxLength`、称呼未关 autocorrect、输入无 a11y 名 | 补上限、`autoCorrect={false}`、label | 同上 | P2 | B3 | [x]（F13，G13） |
| 业主账单/筛选 chip | 无障碍 | 交互 | 可点但无 `role/state` | button + selected | `PaymentsScreen:608` | P2 | B3 | [x]（F13，G13） |
| 租客发票弹层/加载 | 状态 | 状态 | 裸 spinner，无文案 | 带文案 | `PaymentsScreen:480` | P2 | B3 | [ ]（G3） |
| 业主账单卡 | 查看详情 | 跳转 | 卡片不可点，业主看不到账单明细/发票/凭证（租客侧有「查看凭证 / 发票」） | 与租客侧对齐，或明确只读摘要 | `renderItem` 无 `onPress` | P2 | B3 | [ ]（**需产品拍板**：业主是否开放账单凭证） |
| 租客支付/扫码 | 状态 | 交互 | 关闭二维码弹层后不刷新，扫码付完仍显示「待缴」 | 关闭后刷新 | `setPayQr(null)` 无 refetch | P2 | B3 | [ ] |
| 发票弹层/内容 | 布局 | 布局 | 内容无滚动容器，小屏长账单可能超出 | 可滚动 | `Modal` 内直接渲染 | P2 | B3 | [ ] |
| 留资表单/提交成功 | 反馈 | 反馈 | 成功后清空三个字段并显示成功文案 ✅ | — | `submit` | — | — | [—] |
| 支付渠道 | 回调 | 交互 | 依赖后端托管收银台/二维码，App 不做渠道判断 | — | `resolvePayment` | — | — | [—]（渠道能力由后端返回） |
| 两个表单/三语 | 显示 | 显示 | 字段标签、错误、按钮、账单状态全部 i18n ✅ | — | 两文件 `t()` 覆盖 | — | — | [—] |

**本组小结**：留资表单的主要漏洞是**手机号只判空**（脏线索能提交），支付侧是**业主失败当空态**、**日期口径**与**收银台返回不刷新**；均已修。业主账单卡是否开放明细/凭证需要产品拍板。

### §13 统计

| 范围 | 条目 | P1 | P2 | 一致/不改 |
| --- | --- | --- | --- | --- |
| 预约留资 + 支付账单 | 14 | 4 | 7 | 3 |

---

## §14 合同签署（`src/screens/contracts/MyContractsScreen.tsx`）

| 页面/位置 | 元素或跳转 | 类型 | 当前表现 | 期望表现 | 证据 | 等级 | 批次 | 状态 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 列表/详情/加载态 | 加载文案 | 显示 | loading 时 `LoadingState` 传的是「合同加载失败」文案，正常加载也显示失败 | 「加载中…」 | `MyContractsScreen:793`；详情 836 | P1 | B1 | [x]（F14：改 `pub.loading`，两处） |
| 合同列表/行 | 无障碍 | 交互 | 整行可点但无 `role/label`，屏读只念标题 | button + 合同标题 | `MyContractsScreen:476` | P2 | B3 | [x]（F14，G13） |
| 详情/返回键 | 命中区 | 交互 | 24 图标 + hitSlop 8 ≈ 40pt | ≥44pt | `MyContractsScreen:835` | P2 | B3 | [x]（F14，hitSlop 12） |
| 签署台/返回与关闭 | 命中区 | 交互 | 两个 22–24 图标按钮 hitSlop 8 | ≥44pt | `MyContractsScreen:995,1013` | P2 | B3 | [x]（F14） |
| 签名制作/拒签弹窗/关闭 | 命中区 | 交互 | 22 图标 + hitSlop 8 | ≥44pt | `MyContractsScreen:962,1059` | P2 | B3 | [x]（F14） |
| 签署台/已落章「×」 | 命中区 | 交互 | 删除钮仅 12 图标，无 hitSlop、无无障碍名 | ≥44pt 命中 + 删除语义 | `MyContractsScreen:585` | P2 | B3 | [x]（F14） |
| 签署台/预置签署区 | 无障碍 | 交互 | 虚线框可点但屏读无名，不知类型与动作 | button + 「签名 · 点击完成签署」+ disabled | `MyContractsScreen:540` | P2 | B3 | [x]（F14） |
| 签署台/托盘「重做」 | 交互 | 交互 | 命中区约 33pt、无无障碍名 | ≥44pt + 「制作印章/手写签名」 | `MyContractsScreen:651` | P2 | B3 | [x]（F14） |
| 拒签弹窗/原因输入 | 交互 | 交互 | 无 `maxLength`、无无障碍名 | 200 字上限 + label | `MyContractsScreen:1079` | P2 | B3 | [x]（F14） |
| 详情/请求失败 | 状态 | 状态 | `openDetail` 失败只 toast，`detail` 仍为 null → 弹层不出现，用户只看到一闪而过的提示 | 详情内失败态 + 重试 | `openDetail` catch | P2 | B3 | [ ] |
| 签署台/PDF 页图 | 状态 | 状态 | 页图 URL 拿到但 `<Image>` 加载失败时永远显示 spinner | 单页失败提示 + 重试 | `renderDocs` `pdfUrls[page]` 分支 | P2 | B3 | [ ] |
| 签署台/版本徽标 | 显示 | 显示 | 头部固定渲染 `v2`，非后端版本号，属伪数据 | 去掉或改真实版本 | `styles.studioVer` | P2 | B3 | [ ] |
| 合同列表/行信息 | 显示 | 显示 | 只有标题 + 来源 + 状态，无创建/签署时间 | 补 `created_at`（`fmtDate`） | `renderRow` | P2 | B3 | [ ] |
| 我的签署方归属 | 逻辑 | 逻辑 | 账号 → 邮箱 → 姓名 → 单一签署方 四级兜底 ✅ | — | `myParty` | — | — | [—] |
| 时间口径 | 显示 | 显示 | naive UTC 补 `Z` 再按本地时区格式化 ✅ | — | `fmtDate` | — | — | [—] |
| 实名前置 | 逻辑 | 逻辑 | 不再前端按实名禁签，未绑定签署方由后端 403 拦截 ✅ | — | `needsRealName` | — | — | [—] |
| 拒签/已签只读 | 交互 | 交互 | 已签或已拒签隐藏签署与拒签入口，签署区禁点 ✅ | — | `renderCfg` / `renderSignField` | — | — | [—] |

**本组小结**：签署链路（列表 → 详情 → 签署台 → 落章 → 原子提交 → 拒签）完整，三语与时间口径已达标；本轮修掉**加载态文案语义错（P1）**与一组**命中区/屏读缺口（P2）**。剩余 P2 集中在**详情失败态**、**PDF 页图失败**与**列表信息密度**。

### §14 统计

| 范围 | 条目 | P1 | P2 | 一致/不改 |
| --- | --- | --- | --- | --- |
| 我的合同（列表 + 详情 + 签署台） | 16 | 1 | 11 | 4 |

---

## §15 委托上架（`src/screens/owner/MarketingScreen.tsx` + `src/screens/listing/MyListingsScreen.tsx`）

| 页面/位置 | 元素或跳转 | 类型 | 当前表现 | 期望表现 | 证据 | 等级 | 批次 | 状态 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 业主委托/首屏加载 | 加载态 | 状态 | `loading` 时整页 `LoadingState`，页头与返回消失 | 只替换内容区 | `if (loading) return` | P2 | B3 | [ ]（G2） |
| 业主委托/数据请求 | 失败态 | 状态 | 四个接口 `allSettled` 后失败被忽略，页面按空数据渲染「暂无可推广房源」 | 顶部失败提示 + 重试，已有数据保留 | `load()` 无 rejected 分支 | P1 | B1 | [x]（F15：失败条 + 重试） |
| 业主委托/双委托 Tab | 命中区 | 交互 | `paddingVertical: 8`，行高约 36pt | ≥44pt | `styles.tab` | P2 | B3 | [x]（F15，G5：hitSlop 6/4） |
| 业主委托/双委托 Tab | 无障碍 | 交互 | 无 role / 选中态 | tab + selected + label | `styles.tab` 分支 | P2 | B3 | [x]（F15，G13） |
| 业主委托/① 房源选项 | 无障碍 | 交互 | 整行可点但屏读不报选中态 | button + selected + 房源摘要 | `styles.pick` 分支 | P2 | B3 | [x]（F15，G13） |
| 业主委托/② 定价建议 | 显示 | 显示 | 建议价、市场均值、区间、进度条、依据齐全 | — | `mkt.*` 三语 | — | — | [—] |
| 业主委托/③ 挂牌托管 | 显示 | 显示 | 服务费 / 托管费 / 说明齐全 | — | `mkt.*` 三语 | — | — | [—] |
| 业主委托/出售估价 | 显示 | 显示 | `sale_price` 缺失时按 0 渲染「฿0」与「฿0 - ฿0」预估价，像真实报价 | 缺失显示「待定价」，不展示 0 区间 | `salePrice` 计算 | P2 | B3 | [x]（F15） |
| 业主委托/③ 设置带看时段 | 反馈 | 交互 | `Alert.alert` 在 Web 为空实现，点击无任何反馈 | Toast 提示 | `setViewing` 按钮 | P1 | B1 | [x]（F15：改 `notify`） |
| 业主委托/委托表单校验 | 反馈 | 交互 | 不完整时 `Alert.alert`，Web 点提交无反应 | 行内错误文案 | `submit()` | P1 | B1 | [x]（F15：行内错误） |
| 业主委托/委托表单 | 键盘 | 交互 | 底部弹层无键盘避让，iOS 下输入价/地址被键盘遮挡 | `KeyboardAvoidingView` | `Modal` 结构 | P1 | B1 | [x]（F15，G8） |
| 业主委托/委托表单 | 校验 | 交互 | 售价可输 0、负数；无长度上限 | >0 校验 + `maxLength` | `formPrice` 输入 | P2 | B3 | [x]（F15） |
| 业主委托/委托表单 | 无障碍 | 交互 | 名称/售价/币种/地址输入均无 label | 逐字段 label | `TextInput` ×4 | P2 | B3 | [x]（F15，G13） |
| 业主委托/提交 | 状态 | 交互 | 提交中禁用并显示「提交中」，成功关闭并刷新列表 | — | `submitting` | — | — | [—] |
| 业主委托/我的委托 | 交互 | 交互 | 委托行只展示状态与进度，不可点进房源/上架单详情 | 可点进对应详情 | `consignItem` 无 onPress | P2 | B3 | [ ]（待拍板） |
| 业主委托/我的委托 | 显示 | 显示 | 出租取托管中房源、出售取挂牌记录，状态徽标与进度条一致 | — | `rentConsigns` / `listings` | — | — | [—] |
| 我的上架单/加载与失败 | 状态 | 状态 | 首屏/刷新/失败重试三态齐全，失败不清空已有行 | — | `ListState` | — | — | [—] |
| 我的上架单/分页 | 交互 | 交互 | 逐页合并去重，按 total 判到底并显示「没有更多了」 | — | `loadMore` | — | — | [—] |
| 我的上架单/空态 | 交互 | 交互 | 空态走 `EmptyState`，无 `FlatList` 因而没有下拉刷新 | 空态也能下拉刷新 | 空态分支 | P2 | B3 | [ ] |
| 我的上架单/卡片 | 显示 | 显示 | 只有标题/地址/价格/状态/分成，无封面与户型 | 有图显示封面，补户型面积 | `renderItem` | P2 | B3 | [ ] |
| 我的上架单/关闭下架 | 交互 | 交互 | Web `confirm` / 原生 `Alert` 二次确认，成功后就地改状态并同步缓存 | — | `closeListing` | — | — | [—] |
| 我的上架单/卡片 | 交互 | 交互 | 卡片不可点，无「编辑 / 查看详情」入口 | 补编辑与详情入口 | `Card` 无 onPress | P2 | B3 | [ ]（待拍板） |
| 我的上架单/分成行 | 显示 | 显示 | 三项费率全空时仍渲染空 `Text`，多出一段行距 | 空值不渲染 | `metaRow` | P2 | B3 | [ ] |

**本组小结**：委托链路（选择房源 → 定价建议 → 挂牌表单 → 我的委托 / 我的上架单）数据与状态齐全；本轮修掉**失败当空态的 P1（G1）**、**Web 下两处 `Alert` 静默失效（P1）**、**表单无键盘避让（G8）**，并补齐命中区/屏读/售价兜底。剩余 P2 与两个待拍板项：委托行与上架单卡片是否补详情/编辑入口。

### §15 统计

| 范围 | 条目 | P1 | P2 | 一致/不改 |
| --- | --- | --- | --- | --- |
| 业主委托 + 我的上架单 | 23 | 4 | 12 | 7 |

---

## §16 员工/经纪端（`src/screens/employee/*` + `contracts/ContractsScreen` + `broker/BrokerAgreementScreen`）

| 页面/位置 | 元素或跳转 | 类型 | 当前表现 | 期望表现 | 证据 | 等级 | 批次 | 状态 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 员工首页/数据请求 | 失败态 | 状态 | 8 个接口 `allSettled` 后失败被忽略，页面渲染「今日 0 场带看 / 暂无待跟进客户」，与真无数据无法区分 | 失败条 + 重试，已有数据保留 | `loadAll` 无 rejected 分支 | P1 | B1 | [x]（F16：失败条 + 重试） |
| 员工首页/loadAll 异常 | 反馈 | 交互 | 外层 `catch` 用 `Alert.alert`，Web 下空实现，异常静默 | Toast | `loadAll` catch | P1 | B1 | [x]（F16，G11：改 `notifyError`） |
| 员工首页/首屏 | 加载态 | 状态 | `loading` 时整页 `LoadingState`，概览卡/日历全部后置，页面高度跳变 | 只替换内容区 | `if (loading) return` | P2 | B3 | [ ]（G2） |
| 员工首页/今日工作台 | 时间线行 | 交互 | 行仅展示时间/客户/房源，不可点，无法进带看详情 | 可点进带看或日程 | `timelineItem` 为 `View` | P2 | B3 | [x]（F35：行改可点，进「我的日程」；补 role/label） |
| 员工首页/待跟进客户 | 「去跟进」 | 跳转 | 统一 `navigate('CRM')`，不带该线索，落地到客户列表首屏 | 带 leadId 直达该客户 | `followBtn` onPress | P2 | B3 | [x]（F35：带 `leadName` 进 CRM 并预填搜索定位该客户） |
| 员工首页/待跟进客户 | 预算 | 显示 | `budgetCurrency` 缺失时回退到员工默认币种，可能把 USD 预算标成 ฿ | 币种缺失不猜符号 | `money(lead.budget_max, lead.budget_currency)` | P2 | B3 | [x]（F35：无币种时只显示数字不带符号） |
| 员工首页 + 日程页 | 页面文案 | 显示 | 两页除 `emp.workbenchFail` 外**整页中文**（概览、区块标题、状态徽标、星期、月份、图例、空态全部写死），英/泰界面仍是中文 | 全量接 `useI18n` | `AGENDA_META`/`VIEWING_STATUS_META`/`LEAD_STAGE_META`/`monthNames`/`WEEKDAYS` | P1 | B1 | [x]（F18：新增 ~130 条 `emp.*` 三语键，两页文案全部走 `t()`） |
| 日程页/数据请求 | 失败态 | 状态 | 带看请求 `catch` 直接 `setViewings([])`，其余 `allSettled` 失败被忽略，页面显示「本月暂无安排」 | 失败条 + 重试 | `load()` | P1 | B1 | [x]（F16：失败条 + 重试） |
| 日程页/删除自定义日程 | 二次确认 | 交互 | 原生 `Alert.alert` 三按钮，Web 下空实现，点垃圾桶无任何反应 | Web 走 `confirm` | `confirmDelete` | P1 | B1 | [x]（F16） |
| 日程页/保存自定义事件 | 失败反馈 | 交互 | `catch` 只 `setSaving(false)`，保存失败既不提示也不关弹层 | Toast 报错 | `saveEvent` | P1 | B1 | [x]（F16：`notifyError`） |
| 日程页/页头与加载 | 文案 | 显示 | `BeikeHeader title="我的日程"`、`LoadingState label="正在加载日程…"` 写死中文 | `nav/emp.*` 三语 | `BeikeHeader` / `LoadingState` | P1 | B1 | [x]（F16：新增 `emp.calTitle`/`emp.calLoading` 三语） |
| 日程页/月历表头 | 月份与星期 | 显示 | `monthNames`（一月…十二月）、`WEEKDAYS`（日…六）写死中文，切语言不变 | 随语言本地化 | `CalendarScreen:75-76` | P1 | B1 | [x]（F18：`emp.month.1-12` / `emp.weekday.0-6`，按当前语言生成） |
| 日程页/月份导航 | 左右切换 | 交互 | 按钮 36×36，实际命中区不足 44；无屏读名称 | hitSlop + a11y | `styles.navBtn` | P2 | B3 | [x]（F16，G5/G13） |
| 日程页/添加事件 FAB | 无障碍 | 交互 | 纯图标按钮，无 `accessibilityLabel` | 有可读名称 | `styles.fab` | P2 | B3 | [x]（F16，G13） |
| 日程页/列表视图 | 事件行 | 交互 | 「列表」模式下事件行不可点，无法查看详情或删除 | 与月视图一致可操作 | `listEventRow` | P2 | B3 | [x]（F35：催收类给「去催收」入口、自定义事件给删除按钮；带看行无房源 id，暂不提供详情） |
| 日程页/租金催收 | 「去催收」 | 跳转 | 统一 `navigate('CRM')`，不带账单/租约，落地为客户首屏 | 带账单或租约参数 | `actionRoute: 'CRM'` | P2 | B3 | [ ]（**待产品确认**：CRM 需新增按账单/租约定位的能力，涉及接口与页面状态） |
| 日程页/今日待跟进 | 范围 | 显示 | 标题写「今日」，实际把未来 7 天到期合同与逾期账单都算进来 | 文案改为「近 7 天待跟进」 | `todayFollowUps` | P2 | B3 | [x]（F35：三语文案改「近 7 天待跟进 / next 7 days」） |
| 房源管理/一键上架 | 反馈 | 交互 | 校验、成功、失败分别走 `window.alert` / `Alert.alert`，四项文案硬编码中文；Web 与原生两套观感 | Toast + 三语 | `confirmPublish` | P1 | B1 | [x]（F17：校验/成功/失败改 `toast`/`notify`/`notifyError`，确认走 Web `confirm`，文案入 `emp.publish*` 三语） |
| 房源管理/首屏 | 加载态 | 状态 | `loading` 时整页 `LoadingState`，筛选栏消失；`label="正在加载房源…"` 写死中文 | 只替换列表区 + 三语 | `if (loading) return` | P2 | B3 | [x]（F35：改为只在列表区显示 `eprop.loading` 三语 Loading，搜索/筛选保留） |
| 房源管理/列表尾 | 失败条与加载更多 | 显示 | 「加载失败，请稍后重试 / 重试 / 加载更多房源」写死中文 | 复用 `pub.*` 三语 | `ListFooterComponent` | P2 | B3 | [x]（F17：改 `emp.listLoadFail` / `common.retry` / `emp.loadMoreListings`） |
| 房源管理/上架 chip | 无障碍 | 交互 | `accessibilityLabel="上架"` 写死中文 | 三语标签 | `publishChip` | P2 | B3 | [x]（F17 已改 `t('emp.publish')`） |
| CRM/客户与租约 | 提示 | 交互 | 8 处 `Alert.alert`（无号码、拨号失败、无联系方式、保存成功/失败、名称必填…），Web 下全部静默 | 消息类改 Toast | `CRMScreen:98-167` | P1 | B1 | [x]（F17：全部改 `notify`/`notifyError`/`toast`，Web 下不再静默） |
| 业绩/手工补录 | 校验与结果 | 交互 | 补录的 4 条校验 + 保存成功/失败 + 删除确认/失败共 8 处 `Alert`，Web 下点保存无任何反馈 | 行内校验 + Toast，删除确认走 `confirm` | `PerformanceScreen:313-380` | P1 | B1 | [x]（F17：日期/金额错误定位到字段旁红字，成功/失败走 Toast，删除确认走 Web `confirm`） |
| 通讯录/拨号 | 提示 | 交互 | 无号码、号码展示均走 `Alert.alert`，Web 下点按无反应 | Toast / 系统拨号 | `ContactScreen:122,128` | P1 | B1 | [x]（F17：无号码改 `notify`，拨号失败改错误 Toast） |
| 房源浏览/收藏 | 失败反馈 | 交互 | 收藏失败 `Alert.alert(t('acc.opFailed'))`，Web 下静默 | Toast | `PropertyBrowseScreen:371` | P1 | B1 | [x]（F17：改 `notify`） |
| 经纪协议/加载失败 | 失败态 | 状态 | `load()` 失败只弹 Toast，`broker` 仍为 `null`，页面落到「暂无经纪人身份，无法在线签约」，把网络错误说成没有身份，且无重试 | 失败态 + 重试，与「无身份」分开 | `BrokerAgreementScreen:55-70,179-185` | P1 | B1 | [x]（F17：新增 `loadFailed` 失败页 + 重试，与「无经纪人身份」分离；文案仍中文，见下条） |
| 经纪协议/页面文案 | 显示 | 显示 | 协议标题、状态、说明、签署弹层、按钮全中文，未接 i18n | 三语 | `BrokerAgreementScreen` 全文 | P1 | B1 | [x]（F19：新增 `broker.*` 31 键 × 三语；失败页/无身份页/协议卡/签署弹层/toast 全部走 `t()`；泰文长文案下状态行改换行、签署按钮改 `minHeight` 防截断） |
| 经纪协议/签署 | 反馈与状态 | 交互 | 成功/失败走 `notify`/`notifyError`，签署中按钮转圈并禁用 | — | `generateAndSign` | — | — | [—] |
| 合同管理（员工） | 列表与三态 | 状态 | 壳层复用 `useContractsList`，`error`/`refreshing`/空态走 `ContractsList`，首屏仅列表无数据时 `LoadingState` | — | `ContractsScreen:55-73` | — | — | [—]（F14 已覆盖子组件；懒加载失败未验） |
| 员工栈页标题 | 导航栏 | 显示 | `CRM / Performance / Contacts / BrokerAgreement / EmployeePropertyBrowse / Contracts` 均走 `nav.*` / `contract.*` 三语 | — | `RootNavigator:270-329` | — | — | [—]（O-17，F6） |

**本组小结**：员工端功能链路完整、数据口径基本正确，问题集中在三处根因：①**两页主屏整页未接 i18n**（F18 已全量接 `useI18n`，新增 ~130 条 `emp.*` 三语）；②**`Alert.alert` 在 Web 是空实现**，F16 修日程删除、F17 清完 CRM/业绩/通讯录/房源浏览/房源上架，员工端消息类反馈已全部改为 Toast；③**失败被当成空数据或「无身份」**，F16 修首页/日程、F17 修经纪协议，均已分开并提供重试；④经纪协议整页中文已由 F19 接入三语。另有余量：首屏整页 loading（G2）、时间线/事件行不可点、「去跟进/去催收」不带参数。

### §16 统计

| 范围 | 条目 | P1 | P2 | 一致/不改 |
| --- | --- | --- | --- | --- |
| 员工/经纪端 + 员工合同管理 | 30 | 15 | 12 | 3 |

> F19 后：30 条中已修 24（P1 15 / P2 9 / 一致 3），待修 3（P2：上架 chip 屏读名、首页时间线行不可点、日程列表行不可点）。

---

## §17 业主资产首页（`src/screens/owner/HomeScreen.tsx`）

| 页面/位置 | 元素或跳转 | 类型 | 当前表现 | 期望表现 | 证据 | 等级 | 批次 | 状态 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 资产首页/整页 | 页面文案 | 显示 | 概览卡、占用分布图例、区块标题、房源/上架单行、佣金说明、待办提醒、加载与空态全部写死中文，英/泰界面仍是中文 | 三语 | `owner/HomeScreen` 全文 | P1 | B1 | [x]（F20：新增 `ownerHome.*` 42 键 × 三语，`LIST_STATUS` 改存 key 复用 `myListings.status.*`，月份标签复用 `emp.month.*`） |
| 资产首页/房源概览 | 户型·面积 | 显示 | 手拼 `{bed}室{bath}厅 {n}㎡`，单位不随语言 | `ownerHome.rooms` + `formatArea` | `propMeta` | P2 | B3 | [x]（F20，O-01：统一走 `formatArea(..., t('pub.sqm'))`） |
| 资产首页/区块标题 | 标题与右侧入口 | 显示 | 标题与「全部 N ›」同一行，泰文长标题可能挤压右侧入口 | 标题可收缩 | `styles.sectionTitle` | P2 | B3 | [x]（F20：补 `flexShrink: 1`） |
| 资产首页/收益趋势 | 柱状图数值 | 显示 | `BarChart` 对 ≥1 万数值硬编码「万」后缀，英/泰界面显示 `1.0万` | 单位随语言（zh 万 / en·th K·M，千位以下不缩写） | `components/charts/BarChart.tsx` | P1 | B1 | [x]（F21：共享 `formatCompactNumber(value, lang)` 收口，`BarChart` + `DiscoverScreen` 区域均价已改；`admin/HomeScreen`、`owner/IncomeScreen`、`owner/HomeScreen` 随组件自动生效） |

### §17 统计

| 范围 | 条目 | P1 | P2 |
| --- | --- | --- | --- |
| 业主资产首页 | 4 | 2 | 2 |

> F20+F21 后：4 条全部已修（P1 2 / P2 2）。

---

## §18 管理端考勤管理（`src/screens/admin/AttendanceManageScreen.tsx`）

| 页面/位置 | 元素或跳转 | 类型 | 当前表现 | 期望表现 | 证据 | 等级 | 批次 | 状态 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 考勤管理/整页 | 四页签全部文案 | 显示 | 页头、筛选、汇总、明细、考勤组、请假审批、异常报表、四个弹窗、toast、Alert、placeholder 全为硬编码中文 | 三语 | 全文 | P1 | B1 | [x]（F21：新增 `attAdm.*` 163 键 × 三语；状态/假种/审批状态改存 key，渲染期 `t()` 解析；复用 `common.retry/cancel/confirm/all/loading`） |
| 考勤管理/页签栏 | 4 个页签 | 显示 | 泰文下每个页签约两行，`tabBar` 整体变高（四项一致，不参差） | 单行或横向滚动 | `tabText` | P2 | B3 | [x]（F36：页签栏改横向滚动、文案限单行，泰文长标签不再折行） |
| 考勤管理/异常报表 | KPI 卡片 | 显示 | `width:47%` + `flexWrap`，泰文两行标签导致不同行卡片高度不一致（同行为等高） | 等高栅格 | `kpiLabel` | P2 | B3 | [x]（F36：`kpiCard` 加 `minHeight: 96`，跨行卡片等高） |
| 考勤管理/考勤核对 | 明细行右侧 | 显示 | 状态徽标 + 「校准」按钮无 `flexShrink`，极窄屏压缩左侧日期/备注区 | 防压缩/重排列结构 | `dayRow` | P2 | B3 | [x]（F36：右侧徽标+按钮包 `dayRowRight` 固定不压缩，窄屏余量留给左侧） |
| 考勤管理/考勤组表单 | 两列表单 | 显示 | 泰文长标签（如「ผ่อนผันออกก่อน (นาที)」）各自换行，两列输入基线可能不齐 | 表单重排 | `twoCol` | P2 | B3 | [x]（F36：`Field` 支持 `flex:1` 均分两列、标签预留两行高度、输入框宽度 100%） |
| 全站/错误提示 | `notifyError` 兜底 | 显示 | 兜底文案「请稍后重试」与 `retryLabel = '重试'` 仍中文，全 App 共用 | 三语 | `utils/feedback.ts` | P1 | B1 | [x]（F22：`getErrorMessage` 默认兜底改走 `errorText` 的 401/403/404/409/429/5xx/网络分类三语；`notify` 默认标题 `common.done`、`notifyError` 默认标题 `common.actionFailed`、重试按钮 `common.retry`；组件外经 `useI18n.getState().t()` 取词） |

### §18 统计

| 范围 | 条目 | P1 | P2 |
| --- | --- | --- | --- |
| 管理端考勤管理 | 6 | 2 | 4 |

> F22 后：6 条中已修 2（P1 2），待修 4（P2 4：页签两行、KPI 跨行等高、明细行压缩、两列表单基线）。

---

## §19 管理端合同管理（`src/screens/admin/LeasesScreen.tsx`）

| 页面/位置 | 元素或跳转 | 类型 | 当前表现 | 期望表现 | 证据 | 等级 | 批次 | 状态 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 合同管理/整页 | 搜索、筛选、统计、列表、空态、徽标 | 显示 | 搜索占位与清除屏读名、5 个筛选 chip、统计四格、列表标题、空态/无结果、状态徽标、即将到期天数、日期区间、月租、失败条与重试全为硬编码中文 | 三语 | 全文 | P1 | B1 | [x]（F22：新增 `leaseAdm.*` 15 键 × 三语；状态与筛选复用 `lease.status.*`/`common.all`；`STATUS_META`/`CHIPS` 改存 `labelKey` 渲染期解析） |
| 合同管理/统计行 | 四格标签 | 显示 | 泰文「ใกล้หมดอายุ」等长标签在窄格内换行，导致各格数字纵向不齐 | 单行标签 + 可收缩 | `statLabel` | P2 | B3 | [x]（F22：`statLabel` 加 `numberOfLines=1`） |
| 合同管理/合同卡 | 状态徽标 | 显示 | 泰文「ใกล้หมดอายุ · 30 วัน」与左侧合同编号同行，长文案可能挤压/溢出 | 徽标可收缩不撑破 | `badge`/`badgeText` | P2 | B3 | [x]（F22：`badge`/`badgeText` 补 `flexShrink: 1`，徽标文案 `numberOfLines=1`） |
| 合同管理/合同卡 | 卡片点击 | 跳转 | 卡片不可点，页内也无入口查看租客/合同详情（头像 `detailBtn` 样式未使用） | 进入合同详情 | `LeasesScreen` 无 `onPress`；路由仅有 `AdminLeases` | P2 | B2 | [ ]（待产品确认（功能新增）：需新增管理端合同详情路由或明确跳转目标，按「记录不实现」处理，不改路由/页面结构） |

### §19 统计

| 范围 | 条目 | P1 | P2 |
| --- | --- | --- | --- |
| 管理端合同管理 | 4 | 1 | 3 |

> F22 后：4 条中已修 3（P1 1 / P2 2），待修 1（P2：合同卡不可点进详情 → 待产品确认（功能新增），本轮不实现）。

---

## §20 业主收益（`src/screens/owner/IncomeScreen.tsx`）

| 页面/位置 | 元素或跳转 | 类型 | 当前表现 | 期望表现 | 证据 | 等级 | 批次 | 状态 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 收益/整页 | 加载与失败态、Hero、统计、趋势、筛选、明细 | 显示 | 加载文案、加载失败、刷新失败、重试、本月收入、环比、年累计收入、待收金额、趋势标题/近 6 个月、两处空态、收入明细与笔数、租金收入兜底、三种到账状态全为硬编码中文 | 三语 | 全文 | P1 | B1 | [x]（F23：新增 `income.*` 19 键 × 三语；`statusMap`/`FILTERS` 改存 `labelKey`） |
| 收益/月度趋势 | 轴标签 `{n}月` | 显示 | `monthLabel` 本地拼中文「月」，英/泰界面仍显示「11月」 | 随语言（zh「11月」/ en·th「11」） | `monthLabel` | P2 | B3 | [x]（F23：改走 `common.monthN`，`useMemo` 依赖补 `t`） |
| 收益/筛选 | 四个状态 chip | 显示 | 英/泰长标签在一行内超出屏宽被裁切 | 自动换行 | `chips` | P2 | B3 | [x]（F23：`chips` 补 `flexWrap: 'wrap'`） |
| 收益/Hero 与区块头 | 环比 pill、区块标题 | 显示 | 泰文「เทียบเดือนก่อน +5%」「แนวโน้มรายได้รายเดือน」较长，与右侧金额/「6 เดือนล่าสุด」挤压 | 可收缩不撑破 | `heroTop`/`sectionHead` | P2 | B3 | [x]（F23：左侧 Hero 块与环比文案、`sectionTitle` 补 `flexShrink: 1`） |
| 收益/收入明细 | 行副标题月份 | 显示 | 直接渲染后端 `item.month` 原串（如 `2026-11`），与轴标签「11月」口径不一致 | 统一为本地化月份或「2026年11月」 | `recordSub` | P2 | B3 | [ ]（F23 记录：需确认后端 `month` 字段格式后再统一，未改数据口径） |

### §20 统计

| 范围 | 条目 | P1 | P2 |
| --- | --- | --- | --- |
| 业主收益 | 5 | 1 | 4 |

> F23 后：5 条中已修 4（P1 1 / P2 3），待修 1（P2：明细行月份口径待后端确认）。

> 平台级已知限制（可接受，不为此改架构）：切语言后已弹出的 Toast、以及已写入组件 state 的错误文案（如本页 `loadError`、合同页失败条）不会即时换语，重新进入页面或下次请求后生效。

---

## §21 租客服务商城（`src/screens/tenant/ServicesScreen.tsx`）

| 页面/位置 | 元素或跳转 | 类型 | 当前表现 | 期望表现 | 证据 | 等级 | 批次 | 状态 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 服务商城/整页 | 页头、规格标签、商品卡、订单、SKU 弹层 | 显示 | 标题/副标题、区块标题、空态、订单状态、规格与单位、数量、单价/小计/税费、结算条、按钮全为硬编码中文；服务名称仅展示后端 `label_zh` | 三语 | 全文 | P1 | B1 | [x]（F24：新增 `svc.*` 47 键 + `common.notice` × 三语；`orderStatusMeta`/`MODEL_OPTIONS` 改存 `labelKey`；5 个服务编码名称映射 i18n） |
| 服务商城/购买提交 | 未登录、无生效租约、成功、失败反馈 | 反馈 | 全部走 `Alert.alert`，Web 为空实现，点击无任何反馈 | Web 可见反馈 | `handleBuy` | P1 | B1 | [x]（F24：改 `notify` / `notifyError`，失败原因走共享 `errorText`） |
| 服务商城/商品卡 | 服务名与标签 | 显示 | 服务名 `numberOfLines=1`，泰文长名（如 ชำระค่าสาธารณูปโภค）直接截断 | 允许两行 | `productName`/`productTag` | P2 | B3 | [x]（F24：服务名改 2 行，标签单行截断） |
| 服务商城/区块头 | 「实惠购 + 专人上门…」 | 显示 | 英/泰长提示与标题同行挤压 | 可收缩 | `sectionHead` | P2 | B3 | [x]（F24：`sectionTitle`/`sectionHint` 补 `flexShrink: 1`） |
| 服务商城/服务名称 | 未收录编码 | 显示 | 仅映射 5 个已知 code，新增服务编码会回退后端中文 `label_zh || code` | 全量名称三语 | `SERVICE_NAME_KEYS` | P2 | B3 | [ ]（F24 记录：待后端补多语名称字段，或新增编码时补 key；不改数据契约） |

### §21 统计

| 范围 | 条目 | P1 | P2 |
| --- | --- | --- | --- |
| 租客服务商城 | 5 | 2 | 3 |

> F24 后：5 条中已修 4（P1 2 / P2 2），待修 1（P2：未收录服务编码名称回退）。

---

## §22 B 组共享组件 + 管理端长尾 + C 组泰文静态回归

| 页面/位置 | 元素或跳转 | 类型 | 当前表现 | 期望表现 | 证据 | 等级 | 批次 | 状态 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 共享组件 `categoryCards` | 面积规格行「得房率」 | 显示 | 单位 `kg` 与 `㎡` 硬编码，英/泰界面混中文单位符号 | 三语 | `categoryCards` 规格拼接 | P1 | B1 | [x]（F25：改 `t('category.floorLoading')` + `t('pub.sqm')`） |
| 共享组件 `PublicListingRow` | 整行文案 | 显示 | 复核整行文案全部经 `t` prop 传入，无硬编码中文 | 保持 | 全文 | — | B1 | [—]（F25 复核通过，无改动） |
| 合同组件目录 | `ContractsScreen` 加载态 | 显示 | `<LoadingState label="加载中..." />` 死兜底，不随语言 | 三语 | `ContractsScreen` | P1 | B1 | [x]（F25：改 `t('pub.loading')`） |
| 合同组件目录 | `contracts/constants.ts` 语言选项 | 显示 | `简体中文 / English / ไทย` 为语言原生名 | 保持 | `LANG_OPTIONS` | — | B1 | [—]（F25 复核：语言选择器按惯例显示原生名，不改） |
| 共享组件 `BeikeHeader` | 返回 / 主页按钮 | 屏读 | `accessibilityLabel` 硬编码「返回」「回到首页」 | 三语 | `BeikeBackButton`/`BeikeHomeButton` | P1 | B1 | [x]（F25：改 `t('common.back')`/`t('common.backHome')`） |
| 管理端首页 `admin/HomeScreen` | 页签、统计卡、风险条、图表头、最近动态 | 显示 | 25 处硬编码中文（含失败兜底与风险文案） | 三语 | 全文 | P1 | B1 | [x]（F25：新增 `admHome.*` 25 键 × 三语，`TABS` 改存 `labelKey`） |
| 管理端首页 | 风险条描述、图表头/区块标题 | 显示 | 泰文长文案与右侧数值/标签挤压 | 可收缩、两行截断 | `riskDesc`/`chartHeaderLeft` | P2 | B3 | [x]（F25：`riskDesc` 改 2 行、`chartHeaderLeft` 补 `flex:1 + marginRight`、`sectionTitle` 补 `flexShrink`） |
| 管理端客户列表 `admin/CRMScreen` | 客户名 / 会话标题兜底、无联系方式、拨号失败、发送失败 | 反馈/显示 | 4 处中文兜底；联系方式缺失与拨号失败走 `Alert.alert`（Web 空实现） | 三语 + Web 可见反馈 | `chatCustomer`/`callCustomer` | P1 | B1 | [x]（F25：兜底改 `crm.leadTitle`/`crm.conversation`，反馈改 `notify`/`notifyError`，移除未用的 `errorText` 导入） |
| 管理端客户列表 | 阶段徽标、联系方式行、跟进行 | 显示 | 泰文阶段名（รอดำเนินการ 等）与「跟进 · 负责人」长串无收缩约束 | 徽标单行可收缩、行文本不撑破 | `stageBadge`/`followText` | P2 | B3 | [x]（F25：`stageBadge` 补 `flexShrink` + 单行，`contactText`/`followText` 补 `flexShrink`，跟进行单行） |
| 管理端客户列表 | 删除客户确认 | 交互 | 仍用 `Alert.alert`，Web 下是空实现 → 点删除无反应 | Web 走 `confirm`/Toast | `confirmDelete` | P1 | B1 | [x]（F26：新增全局 `confirm()` + `ConfirmProvider`，删除客户改走该弹窗，`destructive` 红色确认） |
| 管理端合作公司 `admin/PartnerHubScreen` | 业绩卡「营收」、考勤「早退」 | 显示 | 两处硬编码中文 | 三语 | 成员业绩 chip / 考勤明细 | P1 | B1 | [x]（F25：新增 `partner.revenue`/`partner.attEarly` × 三语） |
| 管理端合作公司 | 区块标题 | 显示 | 泰文「ผลงานสมาชิก」与右侧「สมาชิก n คน」在窄屏互相挤压 | 标题可收缩 | `listTitle`/`listHead` | P2 | B3 | [x]（F25：`listTitle` 补 `flexShrink: 1`） |
| 租客收藏 `tenant/FavoritesScreen` | 租金单位 | 显示 | `/月` 硬编码 | 三语 | `priceUnit` | P1 | B1 | [x]（F25：改 `t('pub.perMonth')`） |
| 全局 `stores/auth.ts` | 登录失败兜底 | 反馈 | `err` 非 Error 时 message 为「登录失败」 | 三语 | `login` catch | P1 | B1 | [x]（F25：改 `useI18n.getState().t('login.failedTitle')`） |
| 管理端佣金规则 `admin/CommissionRulesScreen` | 业务类型标签 | 显示 | `{ zh, en, th }` 自带三语对象 | 保持 | 常量表 | — | B1 | [—]（F25 复核：代码自带三语，非残留中文） |
| 剩余未 i18n 整页 | 7 个页面 | 显示 | F25 时：`attendance/AttendanceScreen`（125 处）、`employee/PropertiesScreen`（54）、`employee/CRMScreen`（41）、`tenant/MaintenanceScreen`（34）、`tenant/DocumentsScreen`（16）、`employee/ContactScreen`（12）、`employee/PerformanceScreen`（12）纯中文 | 三语 | 扫描 `%TEMP%\zh-lines.txt` | P1 | B1 | [x]（F26–F31：7 页全部清零。保留的 3 处均为已确认落库文案——外勤 `reason`、CRM 会话标题、服务订单 `notes`；`screens/TestScreen.tsx` 为开发调试页不计入） |
| 城市/国家名数据层 | `src/data/locationArea.ts`、`src/data/locationMetro.ts` | 显示 | `cityLabel`/`country` 为纯中文（曼谷/泰国…），经 `stores/location.ts` 直接渲染在首页定位行、`LocationPickerScreen` 城市列表、各分类页标题，英/泰语下仍是中文地名 | 三语对照表（key → 三语名），渲染期按当前语言取 | `LocationPickerScreen:167,192,272`；分类页 `city` | P1 | B1 | [x]（F32：新增 `data/locationNames.ts` 覆盖 34 城 / 9 国 / 36 条线；展示走 `cityDisplayName`/`countryDisplayName`/`metroLineFullName`，`cityLabel`/`country` 继续作身份值，后端参数与 `cityLabel === region.city` 比对不变；搜索 `citySearchText` 同时含中/英/泰，中文输入仍命中。受影响 13 个页面/组件已逐一改接） |

### §22 统计

| 范围 | 条目 | P1 | P2 |
| --- | --- | --- | --- |
| B 组共享组件 + 管理端长尾 + C 组静态回归 | 17 | 11 | 3 |

> F25 后：16 条中已修 12（P1 9 / P2 3），已一致 3（另计：`PublicListingRow` 全量 i18n、语言原生名、`CommissionRules` 自带三语），待修 1（P1：7 个整页未 i18n，另属整页推广批次）。F26–F31 后：该条已 `[x]`，7 页全部清零，仅余 3 处已确认的落库文案。终检新增 1 条（P1：城市/国家名数据层纯中文），F32 已 `[x]`；17 条中已修 13 / 已一致 3 / 待修 1。

## §23 全局确认弹窗（`src/components/ConfirmDialog.tsx`）

> 根因：`Alert.alert` 在 Expo Web 是空实现，删除/危险操作在 Web 端点下去无任何反馈（F25 记录的 CRM 删除客户 P1）。

**形态**：命令式 API + 单例 Provider，和 `Toast` 同模式，页面只加一行 `await confirm({...})`，不加局部 state、不改页面结构。

```tsx
const ok = await confirm({
  title: t('crm.delete'),
  message: `${t('crm.deleteConfirm')}「${name}」？`,
  confirmLabel: t('crm.delete'),
  destructive: true, // 确认按钮用 colors.error
});
if (!ok) return;
```

- `ConfirmProvider` 挂在 `App.tsx` 的 `ToastProvider` 内层、`NavigationContainer` 外层（避免与页面内 `Modal` 嵌套冲突）。
- 取消路径：取消按钮、点遮罩、Android 返回键（`onRequestClose`）→ `resolve(false)`；同一时刻只允许一个待决弹窗（新调用会先结算旧的为 `false`）。
- 文案三语由调用方传入，组件内只兜底 `common.cancel` / `common.confirm`。

### 覆盖范围

| 页面 | 操作 | 批次 | 状态 |
| --- | --- | --- | --- |
| `admin/CRMScreen` | 删除客户 | F26 | [x] 已替换（`destructive`） |
| `employee/CalendarScreen` | 删除自定义日程 | F26 | [x] 已替换（`destructive`） |
| `employee/PerformanceScreen` | 删除补录成交 | F26 | [x] 已替换（`destructive`） |
| `employee/PropertiesScreen` | 房源上架二次确认 | F26 | [x] 已替换（去 `window.confirm` 分支，非破坏性） |
| `attendance/AttendanceScreen` | 撤销请假申请 | F27 | [x] 已替换（`destructive`） |
| 其余 `Alert.alert` 页面（`AdminUsersScreen`、`DataScopesScreen`、`DepartmentsScreen`、`OptionsScreen`、`AdminAttendanceManageScreen`、`admin/PropertiesScreen`、`owner/PropertiesScreen`、`MyListingsScreen`、`ProfileScreen`、`PartnerMemberManager` 等） | 删除/危险操作 | — | [ ] 遇到再逐步替换（本轮按约定不动结构与文案） |

> 已知限制：确认弹窗文案在打开瞬间取当前语言，弹窗打开期间切换语言不会即时换语，与 Toast 同属可接受限制，不为此改架构。







