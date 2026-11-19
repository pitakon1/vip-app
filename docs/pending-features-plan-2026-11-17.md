# 未完成功能落地计划（2026-11-17）

> 输入：`docs/remaining-work.md` §13.3「C 类：保留未开通（依赖方清单）」、§13.4 验证记录，以及本轮对代码的实际核对。
> 目标：把「还没开通」的功能逐项拆成可执行工作项：能自建的写清做法，做不了的给出供应商候选与前置条件。
> 判定口径：
> - **自建**：只依赖本仓库代码与已有基础设施，不需要第三方资质。
> - **混合**：产品与页面自建，但关键数据/通道必须外购。
> - **需外部供应商**：核心能力受牌照、资质、商户号或持牌人限制，代码无法替代。
>
> 核实标记：
> - **已核实**：本轮实际检索并打开官方页面，确认站点存在且能力描述与官方一致。
> - **待核实**：仅来自印象或第三方转述，价格/资质/开放条件未从官方确认。
> - 本文**不写任何未经核实的报价数字**；凡涉及金额，只给计费口径。

---

## 0. 总览

| # | 功能 | 当前状态 | 判定 | 工作量级 |
| --- | --- | --- | --- | --- |
| 3 | 地图与通勤/地铁数据 | 地图找房已上线；服务端 Key 缺失、无通勤/地铁 | 混合 | 5-6 天 |
| 4 | 直播与 VR 看房 | 仅 `video_url`/`vr_url` 外链字段 | 混合 | 2-3 周 |
| 5 | 榜单与成交价数据 | 自有成交聚合已有；缺全市场数据 | 混合 | 4-6 天 |
| 6 | 经纪人供给 | 经纪人后台已完整；缺 C 端入口与供给 | 自建 + 运营 | 2-3 周 |
| 7 | 实名认证与人脸识别 | 证件上传 + 人工审核已上线（2026-11-17）；无人脸/第三方核验 | 人工已自建；通道需外部供应商 | 人工审核已完成；通道 1-2 周 |
| 8 | 微信支付 / 连连支付 | 代码已就绪，密钥默认空（fail closed） | 需外部供应商 | 技术 2-3 天 + 商务 2-6 周 |
| 9 | 电子签公共 CA / TSA | 自建 CA 可用；TSA 未配 | 需外部供应商 | 1 周内（不含采购） |
| 10 | Word 转 PDF（Gotenberg） | 转换代码完整，compose 未部署服务 | 自建 | 1-2 天 |
| 11 | 真机推送 | 推送适配器已有；无设备 token 表与凭据 | 自建 | 3-4 天 |
| 12 | 短信与 OTP 通道 | Twilio 适配器已有；无凭据 | 需外部供应商 | 0.5 天 + 模板报备 |

---

## 3. 地图与通勤 / 地铁数据

### 3.1 当前状态

- **地图找房已上线**：后端 `GET /public/map-points`（`backend/app/api/v1/public.py:771`）；Web 有 `pages/MapFind/index.tsx`、`PublicListings/MapSection.tsx`、`hooks/useMapPoints.ts`。
- **前端 Key 已配置**：`frontend-web/.env` 的 `VITE_GOOGLE_MAPS_WEB_API_KEY` 有值；`frontend-web/src/config/maps.ts` 做了占位 Key 防护。
- **缺 1**：服务端 Key `GOOGLE_MAPS_SERVER_API_KEY` 未配，`backend/app/providers/geo/__init__.py` 的 `configured=False`，geocode 走确定性 mock（曼谷周边随机坐标）。
- **缺 2**：**没有任何通勤/路径/地铁实现**——全仓无 Directions / Routes / Distance Matrix 调用，无地铁线路或站点表。
- 入口现状：分类页「地图」可跳 `/map`，但「通勤找房」类文案仍是「即将上线」（`pages/category/categoryShared.ts` 的 `notAvailable`）。

### 3.2 判定

**混合**。地图渲染、地理编码、通勤计算都是自建代码；底图与公交数据必须外购/订阅。

### 3.3 供应商候选（数据与底图）

