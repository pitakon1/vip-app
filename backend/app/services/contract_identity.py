"""合同签署方身份解析（历史合同回填租约用）。

历史合同表不存 `owner_id`，业主归属只能靠 `lease_id → leases.owner_id` 派生，
或「业主本人就是签署方」。早期合同没有挂租约，且合作方手工录入的签署方经常
没有绑定 `user_id`，只留下姓名/手机/邮箱，手输内容还可能带全角字符、空格、
`+86` 国家码或大小写混写。本模块把「签署方 → 平台用户 → 业主/租客档案」
这一步单独抽出来，供回填脚本与后续复用。

标准流程（landlord / tenant 每一方独立解析，互不影响）：

1. `party.user_id` 存在 → 直接查 `users`；
2. 否则用归一化手机号唯一命中 `is_active` 用户；
3. 否则用归一化邮箱唯一命中；
4. 姓名**绝不用于认定**：同名的人/公司很常见，命中后只把库里的同名用户
   放进 `candidate_user_ids` 供人工核对，甚至唯一命中也不写 `user_id`；
   唯一命中标 `name_only`，多人同名标 `identity_ambiguous`；
5. 任何两个可用信号（`user_id` / `phone` / `email`）指向不同用户 →
   `identity_conflict`；
6. 同一信号命中多个用户 → `identity_ambiguous`；
7. 命中用户 `is_active=False` → `identity_inactive`；
8. 命中用户没有对应档案（业主查 `Owner.user_id`，租客查 `Tenant.user_id`，
   均排除软删除）→ `no_profile`；
9. 没有任何可用信号 → `no_identity`。

命中档案后由调用方拿 `owner_ids` / `tenant_ids` 去选租约；本模块只做身份解析，
不做租约选择。

手工录入数据的归一化规则：
- 文本先 `NFKC`（全角转半角）再 `strip`；
- 邮箱：去首尾空格、转小写；含 `*` 视为脱敏不可用，必须含 `@`；
- 手机号：只保留数字，去掉 `00` 国际前缀与 `86` 国家码、一个前导 `0`，
  长度 7~15 才有效；含 `*` 视为脱敏不可用；
- 姓名：去所有空白、去掉末尾「先生/女士/小姐/老师」，英文按 `casefold`
  比较（不参与自动认定，只用于 `name_only` 标记）。
"""
import re
import unicodedata
import uuid
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Set

from sqlmodel import Session, select

from app.models import Contract, ContractParty, Owner, SignerRole, Tenant, User

# 每个签署方的解析结论
MATCHED = "matched"
NO_IDENTITY = "no_identity"
NAME_ONLY = "name_only"
IDENTITY_CONFLICT = "identity_conflict"
IDENTITY_AMBIGUOUS = "identity_ambiguous"
IDENTITY_INACTIVE = "identity_inactive"
NO_PROFILE = "no_profile"

# 一个合同里多个签署方结论不同时，报告取最需要人工关注的那一条
_REASON_PRIORITY = {
    IDENTITY_CONFLICT: 0,
    IDENTITY_AMBIGUOUS: 1,
    IDENTITY_INACTIVE: 2,
    NAME_ONLY: 3,
    NO_PROFILE: 4,
    NO_IDENTITY: 5,
}

_NAME_SUFFIXES = ("先生", "女士", "小姐", "老师")
_WHITESPACE_RE = re.compile(r"\s+")
_NON_DIGIT_RE = re.compile(r"\D")


def normalize_text(value: Optional[str]) -> str:
    """全角转半角并去掉首尾空白。"""
    if not value:
        return ""
    return unicodedata.normalize("NFKC", value).strip()


def normalize_email(value: Optional[str]) -> Optional[str]:
    """邮箱归一化：去首尾空格、转小写；脱敏或缺少 `@` 视为不可用。"""
    text = normalize_text(value).lower()
    if not text or "*" in text or "@" not in text:
        return None
    return text


def normalize_phone(value: Optional[str]) -> Optional[str]:
    """手机号归一化：只留数字，去掉 `00` / `86` 前缀与一个前导 `0`。

    脱敏号码（含 `*`）与长度不在 7~15 的号码视为不可用，返回 `None`。
    """
    text = normalize_text(value)
    if not text or "*" in text:
        return None
    digits = _NON_DIGIT_RE.sub("", text)
    if digits.startswith("00"):
        digits = digits[2:]
    # +86 138-0000-0000 → 8613800000000 → 13800000000
    if digits.startswith("86") and len(digits) >= 12:
        digits = digits[2:]
    if len(digits) == 11 and digits.startswith("0"):
        digits = digits[1:]
    if not 7 <= len(digits) <= 15:
        return None
    return digits


