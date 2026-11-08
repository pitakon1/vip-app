﻿import { MENU_ICONS, type MenuIconKey } from '@/constants/menuIcons'

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
 *   iconKey        菜单图标常量键名（取值见 constants/menuIcons.ts 枚举）
 *   key            路由路径（移动端底部 Tab 也复用同一 key 判断选中态）
 */

export interface RoleMenuItem {
  /** 路由路径；移动端底部 Tab 复用同一 key 用于选中态判断 */
  key: string
  /** 侧边栏文案 i18n key（menu.*） */
  labelKey: string
  /** 底部 Tab 文案 i18n key（portal.*），缺省回落 labelKey */
  mobileLabelKey?: string
  /** 菜单图标键名（constants/menuIcons.ts） */
  iconKey: MenuIconKey
}

export interface RoleMenuSection {
  /** 分组标签 i18n key（menu.section.*），仅侧边栏渲染 */
  labelKey?: string
  items: RoleMenuItem[]
}

/** 消费端文案与侧边栏不一致时的回落：默认复用侧边栏 key */
export const resolveLabelKey = (item: RoleMenuItem) => item.mobileLabelKey ?? item.labelKey

export const ROLE_SECTIONS: Record<string, RoleMenuSection[]> = {
  // C 端（业主 + 租客）共享菜单：业主与租客功能一致——同一份入口清单、同一命名空间 /tenant/*。
  // 业主不再有独立侧边栏（ROLE_SECTIONS.owner 已删除），统一走顶栏门户 PortalLayout。
  tenant: [
    {
      labelKey: 'menu.section.overview',
      items: [
        {
          key: '/tenant/dashboard',
          labelKey: 'menu.myHome',
          mobileLabelKey: 'portal.home',
          iconKey: 'PANELS',
        },
        {
          key: '/tenant/listings',
          labelKey: 'menu.browseProperties',
          iconKey: 'BUILDING',
        },
        {
          key: '/tenant/my-properties',
          labelKey: 'menu.myProperties',
          iconKey: 'BUILDING',
        },
        {
          key: '/tenant/my-listings',
          labelKey: 'menu.myListings',
          iconKey: 'GRID_4',
        },
        {
          key: '/tenant/marketing',
          labelKey: 'menu.marketing',
          mobileLabelKey: 'portal.marketing',
          iconKey: 'MEGAPHONE',
        },
        {
          key: '/tenant/income',
          labelKey: 'menu.income',
          mobileLabelKey: 'portal.income',
          iconKey: 'DOLLAR',
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
          iconKey: 'CREDIT_CARD',
        },
        {
          key: '/tenant/maintenance',
          labelKey: 'menu.maintenance',
          mobileLabelKey: 'portal.maintenance',
          iconKey: 'WRENCH',
        },
        {
          key: '/tenant/documents',
          labelKey: 'menu.documents',
          mobileLabelKey: 'portal.documents',
          iconKey: 'FILE',
        },
        {
          key: '/tenant/services',
          labelKey: 'menu.services',
          mobileLabelKey: 'portal.services',
          iconKey: 'STAR',
        },
        {
          key: '/tenant/contracts',
          labelKey: 'menu.contracts',
          iconKey: 'FILE_CHECK',
        },
        {
          key: '/company',
          labelKey: 'menu.company',
          iconKey: 'INFO',
        },
      ],
    },
    {
      labelKey: 'menu.section.personal',
      items: [
        {
          key: '/tenant/my',
          labelKey: 'menu.profile',
          mobileLabelKey: 'portal.profile',
          iconKey: 'INFO',
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
          iconKey: 'PANELS',
        },
      ],
    },
    {
      labelKey: 'menu.section.businessManagement',
      items: [
        {
          key: '/properties',
          labelKey: 'menu.properties',
          iconKey: 'BUILDING',
        },
        {
          key: '/crm',
          labelKey: 'menu.leads',
          iconKey: 'USER',
        },
        {
          key: '/leases',
          labelKey: 'menu.leases',
          iconKey: 'FILE',
        },
        {
          key: '/chat',
          labelKey: 'menu.chat',
          iconKey: 'CHAT',
        },
        {
          key: '/contracts',
          labelKey: 'menu.contracts',
          iconKey: 'FILE_CHECK',
        },
        {
          key: '/broker-agreements',
          labelKey: 'menu.brokerAgreements',
          iconKey: 'FILE_CHECK_ALT',
        },
      ],
    },
    {
      labelKey: 'menu.section.personal',
      items: [
        {
          key: '/employee/attendance',
          labelKey: 'menu.attendance',
          iconKey: 'CLOCK',
        },
        {
          key: '/employee/performance',
          labelKey: 'menu.performance',
          iconKey: 'SPARKLES',
        },
        {
          key: '/employee/contacts',
          labelKey: 'menu.contacts',
          iconKey: 'USER',
        },
        {
          key: '/company',
          labelKey: 'menu.company',
          iconKey: 'INFO',
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
          iconKey: 'GRID_4',
        },
      ],
    },
    {
      labelKey: 'menu.section.businessManagement',
      items: [
        {
          key: '/properties',
          labelKey: 'menu.properties',
          iconKey: 'BUILDING',
        },
        {
          key: '/crm',
          labelKey: 'menu.leads',
          iconKey: 'USER',
        },
        {
          key: '/leases',
          labelKey: 'menu.leases',
          iconKey: 'FILE',
        },
        {
          key: '/payments',
          labelKey: 'menu.payments',
          iconKey: 'CREDIT_CARD',
        },
        {
          key: '/contracts',
          labelKey: 'menu.contracts',
          iconKey: 'FILE_CHECK',
        },
      ],
    },
    {
      labelKey: 'menu.section.performance',
      items: [
        {
          key: '/operations',
          labelKey: 'menu.operationsBoard',
          iconKey: 'TREND',
        },
        {
          key: '/viewings',
          labelKey: 'menu.viewings',
          iconKey: 'CLOCK',
        },
        {
          key: '/trend',
          labelKey: 'menu.trend',
          iconKey: 'BARS',
        },
        {
          key: '/commission-rules',
          labelKey: 'menu.commissionRules',
          iconKey: 'DOLLAR',
        },
        {
          key: '/attendance-manage',
          labelKey: 'menu.attendanceManage',
          iconKey: 'SHIELD_CLOCK',
        },
      ],
    },
    {
      labelKey: 'menu.section.system',
      items: [
        {
          key: '/system/users',
          labelKey: 'menu.accountUsers',
          iconKey: 'USERS',
        },
        {
          key: '/system/partners',
          labelKey: 'menu.coopPartners',
          iconKey: 'COLUMNS',
        },
        {
          key: '/system/groups',
          labelKey: 'menu.userGroups',
          iconKey: 'GROUPED_USERS',
        },
        {
          key: '/system/departments',
          labelKey: 'menu.departments',
          iconKey: 'LAYERS',
        },
        {
          key: '/system/data-scopes',
          labelKey: 'menu.dataScopes',
          iconKey: 'GLOBE',
        },
        {
          key: '/system/options',
          labelKey: 'menu.dataDictionary',
          iconKey: 'BOOK',
        },
        {
          key: '/system/permissions',
          labelKey: 'menu.rolePermissions',
          iconKey: 'KEY',
        },
        {
          key: '/system/review-center',
          labelKey: 'menu.reviewCenter',
          iconKey: 'CHECK_CIRCLE',
        },
        {
          key: '/operations/listing-review',
          labelKey: 'menu.listingReview',
          iconKey: 'CHAT',
        },
        {
          key: '/operations/dedupe-review',
          labelKey: 'menu.dedupeReview',
          iconKey: 'SWAP',
        },
        {
          key: '/employees',
          labelKey: 'menu.employees',
          iconKey: 'BADGE_USER',
        },
        {
          key: '/settings',
          labelKey: 'menu.settings',
          iconKey: 'COG',
        },
        {
          key: '/company',
          labelKey: 'menu.company',
          iconKey: 'INFO',
        },
      ],
    },
  ],
  partner_admin: [
    {
      labelKey: 'menu.section.partner',
      items: [
        {
          key: '/partner/members',
          labelKey: 'menu.partnerMembers',
          mobileLabelKey: 'menu.partnerMembers',
          iconKey: 'USER',
        },
        {
          key: '/partner/attendance',
          labelKey: 'menu.partnerAttendance',
          mobileLabelKey: 'menu.partnerAttendance',
          iconKey: 'CALENDAR',
        },
      ],
    },
  ],
}

