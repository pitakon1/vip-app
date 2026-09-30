"""电子签合同服务。

根据用户/租约信息自动渲染合同 → 计算全文哈希 → 各方数字签名
（HMAC-SHA256，见 sign_digest）→ 生成签名 SVG 入库。
输出合同 .html/.json 文件到 CONTRACT_OUTPUT_DIR。
"""
import hashlib
import hmac
import html as html_mod
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Optional, Protocol

from app.config import settings


def _esc(v: Any) -> str:
    return html_mod.escape(str(v if v is not None else ""))


def _table_rows(rows) -> str:
    return "\n".join(
        f"<tr><td style='padding:6px 12px;border:1px solid #e6eaf0'>{k}</td>"
        f"<td style='padding:6px 12px;border:1px solid #e6eaf0'>{v}</td></tr>"
        for k, v in rows
    )


def render_broker_protocol_html(counters: Dict[str, Any], kind: str = "listing_agent") -> str:
    """渲染经纪人协议 HTML。

    kind=listing_agent      → 《房源经纪人上架房源协议》
    kind=broker_distributor → 《平台经纪人分销协议》
    复用现有 body 骨架与内容哈希/签名流程。
    """
    c = counters or {}
    now = datetime.utcnow().strftime("%Y-%m-%d")
    is_listing = kind == "listing_agent"

    name = c.get("broker_name", "")
    company = c.get("broker_company", "")
    phone = c.get("broker_phone", "")
    channel = c.get("broker_channel", "")
    id_number = c.get("broker_id_number", "")

    title = (
        "房源经纪人上架房源协议" if is_listing else "平台经纪人分销协议"
    )
    rows = [
        ("合同编号", _esc(c.get("contract_no", uuid.uuid4().hex[:8].upper()))),
        ("签署日期", _esc(now)),
        ("经纪人姓名", _esc(name)),
        ("所属公司", _esc(company)),
        ("联系电话", _esc(phone)),
        ("联系方式(微信/LINE/WhatsApp)", _esc(channel)),
        ("证件号", _esc(id_number)),
    ]

    if is_listing:
        obligations = [
            "经纪人保证所发布房源信息真实、准确、完整，并对房源产权/租赁状态负责。",
            "同一套房源平台仅保留一份房源档案；重复上架将被系统识别并合并/拦截。",
            "经纪人应如实填写挂牌价与佣金/分成比例，成交后按平台规则结算。",
            "业主联系方式仅用于平台管理，经纪人不得擅自对外披露。",
            "标的佣金比例：卖房 3%-6%，租房为 1/1.5/2/3 个月租金，分成按协议约定。",
        ]
        foot = "（房源方经纪人）"
    else:
        obligations = [
            "客源分销经纪人须如实提供客户线索，配合房源方推动成交。",
            "经纪人不得伪造线索、诱导签约或从事任何损害平台及消费者权益的行为。",
            "佣金分成比例按平台规则执行（如 65:35、50:50、30:70、20:80）。",
            "经纪人有权按平台规则获得相应佣金结算。",
        ]
        foot = "（客源分销经纪人）"

    lis = "\n".join(f"<li>{o}</li>" for o in obligations)
    trs = _table_rows(rows)
    return f"""<!DOCTYPE html><html lang="zh"><head><meta charset="utf-8">
<title>{_esc(title)}</title></head><body>
<h1 style="text-align:center">{_esc(title)}</h1>
<p>甲方：好房网平台　乙方：{_esc(name)}　双方本着平等自愿原则订立本协议。</p>
<table style="border-collapse:collapse;width:100%">{trs}</table>
<h3>协议条款</h3><ol>
{lis}
</ol>
<p style="margin-top:40px">甲方(平台盖章／签名)：<span style="display:inline-block;width:200px"></span>
乙方({_esc(foot)}签名)：<span style="display:inline-block;width:200px"></span></p>
</body></html>"""


