/**
 * 角色菜单单一配置源（Web 端）。
 *
 * 侧边栏分组菜单与移动端底部 Tab 均从此配置派生，避免各端重复书写角色分支。
 * 数据形状（与 mobile-app / miniapp 的角色菜单配置保持同一语义）：
 *   - ROLE_SECTIONS: 角色 -> 分组菜单（sidebar 使用，含分组标签）
 *   - ROLE_MOBILE_KEYS: 角色 -> 底部 Tab 展示的 key 白名单（mobile 以此从全量菜单抽取）
 *
 * 字段说明：
 *   labelKey       侧边栏展示文案的 i18n key（menu.*）
 *   mobileLabelKey 底部 Tab 展示文案的 i18n key（portal.*，消费端文案与原形态一致，缺省回落 labelKey）
 *   icon           栅格 SVG path 的 d
 *   key            路由路径（移动端底部 Tab 也复用同一 key 判断选中态）
 */

export interface RoleMenuItem {
  /** 路由路径；移动端底部 Tab 复用同一 key 用于选中态判断 */
  key: string
  /** 侧边栏文案 i18n key（menu.*） */
  labelKey: string
  /** 底部 Tab 文案 i18n key（portal.*），缺省回落 labelKey */
  mobileLabelKey?: string
  /** 栅格 SVG path 的 d */
  icon: string
}

export interface RoleMenuSection {
  /** 分组标签 i18n key（menu.section.*），仅侧边栏渲染 */
  labelKey?: string
  items: RoleMenuItem[]
}

/** 消费端文案与侧边栏不一致时的回落：默认复用侧边栏 key */
export const resolveLabelKey = (item: RoleMenuItem) => item.mobileLabelKey ?? item.labelKey

