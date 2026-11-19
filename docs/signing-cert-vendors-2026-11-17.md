# 电子签「对外可信」证书采购核实（AATL 文档签名证书）

> 版本：2026-11-17
> 目标：让签出的 PDF 在 Adobe Acrobat/Reader 中显示「签名有效 + 时间戳可信」。
> 前提结论：**TSA 只解决"时间可信"，"签名者身份可信"必须靠 AATL 成员 CA 签发的文档签名证书（Document Signing Certificate）。**
> 核实口径：官方产品页 / 官方 FAQ / 官方知识库 / 官方价目页。未取得官方证据的一律标「待核实」，价格未核实写「需询价」。

---

## 0. 先看这一条：AATL 证书的私钥拿不到服务器上

这是选型的第一约束，比价格重要：

- AATL 技术要求规定，CA 必须在**不可导出、不可复制**的硬件介质（FIPS 140-2 Level 3 或等效）中生成并保护私钥。GlobalSign 官方 FAQ 明确写了这一点。
- 后果：买到的证书私钥**不能导出成 .pfx 塞进 pyHanko 的 `SimpleSigner`**。当前 [kaifang_sign_service.py](file:///e:/app/vip-app-main/backend/app/services/kaifang_sign_service.py#L420-L470) 的签名方式（本地私钥 + `timestamper`）只适用于自建 CA。
- 因此对外签 PDF 只有三条路：
  1. **云端签名服务 + API**（私钥在 CA 的 HSM 里，后端调用签名接口）——推荐；
  2. **自有 HSM**（密钥在自己 HSM，CA 做 attestation）；
  3. **人工在插了 USB token 的机器上用 Acrobat 签**——不可自动化，不适合平台批量签约。

第三点会直接淘汰一批"看起来便宜"的 USB token 产品。下文每家都标注了密钥形态。

---

## 1. 六家文档签名证书比对

### 1.1 DigiCert

| 项目 | 内容 | 状态 |
| --- | --- | --- |
| 产品名 | DigiCert Document Signing Certificate（分 Individual / Business 两种变体） | 已核实 |
| 是否 AATL | 是。官网称"globally trusted and recognized by Adobe Acrobat, Adobe Reader, and DocuSign"；2026-10-22 版 AATL 名录在列（DigiCert，US） | 已核实 |
| OV / 个人 | 两种都支持：Individual（个人）、Business（组织） | 已核实 |
| 身份核验 | 个人证书验签署人身份；组织证书同时验申请人与组织合法性。方式可能包括政府证件、组织信息核验或远程核验。**Remote Identity Verification (RIV) 官网标注仅限 EU** | 已核实（RIV 仅 EU） |
| 泰国注册公司 | 官网未限制国别；泰国公司需提交何种文件、是否需公证/翻译 **待核实**（需商务确认） | 待核实 |
| 有效期 / 续期 | 12 个月自动续订订阅（官网写明 "12 month auto-renewing subscription"） | 已核实 |
| 硬件 / 密钥形态 | DigiCert 提供的硬件令牌，或客户自带的合格硬件令牌。**无私钥导出，不能直接给服务器用** | 已核实 |
| 价格 | 官网标价：**US$68/月/证书，12 个月 US$816**（地区/促销可能不同） | 已核实 |
| 官方链接 | https://www.digicert.com/signing/document-signing-certificates | 已核实 |

**判断**：价格透明、AATL 明确、支持组织证书。但密钥在硬件令牌里，**平台自动化签署用不上**，除非另配 DigiCert 的云端签名方案（本次未核到对应产品页 → 待核实）。

---

### 1.2 GlobalSign

| 项目 | 内容 | 状态 |
| --- | --- | --- |
| 产品名 | GlobalSign AATL Document Signing Certificate（token-based） | 已核实 |
| 是否 AATL | 是。官方 FAQ 明确 "GlobalSign is a member of this list"，且其 AATL 根/中间证书可在官方支持页下载 | 已核实 |
| OV / 个人 | 面向**组织及其员工**（GlobalSign 中国站：适用对象"与组织相关的需要对 Office/PDF 签名的员工"）；是否有纯个人版 **待核实** | 已核实（组织/员工）；个人版待核实 |
| 身份核验 | 下单后 Vetting 团队核验申请资料并**电话回呼确认**，1–3 个工作日；组织合法性通过第三方政府信息源核验 | 已核实 |
| 泰国注册公司 | 未限制国别；泰国公司所需材料 **待核实** | 待核实 |
| 有效期 / 续期 | **1–3 年**（GlobalSign 中国站）；续期窗口：到期前 30 天至到期后 7 天，过期后只能重新下单 | 已核实 |
| 硬件 / 密钥形态 | 必须使用 SafeNet eToken（FIPS 140-2 Level 3 或等效，最低 2048-bit），**实体制卡后邮寄**；取证书需 Windows + Edge，装好后可跨平台签名 | 已核实 |
| 价格 | 日本站（GMO GlobalSign）公开价 **¥84,000/年**；其他地区为地区定价，**需询价** | 已核实（日本站）；其他地区需询价 |
| 官方链接 | https://support.globalsign.com/aatl-document/general-information/aatl-document-signing-faqs ｜ https://www.globalsign.cn/digital-signatures-microsoft-office | 已核实 |

**判断**：流程成熟、合规文档齐全、内含 RFC 3161 时间戳 URL。但**必须等实体 token 邮寄**，且服务端无法直接调用。跨境采购周期要算上国际物流。

---

### 1.3 Sectigo

| 项目 | 内容 | 状态 |
| --- | --- | --- |
| 产品名 | **Document Signing Enterprise**（组织/团队）、**Document Signing Professional**（个人）、**Document Signing for HSM**（自有 HSM） | 已核实 |
| 是否 AATL | 是。官网写明认证来源为 Adobe CDS 或 **AATL 成员 CA**；2026-10-22 名录在列（Sectigo，US） | 已核实 |
| OV / 个人 | 两者都支持：证书可签发为"个人名义"或"组织名义" | 已核实 |
| 身份核验 | 核验申请人身份、实体身份与**实际经营地址（physical existence）**、实体是否授权签发；需按邮件指引提交材料。Professional 提到通过 **face-to-face verification** 确认身份 | 已核实 |
| 可接受的身份证明 | 政府照片证件（护照/驾照/身份证/军人证等）；或金融机构文件（信用卡/借记卡/6 个月内银行对账单/房贷对账单）；或非金融机构文件（近期的水电/固话账单、6 个月内租约、出生证明、上年度地方税单、法院文书） | 已核实 |
| 泰国注册公司 | 材料要求未限定国别，但要求验证实体实际地址 → 泰国注册公司可提交 DBD 文件；**中国注册公司是否接受待核实** | 部分待核实 |
| 有效期 / 续期 | **1 / 2 / 3 年**；期内签名次数不限。续期未单独核实 | 已核实（期限）；续期待核实 |
| 硬件 / 密钥形态 | 标准版为 **FIPS 合规 USB token 邮寄**；另有 **Document Signing for HSM** 产品，密钥放客户自有 HSM | 已核实 |
| 价格 | 官网（波兰站）公开价：Enterprise **PLN 2,044/年**、Professional **PLN 1,672/年**；多年 15–16% 折扣。地区化定价，其他币种 **需询价** | 已核实（当地币种） |
| 处理时长 | 材料齐全后验证 1–5 个工作日，之后制卡并邮寄（含物流追踪） | 已核实 |
| 官方链接 | https://www.sectigo.com/ssl-certificates-tls/document-signing-certificates | 已核实 |

**判断**：唯一在官网把"HSM 版"作为独立产品列出的厂商，适合已有 HSM 或要求客户自持密钥的组织。个人版价格比组织版低，但平台签署应选组织版。

---

### 1.4 SSL.com

| 项目 | 内容 | 状态 |
| --- | --- | --- |
| 产品名 | **IV Document Signing**（个人）、**OV Document Signing**（组织）、**IV+OV**（个人+组织）；配套 **eSigner for Documents**（云签名 / eSealing） | 已核实 |
| 是否 AATL | 是。官网明确 "SSL.com is an Adobe AATL member"，三种证书均标注 Adobe AATL trusted；2026-10-22 名录在列（SSL.com，US） | 已核实 |
| OV / 个人 | 三种都有：IV 只验个人、OV 只验组织、IV+OV 两者都验 | 已核实 |
| 身份核验 | IV：对政府证件验人；OV：核验组织，**要求提交 business registration docs**，1–3 个工作日；标准验证周期 3–5 天，材料齐全后电话回呼 | 已核实 |
| 泰国注册公司 | OV 要求"business registration records"，未限定国别；泰国 DBD 文件可用性 **待核实** | 待核实 |
| 有效期 / 续期 | **1–5 年**可选（OV：1 年 $299、2 年 $275.08/年、3 年 $251.16/年、4 年 $239.20/年、5 年 $215.28/年） | 已核实 |
| 硬件 / 密钥形态 | 二选一：**YubiKey FIPS**（+$379/个）或 **eSigner 云 HSM（FIPS 140-2 Level 3）**；也支持自带云 HSM（AWS/GCP/Azure，需 attestation，费用 $75–$1,275） | 已核实 |
| 自动化能力 | OV 可启用 **eSigner eSealing**，通过 **CSC API** 批量自动签（发票、合同生成等） | 已核实 |
| 价格 | OV **US$299/年**；YubiKey **+$379**；加急验证 **+$599**；IV 价格本次未取 → 需询价 | 已核实（OV/配件）；IV 需询价 |
| 官方链接 | https://www.ssl.com/products/document-trust/document-signing/ ｜ OV：https://www.ssl.com/products/document-trust/document-signing/ov/ | 已核实 |

**判断**：六家里**唯一把"云签名 + 公开 API（CSC）+ 组织证书共享给多个授权签署人 + 公开价"讲清楚**的。对"后端自动签 PDF"这个需求最贴合。

---

### 1.5 Entrust

| 项目 | 内容 | 状态 |
| --- | --- | --- |
| 产品名 | Entrust Document Signing Certificate | 已核实（KB 标题） |
| 是否 AATL | 是。2026-10-22 名录在列（Entrust，US）；其产品说明也写明认证只能由 Adobe CDS 或 AATL CA 完成 | 已核实 |
| OV / 个人 | 第三方转售页描述为 OV（组织版）；**官方页面本次被反爬拦截，官方对个人版的说明待核实** | 待核实 |
| 身份核验 | 官方 KB 未给出完整材料清单 → **待核实** | 待核实 |
| 泰国注册公司 | **待核实** | 待核实 |
| 有效期 / 续期 | **待核实**（KB 未写；转售页标"/年"，不采用） | 待核实 |
| 硬件 / 密钥形态 | 证书装在 **Entrust 提供的 iKey 5100 USB token** 上 | 已核实 |
| 价格 | 需询价（搜到的 £209/年为转售商报价，不采用） | 需询价 |
| 官方链接 | https://www.entrust.com/knowledgebase/ssl/document-signing-certificates-how-to-install-and-use ｜ https://www.entrust.com/ | 已核实（KB）；产品页本次不可访问 |

**判断**：AATL 与硬件 token 已确认，但官方商务信息获取受阻，**采购前必须直接联系 Entrust 销售**确认组织/个人、材料、地区与报价。

---

### 1.6 Certum（Asseco Data Systems）

| 项目 | 内容 | 状态 |
| --- | --- | --- |
| 产品名 | **Certum Document Signing Certificate**（存储于虚拟卡 SimplySign） | 已核实 |
| 是否 AATL | 是。官网明确符合 Adobe Approved Trust List (AATL) 要求；2026-10-22 名录在列（Asseco Data Systems S.A.，PL） | 已核实 |
| OV / 个人 | 证书主题可含"姓名"或"姓名 + 公司信息" → 个人与组织两种形态都有 | 已核实 |
| 身份核验 | AATL 要求 F2F 或等效核验；Certum 用 **AdriadNEXT 远程核验**：扫描证件 + 与本人面部比对，实时进行，约 60 秒，不寄送纸质材料 | 已核实 |
| 泰国注册公司 | 未限定国别；远程核验是否接受泰国公司文件 **待核实** | 待核实 |
| 有效期 / 续期 | **待核实**（商店页未标年限） | 待核实 |
| 硬件 / 密钥形态 | **无物理 token**：证书存在 SimplySign 虚拟卡中（Android 6+ / iOS / 桌面端），可在电脑、平板、手机签名。**属于客户端形态，服务端批量调用能力未核实** | 已核实（虚拟卡）；服务端能力待核实 |
| 价格 | 官方商店 **€81 起**（含税/不含税口径与对应年限 **待核实**） | 部分核实 |
| 官方链接 | https://www.certum.eu/en/document-signing/ ｜ https://shop.certum.eu/documentsigning-certifcates.html | 已核实 |

**判断**：远程面签体验最好（60 秒、无需邮寄），价格最低。但它是"虚拟智能卡 + 客户端"，**是否提供服务器可调用的签名 API 未核实**，这是能否用于平台自动签的关键。

---

## 2. 总表

| 供应商 | 产品 | AATL | 组织/个人 | 密钥形态 | 有效期 | 公开价 | 服务端自动签 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| DigiCert | Document Signing Certificate | ✅ | 两者 | 硬件令牌 | 1 年订阅 | $816/年 | ❌（需另找云签方案，待核实） |
| GlobalSign | AATL Document Signing | ✅ | 组织/员工（个人待核实） | SafeNet eToken | 1–3 年 | ¥84,000/年（日本站） | ❌ |
| Sectigo | Enterprise / Professional / HSM | ✅ | 两者 | USB token 或自有 HSM | 1–3 年 | PLN 2,044/年起 | ✅（仅 HSM 版） |
| SSL.com | IV / OV / IV+OV + eSigner | ✅ | 三者 | YubiKey 或云 HSM | 1–5 年 | $299/年（OV） | ✅（CSC API） |
| Entrust | Document Signing | ✅ | 待核实 | iKey 5100 | 待核实 | 需询价 | ❌ |
| Certum | Document Signing | ✅ | 两者 | 虚拟卡 SimplySign | 待核实 | €81 起 | 待核实 |
| 泰国 INET CA | 组织 / 组织员工 / 个人 | 见 §3.5 | 两者 | 待核实（NTCA 有 PKCS#12 文件形态） | 1/2/3 年 | 5,000/2,500/2,000 THB | 待核实 |

---

## 3. 泰国本地路径：NRCA / ETDA 体系

### 3.1 体系结构（已核实）

- **Thailand NRCA**：国家根 CA，由 **ETDA**（电子交易发展局，数字经济与社会部下属）运营。依据：NRCA 官网 About 页与 NRCA CPS。
- NRCA **只向"在泰国运营 CA 的法人"签发 Sub CA 证书**，不直接给终端用户发签名证书。依据：NRCA CPS 明确 "issues digital certificates to a legal entity (who operates a CA in Thailand)"，且 CA Subscriber 需提供 **Thailand business address**。
- 终端用户证书由各 Sub CA 签发。NRCA 官方证书页列出的相关 Sub CA：
  - **ETDA ICA DocSigning-G1**（RSA 4096 / SHA-512，至 2034-06-08）——**这就是文档签名专用中间 CA**
  - **ETDA ICA TSA-G1**（时间戳）
  - **INET CA G1**（Internet Thailand）
  - **NTCA G2 / G3**（National Telecom）
  - **TDID CA G3**（Thai Digital ID）
  - **TKC RSA V1 / ECC V1**（Turnkey / ThaiCA）
- 来源：https://nrca.go.th/home/certificates

### 3.2 实际办理渠道与价格

以 **INET CA**（Internet Thailand，NRCA 体系 Sub CA）官方价目页为例（已核实）：

| 证书类型 | 价格 | 有效期 |
| --- | --- | --- |
| 组织证书（ใบรับรององค์กร） | **5,000 THB** | 1 年 |
| 组织员工证书（เจ้าหน้าที่องค์กร） | **2,500 THB** | 1 年 |
| 个人证书（บุคคล） | **2,000 THB** | 1 年 |
| 同页另一组年限价 | 8,000 / 4,000 / 3,000 THB | 年限标签未在抓取内容中明确，**待核实** |

- 处理时效：官方写"不超过 30 天，通常 1–2 个工作日"。
- 到期提醒：到期前 30 天邮件通知。
- 有效期选项：1 / 2 / 3 年。
- 来源：https://inetca.inet.co.th/inetca/certDetail.html

**NTCA（National Telecom）**：官网写明提供个人、法人、Web Server 三类证书；证书可为 **Digital File（PKCS#12）并刻录 CD** 交付；申请需**董事在 4 份材料上签字**。来源：https://ntca.ntplc.co.th/ 与其在线申请页。

**TDID / ThaiCA**：作为 NRCA Sub CA 存在（证书页可查），但**其终端文档签名证书的申请入口与产品页未核实**。

### 3.3 组织证书需要的材料（INET 官方，已核实）

1. **公司注册证明副本**（在商务部商业发展厅 **DBD** 注册），**出具不超过 90 天**，由注册证明上的**有权董事签字确认复印件属实**，并加盖公司章（如有）；
2. **有权董事的身份证复印件**，签字确认；
3. 若董事授权他人办理，另需：
   - **授权书**，贴 **30 泰铢印花税**；
   - 受托人身份证复印件，签字确认。

组织员工证书另需：员工身份证明（工作证明 / 公务员证）。

个人证书材料页**只列了泰国身份证复印件** → 外国人用护照能否办理，**待核实**。

### 3.4 是否接受中国 / 泰国注册企业

| 问题 | 结论 | 依据 |
| --- | --- | --- |
| 泰国注册公司能办吗 | **能**。要求 DBD 注册证明 + 有权董事签字 | INET 官方材料清单，已核实 |
| 中国注册公司能直接办吗 | **不能**（推断）。材料硬性要求 DBD 注册证明，中国公司无 DBD 记录 | 由材料清单推出，属**推断**；未找到官方"拒绝外国公司"的明文 |
| 必须本地实体吗 | 组织证书**实质要求泰国法人**；NRCA 对 Sub CA 也要求 Thailand business address | 已核实（Sub CA 要求）；组织证书为推断 |
| 中国个人能办个人证书吗 | **待核实**（材料只列泰国身份证） | 待核实 |

**实务建议**：如果签约主体是泰国公司（推荐，因为合同对手方是泰国用户/房东），用泰国主体去 INET/NTCA 办组织证书，材料最简单。如果只有中国主体，走国际 CA（SSL.com/DigiCert 等）更现实。

### 3.5 泰国证书签的 PDF，Adobe 认不认

- **NRCA 根在 Adobe AATL 名录中**（2026-10-22 版，Thailand NRCA，TH）→ 其链下的文档签名证书**理论上会被 Acrobat 自动信任**。
- 但 AATL 认的是"根 + 符合技术要求"，**不是任意一张 NRCA 链下的证书都自动可信**。必须确认所购证书的 EKU 含文档签名、且由 **ETDA ICA DocSigning-G1** 这类 DocSigning 中间 CA 签发。
- 本次**未做 Acrobat 实测**（没有样张）。采购前应要求供应商提供一张测试签名 PDF，用 Acrobat 打开确认显示"签名有效"。
- ETDA 另提供 **TEDA Web Validation** 在线校验 e-signature / e-time stamping，可作为交叉验证。

---

## 4. 结论

### 4.1 推荐证书类型与供应商

**证书类型：OV（Organization Validated）文档签名证书，绑定泰国签约主体。**

理由：

- 合同是平台/公司对用户出具，签署主体是法人，不是某个员工；IV（个人）会让每份合同绑死在具体个人身上，人员变动即失效。
- OV 支持"一个证书授权多名员工签署"（SSL.com 明确支持共享；Sectigo Enterprise 支持集中管理），符合业务实际。
- 若个别经纪人需要以个人名义签，再单独配 IV，不与平台证书混用。

**首选：SSL.com OV Document Signing + eSigner（云 HSM / CSC API）**

- 六家里唯一同时满足：AATL 在列、OV 组织证书、公开价（$299/年）、**云端 HSM + 公开 CSC API**、可多签署人共享。
- 私钥在 FIPS 140-2 Level 3 云 HSM，符合 AATL 硬件要求，同时**后端可以调用**——这是 DigiCert/GlobalSign/Entrust 的 USB token 做不到的。
- 需先确认：泰国公司营业执照（DBD 文件）是否被接受（待核实）。

**备选一：Sectigo Document Signing for HSM**

- 若公司已有 HSM 或有"密钥必须自持"的合规要求。需询价，且要自己承担 HSM 运维与 attestation。

**备选二：泰国 INET CA 组织证书（5,000 THB/年）**

- 成本最低、本地认可度最高、材料最简单（DBD 证明 + 董事签字）。
- 但必须先确认两件事：① 该证书是否由 **ETDA ICA DocSigning-G1** 链签发并被 Acrobat 信任；② 是否提供**服务器可调用的签名接口**（若只给 USB token / 客户端虚拟卡，则无法自动签）。
- 这两点都**待核实**，不能先承诺。

**不推荐作为平台自动签方案**：DigiCert、GlobalSign、Entrust 的标准文档签名证书——密钥在邮寄的 USB token 里，服务器用不了。它们适合"人工在 Acrobat 里签"，或作为公司对外出具文件的手工签名工具。

### 4.2 采购前必须准备的资料清单

按"泰国主体 + 国际 CA（OV）"准备：

1. **公司注册证明**：DBD 出具，**不超过 90 天**；英文版或附翻译（部分 CA 要求公证/宣誓翻译，待确认）。
2. **公司英文全称、注册号、注册地址、成立日期**（须与 DBD 文件完全一致）。
3. **有权签字董事的护照或身份证**扫描件 + 英文姓名。
4. **授权书**：若由非法定代表人办理采购与激活，需公司授权书（英文，董事签字、盖公章）。
5. **公司域名邮箱**：用于接收验证邮件与证书激活（免费邮箱常被拒）。
6. **可接通的公司电话**：CA 会做回呼核验（SSL.com / GlobalSign 都明确要求）。
7. **实际经营地址证明**：水电/固话账单、租约或税单（Sectigo 明确要求验证 physical existence）。
8. **付款方式**：国际信用卡，或电汇 / Purchase Order（企业采购通常走后者）。
9. **收件地址**（若选 USB token 方案）或**云签名账号管理员**（若选 eSigner 方案）。
10. **用途与量级说明**：签什么文件、预计年签署量、是否需要批量自动签（决定选 OV 还是 OV+eSealing）。
11. **技术对接信息**（选云签时）：出口 IP 白名单、回调地址、CSC API 凭证保管方案。

若走泰国本地（INET/NTCA）：材料收敛为 ①DBD 证明（≤90 天、董事签字盖章）②董事身份证复印件 ③授权书（贴 30 THB 印花税）+ 受托人身份证。**不需要**国际信用卡与英文公证。

### 4.3 证书没拿到之前，系统应当怎么表述

现状里有三处已经"说满了"，需要改：

| 位置 | 当前文案 | 问题 |
| --- | --- | --- |
| [kaifang_sign_service.py](file:///e:/app/vip-app-main/backend/app/services/kaifang_sign_service.py#L286) / [esign_service.py](file:///e:/app/vip-app-main/backend/app/services/esign_service.py#L182) | "本合同经买卖双方电子签名后正式生效，具有同等法律效力。" | 自建 CA + 无 TSA 时，这句是对外法律承诺，依据不足 |
| [contracts.py](file:///e:/app/vip-app-main/backend/app/api/v1/contracts.py#L4931) | "验签通过：内容未篡改，且全部 PDF 签名域校验通过。" | 只证明"链到平台自建根"，不等于 Adobe 信任 |
| [zh.ts](file:///e:/app/vip-app-main/frontend-web/src/i18n/locales/zh.ts#L4419) / [th.ts](file:///e:/app/vip-app-main/frontend-web/src/i18n/locales/th.ts#L4402) / [en.ts](file:///e:/app/vip-app-main/frontend-web/src/i18n/locales/en.ts#L4402) / [miniapp i18n](file:///e:/app/vip-app-main/miniapp/src/i18n/index.ts#L2074) | `验签通过` / `Verified` / `ผ่านการตรวจสอบ` / `验签通过` | 单一口径，无法区分"平台自验"与"公共 CA 可信" |

另一个隐患：验签返回的 `trusted` 字段（[kaifang_sign_service.py](file:///e:/app/vip-app-main/backend/app/services/kaifang_sign_service.py#L531)）来自 `ValidationContext(trust_roots=[自建CA])`，**自签证书下它也会是 True**。它只表示"链到本平台信任根"，**绝不能在 UI 上翻译成"可信"或"Adobe 认可"**。

建议的表述分三层，三端统一：

1. **完整性（可以明确说）**
   - 「文件自签署后未被修改，平台已完成完整性校验。」
2. **签名来源（要如实说）**
   - 当前：「本签名由平台签发，尚未接入公共信任 CA。在 Adobe Acrobat 中可能显示为"签名者身份未知"。」
   - 接入后：「本签名由 [CA 名称] 签发（Adobe AATL 成员），可在 Adobe Acrobat 中验证签名者身份。」
3. **时间戳（单独一行，不合并）**
   - 当前：「未启用可信时间戳。」
   - 接入后：「可信时间戳由 [TSA 名称] 提供（RFC 3161）。」

配套动作：

- 存证报告 verdict 拆成"内容完整性 / 签名信任链 / 时间戳"三行结论，不要合成一句"验签通过"。
- 合同模板里的"具有同等法律效力"改为中性表述，例如"双方同意以电子形式签署本合同，其效力适用相关法律规定"——**具体措辞需法务确认**，不由工程单方面决定。
- 后端对外接口里把 `trusted` 改名为 `chains_to_platform_root` 之类，避免下游误读（或至少在返回体加 `trust_anchor` 字段说明是哪条根）。
- 上线公共 CA 之前，任何页面、App 商店描述、销售话术都**不得出现**"Adobe 可信""法律效力等同手写签名""可信时间戳"等表述。

---

## 附录 A：本次已核实清单

| # | 事实 | 来源 |
| --- | --- | --- |
| 1 | AATL 要求私钥在 FIPS 140-2 L3 或等效硬件中生成并保护 | GlobalSign 官方 FAQ |
| 2 | DigiCert 文档签名：Individual/Business、$68/月、$816/年、12 个月自动续订、硬件令牌、RIV 仅 EU | DigiCert 产品页 |
| 3 | GlobalSign AATL：成员、Vetting 1–3 工作日 + 电话回呼、SafeNet eToken、1–3 年、续期窗口 30 天/7 天 | GlobalSign 官方 FAQ + 中国站 |
| 4 | Sectigo：Enterprise/Professional/HSM 三产品、1–3 年、1–5 工作日验证、USB token、材料清单 | Sectigo 产品页 |
| 5 | SSL.com：IV/OV/IV+OV、OV $299/年、YubiKey +$379、云 HSM、CSC API、3–5 天验证 | SSL.com 产品页与 OV 页 |
| 6 | Entrust：AATL 在列、iKey 5100 token | Entrust KB + AATL 名录 |
| 7 | Certum：AATL、€81 起、SimplySign 虚拟卡、AdriadNEXT 远程人脸+证件核验约 60 秒 | Certum 官网与商店 |
| 8 | NRCA 只向在泰运营 CA 的法人发 Sub CA，要求 Thailand business address | NRCA CPS |
| 9 | NRCA 证书页列出 ETDA ICA DocSigning-G1 / TSA-G1 / INET / NTCA / TDID / TKC | nrca.go.th/home/certificates |
| 10 | INET CA 组织 5,000 / 组织员工 2,500 / 个人 2,000 THB（1 年）；DBD 证明 ≤90 天；≤30 天办理，通常 1–2 工作日 | inetca.inet.co.th |
| 11 | NTCA 提供个人/法人/Web Server，可为 PKCS#12 文件 + CD，董事需签 4 份材料 | ntca.ntplc.co.th |
| 12 | 2026-10-22 版 Adobe AATL 名录含 DigiCert / GlobalSign / Sectigo / SSL.com / Entrust / Asseco(Certum) / Thailand NRCA | Adobe AATL 名录 |

## 附录 B：待核实事项（采购前必须问清）

| # | 事项 | 影响 |
| --- | --- | --- |
| 1 | DigiCert / GlobalSign / Entrust 是否接受**泰国注册公司**的 OV 材料，是否需要公证/翻译 | 能否下单 |
| 2 | Entrust 组织/个人版本、材料清单、有效期、报价 | 无法评估 |
| 3 | Certum 证书年限、是否提供服务端签名 API | 能否自动签 |
| 4 | SSL.com OV 对泰国 DBD 文件的接受度、eSigner CSC API 的商务开通条件 | 首选方案可行性 |
| 5 | INET/NTCA 证书是否由 ETDA ICA DocSigning-G1 签发、是否被 Acrobat 实测信任 | 泰国本地路线可行性 |
| 6 | 泰国 CA 是否提供服务器可调用的签名接口（还是只有 USB token / 客户端） | 能否自动签 |
| 7 | 外国人（中国籍）能否用护照办泰国个人证书 | 个人签署场景 |
| 8 | INET 第二组价格（8,000/4,000/3,000）对应的年限 | 成本测算 |
| 9 | 三家国际 CA 的云签名服务是否支持 pyHanko 对接（CSC API 需自研适配层） | 工程量 |

## 附录 C：一句话结论

买 **OV 组织证书 + 云签名 API**（首选 SSL.com OV + eSigner），不要买 USB token 版本来做服务器自动签；签约主体优先用泰国公司走本地 INET CA 降本，但必须先实测 Acrobat 信任与 API 可用性；证书到位前，系统只说"平台已完成签署与完整性校验"，不说"可信""Adobe 认可""同等法律效力"。
