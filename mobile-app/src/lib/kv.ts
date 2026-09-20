/**
 * 通用 KV 存储：优先 react-native-mmkv（同步原生 KV，冷启动秒读），
 * 不可用时（Expo Go / Web / 原生构建缺失）自动降级 AsyncStorage。
 * 两者均为 MIT 开源组件。
 */
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface SyncKV {
  getString(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
  getAllKeys(): string[];
  clearAll(): void;
}

let mmkv: SyncKV | null = null;

function tryCreateMMKV(): SyncKV | null {
  if (Platform.OS === 'web') return null;
  try {
    const mod = require('react-native-mmkv');
    const MMKVClass = mod?.MMKV;
    if (!MMKVClass) return null;
    const inst = new MMKVClass({ id: 'vip-rental-cache' });
    // 冒烟探测：原生模块缺失时（Expo Go）new MMKV() 即抛错，落入 AsyncStorage 降级
    inst.getString('__probe__');
    return inst as SyncKV;
  } catch {
    return null;
  }
}

mmkv = tryCreateMMKV();

/** 是否运行在 MMKV 上（否则走 AsyncStorage 降级） */
export const isMMKV = mmkv !== null;

/** 同步读（MMKV 可用时）；降级路径返回 null 由调用方走异步兜底 */
export function getStringSync(key: string): string | null {
  return mmkv ? mmkv.getString(key) : null;
}

export async function getItem(key: string): Promise<string | null> {
  if (mmkv) return mmkv.getString(key);
  return AsyncStorage.getItem(key);
}

export async function setItem(key: string, value: string): Promise<void> {
  if (mmkv) {
    mmkv.set(key, value);
    return;
  }
  await AsyncStorage.setItem(key, value);
}

export async function removeItem(key: string): Promise<void> {
  if (mmkv) {
    mmkv.remove(key);
    return;
  }
  await AsyncStorage.removeItem(key);
}

export async function multiRemove(keys: string[]): Promise<void> {
  if (mmkv) {
    keys.forEach((k) => mmkv!.remove(k));
    return;
  }
  await AsyncStorage.multiRemove(keys);
}

export async function getAllKeys(): Promise<string[]> {
  if (mmkv) return [...mmkv.getAllKeys()];
  return [...(await AsyncStorage.getAllKeys())];
}

/** 清理所有 KV 数据（含 token 之外的业务缓存），供「清除缓存」类入口使用 */
export async function clearAll(): Promise<void> {
  if (mmkv) {
    mmkv.clearAll();
    return;
  }
  await AsyncStorage.clear();
}
