"""实名认证（证件上传 + 人工审核）过渡方案。

不做人脸识别、不接第三方核验通道：用户上传证件照片，运营在后台人工核验后
置「通过 / 驳回」，驳回必须写原因。证件图片落在 `uploads/identity`，**不做静态
托管**，只能由鉴权接口按「本人或管理员」读取。

设计取舍：
- 允许历史多次提交（驳回后可重交），以 `submitted_at` 最新一条为当前状态；
- 通过后同时置 `User.is_verified = True`，复用现有「已验证」口径；
- PDPA 同意单独写入 `pdpa_consents`（purpose=`identity_verification`），
  记录同意时间与政策版本，便于数据主体查询与审计。
"""
import uuid
from datetime import datetime
from enum import Enum
from typing import Optional

from sqlmodel import Field

from .base import TimestampMixin


class IdentityDocType(str, Enum):
    """证件类型。"""

    passport = "passport"            # 护照
    national_id = "national_id"      # 身份证 / 泰籍身份证
    driver_license = "driver_license"  # 驾照


class IdentityReviewStatus(str, Enum):
    """人工审核状态。"""

    pending = "pending"
    approved = "approved"
    rejected = "rejected"


class IdentityVerification(TimestampMixin, table=True):
    """实名认证提交记录（一次提交一条，驳回后可重新提交）。"""

    __tablename__ = "identity_verifications"

    user_id: uuid.UUID = Field(foreign_key="users.id", index=True)
    doc_type: IdentityDocType = Field(
        default=IdentityDocType.passport, index=True, description="证件类型"
    )
    real_name: str = Field(max_length=100, description="证件上的姓名")
    id_number: Optional[str] = Field(
        default=None, max_length=64, description="证件号码（展示时脱敏）"
    )
    # 落库的是站内私有路径 `/identity-files/xxx`，不是可公开访问的 URL
    front_file_url: str = Field(max_length=255, description="证件正面/资料页")
    back_file_url: Optional[str] = Field(
        default=None, max_length=255, description="证件反面（护照可空）"
    )
    status: IdentityReviewStatus = Field(
        default=IdentityReviewStatus.pending, index=True
    )
    rejection_reason: Optional[str] = Field(default=None, max_length=500)
    reviewed_by_user_id: Optional[uuid.UUID] = Field(
        default=None, foreign_key="users.id", index=True
    )
    reviewed_at: Optional[datetime] = Field(default=None, index=True)
    submitted_at: datetime = Field(default_factory=datetime.utcnow, index=True)
    consent_granted_at: datetime = Field(default_factory=datetime.utcnow)
    consent_policy_version: str = Field(default="2026-11", max_length=32)