export const ROLE_SECTIONS: Record<string, RoleMenuSection[]> = {
  owner: [
    {
      labelKey: 'menu.section.overview',
      items: [
        {
          key: '/owner/dashboard',
          labelKey: 'menu.myHome',
          mobileLabelKey: 'portal.home',
          icon: 'M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z',
        },
      ],
    },
    {
      labelKey: 'menu.section.assetManagement',
      items: [
        {
          key: '/owner/properties',
          labelKey: 'menu.myProperties',
          icon: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M9 22 9 12 15 12 15 22',
        },
        {
          key: '/publish-listing',
          labelKey: 'menu.publishListing',
          icon: 'M12 5v14M5 12h14',
        },
        {
          key: '/my-listings',
          labelKey: 'menu.myListings',
          icon: 'M3 3h7v7H3z M14 3h7v7h-7z M14 14h7v7h-7z M3 14h7v7H3z',
        },
        {
          key: '/owner/marketing',
          labelKey: 'menu.marketing',
          mobileLabelKey: 'portal.marketing',
          icon: 'M3 11v2a1 1 0 0 0 1 1h2l4 4V6L6 10H4a1 1 0 0 0-1 1z M14 8a4 4 0 0 1 0 8',
        },
        {
          key: '/owner/income',
          labelKey: 'menu.income',
          mobileLabelKey: 'portal.income',
          icon: 'M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6',
        },
        {
          key: '/owner/documents',
          labelKey: 'menu.documents',
          icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6',
        },
        {
          key: '/owner/services',
          labelKey: 'menu.services',
          mobileLabelKey: 'portal.services',
          icon: 'M12 2l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z',
        },
        {
          key: '/company',
          labelKey: 'menu.company',
          icon: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M12 16v-4 M12 8h.01',
        },
      ],
    },
    {
      labelKey: 'menu.section.personal',
      items: [
        {
          key: '/owner/my',
          labelKey: 'menu.profile',
          mobileLabelKey: 'portal.profile',
          icon: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M12 16v-4 M12 8h.01',
        },
      ],
    },
  ],
  tenant: [
    {
      labelKey: 'menu.section.overview',
      items: [
        {
          key: '/tenant/dashboard',
          labelKey: 'menu.myHome',
          mobileLabelKey: 'portal.home',
          icon: 'M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z',
        },
        {
          key: '/tenant/listings',
          labelKey: 'menu.browseProperties',
          icon: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M9 22 9 12 15 12 15 22',
        },
      ],
    },
    {
      labelKey: 'menu.section.myServices',
      items: [
        {
          key: '/tenant/payments',
          labelKey: 'menu.myPayments',
          mobileLabelKey: 'portal.payments',
          icon: 'M1 4h22v16H1z M1 10h23',
        },
        {
          key: '/tenant/maintenance',
          labelKey: 'menu.maintenance',
          mobileLabelKey: 'portal.maintenance',
          icon: 'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z',
        },
        {
          key: '/tenant/documents',
          labelKey: 'menu.documents',
          mobileLabelKey: 'portal.documents',
          icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6',
        },
        {
          key: '/tenant/services',
          labelKey: 'menu.services',
          mobileLabelKey: 'portal.services',
          icon: 'M12 2l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z',
        },
        {
          key: '/company',
          labelKey: 'menu.company',
          icon: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M12 16v-4 M12 8h.01',
        },
      ],
    },
  ],
  employee: [
    {
      labelKey: 'menu.section.overview',
      items: [
        {
          key: '/employee/dashboard',
          labelKey: 'menu.dashboard',
          icon: 'M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z',
        },
      ],
    },
    {
      labelKey: 'menu.section.businessManagement',
      items: [
        {
          key: '/properties',
          labelKey: 'menu.properties',
          icon: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M9 22 9 12 15 12 15 22',
        },
        {
          key: '/listings',
          labelKey: 'menu.propertySearch',
          icon: 'M21 21l-4.35-4.35M17 11a6 6 0 1 1-12 0 6 6 0 0 1 12 0z',
        },
        {
          key: '/crm',
          labelKey: 'menu.leads',
          icon: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 7a4 4 0 1 0 8 0 4 4 0 0 0-8 0',
        },
        {
          key: '/leases',
          labelKey: 'menu.leases',
          icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6',
        },
        {
          key: '/chat',
          labelKey: 'menu.chat',
          icon: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
        },
        {
          key: '/contracts',
          labelKey: 'menu.contracts',
          icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M9 13l2 2 4-4',
        },
        {
          key: '/publish-listing',
          labelKey: 'menu.publishListing',
          icon: 'M12 5v14M5 12h14',
        },
        {
          key: '/my-listings',
          labelKey: 'menu.myListings',
          icon: 'M3 3h7v7H3z M14 3h7v7h-7z M14 14h7v7h-7z M3 14h7v7H3z',
        },
        {
          key: '/broker-agreements',
          labelKey: 'menu.brokerAgreements',
          icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M9 12l2 2 4-4',
        },
      ],
    },
    {
      labelKey: 'menu.section.personal',
      items: [
        {
          key: '/employee/attendance',
          labelKey: 'menu.attendance',
          icon: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M12 6v6l4 2',
        },
        {
          key: '/employee/performance',
          labelKey: 'menu.performance',
          icon: 'M12 15l3.5-3.5 M12 3v0 M2 12h2 M20 12h2 M12 22v0',
        },
        {
          key: '/employee/contacts',
          labelKey: 'menu.contacts',
          icon: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 7a4 4 0 1 0 8 0 4 4 0 0 0-8 0',
        },
        {
          key: '/company',
          labelKey: 'menu.company',
          icon: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M12 16v-4 M12 8h.01',
        },
      ],
    },
  ],
  admin: [
    {
      labelKey: 'menu.section.overview',
      items: [
        {
          key: '/dashboard',
          labelKey: 'menu.dashboard',
          icon: 'M3 3h7v7H3z M14 3h7v7h-7z M14 14h7v7h-7z M3 14h7v7H3z',
        },
      ],
    },
    {
      labelKey: 'menu.section.businessManagement',
      items: [
        {
          key: '/properties',
          labelKey: 'menu.properties',
          icon: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M9 22 9 12 15 12 15 22',
        },
        {
          key: '/crm',
          labelKey: 'menu.leads',
          icon: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 7a4 4 0 1 0 8 0 4 4 0 0 0-8 0',
        },
        {
          key: '/leases',
          labelKey: 'menu.leases',
          icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6',
        },
        {
          key: '/payments',
          labelKey: 'menu.payments',
          icon: 'M1 4h22v16H1z M1 10h23',
        },
        {
          key: '/contracts',
          labelKey: 'menu.contracts',
          icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M9 13l2 2 4-4',
        },
      ],
    },
    {
      labelKey: 'menu.section.performance',
      items: [
        {
          key: '/operations',
          labelKey: 'menu.operationsBoard',
          icon: 'M3 3v18h18 M7 14l4-5 3 3 5-7',
        },
        {
          key: '/viewings',
          labelKey: 'menu.viewings',
          icon: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M12 6v6l4 2',
        },
        {
          key: '/trend',
          labelKey: 'menu.trend',
          icon: 'M18 20V10M12 20V4M6 20v-6',
        },
        {
          key: '/commission-rules',
          labelKey: 'menu.commissionRules',
          icon: 'M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6',
        },
      ],
    },
    {
      labelKey: 'menu.section.system',
      items: [
        {
          key: '/system/users',
          labelKey: 'menu.accountUsers',
          icon: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 7a4 4 0 1 0 8 0 4 4 0 0 0-8 0 M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75',
        },
        {
          key: '/system/groups',
          labelKey: 'menu.userGroups',
          icon: 'M8 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M18 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M3 21v-1a5 5 0 0 1 5-5 5 5 0 0 1 5 5v1 M21 16.5V21 M19.5 18.75h3',
        },
        {
          key: '/system/permissions',
          labelKey: 'menu.rolePermissions',
          icon: 'M21 2l-2 2 M3 22l2-2 M5 20l-2-2 M3 6h4 M7 6a4 4 0 1 0 8 0 4 4 0 0 0-8 0z M9.5 11.6a5.5 5.5 0 1 1-7.8 7.8 5.5 5.5 0 0 1 7.8-7.8z',
        },
        {
          key: '/system/review-center',
          labelKey: 'menu.reviewCenter',
          icon: 'M22 11.08V12a10 10 0 1 1-5.93-9.14 M22 4L12 14.01l-3-3',
        },
        {
          key: '/operations/listing-review',
          labelKey: 'menu.listingReview',
          icon: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
        },
        {
          key: '/operations/dedupe-review',
          labelKey: 'menu.dedupeReview',
          icon: 'M8 3H5a2 2 0 0 0-2 2v3 M8 21H5a2 2 0 0 1-2-2v-3 M21 8V5a2 2 0 0 0-2-2h-3 M21 16v3a2 2 0 0 1-2 2h-3 M3 12h18',
        },
        {
          key: '/employees',
          labelKey: 'menu.employees',
          icon: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
        },
        {
          key: '/settings',
          labelKey: 'menu.settings',
          icon: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z',
        },
        {
          key: '/company',
          labelKey: 'menu.company',
          icon: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M12 16v-4 M12 8h.01',
        },
      ],
    },
  ],
}

/** 移动端底部 Tab 展示白名单（自上而下）。未列出的菜单项只在侧边栏展示。 */
export const ROLE_MOBILE_KEYS: Record<string, string[]> = {
  owner: ['/owner/dashboard', '/owner/income', '/owner/marketing', '/owner/services', '/owner/my'],
  tenant: ['/tenant/dashboard', '/tenant/payments', '/tenant/documents', '/tenant/services', '/tenant/maintenance'],
  agent: ['/employee/dashboard', '/properties', '/listings', '/employee/attendance', '/employee/performance', '/employee/contacts'],
  employee: ['/employee/dashboard', '/properties', '/listings', '/employee/attendance', '/employee/performance', '/employee/contacts'],
  admin: ['/dashboard', '/properties', '/crm', '/payments', '/settings'],
}