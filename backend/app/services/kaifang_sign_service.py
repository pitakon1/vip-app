# -*- coding: utf-8 -*-
"""kaifangqian -> Python 电子签引擎服务。

把「开放签」工具的四大能力以 Python 复刻并跑在当前 FastAPI 进程内
（不另起 Java 服务）：

1. 电子印章生成  ——  对应 /signature/make，用 Pillow 绘制圆形红章。（PIL）
2. 数字证书签发  ——  对应 /cert/event，用 cryptography 签发自签 CA
                     并把 PKCS12 持久化到 SIGN_ENGINE_CERT_DIR，跨重启可验签。
3. PDF 生成     ——  用 reportlab 把内置合同模板（租赁/买卖/经纪协议）渲染为 PDF。
4. 定位签署     ——  对应 /document/sign 的 POSITION 方式：用 PyMuPDF 把印章/签名
                     盖到指定页面对应坐标，再用 pyhanko 做增量式数字签名。
5. 验签         ——  pyhanko 校验内嵌签名是否完好 / 可信（trust root = 本引擎 CA）。

用法：
    engine = kaifang_sign_service.get_engine()
    pdf = engine.render_contract_pdf(counters, kind="lease")      # 生成 PDF
    png = engine.make_seal("电子合同专用章", "住房租赁")          # 印章 PNG
    signed = engine.sign_pdf(pdf, img=png, page=1, x=70, y=80,
                             w=30, h=12, reason="双方电子签署")    # 定位签署
    rep = engine.verify_pdf(signed)                               # 验签
"""
import io
import math
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, Optional

from PIL import Image, ImageDraw, ImageFont

from app.config import settings

# ---------------------------------------------------------------------------
# 持久化 CA 身份（对应 /cert/event，测试证书；正式环境需换成受信任 CA）
# ---------------------------------------------------------------------------
_FONT_MENU = r"C:\Windows\Fonts\msyh.ttc"  # 微软雅黑（含中文字形）


