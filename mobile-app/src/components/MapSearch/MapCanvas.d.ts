import type { FC } from 'react';
import type { MapCanvasProps } from './types';

/**
 * 平台分文件实现（Metro 解析 MapCanvas.native.tsx / MapCanvas.web.tsx）。
 * 这里声明类型，供 TypeScript 在不感知平台扩展名时解析。
 */
declare const MapCanvas: FC<MapCanvasProps>;
export default MapCanvas;
