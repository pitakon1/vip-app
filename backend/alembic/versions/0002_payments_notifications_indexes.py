"""add payment/notification query indexes

新增高频查询索引：
- payments.payer_id    ：我的账单列表（/payments/me 按付款人过滤）
- payments.due_date    ：租金到期提醒天扫（due_date 范围 + status + payment_type）
- notifications.related_entity_id ：提醒/支付关闭通知的幂等去重查询

注意：这三个字段在模型里已标 `index=True`，`0001` 的 `create_all` 建表时会
顺带建出同名索引（`ix_<表>_<列>`）。本迁移是为「模型加索引之前就已存在的老表」
补索引，因此必须先探测索引是否已存在，否则在全新库上会 duplicate index 报错。

Revision ID: 0002
Revises: 0001
Create Date: 2026-09-13
"""
import sqlalchemy as sa
from alembic import op

# revision identifiers
revision = '0002'
down_revision = '0001'
branch_labels = None
depends_on = None

# (索引名, 表名, 列名)
_INDEXES = (
    ("ix_payments_payer_id", "payments", "payer_id"),
    ("ix_payments_due_date", "payments", "due_date"),
    ("ix_notifications_related_entity_id", "notifications", "related_entity_id"),
)


def upgrade():
    inspector = sa.inspect(op.get_bind())
    existing_tables = set(inspector.get_table_names())
    for index_name, table_name, column in _INDEXES:
        if table_name not in existing_tables:
            continue
        if index_name in {idx["name"] for idx in inspector.get_indexes(table_name)}:
            continue
        op.create_index(index_name, table_name, [column])


def downgrade():
    inspector = sa.inspect(op.get_bind())
    existing_tables = set(inspector.get_table_names())
    for index_name, table_name, _ in reversed(_INDEXES):
        if table_name not in existing_tables:
            continue
        if index_name in {idx["name"] for idx in inspector.get_indexes(table_name)}:
            op.drop_index(index_name, table_name=table_name)