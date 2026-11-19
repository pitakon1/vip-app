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
import hashlib
import io
import logging
import math
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, Optional

from PIL import Image, ImageDraw, ImageFont

from app.config import settings

logger = logging.getLogger(__name__)

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
        self._self_ca_der: Optional[bytes] = None

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
        """加载或生成签名证书，并构建 pyhanko SimpleSigner + 信任根。

        优先级：
        1. `SIGN_CERT_PATH` 已配置 → 用采购的公共 CA 证书（pfx/p12 或 pem+key）；
        2. 否则复用 `SIGN_ENGINE_CERT_DIR` 下已有的自签 CA；
        3. 再否则生成 RSA-2048 自签 CA（CA:TRUE, 365 天）并落盘 + 导出 PKCS12。

        自签证书只用于平台内部验签：Adobe 等外部阅读器会提示「签名者不受信」，
        这是采购公共证书前的预期状态，接口会带 `trust_level=platform` 标注。
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
        configured_path = (settings.SIGN_CERT_PATH or "").strip()
        self_signed = True
        chain = []

        if configured_path:
            key_asn, cert_asn, chain = self._load_configured_cert(Path(configured_path))
            self_signed = False
        else:
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
        for extra in chain:
            store.register(extra)

        from pyhanko.sign import signers

        self._signer = signers.SimpleSigner(
            signing_cert=cert_asn,
            signing_key=key_asn,
            cert_registry=store,
        )
        # 自签 CA 作为额外信任锚；采购证书则只依赖公共根（certifi）
        self._trust_root = cert_asn if self_signed else None
        self._self_ca_der = cert_asn.dump()
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
            "self_signed": self_signed,
            "cert_path": configured_path or None,
            "trust_level": "platform" if self_signed else "public",
        }

    def _load_configured_cert(self, path: Path):
        """加载采购的签名证书（pfx/p12 或 pem + 同名 .key），返回 (key, cert, chain)。"""
        from asn1crypto import x509 as asn1_x509
        from cryptography.hazmat.primitives.serialization import (
            Encoding,
            NoEncryption,
            PrivateFormat,
            pkcs12,
        )
        from pyhanko.keys import (
            load_certs_from_pemder_data,
            load_private_key_from_pemder_data,
        )

        if not path.exists():
            raise RuntimeError(f"signing certificate not found: {path}")
        password = (settings.SIGN_CERT_PASSWORD or "").encode("utf-8") or None
        raw = path.read_bytes()
        chain = []

        if path.suffix.lower() in (".pfx", ".p12"):
            key, cert, additional = pkcs12.load_key_and_certificates(raw, password)
            if key is None or cert is None:
                raise RuntimeError("pkcs12 does not contain a key/certificate pair")
            key_pem = key.private_bytes(Encoding.PEM, PrivateFormat.PKCS8, NoEncryption())
            certs = [cert, *(additional or [])]
            chain = [
                asn1_x509.Certificate.load(c.public_bytes(Encoding.DER))
                for c in certs[1:]
            ]
            cert_asn = asn1_x509.Certificate.load(certs[0].public_bytes(Encoding.DER))
        else:
            cert_pem = raw
            key_path = path.with_suffix(".key")
            if not key_path.exists():
                raise RuntimeError(f"signing key not found: {key_path}")
            key_pem = key_path.read_bytes()
            loaded = list(load_certs_from_pemder_data(cert_pem))
            if not loaded:
                raise RuntimeError(f"no certificate in {path}")
            cert_asn, chain = loaded[0], loaded[1:]

        key_asn = load_private_key_from_pemder_data(key_pem, passphrase=password)
        return key_asn, cert_asn, chain

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

    # ---- 印模印章：把扫描的真实印章抠成透明底图（对应开放签「印模生成」） ----
    def make_imprint_seal(self, image_bytes: bytes) -> bytes:
        """扫描的真实章（白纸盖章）→ 自动透明化抠图 → 透明底印章 PNG。

        以「近白背景」为透明，其余保留为印章本体。
        """
        if isinstance(image_bytes, memoryview):
            image_bytes = image_bytes.tobytes()
        src_img = Image.open(io.BytesIO(image_bytes)).convert("RGBA")
        src_img.thumbnail((800, 800))  # 限制尺寸，保证逐像素抠图性能
        gray = src_img.convert("L")
        # 白纸背景：亮度 > 200 → alpha=0；印章本体 → alpha=255
        alpha = gray.point(lambda p: 0 if p > 200 else 255, mode="L")
        src_img.putalpha(alpha)
        bbox = src_img.getbbox()
        if bbox:
            src_img = src_img.crop(bbox)
        out = io.BytesIO()
        src_img.save(out, "PNG")
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

        return self._build_pdf(title, rows, clauses)

    def _build_pdf(self, title: str, rows, clauses) -> bytes:
        """把「标题 + 信息表 + 条款」渲染为 A4 PDF（内置模板与模板库共用）。"""
        buf = io.BytesIO()
        doc = self._pdf_doc(buf)
        A4 = (doc.pagesize[0], doc.pagesize[1])  # 595 x 842 pts
        from reportlab.lib import colors
        from reportlab.platypus import (
            Paragraph,
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

    def render_document_pdf(self, title: str, rows, clauses) -> bytes:
        """按模板库的「标题 + 字段表 + 条款」渲染 PDF，供模板生成合同使用。"""
        return self._build_pdf(title, rows, clauses)

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
        meta_out: Optional[dict] = None,
    ) -> bytes:
        """在 PDF 指定页面、相对左上角坐标处盖 img 并做数字签名。

        坐标 x/y/w/h 沿用 ContractSignField 的**百分比**约定（0-100），
        按页面宽高换算为点数。返回已增量签名的 PDF 字节。

        **必须只追加、不重写**：签章图片作为「签名域外观（/AP）」由 pyhanko 直接
        写进新增的签名域，不再用 PyMuPDF 改写页面内容流。此前实现先 `doc.save()`
        全量重写 PDF 再签名，会破坏已有签名的 ByteRange，导致多人依次签署时
        前一位签署人的签名校验结果为 valid=0（`valid` 为 pyhanko intact 结果）。
        """
        import fitz
        from pyhanko.pdf_utils.images import PdfImage
        from pyhanko.pdf_utils.incremental_writer import IncrementalPdfFileWriter
        from pyhanko.pdf_utils.layout import (
            AxisAlignment,
            InnerScaling,
            Margins,
            SimpleBoxLayoutRule,
        )
        from pyhanko.sign import signers
        from pyhanko.sign.fields import SigFieldSpec
        from pyhanko.stamp import TextStampStyle

        # 只读取页面尺寸，不落盘、不修改 PDF。
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        try:
            pg = doc[page - 1]
            if int(getattr(pg, "rotation", 0) or 0) % 360:
                # 旋转页面的百分比坐标需按 /Rotate 重新映射；我方生成的合同均为 0°，
                # 这里显式失败，避免静默盖错位置（上传件不进入此链路）。
                raise ValueError("rotated PDF pages are not supported for positional signing")
            PX = pg.rect.width
            PY = pg.rect.height
            OX = pg.rect.x0
            OY = pg.rect.y0
        finally:
            doc.close()

        # 百分比 -> PDF 用户空间（原点左下）。y 由页面顶部起算。
        left = OX + PX * (x / 100.0)
        top = OY + PY - PY * (y / 100.0)
        wpt = PX * (w / 100.0)
        hpt = PY * (h / 100.0)
        box = (left, top - hpt, left + wpt, top)

        img = Image.open(io.BytesIO(img_png)).convert("RGBA")
        style = TextStampStyle(
            background=PdfImage(img),
            background_opacity=1.0,
            stamp_text="",
            background_layout=SimpleBoxLayoutRule(
                x_align=AxisAlignment.ALIGN_MID,
                y_align=AxisAlignment.ALIGN_MID,
                margins=Margins(0, 0, 0, 0),
                inner_content_scaling=InnerScaling.STRETCH_FILL,
            ),
        )

        field_name = f"VipSign{uuid.uuid4().hex[:8]}"
        sig_meta = signers.PdfSignatureMetadata(
            field_name=field_name,
            reason=reason or None,
            location="vip app",
        )
        tsa_record: dict = {}
        tsa_configured = bool((settings.TSA_URL or "").strip())

        def _do_sign(with_timestamp: bool) -> bytes:
            ps = signers.PdfSigner(
                sig_meta,
                signer=self.signer,
                timestamper=_make_timestamper(tsa_record if with_timestamp else None),
                stamp_style=style,
                new_field_spec=SigFieldSpec(field_name, on_page=page - 1, box=box),
            )
            writer = IncrementalPdfFileWriter(io.BytesIO(pdf_bytes))
            out_buf = io.BytesIO()
            ps.sign_pdf(writer, output=out_buf)
            out_buf.seek(0)
            return out_buf.getvalue()

        try:
            signed_bytes = _do_sign(with_timestamp=True)
        except Exception as exc:  # noqa: BLE001
            if not tsa_configured:
                raise
            # TSA 不可达/超时不应让合同签不出去：退化为「无时间戳签名」，
            # 并在 meta_out 里如实标记失败原因，验签页据此标注时间戳缺失。
            logger.warning("tsa.sign_failed_fallback_no_timestamp: %s", exc)
            tsa_record = {"tsa_status": "failed", "tsa_error": str(exc)[:300]}
            signed_bytes = _do_sign(with_timestamp=False)

        if meta_out is not None:
            meta_out.update(
                {
                    "tsa_url": (settings.TSA_URL or "").strip() or None,
                    "tsa_status": tsa_record.get(
                        "tsa_status", "signed" if tsa_configured else "not_configured"
                    ),
                    "tsa_time": tsa_record.get("tsa_time"),
                    "tsa_cert_subject": tsa_record.get("tsa_cert_subject"),
                    "tsa_cert_thumbprint": tsa_record.get("tsa_cert_thumbprint"),
                    "tsa_error": tsa_record.get("tsa_error"),
                }
            )
        return signed_bytes

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

    def search_text(self, pdf_bytes: bytes, keyword: str) -> list:
        """在 PDF 中查找关键字全部出现位置，返回页面百分比坐标（对应开放签「关键字签署」）。

        返回 [{page, x, y, w, h, text}]，其中 x/y/w/h 均为 0-100 百分比
        （以该页左上角为原点、印章/签名区左上角基准）。
        """
        import fitz
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        hits = []
        try:
            for pno in range(doc.page_count):
                page = doc[pno]
                for r in page.search_for(keyword):
                    hits.append({
                        "page": pno + 1,
                        "x": round(r.x0 / page.rect.width * 100, 2),
                        "y": round(r.y0 / page.rect.height * 100, 2),
                        "w": round((r.x1 - r.x0) / page.rect.width * 100, 2),
                        "h": round((r.y1 - r.y0) / page.rect.height * 100, 2),
                        "text": keyword,
                    })
        finally:
            doc.close()
        return hits

    def verify_pdf(self, pdf_bytes: bytes) -> list:
        """校验 PDF 内嵌签名，返回每一条签名的完好性/可信性/时间戳状态。

        验签口径（三端统一按这三个字段展示）：
        - `signature_status`: `valid_trusted`（有效且可信）/ `valid_untrusted`
          （密码学有效但签发者不在信任锚内）/ `invalid`（被改动或校验失败）；
        - `signature_valid` + `signer_trusted`: 供旧调用方判断；
        - `timestamp.trusted`: 时间戳是否存在且可信（不存在时为 null）。

        信任锚同时挂：平台自签 CA（`trust_level=platform`）与 certifi 公共根
        （`trust_level=public`）。公共 TSA 的时间戳必须用**独立的**
        `ts_validation_context` 验，否则接 DigiCert 后会被误判不可信。
        """
        from pyhanko.pdf_utils.reader import PdfFileReader
        from pyhanko.sign.validation import validate_pdf_signature
        from pyhanko.sign.validation.pdf_embedded import collect_embedded_signatures
        from pyhanko_certvalidator import ValidationContext

        signer_vc = ValidationContext(trust_roots=self._signer_trust_roots())
        ts_vc = ValidationContext(trust_roots=_public_root_certs())

        rdr = PdfFileReader(io.BytesIO(pdf_bytes))
        results = []
        for sig in collect_embedded_signatures(rdr):
            try:
                r = validate_pdf_signature(
                    sig,
                    signer_validation_context=signer_vc,
                    ts_validation_context=ts_vc,
                )
            except Exception as exc:  # noqa: BLE001  单条签名异常不影响其他签名
                logger.warning("verify.signature_failed field=%s", sig.field_name, exc_info=True)
                results.append(
                    {
                        "field_name": sig.field_name,
                        "valid": 0,
                        "trusted": 0,
                        "signature_valid": False,
                        "signer_trusted": False,
                        "signature_status": "invalid",
                        "trust_anchor_id": None,
                        "trust_level": "untrusted",
                        "signed_by": None,
                        "timestamp": {
                            "present": False,
                            "valid": False,
                            "trusted": None,
                            "time": None,
                            "tsa_subject": None,
                            "error": str(exc)[:300],
                        },
                    }
                )
                continue

            anchor_id, trust_level = self._classify_trust_anchor(
                getattr(getattr(r, "validation_path", None), "trust_anchor", None)
            )
            signature_valid = bool(r.intact and r.valid)
            signer_trusted = bool(r.trusted) and signature_valid
            if signature_valid and signer_trusted:
                status = "valid_trusted"
            elif signature_valid:
                status = "valid_untrusted"
            else:
                status = "invalid"

            results.append(
                {
                    "field_name": sig.field_name,
                    "valid": int(r.intact),
                    "trusted": int(signer_trusted),
                    "signature_valid": signature_valid,
                    "signer_trusted": signer_trusted,
                    "signature_status": status,
                    "trust_anchor_id": anchor_id,
                    "trust_level": trust_level,
                    "signed_by": _human_name(getattr(r, "signing_cert", None)),
                    "timestamp": self._timestamp_summary(
                        getattr(r, "timestamp_validity", None)
                    ),
                    "identity_trust_level": (self.identity() or {}).get("trust_level"),
                }
            )
        return results

    def _signer_trust_roots(self) -> list:
        """签名者信任锚：公共根 + 平台自签 CA（采购证书后自签根仍保留，兼容存量）。"""
        roots = list(_public_root_certs())
        if self._trust_root is not None:
            roots.append(self._trust_root)
        return roots

    def _classify_trust_anchor(self, anchor) -> tuple[Optional[str], str]:
        """按实际链到的根证书路由：自签 CA → platform；公共根 → public。

        pyhanko 的 `ValidationPath.trust_anchor` 是 `CertTrustAnchor` 包装，
        真正的证书在 `.certificate`；老版本可能直接给证书对象，两种都兼容。
        """
        if anchor is None:
            return None, "untrusted"
        cert = getattr(anchor, "certificate", anchor)
        try:
            if self._self_ca_der and cert.dump() == self._self_ca_der:
                return "platform-self-signed", "platform"
        except Exception:  # noqa: BLE001
            pass
        cn = ""
        try:
            cn = cert.subject.native.get("common_name", "") or ""
        except Exception:  # noqa: BLE001
            pass
        if not cn:
            try:
                cn = cert.sha256.hex()[:16]
            except Exception:  # noqa: BLE001
                cn = "unknown-root"
        return f"public:{cn}", "public"

    @staticmethod
    def _timestamp_summary(ts_status) -> dict:
        """把 pyhanko 的 TimestampSignatureStatus 归一成三端可直接展示的结构。"""
        if ts_status is None:
            return {
                "present": False,
                "valid": False,
                "trusted": None,
                "time": None,
                "tsa_subject": None,
                "error": None,
            }
        ok = bool(getattr(ts_status, "intact", False) and getattr(ts_status, "valid", False))
        trusted = ok and bool(getattr(ts_status, "trusted", False))
        gen_time = getattr(ts_status, "timestamp", None)
        subject = None
        try:
            subject = _human_name(getattr(ts_status, "signing_cert", None))
        except Exception:  # noqa: BLE001
            subject = None
        return {
            "present": True,
            "valid": ok,
            "trusted": trusted,
            "time": gen_time.isoformat() if hasattr(gen_time, "isoformat") else None,
            "tsa_subject": subject,
            "error": None if trusted else "timestamp not anchored to a trusted root",
        }

    # ---------------- 骑缝章（仅新建合同启用） ----------------
    def apply_seam_seal(
        self,
        pdf_bytes: bytes,
        seal_png: bytes,
        *,
        ratio: float = 0.22,
        margin: float = 3.0,
    ) -> bytes:
        """给多页 PDF 的每一页右侧页缝加盖骑缝章切片，返回改写后的 PDF 字节。

        做法：圆章直径取页面短边 * ratio，按页数把圆章纵向均分为 N 条切片，
        第 i 页承载第 i 条并贴在右边缘同一垂直中心。页序决定切片位置，
        按顺序叠页即可复原完整圆章，因此「位置与页序」一一对应。

        安全约束：
        - 单页 PDF 原样返回（无页缝可骑）；
        - PDF 内已存在数字签名时原样返回——骑缝章需全量重写页面内容流，
          会破坏既有签名的 ByteRange，绝不改写已签存量合同。
        """
        import fitz
        from pyhanko.pdf_utils.reader import PdfFileReader
        from pyhanko.sign.validation.pdf_embedded import collect_embedded_signatures

        try:
            rdr = PdfFileReader(io.BytesIO(pdf_bytes))
            if any(True for _ in collect_embedded_signatures(rdr)):
                return pdf_bytes
        except Exception:  # noqa: BLE001  读不出结构的 PDF 不做骑缝章改写
            logger.warning("seam_seal.skip_unreadable_pdf", exc_info=True)
            return pdf_bytes

        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        try:
            n = doc.page_count
            if n < 2:
                return pdf_bytes
            seal = Image.open(io.BytesIO(seal_png)).convert("RGBA")
            sw, sh = seal.size
            for pno in range(n):
                page = doc[pno]
                rect = page.rect
                diameter = min(rect.width, rect.height) * ratio
                cy = rect.y0 + rect.height / 2
                x1 = rect.x1 - margin
                x0 = max(rect.x0, x1 - diameter / n)
                y0, y1 = cy - diameter / 2, cy + diameter / 2
                if x1 <= x0 or y1 <= y0:
                    continue
                # 第 pno 页取圆章的第 pno 条纵向切片（像素边界至少 1 px）
                left = round(pno * sw / n)
                right = max(left + 1, round((pno + 1) * sw / n))
                piece = seal.crop((left, 0, min(right, sw), sh))
                buf = io.BytesIO()
                piece.save(buf, "PNG")
                page.insert_image(
                    fitz.Rect(x0, y0, x1, y1), stream=buf.getvalue(), overlay=True
                )
            return doc.tobytes(garbage=0, deflate=True)
        finally:
            doc.close()

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


def _make_timestamper(record: Optional[dict] = None):
    """按配置构造 RFC 3161 时间戳客户端（`TSA_URL` 为空时返回 None＝不签时间戳）。

    默认指向 DigiCert 公共 TSA（`http://timestamp.digicert.com`），其根证书在
    certifi 公共根中，对外验签可信。商业 TSA 若需 HTTP Basic，用
    `TSA_USERNAME` / `TSA_PASSWORD` 配置。

    传入 `record` 时，把本次时间戳的签发时间、TSA 证书主体与 SHA-256 指纹
    写回字典，供 SignatureRecord 审计字段使用（不改变签名结果）。
    """
    url = (settings.TSA_URL or "").strip()
    if not url:
        return None
    try:
        from pyhanko.sign.timestamps import HTTPTimeStamper
        from pyhanko.sign.timestamps.common_utils import extract_ts_certs

        username = (settings.TSA_USERNAME or "").strip()
        password = (settings.TSA_PASSWORD or "").strip()
        auth = (username, password) if username and password else None

        class _RecordingTimeStamper(HTTPTimeStamper):
            """记录 TSA 响应的元数据；任何解析失败都不影响签名本身。"""

            async def async_timestamp(self, message_digest, md_algorithm):
                token = await super().async_timestamp(message_digest, md_algorithm)
                if record is not None:
                    try:
                        certs = list(extract_ts_certs(token, self.cert_registry))
                        gen_time = (
                            token["content"]["encap_content_info"]["content"]
                            .parsed["gen_time"]
                            .native
                        )
                        tsa_cert = next(
                            (
                                c
                                for c in certs
                                if c.key_usage_value
                                and "time_stamping" in c.key_usage_value.native
                            ),
                            certs[0] if certs else None,
                        )
                        record.update(
                            {
                                "tsa_time": gen_time.isoformat()
                                if hasattr(gen_time, "isoformat")
                                else str(gen_time),
                                "tsa_cert_subject": (
                                    tsa_cert.subject.human_friendly
                                    if tsa_cert is not None
                                    else None
                                ),
                                "tsa_cert_thumbprint": (
                                    hashlib.sha256(tsa_cert.dump()).hexdigest()
                                    if tsa_cert is not None
                                    else None
                                ),
                                "tsa_status": "signed",
                            }
                        )
                    except Exception:  # noqa: BLE001
                        logger.warning("tsa.metadata_extract_failed", exc_info=True)
                return token

        return _RecordingTimeStamper(
            url,
            https=url.lower().startswith("https://"),
            auth=auth,
        )
    except Exception:  # noqa: BLE001  依赖缺失/配置错误不应阻断签署
        logger.exception("tsa.timestamper_init_failed")
        return None


# certifi 公共根证书只解析一次：~140 张，重复解析会拖慢每次验签
_PUBLIC_ROOTS: Optional[list] = None


def _human_name(cert) -> Optional[str]:
    """证书主体转可读文本（asn1crypto 的 str() 会给出内存地址，不能直接展示）。"""
    if cert is None:
        return None
    try:
        return cert.subject.human_friendly
    except Exception:  # noqa: BLE001
        return str(getattr(cert, "subject", "")) or None


def _public_root_certs() -> list:
    """加载公共信任锚：certifi 公共根 + `EXTRA_TRUST_ROOTS_DIR` 下补充的根证书。

    certifi 不含部分服务商的旧根（例如 DigiCert Assured ID Root CA），
    而 DigiCert TSA 的响应链正落在这条根上；把这些根以 PEM/DER 放进
    `sign-engine/tsa-roots/` 即可，无需改代码（信任锚可配置）。
    """
    global _PUBLIC_ROOTS
    if _PUBLIC_ROOTS is not None:
        return _PUBLIC_ROOTS
    certs: list = []
    try:
        import certifi
        from asn1crypto import x509 as asn1_x509
        from cryptography import x509 as crypto_x509
        from cryptography.hazmat.primitives.serialization import Encoding

        pem = Path(certifi.where()).read_bytes()
        for chunk in pem.split(b"-----END CERTIFICATE-----"):
            if b"-----BEGIN CERTIFICATE-----" not in chunk:
                continue
            body = chunk.split(b"-----BEGIN CERTIFICATE-----", 1)[1]
            try:
                cert = crypto_x509.load_pem_x509_certificate(
                    body + b"-----END CERTIFICATE-----\n"
                )
                certs.append(
                    asn1_x509.Certificate.load(cert.public_bytes(Encoding.DER))
                )
            except Exception:  # noqa: BLE001
                continue
    except Exception:  # noqa: BLE001
        logger.warning("public_roots.load_failed", exc_info=True)

    certs.extend(_extra_root_certs())
    _PUBLIC_ROOTS = certs
    logger.info("public_roots.loaded count=%s", len(certs))
    return certs


def _extra_root_certs() -> list:
    """加载 `EXTRA_TRUST_ROOTS_DIR`（默认 backend/sign-engine/tsa-roots）下的根证书。"""
    from asn1crypto import x509 as asn1_x509
    from pyhanko.keys import load_certs_from_pemder_data

    configured = (getattr(settings, "EXTRA_TRUST_ROOTS_DIR", "") or "").strip()
    base = (
        Path(configured)
        if configured
        else Path(__file__).resolve().parents[2] / "sign-engine" / "tsa-roots"
    )
    if not base.exists():
        return []
    certs: list = []
    for path in sorted(base.iterdir()):
        if path.suffix.lower() not in (".pem", ".crt", ".cer", ".der"):
            continue
        try:
            raw = path.read_bytes()
            if raw.lstrip().startswith(b"-----BEGIN"):
                certs.extend(load_certs_from_pemder_data(raw))
            else:
                certs.append(asn1_x509.Certificate.load(raw))
        except Exception:  # noqa: BLE001
            logger.warning("trust_roots.load_failed path=%s", path, exc_info=True)
    if certs:
        logger.info("trust_roots.extra_loaded dir=%s count=%s", base, len(certs))
    return certs


def get_engine() -> KaifangSignEngine:
    global _ENGINE
    if _ENGINE is None:
        _ENGINE = KaifangSignEngine()
    return _ENGINE