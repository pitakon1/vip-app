"""CSV 导出渲染：统一返回带 UTF-8 BOM 的附件响应，Excel 双击不乱码。"""
import csv
import io
from typing import Sequence

from fastapi.responses import Response


def csv_response(
    header: Sequence[str], rows: Sequence[Sequence], filename: str
) -> Response:
    """把行数据渲染成 CSV 附件响应（带 BOM，Excel 打开不乱码）。"""
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(header)
    writer.writerows(rows)
    content = ("\ufeff" + buffer.getvalue()).encode("utf-8")
    return Response(
        content=content,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
