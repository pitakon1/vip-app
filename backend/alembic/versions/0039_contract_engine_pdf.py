"""引擎签署：contracts 新增 pdf_path 与 signed_pdf_path

- `pdf_path`：kaifangqian->Python 引擎生成的合同 PDF（可签署原件）。
- `signed_pdf_path`：引擎完成定位签署后的 PDF 存档（含内嵌数字签名）。

列先探测再执行，可重复运行；全新库在 0001 的 create_all 时随模型自动建出。

Revision ID: 0039
Revises: 0038
Create Date: 2026-10-08
"""
import sqlalchemy as sa
from alembic import op

# revision identifiers
revision = "0039"
down_revision = "0038"
branch_labels = None
depends_on = None


def _tables(bind) -> set:
    return set(sa.inspect(bind).get_table_names())


def _columns(bind, table) -> set:
    return {c["name"] for c in sa.inspect(bind).get_columns(table)}


def upgrade():
    bind = op.get_bind()
    if "contracts" in _tables(bind):
        cols = _columns(bind, "contracts")
        with op.batch_alter_table("contracts") as batch:
            if "pdf_path" not in cols:
                batch.add_column(sa.Column("pdf_path", sa.String(512), nullable=True))
            if "signed_pdf_path" not in cols:
                batch.add_column(
                    sa.Column("signed_pdf_path", sa.String(512), nullable=True)
                )


def downgrade():
    bind = op.get_bind()
    if "contracts" in _tables(bind):
        cols = _columns(bind, "contracts")
        with op.batch_alter_table("contracts") as batch:
            if "signed_pdf_path" in cols:
                batch.drop_column("signed_pdf_path")
            if "pdf_path" in cols:
                batch.drop_column("pdf_path")