/** 「放置/管理签署区」工作台：页图落区、关键字签署、签名资产库与手写签名板。 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  PanResponder,
  useWindowDimensions,
  type PanResponderInstance,
  type LayoutChangeEvent,
  type GestureResponderEvent,
} from 'react-native';
import { contractsApi, signAssetsApi } from '@/services/api';
import { notify, notifyError } from '@/utils/feedback';
import { useI18n } from '@/i18n';
import { exportPadPng } from '../utils';
import type { SignFieldForm } from '../types';

interface UseSignStudioOptions {
  detail: any;
  parties: any[];
  signFields: any[];
  openDetail: (id: string) => Promise<void>;
}

export function useSignStudio({ detail, parties, signFields, openDetail }: UseSignStudioOptions) {
  const { t } = useI18n();
  const isWide = useWindowDimensions().width >= 720;

  // 添加签署区（法大大风格）
  const [showAddFields, setShowAddFields] = useState(false);
  const [fieldForm, setFieldForm] = useState<SignFieldForm>({
    party_id: '',
    type: 'signature',
    page: '1',
    x: '50',
    y: '40',
  });
  const [fieldsBusy, setFieldsBusy] = useState<string | boolean>(false);

  // 签名库（复用弹窗）
  const [showLibrary, setShowLibrary] = useState(false);
  // 资产库当前类型（印章 / 手写签名）；手写签名另有独立画板弹窗
  const [libAssetType, setLibAssetType] = useState<'seal' | 'handwrite'>('seal');
  const [signMakeVisible, setSignMakeVisible] = useState(false);
  const [signDraftSvg, setSignDraftSvg] = useState('');
  // 手写签名画板的 <Svg> 实例：用于「使用该签名」时导出 PNG（RN <Image> 不支持 SVG）
  const signSvgRef = useRef<any>(null);

  // ===== 开放签双栏「放置/管理签署区」：左配置栏 + 右文档区 =====
  const [signMethod, setSignMethod] = useState<'position' | 'keyword'>('position');
  const [sealAsset, setSealAsset] = useState<any>(null);
  const [signAsset, setSignAsset] = useState<any>(null);
  // 文档页图（用于落区预览）
  const [docUrls, setDocUrls] = useState<Record<number, string>>({});
  const pageSizesRef = useRef<Record<number, { w: number; h: number }>>({});
  const placePanCache = useRef<Record<number, PanResponderInstance>>({});

  // 关键字签署
  const [kwKeyword, setKwKeyword] = useState('');
  const [kwHits, setKwHits] = useState<any[]>([]);
  const [kwCount, setKwCount] = useState(0);
  const [kwSearchBusy, setKwSearchBusy] = useState(false);
  const [kwBusyIdx, setKwBusyIdx] = useState<number | null>(null);

  const loadAssetLib = useCallback(async () => {
    try {
      const [sealsRes, signsRes]: any = await Promise.all([
        signAssetsApi.list('seal'),
        signAssetsApi.list('handwrite'),
      ]);
      const toList = (d: any) => {
        const data = d?.data;
        return Array.isArray(data) ? data : data?.items ?? data?.data ?? [];
      };
      setSealAsset(toList(sealsRes)[0] ?? null);
      setSignAsset(toList(signsRes)[0] ?? null);
    } catch {
      // 库加载失败不阻塞
    }
  }, []);

  // 打开「放置签署区」：加载页图 + 资产库
  const openStudioFields = () => {
    const target = parties.find((p: any) => !p?.signed && !!p?.id) ?? parties[0];
    setFieldForm({ party_id: String(target?.id ?? ''), type: 'signature', page: '1', x: '50', y: '40' });
    setSignMethod('position');
    setKwKeyword('');
    setKwHits([]);
    setKwCount(0);
    setShowAddFields(true);
  };

  // 印章入口：打开印章库（模板生成公章 / 印模抠图 / 印章列表）
  const openSealLib = () => {
    setLibAssetType('seal');
    setShowLibrary(true);
  };

  // 手写签名入口：直接弹出手写签名板（不再打开没有画板的资产列表）
  const openSignMake = () => {
    setSignDraftSvg('');
    setSignMakeVisible(true);
  };

  // 手写签名板「使用该签名」：入库并回填为当前签署用签名
  const useSignDraft = async () => {
    const svg = signDraftSvg;
    if (!svg || !svg.startsWith('<svg')) {
      notify(t('contract.signNotMade'));
      return;
    }
    // 优先导出 PNG 入库（RN <Image> 只能渲染位图）；导出不可用时回退 SVG，由 AssetThumb 用 SvgXml 展示
    const png = await exportPadPng(signSvgRef);
    const dataUrl = png || `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    try {
      const res: any = await signAssetsApi.create({
        name: t('contract.mySigns'),
        asset_type: 'handwrite',
        source: 'drew',
        data_url: dataUrl,
      });
      const created = res?.data?.id ? res.data : res?.id ? res : null;
      setSignAsset(
        created ?? {
          id: '',
          name: t('contract.mySigns'),
          asset_type: 'handwrite',
          source: 'drew',
          data_url: dataUrl,
        },
      );
      notify(t('contract.assetSaved'));
      setSignMakeVisible(false);
    } catch (e) {
      notifyError(t('contract.addAsset'), e);
    }
  };

  // 文档页图加载（放置在页图上的示意框）
  useEffect(() => {
    if (!showAddFields || !detail?.pdf_available || !detail?.id) {
      setDocUrls({});
      return;
    }
    let cancelled = false;
    const cnt = Number(detail?.pdf_page_count) || 1;
    (async () => {
      const map: Record<number, string> = {};
      for (let p = 1; p <= cnt; p++) {
        try {
          const url = await contractsApi.pdfPageUrl(detail.id, p);
          if (cancelled) return;
          if (url) map[p] = url;
        } catch {
          // 跳过单页
        }
      }
      if (!cancelled) setDocUrls(map);
    })();
    if (cnt > 0) void loadAssetLib();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAddFields, detail?.id, detail?.pdf_available]);

  const onDocPageLayout = (page: number) => (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    pageSizesRef.current[page] = { w: width, h: height };
  };

  // 员工在页图上点按 / 拖动落区：坐标一律换算成 0-100 百分比（不暴露给用户）
  const getPlacePan = useCallback((page: number) => {
    if (placePanCache.current[page]) return placePanCache.current[page];
    // 相对页图的坐标必须先除以页图尺寸换算成百分比再写进 fieldForm：
    // 该字段会被当成百分比渲染（left: `${x}%`），直接把像素值写进去会让预览框
    // 飞到页图外、再被 pdfPageWrap 的 overflow:hidden 裁掉——表现为「点了没反应」。
    const place = (evt: GestureResponderEvent) => {
      const size = pageSizesRef.current[page];
      const lx = Number(evt.nativeEvent.locationX);
      const ly = Number(evt.nativeEvent.locationY);
      if (!size?.w || !size?.h || !Number.isFinite(lx) || !Number.isFinite(ly)) return;
      const pctX = Math.max(0, Math.min(100, (lx / size.w) * 100));
      const pctY = Math.max(0, Math.min(100, (ly / size.h) * 100));
      setFieldForm((f) => ({
        ...f,
        page: String(page),
        x: String(Number(pctX.toFixed(1))),
        y: String(Number(pctY.toFixed(1))),
      }));
    };
    const pan = PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: place,
      onPanResponderMove: place,
      onPanResponderRelease: place,
      onPanResponderTerminate: () => {},
    });
    placePanCache.current[page] = pan;
    return pan;
  }, []);

  // 命中某项 → 在该页以命中坐标落区（百分比），并用命中类型提示
  const placeKeywordHitStaff = (hit: any) => {
    setFieldForm((f) => ({
      ...f,
      page: String(hit?.page ?? 1),
      x: String(Number(hit?.x ?? 50)),
      y: String(Number(hit?.y ?? 40)),
    }));
  };

  /* ===== 添加签署区（法大大风格）===== */
  const openAddFields = () => {
    // 默认选中第一个未签署方
    const target = parties.find((p: any) => !p?.signed && !!p?.id) ?? parties[0];
    setFieldForm({
      party_id: String(target?.id ?? ''),
      type: 'signature',
      page: '1',
      x: '50',
      y: '40',
    });
    setShowAddFields(true);
  };

  const commitFields = async (fields: any[]) => {
    if (!detail?.id || !fields.length) return;
    setFieldsBusy(true);
    try {
      await contractsApi.saveSignFields(detail.id, fields);
      notify(t('contract.createFieldsDone'));
      setShowAddFields(false);
      await openDetail(detail.id);
    } catch (e) {
      notifyError(t('contract.createFieldsDone'), e);
    } finally {
      setFieldsBusy(false);
    }
  };

  // 表单式添加单个签署区
  const submitField = async () => {
    if (!fieldForm.party_id) {
      notify(t('contract.needPartyFirst'));
      return;
    }
    const isSign = fieldForm.type === 'signature';
    await commitFields([
      {
        party_id: fieldForm.party_id,
        field_type: fieldForm.type,
        page: Number(fieldForm.page) || 1,
        // 签署区坐标与尺寸统一为页面百分比(0-100)，尺寸与右栏落框预览保持一致，
        // 否则缺省 w/h 会存成 0×0，签署框在文档上不可见也点不到。
        x: Number(fieldForm.x) || 0,
        y: Number(fieldForm.y) || 0,
        w: isSign ? 22 : 13,
        h: isSign ? 8 : 6,
      },
    ]);
  };

  // 默认布局：按文档位置错开摆放未签署方的签名位（百分比 0-100）
  const applyDefaultLayout = async () => {
    const targets = parties.filter((p: any) => !p?.signed && !!p?.id);
    if (!targets.length) {
      notify(t('contract.needPartyFirst'));
      return;
    }
    const fields = targets.map((p: any, i: number) => ({
      party_id: String(p.id),
      field_type: 'signature',
      page: 1,
      x: i % 2 === 0 ? 25 : 65,
      y: 55 + (i % 2) * 25 + Math.floor(i / 2) * 12,
      w: 22,
      h: 8,
    }));
    await commitFields(fields);
  };

  const removeField = async (fieldId: string) => {
    if (!detail?.id) return;
    setFieldsBusy(`ff-${fieldId}`);
    try {
      await contractsApi.deleteSignField(detail.id, fieldId);
      notify(t('contract.deleteFieldsDone'));
      await openDetail(detail.id);
    } catch (e) {
      notifyError(t('contract.deleteFieldsDone'), e);
    } finally {
      setFieldsBusy(false);
    }
  };

  /* ===== 关键字签署：检索命中位置（坐标 0-100 百分比，页面仅展示语义「第N页」）=*/
  const doKeywordSearch = async () => {
    if (!detail?.id || !kwKeyword.trim()) {
      notify(t('contract.insert'));
      return;
    }
    setKwSearchBusy(true);
    try {
      const res: any = await contractsApi.keywordSearch(detail.id, kwKeyword.trim());
      const data = res?.data ?? {};
      const hits = Array.isArray(data?.hits) ? data.hits : [];
      setKwHits(hits);
      setKwCount(Number(data?.count ?? hits.length));
    } catch (e) {
      notifyError(t('contract.keywordSign'), e);
    } finally {
      setKwSearchBusy(false);
    }
  };

  // 在某个命中位置建立签署位（语义化展示第N页，不暴露 x/y 坐标）
  const createKeywordField = async (index: number) => {
    if (!detail?.id || !fieldForm.party_id) {
      notify(t('contract.insert'));
      return;
    }
    setKwBusyIdx(index);
    try {
      await contractsApi.keywordFields(detail.id, {
        keyword: kwKeyword.trim(),
        party_id: fieldForm.party_id,
        field_type: fieldForm.type,
        index,
      });
      notify(t('contract.keywordFieldCreated'));
      setKwHits([]);
      setKwKeyword('');
      await openDetail(detail.id);
    } catch (e) {
      notifyError(t('contract.keywordFieldCreated'), e);
    } finally {
      setKwBusyIdx(null);
    }
  };

  return {
    isWide,
    showAddFields,
    setShowAddFields,
    fieldForm,
    setFieldForm,
    fieldsBusy,
    showLibrary,
    setShowLibrary,
    libAssetType,
    setLibAssetType,
    signMakeVisible,
    setSignMakeVisible,
    signDraftSvg,
    setSignDraftSvg,
    signSvgRef,
    signMethod,
    setSignMethod,
    sealAsset,
    setSealAsset,
    signAsset,
    setSignAsset,
    docUrls,
    loadAssetLib,
    openStudioFields,
    openSealLib,
    openSignMake,
    useSignDraft,
    onDocPageLayout,
    getPlacePan,
    placeKeywordHitStaff,
    openAddFields,
    commitFields,
    submitField,
    applyDefaultLayout,
    removeField,
    doKeywordSearch,
    createKeywordField,
    kwKeyword,
    setKwKeyword,
    kwHits,
    setKwHits,
    kwCount,
    setKwCount,
    kwSearchBusy,
    kwBusyIdx,
    signFields,
  };
}