class KaifangSignEngine:
    """开放签(Python)电子签引擎：印章 / 证书 / PDF 生成 / 定位签署 / 验签。"""

    name = "kaifangqian_python"

    def __init__(self, cert_dir: Optional[Path] = None, pfx_pass: str = ""):
        self._cert_dir = Path(cert_dir or settings.SIGN_ENGINE_CERT_DIR)
        self._pfx_pass = pfx_pass or settings.SIGN_ENGINE_PFX_PASS
        self._cert_dir.mkdir(parents=True, exist_ok=True)
        # 惰性初始化的 pyhanko 签署器 + 信任根
        self._signer = None
        self._trust_root = None
        self._identity = None

    # ---------------- 证书 / 签署器 ----------------
    # 懒装配：首次使用才生成/加载 CA，避免导入期副作用。
    @property
    def signer(self):
        if self._signer is None:
            self._ensure_identity()
        return self._signer

    @property
    def trust_root(self):
        if self._trust_root is None:
            self._ensure_identity()
        return self._trust_root

    def _ca_files(self):
        return {
            "key": self._cert_dir / "ca_key.pem",
            "cert": self._cert_dir / "ca_cert.pem",
            "pfx": self._cert_dir / "ca.pfx",
        }

    def _ensure_identity(self) -> None:
        """加载或生成自签 CA，并构建 pyhanko SimpleSigner + 信任根。

        - 已存在 ca_key.pem / ca_cert.pem 则直接复用（保证跨重启验签一致）；
        - 否则生成 RSA-2048 自签 CA（CA:TRUE, 365 天）并落盘 + 导出 PKCS12。
        """
        from cryptography import x509
        from cryptography.hazmat.primitives import hashes, serialization
        from cryptography.hazmat.primitives.asymmetric import rsa
        from cryptography.x509.oid import NameOID
        from pyhanko.keys import (
            load_certs_from_pemder_data,
            load_private_key_from_pemder_data,
        )
        from pyhanko_certvalidator.registry import SimpleCertificateStore

        files = self._ca_files()
        if files["key"].exists() and files["cert"].exists():
            key_pem = files["key"].read_bytes()
            cert_pem = files["cert"].read_bytes()
        else:
            key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
            cn = f"VIP租房开放签引擎 v{uuid.uuid4().hex[:6]}"
            name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, cn)])
            now = datetime.now(timezone.utc)
            cert = (
                x509.CertificateBuilder()
                .subject_name(name)
                .issuer_name(name)
                .public_key(key.public_key())
                .serial_number(x509.random_serial_number())
                .not_valid_before(now - timedelta(days=1))
                .not_valid_after(now + timedelta(days=365))
                .add_extension(
                    x509.BasicConstraints(ca=True, path_length=None), critical=True
                )
                .add_extension(
                    x509.SubjectKeyIdentifier.from_public_key(key.public_key()),
                    critical=False,
                )
                .sign(key, hashes.SHA256())
            )
            key_pem = key.private_bytes(
                serialization.Encoding.PEM,
                serialization.PrivateFormat.PKCS8,
                serialization.NoEncryption(),
            )
            cert_pem = cert.public_bytes(serialization.Encoding.PEM)
            files["key"].write_bytes(key_pem)
            files["cert"].write_bytes(cert_pem)
            pfx = serialization.pkcs12.serialize_key_and_certificates(
                name=b"kfq-engine",
                key=key,
                cert=cert,
                cas=None,
                encryption_algorithm=serialization.BestAvailableEncryption(
                    self._pfx_pass.encode("utf-8")
                ),
            )
            files["pfx"].write_bytes(pfx)

        cert_asn = next(load_certs_from_pemder_data(cert_pem))
        key_asn = load_private_key_from_pemder_data(key_pem, passphrase=None)
        store = SimpleCertificateStore()
        store.register(cert_asn)

        from pyhanko.sign import signers

        self._signer = signers.SimpleSigner(
            signing_cert=cert_asn,
            signing_key=key_asn,
            cert_registry=store,
        )
        self._trust_root = cert_asn
        try:
            cn = (
                cert_asn.subject.native.get("common_name", "")
                if hasattr(cert_asn.subject, "native")
                else ""
            )
        except Exception:  # noqa: BLE001
            cn = ""
        self._identity = {
            "configured": True,
            "cn": cn or "电子签引擎CA",
            "pfx": files["pfx"].name if files["pfx"].exists() else None,
        }

    def identity(self) -> Dict[str, Any]:
        """引擎身份信息（供探针/健康检查展示）。"""
        if not self._identity:
            self._ensure_identity()
        return dict(self._identity)

    # ---------------- 电子印章生成（/signature/make） ----------------
    def make_seal(self, top_text: str, middle_text: str = "", size: int = 360) -> bytes:
        """生成圆形红色电子印章 PNG。

        top_text    沿顶部/上部环绕的公司名/专章名（如“电子合同专用章”）；
        middle_text 中间横排文字（如“住房租赁”“合同专用”）。
        """
        img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        red = (200, 16, 16, 255)
        cx = cy = size // 2
        r_out, r_in = size // 2 - 6, size // 2 - 34
        d.ellipse((cx - r_out, cy - r_out, cx + r_out, cy + r_out), outline=red, width=8)
        d.ellipse((cx - r_in, cy - r_in, cx + r_in, cy + r_in), outline=red, width=3)
        # 五角星
        pts = []
        for i in range(10):
            r = 34 if i % 2 == 0 else 15
            ang = math.radians(-90 + i * 36)
            pts.append((cx + r * math.cos(ang), cy + r * math.sin(ang)))
        d.polygon(pts, fill=red)

        F = ImageFont.truetype
        f = F(_FONT_MENU, 30, index=0)
        # 顶部环绕文字（text 非空时）
        for i, ch in enumerate(top_text):
            ang = math.radians(150 - 13 * (i + 1))
            chimg = Image.new("RGBA", (48, 48), (0, 0, 0, 0))
            cd = ImageDraw.Draw(chimg)
            cd.text((8, 4), ch, font=f, fill=red)
            chimg = chimg.rotate(ang, expand=False, resample=Image.BICUBIC)
            tx = cx + int((r_out - 34) * math.cos(math.radians(180 - 18 * (i + 1)))) - 24
            ty = cy - int((r_out - 34) * math.sin(math.radians(180 - 18 * (i + 1)))) - 24
            img.alpha_composite(chimg, (tx, ty))
        # 中排横排文字
        if middle_text:
            mid = Image.new("RGBA", (size, 60), (0, 0, 0, 0))
            md = ImageDraw.Draw(mid)
            tw = md.textlength(middle_text, font=f)
            md.text(((size - tw) / 2, 0), middle_text, font=f, fill=red)
            img.alpha_composite(mid, (0, cy + 8))

        out = io.BytesIO()
        img.save(out, "PNG")
        return out.getvalue()

    # ---- 手写签名 PNG（个人签名：姓名套透明底） ----
    def make_handwrite(self, name: str, width: int = 300, height: int = 120) -> bytes:
        """把姓名渲染为透明底、带手写感的签名 PNG（供 PDF 定位签署用）。"""
        text = (name or "签名").strip() or "签名"
        F = ImageFont.truetype(_FONT_MENU, 56, index=0)
        img = Image.new("RGBA", (max(width, 200), height), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        tw = d.textlength(text, font=F)
        d.text((max(8, (width - tw) / 2), height / 2 - 40), text, font=F,
               fill=(24, 60, 130, 255))
        out = io.BytesIO()
        img.save(out, "PNG")
        return out.getvalue()

    def render_contract_pdf(self, counters: Dict[str, Any], kind: str = "lease") -> bytes:
        """把内置合同模板渲染为 PDF 字节。

        与 esign_service.render_*_html 使用相同字段；输出为可签署的 PDF 文档。
        """
        c = counters or {}
        c = {k: _esc(v) for k, v in c.items()}
        now = datetime.utcnow().strftime("%Y-%m-%d")
        no = c.get("contract_no") or uuid.uuid4().hex[:8].upper()
        title = c.get("title")

        if kind == "purchase":
            title = title or "房屋买卖合同"
            rows = [
                ("合同编号", no), ("签署日期", now),
                ("出卖方", c.get("seller_name", "")),
                ("出卖方证件号", c.get("seller_id_number", "")),
                ("买受方", c.get("buyer_name", "")),
                ("买受方证件号", c.get("buyer_id_number", "")),
                ("标的房屋", c.get("property_name", "") or c.get("property_address", "")),
                ("房号", c.get("room_number", "")),
                ("面积(㎡)", c.get("property_area", "")),
                ("房屋总价(元)", c.get("total_price", "")),
                ("单价(元/㎡)", c.get("price_per_sqm", "")),
                ("定金(元)", c.get("down_payment", "")),
                ("交付时间", c.get("delivery_date", "")),
            ]
            clauses = [
                "出卖方保证对标的房屋享有合法所有权或处分权，产权清晰，无查封、抵押或其他权利瑕疵。",
                "标的房屋所有权自交付后依法转移至买受方；买受方按约定取得相应产权凭证。",
                "双方确认房屋总价及税费负担按合同约定执行，一方违约须承担相应违约责任。",
                "买受方应按约定支付定金与尾款，逾期付款的按合同约定承担逾期责任。",
                "房屋应按约定的交付时间按现状移交，配套钥匙与相关证照一并交付。",
                "本合同经买卖双方电子签名后正式生效，具有同等法律效力。",
            ]
        elif kind in ("broker", "listing_agent", "broker_distributor"):
            title = title or "经纪人协议"
            rows = [
                ("合同编号", no), ("签署日期", now),
                ("经纪人姓名", c.get("broker_name", "")),
                ("所属公司", c.get("broker_company", "")),
                ("联系电话", c.get("broker_phone", "")),
                ("联系方式", c.get("broker_channel", "")),
                ("证件号", c.get("broker_id_number", "")),
            ]
            clauses = [
                "经纪人保证所发布房源信息真实、准确、完整，并对房源产权/租赁状态负责。",
                "同一套房源平台仅保留一份房源档案；重复上架将被系统识别并合并/拦截。",
                "经纪人应如实填写挂牌价与佣金/分成比例，成交后按平台规则结算。",
                "业主联系方式仅用于平台管理，经纪人不得擅自对外披露。",
                "双方确认佣金与分成按平台规则执行，任何一方违约须承担相应责任。",
            ]
        else:  # lease 默认
            title = title or "房屋租赁合同"
            rows = [
                ("合同编号", no), ("签署日期", now),
                ("物业地址", c.get("property_address", "")),
                ("房号", c.get("room_number", "")),
                ("月租金", c.get("monthly_rent", "")),
                ("押金", c.get("deposit", "")),
                ("租赁开始", c.get("start_date", "")),
                ("租期月数", c.get("term_months", "")),
                ("租客姓名", c.get("tenant_name", "")),
                ("租客证件号", c.get("tenant_id_number", "")),
                ("业主/房东", c.get("landlord_name", "")),
                ("业主证件号", c.get("landlord_id_number", "")),
            ]
            clauses = [
                "甲方出租给乙方的房屋坐落及房号以合同信息表为准，实际以交付现状为准。",
                "租赁用途为居住；未经甲方书面同意，乙方不得擅自变更用途或转租。",
                "租赁期限以合同信息表为准，且不超过二十年，超过部分无效。",
                "租金、押金及支付方式以合同信息表为准；乙方逾期付款按约定承担违约责任。",
                "租赁期满或合同解除后，乙方结清费用且无违约的，甲方应原额无息退还押金。",
                "本合同自双方电子签名之日起生效，对双方均具有法律约束力。",
            ]

        buf = io.BytesIO()
        doc = self._pdf_doc(buf)
        A4 = (doc.pagesize[0], doc.pagesize[1])  # 595 x 842 pts
        from reportlab.lib import colors
        from reportlab.platypus import (
            Paragraph,
            SimpleDocTemplate,
            Spacer,
            Table,
            TableStyle,
        )
        from reportlab.lib.styles import ParagraphStyle
        from reportlab.lib.enums import TA_CENTER

        style_title = ParagraphStyle(
            "t", alignment=TA_CENTER, fontSize=18, leading=24, fontName=self._font()
        )
        style_b = ParagraphStyle(
            "b", fontSize=11, leading=16, fontName=self._font()
        )

        story = [Paragraph(_esc(title), style_title), Spacer(1, 16)]

        # 关键信息表
        tbl = Table([[Paragraph(k, style_b), Paragraph(v or "＿", style_b)]
                     for k, v in rows], colWidths=[A4[0] * 0.32, A4[0] * 0.58])
        tbl.setStyle(TableStyle([
            ("GRID", (0, 0), (-1, -1), 0.6, colors.HexColor("#d0d7de")),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ("RIGHTPADDING", (0, 0), (-1, -1), 6),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ]))
        story.append(tbl)
        story.append(Spacer(1, 14))

        # 条款
        story.append(Paragraph(_esc("合同条款"), style_b))
        for i, cl in enumerate(clauses, 1):
            story.append(Paragraph(f"{i}. {cl}", style_b))
        story.append(Spacer(1, 30))
        story.append(Paragraph(_esc("甲方(签名)：＿＿＿＿＿＿＿＿　乙方(签名)：＿＿＿＿＿＿＿＿"), style_b))

        doc.build(story)
        buf.seek(0)
        return buf.getvalue()

    # ---------------- 定位签署（/document/sign · POSITION） ----------------
    def sign_pdf(
        self,
        pdf_bytes: bytes,
        img_png: bytes,
        page: int = 1,
        x: float = 50.0,
        y: float = 80.0,
        w: float = 30.0,
        h: float = 12.0,
        reason: Optional[str] = None,
    ) -> bytes:
        """在 PDF 指定页面、相对左上角坐标处盖 img 并做数字签名。

        坐标 x/y/w/h 沿用 ContractSignField 的**百分比**约定（0-100），
        按页面宽高换算为点数。返回已增量签名的 PDF 字节。
        """
        import fitz

        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        pg = doc[page - 1]
        PX = pg.rect.width
        PY = pg.rect.height
        # 百分比 -> 点；y 由 PDF 顶部起算
        x0 = pg.rect.x0 + PX * (x / 100.0)
        y0 = pg.rect.y0 + PY * (y / 100.0)
        wpt = PX * (w / 100.0)
        hpt = PY * (h / 100.0)
        pg.insert_image((x0, y0, x0 + wpt, y0 + hpt), stream=img_png)
        tmp = io.BytesIO()
        doc.save(tmp, garbage=0)
        tmp.seek(0)
        doc.close()

        from pyhanko.pdf_utils.incremental_writer import IncrementalPdfFileWriter
        from pyhanko.sign import signers

        w2 = IncrementalPdfFileWriter(tmp)
        meta = signers.PdfSignatureMetadata(
            field_name=f"VipSign{uuid.uuid4().hex[:6]}",
            reason=reason or None,
            location="vip app",
        )
        ps = signers.PdfSigner(meta, signer=self.signer)
        out = io.BytesIO()
        ps.sign_pdf(w2, output=out)
        out.seek(0)
        return out.getvalue()

    # ---------------- 验签 ----------------
    def page_count(self, pdf_bytes: bytes) -> int:
        """返回 PDF 页数。"""
        import fitz
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        n = doc.page_count
        doc.close()
        return n

    def page_image(self, pdf_bytes: bytes, page: int, dpi: int = 96) -> bytes:
        """把 PDF 指定页（1 起）渲染为 PNG 字节，供前端页图预览/拖拽定位签署。"""
        import fitz
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        try:
            pix = doc[page - 1].get_pixmap(dpi=dpi)
            return pix.tobytes("png")
        finally:
            doc.close()

    def verify_pdf(self, pdf_bytes: bytes) -> list:
        """校验 PDF 内嵌签名，返回每一条签名的完好性/可信性/签署主体。"""
        from pyhanko.pdf_utils.reader import PdfFileReader
        from pyhanko.sign.validation import validate_pdf_signature
        from pyhanko.sign.validation.pdf_embedded import collect_embedded_signatures
        from pyhanko_certvalidator import ValidationContext

        vc = ValidationContext(trust_roots=[self.trust_root])
        rdr = PdfFileReader(io.BytesIO(pdf_bytes))
        results = []
        for sig in collect_embedded_signatures(rdr):
            r = validate_pdf_signature(sig, signer_validation_context=vc)
            results.append({
                "valid": int(r.intact),
                "trusted": int(r.trusted),
                "signed_by": str(getattr(r.signing_cert, "subject", "")),
            })
        return results

    # ---- 内部工具 ----
    def _font(self):
        """reportlab 中文字体名（已注册则返回，否则回退 Helvetica）。"""
        from reportlab.pdfbase import pdfmetrics
        if "MSYH" in pdfmetrics.getRegisteredFontNames():
            return "MSYH"
        try:
            from reportlab.pdfbase.ttfonts import TTFont
            pdfmetrics.registerFont(TTFont("MSYH", _FONT_MENU, subfontIndex=0))
            return "MSYH"
        except Exception:  # noqa: BLE001
            return "Helvetica"

    def _pdf_doc(self, stream):
        from reportlab.lib.pagesizes import A4
        from reportlab.platypus import SimpleDocTemplate
        return SimpleDocTemplate(
            stream, pagesize=A4,
            leftMargin=48, rightMargin=48, topMargin=56, bottomMargin=56,
        )


def _esc(v: Any) -> str:
    """把字段清洗为可安全写入 PDF 的文本（去空白/控制字符）。"""
    if v is None:
        return ""
    return str(v).replace("\x00", "")


# ---------------------------------------------------------------------------
# 进程级单例
# ---------------------------------------------------------------------------
_ENGINE: Optional[KaifangSignEngine] = None


def get_engine() -> KaifangSignEngine:
    global _ENGINE
    if _ENGINE is None:
        _ENGINE = KaifangSignEngine()
    return _ENGINE