| 供应商 | 地区适配 | 能力 | 接入方式 | 资质/商务 | 费用口径 | 链接 | 核实 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Google Maps Platform | 全球，泰国公交覆盖较好 | Maps JS / Places / Geocoding / **Routes API**（含 transit）/ Distance Matrix | REST + JS/RN SDK | Google Cloud 项目 + 结算账号 + Key 限制（HTTP Referer / IP） | 按调用量计费，有月度免费额度与订阅套餐 | [官方定价页](https://developers.google.com/maps/billing-and-pricing/pricing) | 已核实（定价页存在），具体单价待查控制台 |
| Longdo Map | **泰国本土** | 地点搜索、地理编码/逆编码、路径规划、覆盖范围计算；提供 JS/React/React Native/Android/iOS/Flutter SDK | REST + SDK | 注册获取 API Key；免费额度受官方条款约束 | 免费额度 + 按量/年付；第三方页称 50,000 次/月免费、250,000 次/月 ฿5,000（**转售页，待核实**） | [map.longdo.com/docs](https://map.longdo.com/docs/en/rest) | 已核实（官方文档），报价待核实 |
| Mapbox | 全球 | 自定义底图样式强；公交换乘需自备 GTFS | REST + SDK | 账号 + Token | 按 map load / 请求计费 | [mapbox.com](https://www.mapbox.com/pricing/) | 待核实 |

### 3.4 自建做法

1. **打通服务端 Key**：配 `GOOGLE_MAPS_SERVER_API_KEY`（IP 限制），启用 Geocoding + Routes；`providers/geo` 的 mock 自动失效。
2. **通勤接口**：新增 `GET /public/commute`，参数 `property_id` / `dest_lat,lng` / `mode=transit|driving|walking`。
   - 服务端查 `commute_cache` 表（`property_id`、`dest_key`、`mode`、`duration_min`、`distance_km`、`provider`、`fetched_at`），TTL 24h（Redis）。
   - 命中缓存直接返回，避免按浏览计费失控。
3. **地铁/沿线找房**：优先直接用 Routes 的 `transit` 结果（含 BTS/MRT/ARL 步行段），**不自建线路库**；若要「沿线站点筛选」，再引入 GTFS（曼谷 GTFS 的开放方式**待核实**）或 Longdo 图层。
4. **三端**：
   - Web：房源详情「通勤」卡片（输入目的地/选常用地址）；地图找房加「30/45/60 分钟通勤圈」筛选。
   - App：`PropertyDetail` 通勤卡片 + 地图页通勤圈。
   - 小程序：`map` 组件 + 通勤卡片（受小程序地图能力限制，先只做点位与文字时长）。
5. **成本护栏**：通勤接口按用户/IP 限流（`slowapi` 已有），非登录用户不开放批量查询。

**工作量**：Key + 服务端打通 0.5 天；通勤接口 + 缓存 1 天；Web 通勤卡片 1 天；App/小程序 1-1.5 天；通勤圈筛选 1.5-2 天。**合计 5-6 天**（天级）。

**前置**：Google Cloud 结算账号（有卡即可），无牌照要求。

---

## 4. 直播与 VR 看房

### 4.1 当前状态

- `backend/app/models/property.py:146-151` 只有 `video_url`、`vr_url` 两个**外链文本字段**，注释明确「平台上不自建三维引擎」。
- 无直播房间、无 RTC token 签发、无信令、无全景播放器、无录制回放；`vr|panorama|live_stream|直播` 在 `backend/app` 仅命中上述字段与列表筛选。
- 分类页的「视频/VR」筛选项（`has_video`、`has_vr`）只是按外链是否存在过滤。

### 4.2 判定

**混合**。直播房间与播放器自建（接 RTC SDK）；VR 的**采集与三维重建**必须外部服务，展示层可自建。

### 4.3 供应商候选

| 供应商 | 地区适配 | 能力 | 接入方式 | 资质/商务 | 费用口径 | 链接 | 核实 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Agora（声网） | 全球，泰国节点可用 | RTC 音视频、云端录制、Web/RN/小程序 SDK | SDK + REST（token 签发） | 注册即用，企业认证后提额 | 按分钟：Video HD $3.99/1000 分钟、Full HD $8.99/1000 分钟；每月前 10,000 分钟免费 | [agora.io/pricing](https://www.agora.io/en/pricing/video-calling/) | 已核实 |
| 如视 Realsee | 中国团队，支持海外项目 | VR 空间采集、三维重建、VR 展示与漫游；手机 App 即可采集 | 采集服务 + 开放平台展示链接/嵌入 | 商务对接，按项目排期 | 按套采集报价（面积/城市影响），无公开价 | [realsee.com](https://www.realsee.com/cn/home) | 已核实（官网/产品页） |
| 贝壳开放平台 VR 空间采集 | 中国为主，海外需确认 | VR 空间采集建模专项服务，基于如视设备与算法 | 开放平台服务申请 | 企业资质 + 商务 | 按套/按项目 | [open.ke.com](https://open.ke.com/service/VRSpaceCollect/) | 已核实（服务页存在） |
| Zego / 腾讯 TRTC | 全球 | 同类 RTC，含直播与录制 | SDK + REST | 企业认证 | 按分钟/按套餐 | [zegocloud.com](https://www.zegocloud.com/pricing) / [cloud.tencent.com](https://cloud.tencent.com/product/trtc) | 待核实 |

### 4.4 自建做法

**直播**

- 新表 `live_rooms`：`host_id`、`property_id`、`channel_name`、`status`(created/live/ended)、`started_at`、`ended_at`、`replay_url`。
- 接口：`POST /live/rooms`（校验 host 为经纪人/员工或业主，签发 RTC token，含过期时间）、`POST /live/rooms/{id}/close`、`GET /live/rooms/{id}`（公开只读，仅 live 状态）。
- 录制：云端录制开启，结束后回调落 `replay_url`，回挂 `property.video_url` 或新字段 `live_replay_url`。
- 三端：Web 直播页（主播端/观看端）；App 用 RN SDK 加入频道；**小程序先不做**——微信小程序直播组件有类目与资质要求，且需 `live-player` 权限审批。
- 合规：主播实名（与第 7 项联动）、直播内容留存、举报入口。

**VR**

- 沿用 `property.vr_url` 作为「外部全景链接」；新增 `property.vr_provider`（realsee/720yun/other）便于前端选择播放器。
- 自建展示：全景图用开源 Photo Sphere Viewer 内嵌；多场景漫游与热点由供应商产出链接，平台只做嵌入与埋点。
- 不在平台内做三维重建（成本与算法都不划算）。

**工作量**：直播后端 2-3 天；App 直播页 3-5 天；Web 直播页 2-3 天；VR 播放器 1-2 天；联调与合规页 2-3 天。**合计 2-3 周**（周级），不含 VR 采集执行。

**前置**：Agora 账号（可自助）；VR 采集需上门拍摄资源与预算。

---

## 5. 榜单与成交价数据

### 5.1 当前状态

- **自有成交数据能力已具备**：
  - `public.py` 有小区画像：本项目成交趋势、近 12 个月成交均价、相似房源成交、区排名（`district_rank`/`district_total`）、全城行情、出租行情（`public.py:2704-2935`）。
  - 「成交」以 `property_deals`（`status=completed`）为准，近 30 日成交套数按项目聚合（`public.py:1803-1806`），**无成交返回 0，不编造**。
  - `MarketIndex` / `MarketReport` 模型已存在（`backend/app/models/market_data.py`，含 `published` 开关），后台有 `MarketIntelligence` 页。
- **缺**：跨平台/全市场的成交价与榜单。自有成交样本量小，直接叫「成交价榜」会误导。

### 5.2 判定

**混合**。自有榜单自建（完成度约 80%）；全市场指数与成交数据需外部。

### 5.3 供应商候选（全市场数据）

| 供应商 | 地区适配 | 能力 | 接入方式 | 资质/商务 | 费用口径 | 链接 | 核实 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| REIC（ศูนย์ข้อมูลอสังหาริมทรัพย์） | 泰国官方（政府住房银行体系） | 季度房价指数、转让/成交统计、区域报告 | 公开报告下载 / 订阅（是否有 API **待核实**） | 公开数据可引用，需标注来源 | 报告多为公开；深度数据订阅待核实 | [reic.or.th](https://www.reic.or.th/) | 已核实（官网与指数报告存在） |
| Bank of Thailand RPPI | 泰国官方 | 住宅价格指数（月度），公开统计库 | 网页/统计接口 | 公开 | 免费 | [BOT 统计](https://app.bot.or.th/BTWS_STAT/statistics/BOTWEBSTAT.aspx?reportID=993&language=ENG) | 已核实（统计页存在） |
| CBRE Thailand Research | 泰国本地 | 季度住宅/公寓市场报告、成交与供应分析 | 商务订阅 / 报告引用 | 商务对接 | 订阅制，待核实 | [cbre.co.th](https://www.cbre.co.th/) | 已核实（站点），报告订阅政策待核实 |
| Colliers Thailand Research | 泰国本地 | 同类季度研究 | 商务订阅 | 商务对接 | 订阅制，待核实 | [colliers.com/en-th](https://www.colliers.com/en-th) | 已核实（站点），订阅政策待核实 |
| FazWaz / Hipflat / DDproperty | 泰国 | 挂牌与成交参考、区域均价 | 商业数据合作 | 商务对接 | 待核实 | — | 待核实 |

### 5.4 自建做法

1. 新表 `market_rankings`：`period`(YYYY-MM)、`scope`(city/district/project)、`scope_key`、`metric`(deal_count/avg_psqm/gross_yield)、`rank`、`entity_type`、`entity_id`、`value`、`sample_count`、`source`、`published`。
2. Celery 定时任务（`celery-beat` 已部署）按月/周重算：`property_deals` + `listings` 聚合 → 写 `market_rankings`（先 `published=false`）。
3. 后台审核发布：`POST /admin/market-rankings/recompute`、`PATCH /admin/market-rankings/{id}/publish`。
4. 公开接口：`GET /public/rankings?scope=district&metric=avg_psqm&period=`。
5. **口径强制**：每个榜单返回 `sample_count` 与 `source`，前端固定展示「样本=平台成交 n=xx，非全市场」；引用 REIC/BOT 时展示来源与期次。
6. 三端：Web `/rankings`（榜单页 + 口径说明）；App「发现」页榜单卡；小程序同 Web 精简版。

**工作量**：聚合任务 1-2 天；接口 0.5 天；Web 榜单页 1-2 天；App/小程序 1-2 天。**合计 4-6 天**（天级）。

**风险**：样本不足时榜单会剧烈波动——设最小样本阈值（如 `sample_count >= 5` 才发布），否则显示「样本不足」。

---

## 6. 经纪人供给（找经纪人 / 帮我找房 / 精选自营 / 业主直卖）

### 6.1 当前状态

- **经纪人后台已相当完整**：`backend/app/api/v1/brokers.py` 已有入驻、审核（approve/suspend）、邀请码、推荐（referral）、分单（split-deals）、协议；`BrokerPartner.kyc_status` 存在。
- **缺 C 端入口**：分类页「找经纪人」仍走 `notAvailable`（`Hotel.tsx:67` 等多处）。
- **缺供给**：没有任何已签约经纪人数据；这是运营问题，不是代码问题。
- **缺运营标签**：「精选自营」「业主直卖」无标签体系；`listings.is_featured` 只有「精选」布尔。

### 6.2 判定

**自建 + 运营**。无外部供应商；供给靠地推、同业合作、现有业主/租客转化。

### 6.3 自建做法

1. **公开经纪人列表**：`GET /public/brokers`（仅 `approved` + `kyc_status=verified`；按区域、语言、近 90 天成交量排序；不返回手机号，走站内咨询）。
2. **撮合**：新表 `broker_assignments`（`lead_id`、`broker_id`、`score`、`status`、`assigned_by`、`assigned_at`）；`POST /leads/{id}/assign`（员工手动派单）+ 简单规则（区域匹配 → 成交量 → 轮询）。
3. **「帮我找房」表单**：C 端提交需求（预算/区域/入住时间/语言）→ 生成 `lead` → 自动派单 → 经纪人工作台可见。**这是供给不足时唯一的正确入口**，不要先放经纪人列表。

   **进度（2026-11-17，已完成）**：三端表单 + `POST /public/inquiries`（`intent=find_my_home`）已落地，结构化写入 `Lead.budget_* / requirement / interested_projects`，并为在职 admin/agent 写 `lead.new` 站内通知；公开经纪人列表与 `broker_assignments` 仍按「有签约经纪再开」暂缓。
4. **标签体系**：新增 `listing_tags`（`listing_id`、`tag`: `self_operated` / `owner_direct` / `selected`、`created_by`），后台可打标；公开列表按标签筛选。
5. **业主直卖**：`listings` 已有 `owner_id` 与业主发布能力；补 `source=owner_direct` 审核流（防止绕过经纪人协议）。
6. **三端**：Web `/brokers`（列表+详情+咨询）、`/find-my-home`（表单）；App 对应两屏；小程序先只做「帮我找房」表单。

**工作量**：公开列表 + 撮合 3-5 天；三端页面 4-6 天；标签/直卖 2-3 天。**合计 2-3 周**（周级）。

**前置（运营）**：至少 5-10 名完成审核与实名的经纪人，否则列表页空转。建议顺序：先上「帮我找房」收集线索 → 有 3 名以上经纪人再开放列表。

---

## 7. 实名认证与人脸识别

### 7.1 当前状态

- `BrokerPartner` 有 `kyc_status`（`none/pending/verified`）、`real_name`、`kyc_verified_at`（`backend/app/models/broker.py:47-79`），但**只是状态字段**，没有任何核验调用。
- `User` 表无实名/证件字段。
- 合同签署的身份匹配是站内逻辑（`backend/app/services/contract_identity.py`：姓名/手机号/在职状态匹配），**不是实名认证**，只是防止签错人。
- 因此：经纪人 KYC 目前只能由后台人工置位，租客/业主完全没有实名。

### 7.2 判定

**需外部供应商**（泰国 NDID 体系或国际 eKYC）。可先自建「证件上传 + 人工审核」过渡，成本低且能立刻满足合同签署留痕。

### 7.3 供应商候选

| 供应商 | 地区适配 | 能力 | 接入方式 | 资质/商务 | 费用口径 | 链接 | 核实 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| NDID（National Digital ID） | **泰国国家级** | eKYC + eSignature 数字身份交换；ETDA 颁发 Digital Identity Exchange Service License；ISO 27001:2022 | API（需成为成员/接入方） | 商务 + 合规尽调 + 成员协议；需泰国主体 | 按交易/年费，待核实 | [ndid.co.th](https://ndid.co.th/en/home-english/) | 已核实（官网资质描述） |
| ThaID（DOPA） | 泰国官方 | 泰国民众实名身份 | 通常经 NDID/政府合作接入 | 政府合作，个人开发者不可直连 | 待核实 | [dopa.go.th](https://www.dopa.go.th/) | 待核实（仅确认主管部门，接入条件未核实） |
| GBG / Jumio / Sumsub / Veriff | 全球 | 证件 OCR + 活体人脸 + 反欺诈；支持护照/驾照（外籍租客） | REST API + 移动 SDK | 自助注册，企业认证 | 按次计费（成功核验计费），单价待核实 | [jumio.com](https://www.jumio.com/) / [sumsub.com](https://sumsub.com/) | 待核实 |
| e签宝 | 中国 | 中国籍用户实名 + 人脸核验，与电子签联动 | API/SDK | 企业认证 | 按次/套餐，待核实 | [esign.cn](https://www.esign.cn/) | 待核实 |

### 7.4 自建过渡方案（建议先做）

- 新表 `identity_verifications`：`user_id`、`role`、`doc_type`(thai_id/passport)、`doc_no_encrypted`、`front_file_id`、`back_file_id`、`selfie_file_id`、`status`(pending/approved/rejected)、`provider`(manual/ndid/jumio)、`reviewer_id`、`reject_reason`、`verified_at`。
- 证件号与影像路径用现有 `PII_ENCRYPTION_KEY` 加密（`backend/app/config.py` 已有），访问需审计。
- 接口：`POST /identity/submit`、`GET /identity/me`、后台 `GET /admin/identity?status=pending`、`POST /admin/identity/{id}/approve|reject`。
- 三端：我的 →「实名认证」（证件拍照 + 自拍 + 状态）；后台审核列表（Web）。
- 生效点：合同签署前校验 `identity_status=verified`（可配置为「仅高风险合同强制」）；经纪人入驻强制。
- **工作量**：3-5 天（天级）。

**接 NDID/Jumio**：在 `provider` 字段与适配层预留后，接入约 1-2 周（含商务与联调）。

**合规（重要）**：泰国 PDPA 下人脸属敏感个人数据，需单独明示同意、最小化留存、可撤回；建议**不自存人脸原图**，只存核验结果与供应商标识；如自存，必须加密 + 限期删除 + 访问审计。

### 7.5 进度（2026-11-17，已完成自建过渡方案）

- 已落地：`identity_verifications` 表（doc_type / real_name / id_number / 正反面路径 / status / rejection_reason / reviewed_by / reviewed_at / PDPA 同意时间与政策版本）；接口 `GET /identity/me`、`POST /identity/submit`、`POST /identity/staging`（小程序单文件预传）、`GET /identity/pending`、`GET /identity/{id}/file/{side}`、`POST /identity/{id}/approve|reject`。PDPA 同意单独写入 `consents`（purpose=`identity_verification`）；证件图不静态托管，仅本人或 admin 鉴权读取；证件号接口只回 `****尾4`。
- 三端入口：Web `/tenant/identity` + 后台 `/operations/identity-review`（审核队列、通过/驳回/驳回原因、附件预览）；App `IdentityVerification`（我的 → 实名认证）；小程序 `pages/tenant/identity`（我的 → 设置 → 实名认证）。中英泰文案同步。
- 不接人脸识别/NDID：未引入第三方核验与自拍活体，待外部供应商采购结论；自建部分不依赖外部凭据。
- 测试：`backend/tests/test_identity_verification.py` 8 passed；三端 `tsc --noEmit` 通过。

---

## 8. 微信支付与连连支付商户开通

### 8.1 当前状态

- **代码已就绪**：`backend/app/providers/payment/` 下有 `lianlian_provider.py`、`wechat_provider.py`、`alipay_provider.py`、`promptpay_provider.py`、`stripe`、`wise`，`router.py` 统一路由。
- **密钥全部默认空且 fail closed**（`channel_config.py` 顶部注释明确）：未配置即视为渠道不可用，不会静默放行。
- 连连默认指向沙箱 `https://sandbox-th.lianlianpay-inc.com`，生产需改 `LIANLIAN_BASE_URL=https://api.lianlianpay.co.th`。
- **缺**：商户号、RSA 密钥对、回调地址、结算账户、主体资质。属纯商务/资质问题。

### 8.2 判定

**需外部供应商**（商户开通）。技术侧只需配置与联调。

### 8.3 供应商候选

| 供应商 | 地区适配 | 能力 | 接入方式 | 资质/商务 | 费用口径 | 链接 | 核实 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| LianLian Global 泰国 | **泰国本地收单** | 网关收单（卡/本地支付方式）、退款、回调 | REST（Direct API），沙箱 + 生产 | 泰国公司主体、营业执照、法人证件、结算银行账户、网站/App 审核 | 按交易额费率（行业/量级定价），无公开价目 | [doc.lianlianpay.co.th](https://doc.lianlianpay.co.th/docs/direct-api/) | 已核实（官方 API 文档，沙箱/生产域名与代码默认一致） |
| 微信支付跨境 | 中国用户 | 跨境收单（直连/机构/普通服务商） | REST v3 | 海外合法主体 + 独立网站/APP；**直连模式目前仅香港及英国开放**；泰国主体一般走机构/服务商 | 费率与结算周期待核实 | [跨境接入前准备](https://pay.weixin.qq.com/doc/global/v3/zh/4012354243) | 已核实（官方文档），费率待核实 |
| PromptPay（自建） | **泰国本地** | EMVCo 二维码收款，无需第三方 API | 本地生成 QR | 需真实收款标识（手机号/税号/国民 ID） | 银行/渠道手续费，平台无 API 费 | 银行/BoT 规范 | 已实现，配置 `PROMPTPAY_TARGET` 即可 |
| Stripe | 国际卡 | 卡支付、订阅 | REST + SDK | 泰国主体可申请（待核实） | 按交易额 + 固定费 | [stripe.com](https://stripe.com/pricing) | 待核实 |

**微信支付申请流程（官方页已核实）**：填写「商户资料表」发至 `weixinpayBD@Tencent.com` → 商务 7-15 个工作日内联系 → 资质审核 → 签约 → 技术接入。机构模式还要求「具备所在国家/地区的金融服务或资金处理类牌照」。

### 8.4 落地步骤

1. 先用 PromptPay 收款（零商务门槛），把租金/服务费跑通。
2. 同步启动 LianLian 商户申请（泰国主体最顺）；拿到沙箱商户号后即可联调——代码已支持。
3. 微信支付视用户结构决定：中国客群占比高再投入；预计走机构/服务商模式，周期更长。
4. 配置项（`backend/.env` / `.env.prod`）：
   ```
   LIANLIAN_MERCHANT_ID / LIANLIAN_PRIVATE_KEY / LIANLIAN_PUBLIC_KEY
   LIANLIAN_NOTIFY_URL / LIANLIAN_REDIRECT_URL / LIANLIAN_BASE_URL
   WECHAT_MERCHANT_ID / WECHAT_API_KEY / WECHAT_APP_ID / WECHAT_CERT_SERIAL_NO
   WECHAT_PRIVATE_KEY / WECHAT_PLATFORM_CERT
   ```
5. 回调必须 HTTPS 公网可达（生产入口 `rental_frontend:3000` → Nginx `/api` 反代，需域名 + 证书）。
6. 对账：`payments.idempotency_key` 已有，补「渠道流水号 ↔ 平台订单」对账报表。

**工作量**：技术 2-3 天（配置 + 回调验签联调 + 小额真实交易 + 对账）；商务 2-6 周（外部，不可压缩）。

---

## 9. 电子签公共 CA 证书与 TSA 时间戳

### 9.1 当前状态

- **自建 CA 已可用**：`backend/sign-engine/` 下有 `ca.pfx`、`ca_cert.pem`、`ca_key.pem`；`kaifang_sign_service.py` 负责签发与验签，PKCS12 持久化到 `SIGN_ENGINE_CERT_DIR`，跨重启可验签。
- 2026-11-17 复测：生成 → 加签署方 → 签署 → 下载全流程通过，已签 PDF 80,119 字节，`verify_pdf` 返回 `valid=1, trusted=1`，`signature_health=ok`。
- **缺 1**：信任根是**自建 CA**，第三方（法院、银行、对方律师）无法用公共信任链独立验证。
- **缺 2**：`TSA_URL` 为空（`backend/app/config.py:110`），签署未加可信时间戳，只能依赖系统时间。
- 结论：内部留痕够用，对外举证不足。

### 9.2 判定

**需外部供应商**（公共 CA 证书 + TSA）。自建 CA 保留作为内部/低成本场景。

### 9.3 供应商候选

| 供应商 | 地区适配 | 能力 | 接入方式 | 资质/商务 | 费用口径 | 链接 | 核实 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Thai Digital ID (TDID) | **泰国首家 CA**，属 Thailand NRCA 体系 | 个人/法人数字证书，用于电子签名 | 证书签发（PKCS12/USB/HSM），API 需商务 | 企业申请 + 身份核验；私钥托管方式需谈 | 按证书/年，待核实 | [NRCA 认证 CA 名录](https://nrca.go.th/) | 已核实其「泰国首家 CA、NRCA 体系」（BOT 材料 + NRCA 名录），官网入口待确认 |
| NT CA（National Telecom） | 泰国国企 CA | 个人 / 法人 / 设备三类证书，在线或 walk-in 申请 | 线下 + 在线申请 | 个人身份证/法人文件 | 按证书/年，待核实 | [ntca.ntplc.co.th](https://www.ntca.ntplc.co.th/) | 已核实（官网页面） |
| Thailand NRCA 认证 CA 列表 | 泰国合规清单 | ETDA 维护的 CA 名录，可用于选型与合规举证 | 参考 | — | — | [nrca.go.th](https://nrca.go.th/) | 已核实（列表页存在） |
| DigiCert / GlobalSign / Sectigo | 国际 | 文档签名证书（Document Signing），进 AATL/EUTL 信任列表 | 证书文件/HSM + API | 企业核验（邓白氏/营业执照） | 按年/证书，待核实 | [digicert.com](https://www.digicert.com/) | 待核实（厂商与产品线为公开事实，具体产品页与审核要求未核实） |
| FreeTSA | 全球 | 免费 RFC3161 时间戳 | HTTP TSA | 无 | 免费（无 SLA） | [freetsa.org](https://freetsa.org/) | 待核实 |
| DigiCert / GlobalSign TSA | 全球 | 商业 RFC3161 时间戳，带 SLA | HTTP TSA | 商务 | 按量/年，待核实 | 同上 | 待核实 |

### 9.4 做法

1. 采购**文档签名证书**（优先泰国 NRCA 体系内 CA，便于本地举证；国际业务可加 DigiCert）。
2. 把证书转为 PKCS12 放入 `SIGN_ENGINE_CERT_DIR`（生产为 `backend_sign_engine` 卷），配 `SIGN_ENGINE_PFX_PASS`；`kaifang_sign_service.py` 无需改代码即可切换签名身份。
3. `TSA_URL` 指向公共 TSA（先用 FreeTSA 验证链路，再换商业 TSA）；签署时对签名值加时间戳。
4. 验签页展示：证书主体、签发 CA、有效期、TSA 时间、链验证结果；提供「下载签名报告 PDF」。
5. 兼容策略：历史自建 CA 合同继续可验，页面标注「平台自签」；新合同用公共 CA。

**工作量**：证书接入 + 链配置 2-4 天；TSA 1 天；信任展示 1-2 天。**合计 1 周内**（不含采购周期）。

**注意（待核实）**：泰国《电子交易法 B.E. 2562》对「可靠电子签名」有要件要求；公共 CA 证书有助于满足举证，但不是唯一路径。具体法律意见应由泰国律师出具。

---

## 10. Word 转 PDF（Gotenberg 部署）

### 10.1 当前状态

- **代码完整**：`backend/app/services/pdf_convert.py`
  - PDF 原样返回；图片（jpg/png/webp/gif）走 reportlab 本地转；`doc/docx/xls/xlsx` 走 Gotenberg `/forms/libreoffice/convert`。
  - 未配 `GOTENBERG_URL` → 抛 `PDF_CONVERT_DISABLED`，上传仍成功但降级（合同只能走无落章链路）。
- **缺**：`docker-compose.yml` / `docker-compose.prod.yml` 都**没有 gotenberg 服务**，环境变量也未设置。
- 选型已在代码注释中定死：Gotenberg（Apache-2.0），不引入 AGPL，不在应用进程拉 soffice。

### 10.2 判定

**自建**（开源组件，部署成本极低）。这是 12 项里性价比最高的一项。

### 10.3 做法

1. compose 增加服务（开发与生产两份）：
   ```yaml
   gotenberg:
     image: gotenberg/gotenberg:8
     container_name: rental_gotenberg
     restart: unless-stopped
     # 仅内网，不映射端口
     command: ["gotenberg", "--api-timeout=30s"]
     mem_limit: 1g
   ```
2. 后端环境变量：`GOTENBERG_URL=http://gotenberg:3000`；`GOTENBERG_TIMEOUT_SECONDS=30`；`fastapi`/`celery` 增加 `depends_on: gotenberg`。
3. **中文字体（关键坑）**：官方镜像默认不含 CJK 字体，Word 转 PDF 中文会变方块。二选一：
   - 自定义镜像 `FROM gotenberg/gotenberg:8` + `apt-get install -y fonts-noto-cjk`；
   - 或把字体目录挂载到容器字体路径。
   改完必须用真实中文合同回归一次。
4. 异步化：转换放 Celery（`frontend` 上传后返回 `pending`，worker 转完回写），避免大文档阻塞请求。
5. 前端：上传 Word 合同不再提示「不支持」；转换中显示「处理中」，失败给可读原因（`PDF_CONVERT_DISABLED` / `PDF_CONVERT_FAILED` / `PDF_CONVERT_UNSUPPORTED`）。

**工作量**：compose + 字体 0.5 天；异步化 0.5-1 天；回归 0.5 天。**合计 1-2 天**（天级）。

**替代（不推荐）**：CloudConvert API（按转换分钟计费，待核实）、Adobe PDF Services（按文档计费，待核实）——都引入外部依赖与费用，Gotenberg 自建更划算。

---

## 11. 真机推送

### 11.1 当前状态

- **推送适配器已有**：`backend/app/providers/notification/push_provider.py` 走 Expo Push API（`https://exp.host/--/api/v2/push/send`），校验 `ExponentPushToken[...]` 格式；`router.py` 已注册 `NotificationChannel.PUSH`。
- `User` 有 `notify_push` 开关；`Notification` 表有 `channel=push`。
- **缺 1**：**没有设备 token 表，也没有注册接口**——全仓 `push_token|device_token|ExponentPushToken` 只在 provider 内部出现，说明目前无法把 token 存起来。
- **缺 2**：无 Expo projectId、无 FCM/APNs 凭据，App 端未注册 token。
- **缺 3**：Expo Go 的远程推送能力受限，真机验证需要 EAS development build。

### 11.2 判定

**自建**。Expo Push 服务本身免费；成本是开发者账号与构建流程。

### 11.3 做法

1. 新表 `device_push_tokens`：`user_id`、`platform`(ios/android)、`token`、`device_id`、`app_version`、`last_seen_at`、`revoked_at`；唯一约束 `(token)`。
2. 接口：`POST /notifications/push-tokens`（upsert）、`DELETE /notifications/push-tokens`（登出撤销）。
3. App：`expo-notifications` 请求权限 → `getExpoPushTokenAsync({ projectId })` → 登录成功后上报 → 登出撤销；`app.json` 配 `notification` 图标/渠道。
4. 服务端发送：通知创建时按 `user_id` 查有效 tokens → `PushProvider` 批量发送；**处理 Expo receipts**：`DeviceNotRegistered` 时把 token 置 `revoked_at`，避免长期无效发送。
5. 凭据：
   - Expo projectId（EAS 项目）；
   - Android：FCM v1 服务账号 JSON（Firebase 项目）；
   - iOS：APNs Key（`.p8` + Key ID + Team ID），需付费 Apple Developer 账号。
6. 构建：EAS `development build` / `preview`，真机安装后验证「前台/后台/冷启动」三种收推送场景。

**工作量**：后端 1-1.5 天；App 1-2 天；EAS 配置 + 真机验证 1 天。**合计 3-4 天**（天级），另有账号申请周期。

**备选**：极光 JPush、OneSignal（均按设备/按量计费，待核实）；若后续要国内安卓厂商通道（小米/华为/OPPO），需单独接。

**合规**：营销类推送需 opt-in（`notify_push` 已有，但需区分「交易通知」与「营销通知」）；iOS 需隐私清单说明。

---

## 12. 短信与 OTP 通道

### 12.1 当前状态

- **适配器已有**：`backend/app/providers/notification/sms_provider.py` 走 Twilio REST，读 `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_FROM_NUMBER`；未配则返回明确错误。
- **业务链路已有**：`backend/app/api/v1/auth.py` 的 `request_otp` 支持 `channel=sms|email`，走 `SMSProvider`/`EmailProvider`；`OTP_EXPIRE_MINUTES`、`OTP_MAX_ATTEMPTS` 已可配；`verification_code` 模型已存在。
- `backend/.env` 当前 `OTP_DEV_CODE_ECHO=true`（本地联调回显验证码），生产必须为 `false`。
- **缺**：Twilio 凭据、发件号码/Sender ID 报备、泰国本地送达率验证、短信模板。

### 12.2 判定

**需外部供应商**（通道）。代码改动接近零，主要是账号与报备。

### 12.3 供应商候选

| 供应商 | 地区适配 | 能力 | 接入方式 | 资质/商务 | 费用口径 | 链接 | 核实 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Twilio | 全球，泰国可达 | SMS + Verify（OTP） | REST（代码已适配） | 注册 + 充值；泰国 alphanumeric sender 需报备（待核实细则） | 按条/按段计费，后付费；泰国页显示 $0.0305/条（alphanumeric sender） | [Twilio 泰国定价](https://www.twilio.com/en-us/sms/pricing/th) | 已核实（官方定价页） |
| AIS Open API | **泰国本土运营商** | OTP API、Messaging Service（GSMA/CAMARA 标准） | REST API | 企业合作开通，需商务对接 | 待核实 | [AIS Open API](https://www.ais.th/en/business/enterprise/technology-and-solution/communication/ais-open-api) | 已核实（产品页含 OTP API） |
| NT（National Telecom）/ 本地聚合商 | 泰国本土 | 本地短信直达、Sender ID | API/线下 | 企业资质 | 待核实 | [ntplc.co.th](https://www.ntplc.co.th/) | 待核实 |
| Vonage / Sinch / 阿里云国际短信 | 全球 | SMS + OTP | REST | 注册 + 实名 | 按条 | [vonage.com](https://www.vonage.com/communications-apis/sms/pricing/) | 待核实 |

### 12.4 做法

1. 配 `TWILIO_ACCOUNT_SID/AUTH_TOKEN/FROM_NUMBER`；生产 `OTP_DEV_CODE_ECHO=false`。
2. 号码规范：泰国 `+66`，去掉本地前导 `0`；`users.phone_normalized` 已存在，发送前统一 E.164。
3. 限流与防刷：OTP 端点已有 `slowapi`，确认「同号 60s/次 + 单号每日上限 + 单 IP 上限」；`OTP_MAX_ATTEMPTS` 已限制校验次数。
4. 降级：SMS 失败自动尝试 email（`EmailProvider` 已实现）；两者都失败时返回明确错误，不回显验证码。
5. 模板：泰/中/英三版；若走 AIS/NT 需提交模板审核。
6. 验证：用 AIS/True/dtac 三家泰国卡各测 10 条，记录送达率与时延；再决定是否换本地通道。

**工作量**：配置 + 联调 0.5 天；三网真机验证 0.5 天；模板报备 1-2 周（外部）。

**成本口径**：按条计费、后付费；不要预付大额套餐，先按量跑一个月看真实用量。

---

## 13. 结论：推荐落地顺序

### 第一优先：本周可完成，低成本高收益（纯自建）

1. **Word 转 PDF（Gotenberg）** — 1-2 天，补上电子签最后一块短板；注意中文字体。
2. **短信 OTP 通道** — 0.5 天接 Twilio（或 AIS），让注册/签署不再依赖 `dev_code`。
3. **服务端地图 Key + geocode 去 mock** — 0.5 天，让考勤/地址解析变成真实数据。
4. **真机推送** — 3-4 天，补设备 token 表与 EAS 凭据，通知真正到达手机。

> 这四项合计约 1 周，全部不依赖任何外部资质，收益立刻可见。

### 第二优先：2-3 周，产品自建（可并行）

5. **自有榜单**（4-6 天）— 已有 `property_deals` 与小区画像，补聚合任务与发布审核即可，注意样本阈值。
6. **通勤/地铁找房**（5-6 天）— 在已上线地图上叠加 Routes + 缓存，成本可控。
7. **实名认证人工审核过渡**（3-5 天）— 先把合同签署的身份留痕补上，NDID 接入后替换 provider。
8. **「帮我找房」表单 + 经纪人公开页**（先表单后列表）— 有供给再放列表。

### 第三优先：必须等外部条件（商务/资质周期）

10. **LianLian 商户开通**（技术 2-3 天，商务 2-6 周）— 泰国主体最顺，优先启动。
11. **微信支付跨境**（周期更长）— 视中国客群占比决定；注意泰国主体一般不能走直连模式。
12. **公共 CA 证书 + TSA**（采购周期不定）— 内部留痕已够用，对外举证前完成即可。
13. **NDID / 国际 eKYC 正式接入**（1-2 周开发 + 商务）— 等人工审核跑出量再做。
14. **VR 采集 / 直播**（2-3 周开发 + 采集资源）— 投入最大，建议先用外链 `vr_url` 验证转化，再决定自建直播。

### 明确「不做」的项

- **权限页的剪贴板/蓝牙/应用列表/NFC**：iOS/Android 均无「申请即弹窗」的公开接口，NFC 还需 entitlement 与硬件支持。维持「当前平台不支持」+ 跳系统设置，属操作系统限制，**任何供应商都无法解决**。
- **平台内自建三维重建**：成本与算法都不划算，只做展示与外链。

---

## 附录 A：本次核实清单

| 结论 | 依据 |
| --- | --- |
| NDID 为泰国国家级数字身份平台，持 ETDA Digital Identity Exchange Service License、ISO 27001:2022 | ndid.co.th 官网 |
| LianLian 泰国 API 文档、沙箱/生产域名与代码默认值一致 | doc.lianlianpay.co.th/docs/direct-api |
| 微信支付跨境三种模式；直连仅香港/英国；机构模式需金融牌照 | pay.weixin.qq.com 跨境文档 |
| Agora Video HD $3.99/1000 分钟、Full HD $8.99/1000 分钟、每月 1 万分钟免费 | agora.io 官方定价页 |
| Twilio 泰国 SMS 页显示 alphanumeric sender $0.0305/条 | twilio.com 泰国定价页 |
| Longdo Map 提供 REST（搜索/地理编码/路径规划）与多端 SDK | map.longdo.com/docs |
| 如视 / 贝壳开放平台提供 VR 空间采集与三维重建 | realsee.com、open.ke.com |
| REIC 为泰国官方房地产数据中心，发布季度房价指数 | reic.or.th |
| BOT 住宅价格指数公开可查 | app.bot.or.th 统计页 |
| CBRE / Colliers 泰国均提供估值与顾问服务 | cbre.co.th、colliers.com/en-th |
| NT CA 提供个人/法人/设备证书 | ntca.ntplc.co.th |
| Thailand NRCA 维护合规 CA 名录 | nrca.go.th |
| Expo 推送需 FCM（Android）与 APNs（iOS）凭据 | docs.expo.dev 推送文档 |
| AIS Open API 提供 OTP API | ais.th 企业产品页 |

## 附录 B：待核实事项（不得当作已确认结论使用）

- 所有供应商的**具体报价、费率、年费、最低消费**：本文一律未抄录，需商务询价。
- Baania Bestimate 是否开放 API、计价方式。
- ThaID 对商业机构的开放条件。
- TDID 官网入口与证书申请流程（仅通过 BOT 材料确认其地位）。
- DigiCert/GlobalSign/Sectigo 文档签名证书的具体年费与审核要求。
- FreeTSA 的可用性与 SLA。
- 曼谷 GTFS 数据的开放方式与授权。
- 泰国对电子签名举证的律师意见。
- FazWaz / Hipflat / DDproperty 的数据合作政策。
- Stripe 对泰国主体的开户政策。