def normalize_name(value: Optional[str]) -> str:
    """姓名归一化：去所有空白、去称谓后缀，英文按 casefold 比较。"""
    text = _WHITESPACE_RE.sub("", normalize_text(value))
    for suffix in _NAME_SUFFIXES:
        if text.endswith(suffix) and len(text) > len(suffix):
            text = text[: -len(suffix)]
            break
    return text.casefold()


@dataclass
class PartyIdentity:
    """单个签署方的解析结果。"""

    party_id: Optional[uuid.UUID]
    role: SignerRole
    reason: str
    user_id: Optional[uuid.UUID] = None
    profile_ids: Set[uuid.UUID] = field(default_factory=set)
    # 未认定时供人工核对的候选用户；`user_id` 只在 `matched` /
    # `identity_inactive` / `no_profile` 这类「已确定是某个人」的情况下才有值
    candidate_user_ids: Set[uuid.UUID] = field(default_factory=set)

    def as_reason(self) -> dict:
        """报表用的一条记录（每个签署方一条）。"""
        role = self.role.value if isinstance(self.role, SignerRole) else str(self.role)
        return {
            "party_id": str(self.party_id),
            "role": role,
            "reason": self.reason,
            "user_id": str(self.user_id) if self.user_id else None,
            "profile_ids": sorted(str(x) for x in self.profile_ids),
            "candidate_user_ids": sorted(str(x) for x in self.candidate_user_ids),
        }


@dataclass
class ContractIdentity:
    """一份合同的签署方身份解析结果。"""

    owner_ids: Set[uuid.UUID] = field(default_factory=set)
    tenant_ids: Set[uuid.UUID] = field(default_factory=set)
    parties: List[PartyIdentity] = field(default_factory=list)

    @property
    def reasons(self) -> List[dict]:
        """每个签署方一条解析结论，便于统计与人工核对报表。"""
        return [party.as_reason() for party in self.parties]

    @property
    def unresolved_reason(self) -> Optional[str]:
        """需要人工核对时返回合同级原因；可安全自动回填时返回 `None`。

        任一业主/租客签署方未解析出档案（含仅姓名、冲突、多义、停用、无档案）
        都不自动回填——错挂租约比不挂更糟。
        """
        if not self.parties:
            return NO_IDENTITY
        blocking = [
            party.reason for party in self.parties if party.reason != MATCHED
        ]
        if blocking:
            return min(blocking, key=lambda r: _REASON_PRIORITY.get(r, 99))
        if not self.owner_ids and not self.tenant_ids:
            return NO_IDENTITY
        return None


