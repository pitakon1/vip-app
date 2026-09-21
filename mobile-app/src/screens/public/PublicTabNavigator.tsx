/**
 * 未登录访客的底部导航（找房 / 学校 / 小区 / 我的）。
 *
 * 这是「先让流量进来」在移动端的落点：此前 `RootNavigator` 在未登录时只挂
 * Login/Register 两页，整个 App 是个登录墙——C 端内容一点都进不来。
 * 现在访客直接进这套 Tab 看内容，只有点「我的」办自己的事才去登录。
 */
import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Ionicons from '@expo/vector-icons/Ionicons';
import colors from '@/theme/colors';
import { useI18n } from '@/i18n';
import PublicListingsScreen from './PublicListingsScreen';
import PublicSchoolsScreen from './PublicSchoolsScreen';
import PublicCommunitiesScreen from './PublicCommunitiesScreen';
import PublicGuestProfileScreen from './PublicGuestProfileScreen';

const Tab = createBottomTabNavigator();

type IoniconName = keyof typeof Ionicons.glyphMap;

const TABS: { name: string; component: React.ComponentType<any>; icon: IoniconName; labelKey: string }[] = [
  { name: 'PublicListings', component: PublicListingsScreen, icon: 'search', labelKey: 'pub.tabListings' },
  { name: 'PublicSchools', component: PublicSchoolsScreen, icon: 'school', labelKey: 'pub.tabSchools' },
  { name: 'PublicCommunities', component: PublicCommunitiesScreen, icon: 'business', labelKey: 'pub.tabCommunities' },
  { name: 'PublicMe', component: PublicGuestProfileScreen, icon: 'person', labelKey: 'pub.tabMe' },
];

export default function PublicTabNavigator() {
  const { t } = useI18n();

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.ink3,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarLabelStyle: { fontSize: 11 },
      }}
    >
      {TABS.map((tab) => (
        <Tab.Screen
          key={tab.name}
          name={tab.name}
          component={tab.component}
          options={{
            title: t(tab.labelKey),
            tabBarIcon: ({ color, size, focused }) => (
              <Ionicons
                name={(focused ? tab.icon : `${tab.icon}-outline`) as IoniconName}
                size={size}
                color={color}
              />
            ),
          }}
        />
      ))}
    </Tab.Navigator>
  );
}