def render_contract_html(counters: Dict[str, Any]) -> str:
    """用模板渲染合同 HTML。counters 需含租客/业主/房源/租约等字段。"""
    c = counters or {}
    now = datetime.utcnow().strftime("%Y-%m-%d")
    rows = [
        ("合同编号", _esc(c.get("contract_no", uuid.uuid4().hex[:8].upper()))),
        ("签署日期", _esc(now)),
        ("物业地址", _esc(c.get("property_address", ""))),
        ("房号", _esc(c.get("room_number", ""))),
        ("月租金", _esc(c.get("monthly_rent", ""))),
        ("押金", _esc(c.get("deposit", ""))),
        ("租赁开始", _esc(c.get("start_date", ""))),
        ("租期月数", _esc(c.get("term_months", ""))),
        ("租客姓名", _esc(c.get("tenant_name", ""))),
        ("租客证件号", _esc(c.get("tenant_id_number", ""))),
        ("业主/房东", _esc(c.get("landlord_name", ""))),
        ("业主证件号", _esc(c.get("landlord_id_number", ""))),
    ]
    trs = "\n".join(
        f"<tr><td style='padding:6px 12px;border:1px solid #e6eaf0'>{k}</td>"
        f"<td style='padding:6px 12px;border:1px solid #e6eaf0'>{v}</td></tr>"
        for k, v in rows
    )
    return f"""<!DOCTYPE html><html lang="zh"><head><meta charset="utf-8">
<title>{_esc(c.get('title','租赁合同'))}</title></head><body>
<h1 style="text-align:center">{_esc(c.get('title','房屋租赁合同'))}</h1>
<p>本合同由甲方(业主)与乙方(租客)本着平等自愿原则协商订立。</p>
<table style="border-collapse:collapse;width:100%">{trs}</table>
<h3>条款</h3><ol>
<li>乙方应按月足额支付租金；逾期需按约定支付滞纳金。</li>
<li>押金在合同届满并结清费用后无息退还。</li>
<li>物业设备损坏由责任方负责承担维修费用。</li>
<li>本合同经甲乙双方电子签名后正式生效，具有同等法律效力。</li>
</ol>
<p style="margin-top:40px">甲方(签名)：<span style="display:inline-block;width:200px"></span>
乙方(签名)：<span style="display:inline-block;width:200px"></span></p>
</body></html>"""


def render_purchase_html(counters: Dict[str, Any]) -> str:
    """渲染房屋买卖合同 HTML。

    counters 需含买受方/出卖方/标的房屋/房价/交付时间等字段：
    seller_*（出卖方）、buyer_*（买受方）、property_*（标的房屋）、
    total_price/price_per_sqm（房价）、down_payment（定金）、delivery_date（交付时间）。
    布局与租赁模板（render_contract_html）保持一致：表格 + 折行条款 + 双方签字栏。
    """
    c = counters or {}
    now = datetime.utcnow().strftime("%Y-%m-%d")
    rows = [
        ("合同编号", _esc(c.get("contract_no", uuid.uuid4().hex[:8].upper()))),
        ("签署日期", _esc(now)),
        ("出卖方", _esc(c.get("seller_name", ""))),
        ("出卖方证件号", _esc(c.get("seller_id_number", ""))),
        ("买受方", _esc(c.get("buyer_name", ""))),
        ("买受方证件号", _esc(c.get("buyer_id_number", ""))),
        ("标的房屋", _esc(c.get("property_name", "") or c.get("property_address", ""))),
        ("房号", _esc(c.get("room_number", ""))),
        ("面积(㎡)", _esc(c.get("property_area", ""))),
        ("房屋总价(元)", _esc(c.get("total_price", ""))),
        ("单价(元/㎡)", _esc(c.get("price_per_sqm", ""))),
        ("定金(元)", _esc(c.get("down_payment", ""))),
        ("交付时间", _esc(c.get("delivery_date", ""))),
    ]
    trs = _table_rows(rows)
    clauses = [
        "出卖方保证对标的房屋享有合法所有权或处分权，产权清晰，无查封、抵押或其他权利瑕疵。",
        "标的房屋所有权自交付后依法转移至买受方；买受方按约定取得相应产权凭证。",
        "双方确认房屋总价及税费负担按合同约定执行，一方违约须承担相应违约责任。",
        "买受方应按约定支付定金与尾款，逾期付款的按合同约定承担逾期责任。",
        "房屋应按约定的交付时间按现状移交，配套钥匙与相关证照一并交付。",
        "本合同经买卖双方电子签名后正式生效，具有同等法律效力。",
    ]
    lis = "\n".join(f"<li>{o}</li>" for o in clauses)
    return f"""<!DOCTYPE html><html lang="zh"><head><meta charset="utf-8">
<title>{_esc(c.get('title','房屋买卖合同'))}</title></head><body>
<h1 style="text-align:center">{_esc(c.get('title','房屋买卖合同'))}</h1>
<p>本合同由出卖方与买受方本着平等自愿原则协商订立，就标的房屋买卖事宜达成如下协议。</p>
<table style="border-collapse:collapse;width:100%">{trs}</table>
<h3>条款</h3><ol>
{lis}
</ol>
<p style="margin-top:40px">出卖方(签名)：<span style="display:inline-block;width:200px"></span>
买受方(签名)：<span style="display:inline-block;width:200px"></span></p>
</body></html>"""


# 内置合同模板注册表：(kind → (模板展示名, 渲染函数, 渲染关键参数))
# 供 /contracts/templates 读取生成模板列表，并按 kind 分发到对应渲染器。
_TEMPLATE_REGISTRY: Dict[str, Any] = {
    "lease": ("租赁合同", render_contract_html, {}),
    "purchase": ("房屋买卖合同", render_purchase_html, {}),
    "broker": ("经纪人协议", render_broker_protocol_html, {"kind": "listing_agent"}),
}


