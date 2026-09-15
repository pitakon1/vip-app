"""上传文件内容校验（魔数嗅探）。

仅凭扩展名判断类型并不可靠：把脚本/HTML（如 `.svg`、`.php`、`.html`）改名为
`.jpg` 即可绕过扩展名白名单。上传目录由静态服务直接托管，一旦落盘可访问就存在
存储型 XSS / 内容嗅探风险，故补一层「文件内容必须真的是图片」的校验。

用法（UploadFile 支持 seek，读完头部字节后需 seek(0) 复位再落盘）::

    head = await file.read(16)
    file.file.seek(0)
    if detect_image_mime(head) is None:
        raise HTTPException(400, "...")
"""
from typing import Optional

# 头部签名 -> MIME（WebP 需额外看第 8-12 字节，单独处理）
_SIGNATURES: tuple[tuple[str, tuple[bytes, ...]], ...] = (
    ("image/jpeg", (b"\xff\xd8\xff",)),
    ("image/png", (b"\x89PNG\r\n\x1a\n",)),
    ("image/gif", (b"GIF87a", b"GIF89a")),
    ("image/bmp", (b"BM",)),
)

# 读取头部字节数：WebP 的 "WEBP" 标识落在第 8-12 字节
HEAD_BYTES = 16

# 文档中心允许的内容类型（同样按文件头嗅探，扩展名可伪造）。
# docx/xlsx/pptx 与 doc/xls/ppt 只能识别到「容器」层（新版是 zip、旧版是 OLE），
# 精确 MIME 交给扩展名，魔数只负责挡住「改名伪装」。
_DOCUMENT_SIGNATURES: tuple[tuple[str, tuple[bytes, ...]], ...] = (
    ("application/pdf", (b"%PDF-",)),
    ("application/x-ole-storage", (b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1",)),
    ("application/zip", (b"PK\x03\x04",)),
    ("image/jpeg", (b"\xff\xd8\xff",)),
    ("image/png", (b"\x89PNG\r\n\x1a\n",)),
    ("image/gif", (b"GIF87a", b"GIF89a")),
    ("image/bmp", (b"BM",)),
)


def detect_document_mime(head: bytes) -> Optional[str]:
    """根据文件头返回文档容器类型；无法识别时返回 None。

    与 `detect_image_mime` 分开写：文档中心还要收 PDF / Word / Excel，
    这些格式既不能只信扩展名，也无法只靠文件头拿到精确 MIME。
    """
    if not head:
        return None
    for mime, prefixes in _DOCUMENT_SIGNATURES:
        if any(head.startswith(prefix) for prefix in prefixes):
            return mime
    # WebP: RIFF....WEBP
    if head.startswith(b"RIFF") and head[8:12] == b"WEBP":
        return "image/webp"
    return None


def detect_image_mime(head: bytes) -> Optional[str]:
    """根据文件头返回图片 MIME；无法识别为图片时返回 None。"""
    if not head:
        return None
    for mime, prefixes in _SIGNATURES:
        if any(head.startswith(prefix) for prefix in prefixes):
            return mime
    # WebP: RIFF....WEBP
    if head.startswith(b"RIFF") and head[8:12] == b"WEBP":
        return "image/webp"
    return None