/** 移动端底部 Tab 展示白名单（自上而下）。未列出的菜单项只在侧边栏展示。 */
export const ROLE_MOBILE_KEYS: Record<string, string[]> = {
  // 业主与租客共用同一组 C 端底部 Tab（功能一致）
  owner: ['/tenant/dashboard', '/tenant/listings', '/tenant/payments', '/tenant/documents', '/tenant/my'],
  tenant: ['/tenant/dashboard', '/tenant/listings', '/tenant/payments', '/tenant/documents', '/tenant/my'],
  agent: ['/employee/dashboard', '/properties', '/employee/attendance', '/employee/performance', '/employee/contacts'],
  employee: ['/employee/dashboard', '/properties', '/employee/attendance', '/employee/performance', '/employee/contacts'],
  admin: ['/dashboard', '/properties', '/crm', '/payments', '/settings'],
  partner_admin: ['/partner/members'],
}

/**
 * C 端门户顶栏（PortalLayout）展示的 6 项：首页 / 找房 / 我的房源 / 收益 / 文档 / 我的。
 * 其余入口（缴费 / 报修 / 服务 / 合同 / 委托挂牌 / 我的上架单 / 公司）收进「我的」宫格。
 */
export const C_PORTAL_NAV_KEYS = [
  '/tenant/dashboard',
  '/tenant/listings',
  '/tenant/my-properties',
  '/tenant/income',
  '/tenant/documents',
  '/tenant/my',
]