def list_templates() -> list:
    """返回可用合同模板列表（kind + 展示名 title）。

    title 为模板展示名（中文，前端可按需 i18n 覆盖）。列表按注册顺序返回，
    即：lease → purchase → broker。
    """
    return [
        {"kind": kind, "title": title}
        for kind, (title, _render, _kw) in _TEMPLATE_REGISTRY.items()
    ]


def content_hash(content: str) -> str:
    """合同全文 SHA-256（用于完整性审计）。"""
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


def _signing_key() -> bytes:
    """取合同签名密钥；未配置时 fail closed。

    该配置项默认值已改为空串（原先是一个公开的示例值）。用空/示例密钥做 HMAC
    等价于没有签名——任何人都能伪造出"校验通过"的合同，故这里直接拒绝签名。
    """
    secret = (settings.CONTRACT_SIGNING_SECRET or "").strip()
    if not secret:
        raise RuntimeError(
            "CONTRACT_SIGNING_SECRET 未配置：拒绝签发电子合同签名，"
            "请在后端 .env 中设置强随机密钥。"
        )
    return secret.encode("utf-8")


def sign_digest(data: str) -> str:
    """对内容做数字签名（HMAC-SHA256）。

    统一走 HMAC 分支：原 RSA 分支每次调用都 `rsa.generate_private_key()` 生成
    新的随机私钥且不保存（注释声称「用 SECRET 确定性派生」但代码未实现），
    同一文档的签名永远无法复验/审计，已移除。HMAC 由 CONTRACT_SIGNING_SECRET
    与内容确定性计算，可用同一密钥离线重建复验。
    """
    key_material = _signing_key()
    return hmac.new(key_material, data.encode("utf-8"), hashlib.sha256).hexdigest()


def signature_svg(name: str, stamp: str) -> str:
    """生成手写感签名 SVG。"""
    uid = uuid.uuid4().hex[:6].upper()
    return f"""<svg xmlns='http://www.w3.org/2000/svg' width='260' height='80' viewBox='0 0 260 80'>
<text x='20' y='60' font-size='34' fill='#14b8a6' font-family='Segoe Script, cursive'>{_esc(name)}</text>
<text x='20' y='76' font-size='13' fill='#64748b'>SIG-{uid}</text></svg>"""


def generate_contract(counters: Dict[str, Any], language: str = "zh", kind: str = "lease") -> Dict[str, Any]:
    """生成合同：渲染 + 哈希 + 落盘。返回元数据（不涉及签署）。

    kind=lease（默认租赁合同）走 render_contract_html；
    kind=listing_agent / broker_distributor 走 render_broker_protocol_html。
    """
    if kind == "listing_agent":
        html_content = render_broker_protocol_html(counters, kind)
        title = "房源经纪人上架房源协议"
    elif kind == "broker_distributor":
        html_content = render_broker_protocol_html(counters, kind)
        title = "平台经纪人分销协议"
    elif kind == "purchase":
        html_content = render_purchase_html(counters)
        title = counters.get("title", "房屋买卖合同")
    elif kind == "broker":
        # 顶层「经纪人协议」模板：复用房源经纪人上架协议主体展示
        html_content = render_broker_protocol_html(counters, "listing_agent")
        title = counters.get("title", "经纪人协议")
    else:
        html_content = render_contract_html(counters)
        title = counters.get("title", "房屋租赁合同")
    digest = content_hash(html_content)

    base = Path(settings.CONTRACT_OUTPUT_DIR)
    base.mkdir(parents=True, exist_ok=True)
    file = base / f"contract_{uuid.uuid4().hex[:12]}.html"
    file.write_text(html_content, encoding="utf-8")

    return {
        "title": title,
        "language": language,
        "content_html": html_content,
        "document_hash": digest,
        "file_path": str(file),
    }


class SignProvider(Protocol):
    """电子签服务提供方接口。

    本期只落地平台自研实现 `InHouseProvider`；预留该接口是为了后续可接入
    第三方电子签（如 e签宝 / DocuSign）而不改动业务侧调用点。
    """

    name: str

    def render_signature(self, name: str, stamp: str) -> str:
        """生成手写感签名 SVG。"""
        ...

    def sign_digest(self, data: str) -> str:
        """对内容做可离线复验的数字签名。"""
        ...


class InHouseProvider:
    """平台自研电子签：HMAC-SHA256 摘要 + SVG 手写签名。"""

    name = "in_house"

    def render_signature(self, name: str, stamp: str) -> str:
        return signature_svg(name, stamp)

    def sign_digest(self, data: str) -> str:
        return sign_digest(data)


_DEFAULT_PROVIDER: Optional[SignProvider] = None


def get_sign_provider() -> SignProvider:
    """取当前电子签提供方（默认平台自研）。"""
    global _DEFAULT_PROVIDER
    if _DEFAULT_PROVIDER is None:
        _DEFAULT_PROVIDER = InHouseProvider()
    return _DEFAULT_PROVIDER