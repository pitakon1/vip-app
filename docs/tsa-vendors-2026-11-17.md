# 电子签 TSA（可信时间戳）供应商核实比对

> 版本：2026-11-17
> 范围：FreeTSA、DigiCert、Sectigo、GlobalSign、SSL.com、Entrust、Certum、HARICA，以及泰国 NRCA / TDID 体系。
> 目的：为 pyHanko 自签 CA 的电子签链路选一个"合规可用"的可信时间戳源，并说明换公共 CA 后历史合同的兼容方式。

## 0. 核实口径与标记约定

| 标记 | 含义 |
| --- | --- |
| **已核实** | 本次通过官方页面（厂商 KB / 产品页 / 政策 PDF / 官方证书库）取得，文档内给出可复核的链接或端点。 |
| **待核实** | 未找到官方证据，或仅有第三方转售/社区页面；文中明确标注，不作为决策依据。 |
| **推断** | 基于已核实事实的逻辑推论（例如"AATL 有名录 ⇒ Acrobat 可能信任该链"），非官方声明。 |

两条硬约束（按需求）：

1. 不抄录任何未核实的价格。商业报价一律写「需询价」。
2. 只写核实过的内容，其余标「待核实」。

本项目的落地接口位置（结论部分会引用）：

- 时间戳客户端构造：[kaifang_sign_service.py](file:///e:/app/vip-app-main/backend/app/services/kaifang_sign_service.py#L633-L648)，`TSA_URL` 为空时返回 `None`，即"不加时间戳"。
- 签署时挂载：[kaifang_sign_service.py](file:///e:/app/vip-app-main/backend/app/services/kaifang_sign_service.py#L463)
- 验签信任根：[kaifang_sign_service.py](file:///e:/app/vip-app-main/backend/app/services/kaifang_sign_service.py#L524) 仅 `ValidationContext(trust_roots=[self.trust_root])`
- 配置项：[config.py](file:///e:/app/vip-app-main/backend/app/config.py#L110) `TSA_URL: str = ""`
- 签名留痕表：[contract.py](file:///e:/app/vip-app-main/backend/app/models/contract.py#L206-L227) `SignatureRecord` 目前**没有** TSA / 证书链 / 信任锚相关字段

---

## 1. 逐家比对

### 1.1 FreeTSA

| 项目 | 内容 | 状态 |
| --- | --- | --- |
| 服务名 | FreeTSA（免费公共 RFC 3161 时间戳服务，社区/公益性质） | 已核实 |
| RFC 3161 支持 | 支持，标准 TSP 请求/响应（`application/timestamp-query` → `application/timestamp-reply`） | 已核实 |
| 端点地址 | `https://freetsa.org/tsr`（官网给出的 curl 示例即用此地址） | 已核实 |
| 是否免费及限制 | 免费；**无账号、无 API Key**，公开可调用。官方未提供 SLA / 可用性承诺 | 已核实（"无账号"）；SLA 缺失属事实性描述 |
| 商业报价口径 | 不适用（无商业版本）。若需 SLA 必须换商业 TSA | 已核实 |
| 信任根 / 公共信任列表 | **不在 Adobe AATL 名录**（已对照 2026-10-22 版名录逐条查找，无 FreeTSA）。Acrobat 默认不信任其时间戳 | 已核实（名录内无）；"Acrobat 默认不信任"为推断 |
| 证书形态 | 根证书 `https://www.freetsa.org/files/cacert.pem`；TSA 证书 `https://www.freetsa.org/files/tsa.crt` | 已核实 |
| 证书有效期 | 新证书自 **2026-03-16** 生效、有效期至 **2040-02**，密钥为 **P-384（secp384r1）ECC**；旧证书于 **2026-03** 失效 | 已核实 |
| 接入方式 | 纯 HTTP 时间戳协议（RFC 3161）；PyHanko `HTTPTimeStamper("https://freetsa.org/tsr", https=True)` 可直接用，无需 SDK | 已核实（端点）；PyHanko 适配为推断（协议标准） |
| 官方链接 | https://www.freetsa.org/index_en.php | 已核实 |

**要点**：零成本、零注册、零代码改动（改一个环境变量即可）。但**换过根、且不在 AATL**，对外合同用它只能算"有可信时间戳"，不能算"Adobe 生态默认可验证"。另外 2026-03 发生过根证书切换，历史 PDF 里的旧时间戳需要旧根才能验——这一点在"历史合同兼容"里同样适用。

---

### 1.2 DigiCert

| 项目 | 内容 | 状态 |
| --- | --- | --- |
| 服务名 | DigiCert RFC 3161 Timestamp Authority（公共时间戳服务） | 已核实 |
| RFC 3161 支持 | 支持，官方 KB 明确为 "RFC3161-compliant time stamp authority server" | 已核实 |
| 端点地址 | `http://timestamp.digicert.com`（官方注明：解析到 `216.168.244.9:80`，**URL 大小写敏感，必须全小写**） | 已核实 |
| 是否免费及限制 | 端点公开可直接调用；是否要求持有 DigiCert 证书或商业授权，官方 KB 未在此页给出明确条款 → **待核实** | 待核实 |
| 商业报价口径 | 需询价（文档签名/时间戳通常随证书产品打包，未核实单独计价方式） | 需询价 |
| 信任根 / 公共信任列表 | **在 Adobe AATL 名录中**（2026-10-22 版，DigiCert，US） | 已核实 |
| 证书链获取 | 官方提供 SHA256 / SHA384 / SHA512 的 RSA-4096 时间戳响应者链下载 | 已核实 |
| 接入方式 | HTTP 时间戳协议（RFC 3161）。注意是 **http**（非 https），PyHanko 需 `HTTPTimeStamper(url, https=False)` | 已核实（端点 scheme）；PyHanko 参数为推断 |
| 官方链接 | https://knowledge.digicert.com/general-information/rfc3161-compliant-time-stamp-authority-server | 已核实 |

**要点**：接入门槛最低的"正规"选择——公开端点 + AATL 在列 + 官方给了链下载。风险点是**明文 HTTP**（时间戳响应本身有签名，不依赖传输加密，但需在部署侧确认出网策略允许 80 端口），以及商用条款需商务确认。

---

### 1.3 Sectigo

| 项目 | 内容 | 状态 |
| --- | --- | --- |
| 服务名 | Sectigo RFC 3161 Timestamp Authority（同时服务 Authenticode） | 已核实 |
| RFC 3161 支持 | 支持；官方知识库说明同一端点同时支持 RFC3161 与 Authenticode，按请求哈希自动选 RSA/SHA-256/384/512 | 已核实 |
| 端点地址 | `http://timestamp.sectigo.com` | 已核实 |
| 是否免费及限制 | 公开端点，官方页面未列出计费门槛 → 商用条款 **待核实** | 待核实 |
| 商业报价口径 | 需询价 | 需询价 |
| 信任根 / 公共信任列表 | **在 Adobe AATL 名录中**（2026-10-22 版，Sectigo，US） | 已核实 |
| 合规标准 | eIDAS TSA 政策文件确认：RFC 3161 / RFC 5816 + **ETSI EN 319 422**，RSA 4096 + SHA-384 | 已核实 |
| 接入方式 | HTTP 时间戳协议（RFC 3161），单端点自适应哈希 | 已核实 |
| 官方链接 | https://www.sectigo.com/ ｜ 知识库：https://help.sectigo.com/（具体 KB 页 URL 未固定 → 待核实） | 部分待核实 |

**要点**：单端点自适应是最省心的接入形态（不用按哈希切 URL）。合规文档齐全（ETSI EN 319 422），适合需要向对方出具"符合 eIDAS 时间戳"说明的场景。

---

### 1.4 GlobalSign

| 项目 | 内容 | 状态 |
| --- | --- | --- |
| 服务名 | GlobalSign RFC 3161 Timestamping（SaaS 时间戳服务） | 已核实 |
| RFC 3161 支持 | 支持；官方支持页给出 SHA-2 系列 RFC3161 端点 | 已核实 |
| 端点地址 | `http://timestamp.globalsign.com/tsa/r6advanced1`（SHA-2 / RFC3161） | 已核实 |
| 是否免费及限制 | 端点公开；免费额度与商用授权条款 **待核实** | 待核实 |
| 商业报价口径 | 需询价（官网有独立时间戳服务产品页） | 需询价 |
| 信任根 / 公共信任列表 | **在 Adobe AATL 名录中**（2026-10-22 版，GlobalSign，US + JP 两条） | 已核实 |
| 接入方式 | HTTP 时间戳协议（RFC 3161）；另有面向中国区的产品介绍页（globalsign.cn/timestamp-service） | 已核实（端点 + 产品页存在） |
| 官方链接 | https://www.globalsign.com/en/timestamp-service ｜ https://www.globalsign.cn/timestamp-service | 已核实（页面存在）；具体支持 KB 页 URL 待核实 |

**要点**：端点是 `r6advanced1`，属于"一服务多端点"体系，升级哈希算法时会换 URL 后缀——配置项要允许改，不要把 URL 写死在代码里（当前实现读 `TSA_URL`，已满足）。

---

### 1.5 SSL.com

| 项目 | 内容 | 状态 |
| --- | --- | --- |
| 服务名 | SSL.com Timestamping（C2PA 时间戳服务） | 已核实 |
| RFC 3161 支持 | 支持 RFC 3161 + **RFC 5816**（ESSCertIDv2） | 已核实 |
| 端点地址 | `https://ts-c2pa.ssl.com`（**必须携带 API Key**；证书为 ECC，RSA 需另行申请） | 已核实 |
| 是否免费及限制 | 有免费额度：C2PA 免费证书含 **2,500 次时间戳/年**；Premium 含 **10,000 次/年**；超出按量或批量购买。额度与"通用 PDF TSA"是否共用 **待核实** | 已核实（额度）；共用关系待核实 |
| 商业报价口径 | 需询价（超额部分按量，单价未核实） | 需询价 |
| 信任根 / 公共信任列表 | **在 Adobe AATL 名录中**（2026-10-22 版，SSL.com，US）；另有 C2PA TSA Trust List 认证、WebTrust 审计 | 已核实 |
| 接入方式 | HTTPS 时间戳协议 + API Key（需要注册账号并签发密钥，不能匿名调用） | 已核实 |
| 官方链接 | https://www.ssl.com/products/content-authenticity/timestamping/ | 已核实 |

**要点**：**必须 API Key**，这是与其他家最大的差异——接入要多做一步"密钥管理"（密钥要进密钥库、要有轮换和失败告警）。产品定位偏 C2PA/内容真实性，通用 PDF 时间戳端点 **待核实**，选它之前要先确认能给普通 PDF 签名用。

---

### 1.6 Entrust

| 项目 | 内容 | 状态 |
| --- | --- | --- |
| 服务名 | Entrust Timestamp Authority（文档签名 / 代码签名两套端点） | 已核实 |
| RFC 3161 支持 | 支持 RFC 3161 + **RFC 5816**；产品页确认符合 **ETSI EN 319 421 / 422** | 已核实 |
| 端点地址 | 文档签名：`http://timestamp.entrust.net/TSS/RFC3161sha2TS`；代码签名：`http://timestamp.entrust.net/rfc3161ts2` | 已核实 |
| 已退役端点 | 旧 SHA-1 / Java / Authenticode / CDS 端点已停止服务（官方 KB 明确迁移说明） | 已核实 |
| 是否免费及限制 | 端点公开；商用条款 **待核实** | 待核实 |
| 商业报价口径 | 需询价 | 需询价 |
| 信任根 / 公共信任列表 | **在 Adobe AATL 名录中**（2026-10-22 版，Entrust，US） | 已核实 |
| 接入方式 | HTTP 时间戳协议（RFC 3161）；按用途选端点（文档签名用 `TSS/RFC3161sha2TS`） | 已核实 |
| 官方链接 | https://www.entrust.com/knowledgebase/ssl/time-stamp-url | 已核实 |

**要点**：**端点按用途分流**，PDF 合同签名必须用 `TSS/RFC3161sha2TS`（文档签名），用错到代码签名端点在合规审计时会被质疑。旧端点退役是已发生的事实，网上很多老教程里的 URL 已失效。

---

### 1.7 Certum（Asseco Data Systems）

| 项目 | 内容 | 状态 |
| --- | --- | --- |
| 服务名 | CERTUM Qualified Time Stamp Authority（CERTUM QTSA） | 已核实 |
| RFC 3161 支持 | 支持，TSA 政策文件确认符合 **RFC 3161 + ETSI TS 101 861** | 已核实 |
| 端点地址 | `http://time.certum.pl`（官方政策文件给出的 TSA 地址） | 已核实 |
| 是否免费及限制 | 是**合格时间戳（eIDAS qualified）**，通常需购买套餐/额度；免费额度 **待核实** | 待核实 |
| 商业报价口径 | 需询价（eIDAS 合格时间戳按 token 或套餐计费，未核实单价） | 需询价 |
| 信任根 / 公共信任列表 | **在 Adobe AATL 名录中**（2026-10-22 版，Asseco Data Systems S.A.，PL） | 已核实 |
| 接入方式 | HTTP 时间戳协议（RFC 3161）；HTTPS 端口与证书链下载地址 **待核实** | 部分待核实 |
| 官方链接 | https://www.certum.eu/ ｜ TSA 政策：https://www.certum.eu/（具体 PDF URL 未固定 → 待核实） | 部分待核实 |

**要点**：欧盟合格时间戳（QTS）身份是最强的合规背书，适合需要向欧盟对手方解释"时间戳具法律推定效力"的场景。但**要采购额度**，不是公开免费端点。

---

### 1.8 HARICA

| 项目 | 内容 | 状态 |
| --- | --- | --- |
| 服务名 | HARICA Qualified Timestamp Service（希腊学术网 CA，QTS） | 已核实 |
| RFC 3161 支持 | 支持（作为合格时间戳服务提供 TSP） | 已核实（服务存在）；具体政策文档编号待核实 |
| 端点地址 | `http://qts.harica.gr`（官方 Acrobat 使用指南中作为 Server URL 给出） | 已核实 |
| 认证要求 | **需要用户名/密码**，凭证通过短信下发（官方指南描述的注册流程） | 已核实 |
| 是否免费及限制 | 面向希腊学术社群有免费政策；对外部用户是否免费 **待核实** | 待核实 |
| 商业报价口径 | 需询价。第三方转售页显示 "1,000 tokens £98"，属**转售商报价，非 HARICA 官方**，不采用 | 需询价 / 转售报价待核实 |
| 信任根 / 公共信任列表 | **不在 Adobe AATL 名录**（2026-10-22 版逐条查找无 HARICA）。作为 EU QTS 应在 EU 可信列表（EUTL）中 → **EUTL 条目待核实** | 已核实（不在 AATL）；EUTL 待核实 |
| 接入方式 | HTTP 时间戳协议（RFC 3161）+ HTTP Basic 认证（用户名/密码） | 已核实（认证方式） |
| 官方链接 | https://guides.harica.gr/docs/Guides/Software/Acrobat-Reader/Sign-Documents/ | 已核实 |

**要点**：**有账号密码门槛 + 不在 AATL**，对"我们的用户用 Acrobat 打开要显示绿勾"这个目标没有帮助。除非对手方明确要求 EU QTS，否则优先级低。

---

### 1.9 泰国 NRCA / TDID 体系

泰国的时间戳不在商业 CA 体系里，而在**国家根 CA（NRCA）→ Sub CA** 体系下。已核实到的层级与实体：

| 项目 | 内容 | 状态 |
| --- | --- | --- |
| 国家根 | Thailand NRCA（National Root Certification Authority），由 ETDA 运营；**在 Adobe AATL 名录中**（2026-10-22 版，Thailand NRCA，TH） | 已核实 |
| Sub CA（时间戳） | `ETDA ICA TSA-G1`：RSA **4096**、**SHA-512**、有效期至 **2034-06-08**（NRCA 官网证书页列出） | 已核实 |
| Sub CA 名录其他成员 | Thai Digital ID、Internet Thailand、National Telecom、Bangkok MSP、Turnkey 等（NRCA 证书页） | 已核实（名录存在） |
| 公开时间戳服务 | ETDA 提供 **e-Timestamping** 服务；另有 **TEDA Web Validation** 可在线校验 e-time stamping / e-signature | 已核实（服务存在）；申请入口与费用待核实 |
| INET-TSA | `tsa.one.th`（Internet Thailand 体系）的 TSA 政策 PDF 确认其时间戳 token **符合 RFC 3161** | 已核实 |
| TDID（Thai Digital ID）时间戳 | TDID 作为 NRCA 体系下的 CA 存在（名录中）；**其对外时间戳服务端点/申请方式未找到官方证据** | **待核实** |
| 是否免费及限制 | 未核实。ETDA e-Timestamping 对政府/教育可能免费，商业使用条款需向 ETDA 确认 | **待核实** |
| 商业报价口径 | 需询价（向 ETDA 或对应 Sub CA 运营方询价） | 需询价 |
| 接入方式 | HTTP 时间戳协议（RFC 3161）；具体端点需在开通后由运营方提供 | 部分待核实 |
| 官方链接 | https://nrca.go.th/ ｜ 证书页：https://nrca.go.th/home/certificates | 已核实 |

**要点**：这是**唯一"业务所在地 + AATL 在列"双满足**的体系——NRCA 根在 Adobe AATL 里，泰国本地法院/监管对 ETDA 体系签发的电子签名与时间戳认可度最高。但**公开的自助接入端点没有**，要先走 ETDA/Sub CA 的商务与资质流程；具体端点、费用、SLA 全部要询价确认。

---

## 2. 总表

| 供应商 | RFC3161 | 端点（官方公开） | 免费 | 商业报价 | Adobe AATL | 接入门槛 |
| --- | --- | --- | --- | --- | --- | --- |
| FreeTSA | ✅ | `https://freetsa.org/tsr` | ✅ 完全免费、无账号 | 不适用 | ❌ | 最低（改环境变量） |
| DigiCert | ✅ | `http://timestamp.digicert.com`（全小写） | 待核实 | 需询价 | ✅ | 低（公开 HTTP） |
| Sectigo | ✅ | `http://timestamp.sectigo.com` | 待核实 | 需询价 | ✅ | 低（公开 HTTP，自适应哈希） |
| GlobalSign | ✅ | `http://timestamp.globalsign.com/tsa/r6advanced1` | 待核实 | 需询价 | ✅ | 低（公开 HTTP） |
| SSL.com | ✅ RFC5816 | `https://ts-c2pa.ssl.com` | ✅ 2,500–10,000 次/年 | 需询价 | ✅ | 中（必须 API Key） |
| Entrust | ✅ RFC5816 | `http://timestamp.entrust.net/TSS/RFC3161sha2TS` | 待核实 | 需询价 | ✅ | 低（注意按用途选端点） |
| Certum | ✅ | `http://time.certum.pl` | 待核实 | 需询价 | ✅ | 中（eIDAS QTS 需采购额度） |
| HARICA | ✅ | `http://qts.harica.gr` | 待核实 | 需询价 | ❌（EUTL 待核实） | 高（账号密码，短信下发） |
| NRCA / ETDA | ✅（INET-TSA 政策已确认） | `ETDA ICA TSA-G1`（端点待开通） | 待核实 | 需询价 | ✅（Thailand NRCA） | 最高（资质+商务流程） |

---

## 3. 结论一：现阶段先接哪家

### 3.1 现状

- pyHanko **0.37.0**（`importlib.metadata.version("pyhanko")` 已核对）。
- `TSA_URL` 默认为空 → `_make_timestamper()` 返回 `None` → 签署出来的 PDF **只有签名、没有可信时间戳**。
- 验签只信任自建 CA，未配置 TSA 信任。
- `SignatureRecord` 没有记录 TSA 端点/证书序列号/信任锚。

这意味着当前签署链路的状态是：**"能签、能自验，但不具备可对外主张的可信时间"**。PAdES-B 级别也达不到（B-T 才有可信时间戳）。

### 3.2 分三步走

**第一步（今天就能做，仅内部/测试）：FreeTSA**

```
TSA_URL=https://freetsa.org/tsr
```

现有代码零改动即可生效。**但必须明确它的边界**：

- 不在 Adobe AATL，Acrobat 打开会提示时间戳不可验证；
- 无 SLA，公益服务随时可能不可用；
- 2026-03 换过根（旧证书已失效），验签历史文件要保留旧根。

所以它只用于：开发联调、内部演示、验证"时间戳确实被嵌进 PDF"。**不要用于对外合同。**

**第二步（对外可用，工程成本最低）：DigiCert**

```
TSA_URL=http://timestamp.digicert.com
```

理由：

1. 公开端点，无需注册/采购即可先跑通（商用条款需商务确认，但技术上不阻塞）；
2. **AATL 在列**，Acrobat 侧的时间戳验证有基础；
3. 官方提供完整响应者链下载，便于做信任配置；
4. 项目已有 `TSA_URL` 配置项，改环境变量即可切换，不用改代码。

注意事项（都是已核实事实推出的操作约束）：

- URL 必须**全小写**（官方明确大小写敏感）；
- 端点是 **http:80**，PyHanko 的 `HTTPTimeStamper` 需按 scheme 传 `https=False`。当前实现用 `url.lower().startswith("https://")` 判断，天然正确；
- 生产出网策略要放行 80 端口。

**第三步（合规最优，需走商务）：泰国 NRCA / ETDA 体系**

业务在泰国、合同对手方大概率是泰国公司或中国出海企业：

- NRCA 根在 Adobe AATL 里（TH 条目，已核实），是唯一"本地监管认可 + Adobe 生态认可"的组合；
- 走 ETDA e-Timestamping 或 Sub CA（INET-TSA 用 `tsa.one.th`，政策已确认 RFC 3161）开通；
- 端点、费用、SLA、资质材料**全部需要向 ETDA 询价确认**，目前没有公开自助入口。

**推荐落地顺序**：FreeTSA（联调）→ DigiCert（对外先跑通）→ NRCA（拿到商务合同后替换）。
不建议跳过第二步直接等 NRCA，因为商务周期不可控，而签署功能不能一直裸奔。

### 3.3 接 TSA 时必须同时改的代码

这一步不能省。只配 `TSA_URL` 会让"签名可信"和"时间戳可信"出现割裂：

1. **验签要传 TSA 信任上下文。** 已在本机 pyHanko 0.37.0 上核对 `validate_pdf_signature` 的参数列表：
   `['embedded_sig', 'signer_validation_context', 'ts_validation_context', 'diff_policy', 'key_usage_settings', 'skip_diff']`
   即存在 `ts_validation_context`。当前 [kaifang_sign_service.py](file:///e:/app/vip-app-main/backend/app/services/kaifang_sign_service.py#L524) 只传了 `signer_validation_context`，接公共 TSA 后时间戳会被判为"不可信/未验证"。

   需要补充的形态（示意）：

```python
ts_vc = None
if settings.TSA_URL:
    ts_vc = ValidationContext(
        trust_roots=[*load_tsa_roots()],   # 从 TSA_URL 对应的厂商根证书加载
        allow_fetching=True,               # 允许拉 OCSP/CRL
    )
r = validate_pdf_signature(
    sig,
    signer_validation_context=vc,
    ts_validation_context=ts_vc,
)
```

2. **信任锚要可配置，不要只有自建 CA 一个。** 建议把"信任锚"做成一个可枚举的集合（自建 CA / DigiCert / Sectigo / NRCA ...），验签时按签名者证书的 issuer 选择对应链去构建，而不是所有签名都拿同一个 `trust_roots` 硬试。

3. **留痕要补字段。** `SignatureRecord` 当前只有 `signature_hash` / `ip` / `proxy_authorization_id`。建议增加：
   - `tsa_url`、`tsa_cert_serial`、`tsa_gen_time`（时间戳来源与时刻）
   - `signing_cert_serial`、`trust_anchor_id`（签名证书与所用信任锚）
   - `signature_level`（`B-B` / `B-T` / `B-LT` / `B-LTA`）

   这不是"锦上添花"：换 CA 之后要判断历史合同该用哪个根验签，只能靠这些字段，事后补不回来。

4. **超时与降级策略。** `HTTPTimeStamper` 失败时不能静默签出"无时间戳"的合同——那样会在审计时被当成缺陷。建议：TSA 调用失败 → 签署失败并明确报错（fail closed），与项目支付密钥的 fail-closed 口径一致。

---

## 4. 结论二：换公共 CA 时历史合同如何兼容

核心原则：**历史 PDF 不重签、不覆盖，只"补证据"。**

### 4.1 为什么不用重签

PDF 签名是增量式写入的，重签会叠加新签名或改变文件字节，导致：

- 原签署人的签名摘要失效（哈希覆盖全文件）；
- 已交付给用户/对方的文件版本与库内版本不一致；
- 审计链断裂。

已签出的 PDF 的验证只依赖**当时的签名证书 + 当时的时间戳**，与"你现在用什么 CA"无关。所以正确做法是保留旧证据，而不是重做。

### 4.2 具体做法

1. **保留旧 CA 的完整材料**
   - 自建 CA 的 `ca_cert.pem` / `ca_key.pem` / `ca.pfx` **永久归档**，不要因为"迁到公共 CA"就删；
   - 公共 TSA 的响应者链证书（DigiCert 官方提供 SHA256/384/512 三套链）一并归档；
   - 记录每个文件对应的 `trust_anchor_id`。

2. **吊销信息要落快照**
   - CRL / OCSP 响应有有效期，过期后"当年是否已吊销"就无法证明；
   - 换 CA 前，对存量合同批量抓一次 OCSP/CRL 并存进库（或对象存储），与 `SignatureRecord` 关联。

3. **验签按签发者路由信任锚**
   - 读取签名者证书的 issuer / serial，匹配 `trust_anchor_id`，用对应根构建 `ValidationContext`；
   - 不要把所有根塞进一个 `trust_roots` 让库去暴力试——多根同名/交叉签会导致误判，且性能差；
   - 验签结果要区分三种状态并如实展示：`平台自签（仅内部可信）` / `公共 CA 可信` / `时间戳可信`。前端不要统一显示成"已验证"。

4. **用 PAdES-LTA 给历史合同续时**
   - 旧 TSA 证书到期前（FreeTSA 旧根已在 2026-03 失效就是前车之鉴），对存量 PDF 追加 **document timestamp**（PAdES-LTA 的 Document Security Store + DocTimeStamp），把"证书当时有效"这一事实固定下来；
   - 续时是**追加**，不是重签，不破坏原签名；
   - 建议设一个定期任务：扫描"签名证书或 TSA 证书将在 N 个月内到期"的合同，自动排队续时。

5. **对外说明口径**
   - 换 CA 时准备一份说明：旧合同由平台自建 CA 签署（附根证书指纹），新合同由 XX CA 签署；
   - 若对方需要，把旧根证书 `.crt` 一并给到，让对方在 Acrobat 里手动加入受信任证书——这是自签 CA 时代唯一能让 Acrobat 显示可信的合规做法。

6. **数据层面**
   - 迁移脚本只新增字段/回填 `trust_anchor_id`，**不要改 `signature_hash`**（那是原始证据）；
   - `contracts` 的签署状态不要因为换 CA 而重置。

---

## 附录 A：本次已核实清单

| # | 事实 | 来源类型 |
| --- | --- | --- |
| 1 | FreeTSA 端点 `https://freetsa.org/tsr`，根/TSA 证书下载地址，新证书 2026-03-16 生效、2040-02 到期、P-384 | 官方站点 |
| 2 | DigiCert RFC3161 端点 `http://timestamp.digicert.com`，大小写敏感，216.168.244.9:80 | 官方 KB |
| 3 | Sectigo 端点 `http://timestamp.sectigo.com`，单端点自适应 RSA/SHA-256/384/512，ETSI EN 319 422 | 官方知识库 + eIDAS 政策 PDF |
| 4 | GlobalSign SHA-2 RFC3161 端点 `.../tsa/r6advanced1` | 官方支持页 |
| 5 | SSL.com 端点 `https://ts-c2pa.ssl.com` 必须 API Key；2,500 / 10,000 次/年额度；RFC 5816；WebTrust | 官方产品页 |
| 6 | Entrust 文档签名端点 `.../TSS/RFC3161sha2TS`，代码签名 `.../rfc3161ts2`，旧端点退役 | 官方 KB |
| 7 | Certum 端点 `http://time.certum.pl`，RFC 3161 + ETSI TS 101 861，QTSA | 官方 TSA 政策 PDF |
| 8 | HARICA 端点 `http://qts.harica.gr`，需用户名/密码（短信下发） | 官方 Acrobat 指南 |
| 9 | Adobe AATL 2026-10-22 名录包含 DigiCert / Entrust / GlobalSign(US,JP) / Sectigo / SSL.com / Asseco(Certum) / Thailand NRCA；不含 FreeTSA、不含 HARICA | Adobe AATL 名录 |
| 10 | NRCA Sub CA `ETDA ICA TSA-G1`：RSA 4096 / SHA-512 / 至 2034-06-08 | nrca.go.th 证书页 |
| 11 | ETDA 提供 e-Timestamping 与 Web Validation | ETDA 官方 |
| 12 | INET-TSA（`tsa.one.th`）时间戳 token 符合 RFC 3161 | 官方政策 PDF |
| 13 | pyHanko 0.37.0；`validate_pdf_signature` 支持 `ts_validation_context` | 本机实测 |
| 14 | 现有代码 `TSA_URL` 为空 → 不加时间戳；验签只信任自建 CA | 代码核对 |

## 附录 B：待核实事项

| # | 事项 | 为什么重要 |
| --- | --- | --- |
| 1 | DigiCert / Sectigo / GlobalSign / Entrust 是否需要持证或付费授权才能调用公共 TSA 端点 | 决定"先跑通"是否合法合规，而非仅技术上可用 |
| 2 | SSL.com 的 `ts-c2pa.ssl.com` 是否可签普通 PDF（非 C2PA 场景） | 决定它能不能作为 PDF 合同 TSA |
| 3 | HARICA 在 EU 可信列表（EUTL）中的状态与对外部用户的免费政策 | 决定它是否值得为 "EU QTS" 走注册流程 |
| 4 | Certum TSA 的 HTTPS 端口与证书链下载地址 | 接入细节 |
| 5 | ETDA e-Timestamping 的申请入口、资质要求、费用与 SLA | 决定 NRCA 路线的时间成本 |
| 6 | TDID（Thai Digital ID）是否对外提供独立 TSA 服务与端点 | 用户点名要求覆盖，但目前无官方证据 |
| 7 | 泰国本地法院/监管对"非 ETDA 体系 TSA"签出合同的接受度 | 影响选型优先级 |
| 8 | 各商业 TSA 的实际报价与结算方式 | 本报告按要求不抄未核实价格 |

## 附录 C：一句话选型建议

- **今天**：`TSA_URL=https://freetsa.org/tsr`，把链路跑通，仅内部使用。
- **对外**：`TSA_URL=http://timestamp.digicert.com`，同时补 `ts_validation_context` 与留痕字段。
- **合规收口**：向 ETDA 询价，接入 NRCA 体系的 `ETDA ICA TSA-G1` / INET-TSA，替换 DigiCert。
- **历史合同**：不重签，归档旧根 + 吊销快照 + 按签发者路由信任锚 + PAdES-LTA 续时。