class ContractIdentityResolver:
    """签署方身份解析器。

    用户索引按实例懒加载一次，批量回填同一会话里应复用同一个实例，避免
    每份合同都全量扫描 `users`。索引同时兼容库内手机号/邮箱自身的手输格式。
    """

    def __init__(self, session: Session):
        self.session = session
        self._loaded = False
        self._by_id: Dict[uuid.UUID, User] = {}
        self._by_phone: Dict[str, List[User]] = {}
        self._by_email: Dict[str, List[User]] = {}
        self._by_name: Dict[str, List[User]] = {}

    def _ensure_indexes(self) -> None:
        if self._loaded:
            return
        for user in self.session.exec(select(User)).all():
            self._by_id[user.id] = user
            phone = normalize_phone(user.phone)
            if phone:
                self._by_phone.setdefault(phone, []).append(user)
            email = normalize_email(user.email)
            if email:
                self._by_email.setdefault(email, []).append(user)
            name = normalize_name(user.full_name)
            if name:
                self._by_name.setdefault(name, []).append(user)
        self._loaded = True

    def resolve(self, contract: Contract) -> ContractIdentity:
        """解析一份合同的全部业主/租客签署方。"""
        self._ensure_indexes()
        parties = self.session.exec(
            select(ContractParty).where(ContractParty.contract_id == contract.id)
        ).all()

        result = ContractIdentity()
        for party in parties:
            if party.role not in (SignerRole.landlord, SignerRole.tenant):
                continue
            identity = self._resolve_party(party)
            result.parties.append(identity)
            if identity.reason != MATCHED:
                continue
            if party.role == SignerRole.landlord:
                result.owner_ids |= identity.profile_ids
            else:
                result.tenant_ids |= identity.profile_ids
        return result

    def _resolve_party(self, party: ContractParty) -> PartyIdentity:
        return self._resolve_fields(
            role=party.role,
            user_id=party.user_id,
            name=party.name,
            phone=party.phone,
            email=party.email,
            party_id=party.id,
        )

    def resolve_party_user(
        self,
        *,
        role: SignerRole,
        user_id: Optional[uuid.UUID] = None,
        name: Optional[str] = None,
        phone: Optional[str] = None,
        email: Optional[str] = None,
    ) -> PartyIdentity:
        """新增签署方时解析平台用户（`POST /contracts/{id}/parties` 复用）。

        与回填的区别：这里只要求「唯一有效用户」，**不要求**业主/租客档案——
        没有档案的用户同样应能绑定 `user_id`（否则「我的合同」看不到、也签不了）。
        姓名依旧只标记不自动认定。
        """
        return self._resolve_fields(
            role=role,
            user_id=user_id,
            name=name,
            phone=phone,
            email=email,
            require_profile=False,
        )

    def _resolve_fields(
        self,
        *,
        role: SignerRole,
        user_id: Optional[uuid.UUID],
        name: Optional[str],
        phone: Optional[str],
        email: Optional[str],
        party_id: Optional[uuid.UUID] = None,
        require_profile: bool = True,
    ) -> PartyIdentity:
        self._ensure_indexes()
        base = {"party_id": party_id, "role": role}

        # 收集每个可用信号的命中用户（未命中返回空列表，不参与冲突判断）
        signals: Dict[str, List[User]] = {}
        if user_id:
            direct = self._by_id.get(user_id)
            signals["user_id"] = [direct] if direct else []
        normalized_phone = normalize_phone(phone)
        if normalized_phone:
            signals["phone"] = self._by_phone.get(normalized_phone, [])
        normalized_email = normalize_email(email)
        if normalized_email:
            signals["email"] = self._by_email.get(normalized_email, [])

        # 同一信号命中多人：无法判断是哪一位（同名/共用手机号常见于合作方录入）
        if any(len(users) > 1 for users in signals.values()):
            return PartyIdentity(
                reason=IDENTITY_AMBIGUOUS,
                candidate_user_ids={
                    user.id for users in signals.values() for user in users
                },
                **base,
            )

        matched = {user.id: user for users in signals.values() for user in users}
        # 不同信号指向不同用户：数据自相矛盾，交人工核对
        if len(matched) > 1:
            return PartyIdentity(
                reason=IDENTITY_CONFLICT,
                candidate_user_ids=set(matched),
                **base,
            )

        if not matched:
            return self._resolve_by_name(name, base)

        user = next(iter(matched.values()))
        if not user.is_active:
            return PartyIdentity(
                reason=IDENTITY_INACTIVE, user_id=user.id, **base
            )

        if not require_profile:
            return PartyIdentity(reason=MATCHED, user_id=user.id, **base)

        profile_ids = self._profiles_for(role, user.id)
        if not profile_ids:
            return PartyIdentity(reason=NO_PROFILE, user_id=user.id, **base)
        return PartyIdentity(
            reason=MATCHED, user_id=user.id, profile_ids=profile_ids, **base
        )

    def _resolve_by_name(
        self, name: Optional[str], base: dict
    ) -> PartyIdentity:
        """姓名只产出候选，绝不认定。

        同名的自然人/公司在库里很常见，唯一命中也不代表就是同一个人
        （可能是同名不同人）。所以这里只返回 `candidate_user_ids` 供人工
        核对，不写 `user_id`，避免上游或报表把它当成已绑定。
        """
        normalized = normalize_name(name)
        hits = self._by_name.get(normalized, []) if normalized else []
        if not hits:
            return PartyIdentity(reason=NO_IDENTITY, **base)
        if len(hits) > 1:
            return PartyIdentity(
                reason=IDENTITY_AMBIGUOUS,
                candidate_user_ids={user.id for user in hits},
                **base,
            )
        return PartyIdentity(
            reason=NAME_ONLY, candidate_user_ids={hits[0].id}, **base
        )

    def _profiles_for(
        self, role: SignerRole, user_id: uuid.UUID
    ) -> Set[uuid.UUID]:
        """按角色查档案主键，排除软删除档案。"""
        model = Owner if role == SignerRole.landlord else Tenant
        rows = self.session.exec(
            select(model.id).where(
                model.user_id == user_id, model.deleted_at.is_(None)
            )
        ).all()
        return set(rows)


def resolve_contract_identity(
    session: Session, contract: Contract
) -> ContractIdentity:
    """一次性解析（每次重建用户索引）；批量场景请复用 `ContractIdentityResolver`。"""
    return ContractIdentityResolver(session).resolve(contract)
