"""add payment/notification query indexes

新增高频查询索引：
- payments.payer_id    ：我的账单列表（/payments/me 按付款人过滤）
- payments.due_date    ：租金到期提醒天扫（due_date 范围 + status + payment_type）
- notifications.related_entity_id ：提醒/支付关闭通知的幂等去重查询

Revision ID: 0002
Revises: 0001
Create Date: 2026-09-13
"""
from alembic import op

# revision identifiers
revision = '0002'
down_revision = '0001'
branch_labels = None
depends_on = None


def upgrade():
    op.create_index("ix_payments_payer_id", "payments", ["payer_id"])
    op.create_index("ix_payments_due_date", "payments", ["due_date"])
    op.create_index(
        "ix_notifications_related_entity_id", "notifications", ["related_entity_id"]
    )


def downgrade():
    op.drop_index("ix_notifications_related_entity_id", table_name="notifications")
    op.drop_index("ix_payments_due_date", table_name="payments")
    op.drop_index("ix_payments_payer_id", table_name="payments")