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
import os
import secrets
from pathlib import Path
from typing import Any, Callable, Optional

from fastapi import HTTPException
from fastapi import UploadFile

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


def save_upload(
    upload: UploadFile,
    upload_dir: Path,
    max_size: int,
    allowed_exts: set[str],
    allowed_mimes: Optional[dict[str, set[str]]],
    *,
    detector: Callable[[bytes], Optional[str]] = detect_document_mime,
    name_prefix: str = "upload",
    url_prefix: str = "/uploads/",
    label: str = "file",
    supported_text: str = "",
    invalid_content_message: Optional[str] = None,
    digest: Optional[Any] = None,
) -> str:
    """统一的上传落盘链：扩展名白名单 → 文件头魔数 → 体积上限 → 随机文件名 → chunk 写盘 → 失败清理。

    - allowed_exts: 允许的扩展名集合（小写带点，如 {".jpg", ".png"}）
    - allowed_mimes: 扩展名 -> 允许的魔数识别 MIME 集合；为 None 时只要求魔数可识别（非 None）
    - detector: 读文件头判断 MIME 的函数（detect_document_mime / detect_image_mime）
    - digest: 传入 hashlib 对象时在写盘过程中同步计算（避免二次读盘）
    - 返回可供落库的站内 URL（url_prefix + 服务端生成的文件名），文件名不采用客户端
      文件名，避免路径穿越与覆盖。
    """
    original_name = upload.filename or label
    ext = os.path.splitext(original_name)[1].lower()
    if ext not in allowed_exts:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported {label} type: {ext or 'none'}{supported_text}",
        )
    head = upload.file.read(HEAD_BYTES)
    upload.file.seek(0)
    detected = detector(head)
    if allowed_mimes is None:
        if detected is None:
            raise HTTPException(
                status_code=400,
                detail=invalid_content_message
                or f"File content is not a valid {label}: {original_name}",
            )
    elif detected not in allowed_mimes.get(ext, ()):
        raise HTTPException(
            status_code=400,
            detail=f"File content does not match its extension: {original_name}",
        )

    upload_dir.mkdir(parents=True, exist_ok=True)
    filename = f"{name_prefix}_{secrets.token_hex(16)}{ext}"
    dest = upload_dir / filename
    size = 0
    try:
        with dest.open("wb") as buffer:
            while True:
                chunk = upload.file.read(1024 * 1024)
                if not chunk:
                    break
                size += len(chunk)
                if size > max_size:
                    raise HTTPException(
                        status_code=400,
                        detail=f"File too large (max {max_size // (1024 * 1024)}MB)",
                    )
                if digest is not None:
                    digest.update(chunk)
                buffer.write(chunk)
    except HTTPException:
        dest.unlink(missing_ok=True)
        raise
    except Exception:
        dest.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail=f"Failed to save {label}")
    return f"{url_prefix}{filename}"


def validate_internal_url(value: str, url_prefix: str, url_name: str = "file_url") -> str:
    """校验入库的站内文件 URL：只接受服务端生成的 {url_prefix} 路径。

    防止库里被写进外部地址后，被下载接口当作开放重定向目标。
    """
    value = (value or "").strip()
    if "://" in value or not value.startswith(url_prefix):
        raise HTTPException(
            status_code=400,
            detail=f"{url_name} must be an internal {url_prefix} path",
        )
    name = value[len(url_prefix):]
    if not name or "/" in name or "\\" in name or name in {".", ".."}:
        raise HTTPException(
            status_code=400, detail=f"{url_name} must not contain directory traversal"
        )
    return value


def resolve_stored_path(
    value: str,
    base_dir: Path,
    url_prefix: str,
    url_name: str = "file_url",
    not_found_message: str = "File not found on disk",
) -> Path:
    """把落库的站内文件 URL 反解为磁盘路径，并确保不逃出 base_dir。"""
    url = validate_internal_url(value, url_prefix, url_name)
    path = (base_dir / url[len(url_prefix):]).resolve()
    if base_dir.resolve() not in path.parents or not path.is_file():
        raise HTTPException(status_code=404, detail=not_found_message)
    return path