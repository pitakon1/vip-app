import { useEffect, useRef, useState } from 'react';
import { useAuthStore } from '@/stores/auth';
import { ownerApi, leasesApi } from '@/services/api';

type Bool = boolean | undefined; // undefined = 加载中/未确认

export interface UserCapabilities {
  /** 名下是否有房源（业主身份的数据依据；undefined 表示加载中/接口未返回） */
  hasProperty: Bool;
  /** 是否有生效租约（租客身份的数据依据） */
  hasActiveLease: Bool;
  /** 业主能力：名下有房源，或角色本身是 owner（兜底） */
  canManageProperty: boolean;
  /** 租客能力：有生效租约，或角色本身是 tenant（兜底） */
  isActiveTenant: boolean;
  /** 能力是否仍未确认（加载中） */
  loading: boolean;
}

/**
 * 用户能力探测（数据驱动，替代单一 role 互斥判断）。
 * 一个用户可能「既是业主又是租客」（名下有房 + 同时也在租），
 * 因此不依赖单一 role 的二选一，而是并行拉取：
 *  - ownerApi.properties() 非空 → 业主能力
 *  - leasesApi.mine() 存在 active 租约 → 租客能力
 * 接口失败/未返回时静默降级为按 role 兜底，避免把已有能力误伤成隐藏。
 */
export function useUserCapabilities(): UserCapabilities {
  const role = useAuthStore((s) => s.user?.role);
  const [cap, setCap] = useState<{ hasProperty: Bool; hasActiveLease: Bool }>({
    hasProperty: undefined,
    hasActiveLease: undefined,
  });
  const fired = useRef(false);

  useEffect(() => {
    if (!role || fired.current) return;
    fired.current = true;
    let alive = true;

    Promise.allSettled([ownerApi.properties(), leasesApi.mine()]).then(([pRes, lRes]) => {
      if (!alive) return;

      let hasProperty: Bool;
      if (pRes.status === 'fulfilled') {
        const d: any = pRes.value?.data;
        const items = Array.isArray(d) ? d : d?.items ?? d?.data ?? [];
        hasProperty = items.length > 0;
      } else {
        hasProperty = role === 'owner'; // 接口失败按角色兜底
      }

      let hasActiveLease: Bool;
      if (lRes.status === 'fulfilled') {
        const d: any = lRes.value?.data;
        const list = Array.isArray(d) ? d : d?.items ?? [];
        hasActiveLease = list.some((x: any) => x?.status === 'active');
      } else {
        hasActiveLease = role === 'tenant'; // 失败兜底
      }

      setCap({ hasProperty, hasActiveLease });
    });

    return () => {
      alive = false;
    };
  }, [role]);

  const canManageProperty = cap.hasProperty === true || role === 'owner';
  const isActiveTenant = cap.hasActiveLease === true || role === 'tenant';

  return { ...cap, canManageProperty, isActiveTenant, loading: !role || (cap.hasProperty === undefined && cap.hasActiveLease === undefined) };
}