"""上传件转 PDF（供电子签定位落章使用）。

背景：定位签署依赖 PDF 用户空间坐标，Word/Excel/图片上传件必须先转成 PDF，
否则合同只能走「无落章」的纯留痕链路（签署页看不到文档、盖不了章）。

实现选型：**Gotenberg**（https://gotenberg.dev ，Apache-2.0），独立容器跑
LibreOffice，通过 HTTP 调用；不引入 AGPL 组件，也不在应用进程里拉起 soffice。
- 未配置 `GOTENBERG_URL` → 转换能力关闭（返回明确错误，上传仍成功、仅降级）；
- 配置了但调用失败/超时 → 抛 `PdfConversionError`，由调用方决定降级与提示。

图片（jpg/png/webp/gif）不依赖 Gotenberg，直接用 reportlab 包成单页 PDF
（项目已依赖 reportlab），避免为图片也强依赖外部服务。
"""
from __future__ import annotations

import io
import logging
from pathlib import Path

import httpx
from reportlab.lib.pagesizes import A4
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

from app.config import settings

logger = logging.getLogger(__name__)

# LibreOffice 可转换的格式（与上传白名单对齐）
LIBREOFFICE_EXTS = {".doc", ".docx", ".xls", ".xlsx"}
IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}


class PdfConversionError(RuntimeError):
    """转换失败。`code` 供接口/前端区分「未启用」与「转换出错」。"""

    def __init__(self, code: str, message: str = ""):
        super().__init__(message or code)
        self.code = code


def is_enabled() -> bool:
    """是否已配置 Gotenberg（图片转 PDF 不依赖它）。"""
    return bool((settings.GOTENBERG_URL or "").strip())


def image_to_pdf(data: bytes) -> bytes:
    """把单张图片按 A4 等比居中排成一页 PDF。"""
    try:
        img = ImageReader(io.BytesIO(data))
        iw, ih = img.getSize()
    except Exception as exc:  # noqa: BLE001  损坏/不支持的图片
        raise PdfConversionError("PDF_CONVERT_UNSUPPORTED", str(exc))
    if not iw or not ih:
        raise PdfConversionError("PDF_CONVERT_UNSUPPORTED", "empty image")

    buf = io.BytesIO()
    page_w, page_h = A4
    margin = 24
    scale = min((page_w - margin * 2) / iw, (page_h - margin * 2) / ih)
    w, h = iw * scale, ih * scale
    c = canvas.Canvas(buf, pagesize=A4)
    c.drawImage(img, (page_w - w) / 2, (page_h - h) / 2, width=w, height=h)
    c.showPage()
    c.save()
    return buf.getvalue()


def convert_to_pdf(source: Path, filename: str | None = None) -> bytes:
    """把上传件转为 PDF 字节。

    - pdf 原样返回；
    - 图片走本地 reportlab；
    - doc/docx/xls/xlsx 走 Gotenberg（未配置则 `PDF_CONVERT_DISABLED`）。
    """
    suffix = source.suffix.lower()
    if suffix == ".pdf":
        return source.read_bytes()
    if suffix in IMAGE_EXTS:
        return image_to_pdf(source.read_bytes())
    if suffix not in LIBREOFFICE_EXTS:
        raise PdfConversionError("PDF_CONVERT_UNSUPPORTED", f"unsupported: {suffix}")

    base = (settings.GOTENBERG_URL or "").strip().rstrip("/")
    if not base:
        raise PdfConversionError(
            "PDF_CONVERT_DISABLED",
            "GOTENBERG_URL 未配置，Word/Excel 上传件不会转 PDF",
        )

    name = filename or source.name
    try:
        with httpx.Client(timeout=settings.GOTENBERG_TIMEOUT_SECONDS) as client:
            resp = client.post(
                f"{base}/forms/libreoffice/convert",
                files={"files": (name, source.read_bytes())},
            )
        resp.raise_for_status()
    except Exception as exc:  # noqa: BLE001  网络/对端错误统一转可见错误
        logger.warning("pdf_convert.gotenberg_failed", exc_info=True)
        raise PdfConversionError("PDF_CONVERT_FAILED", str(exc))

    data = resp.content
    if not data.startswith(b"%PDF-"):
        raise PdfConversionError("PDF_CONVERT_FAILED", "not a PDF response")
    return data
