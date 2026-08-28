# 租客界面 Redesign Brief

## 任务目标
将租客界面从"管理后台"风格重新设计为"消费级用户门户"风格。当前页面虽然使用了portal/mobile布局，但视觉语言和管理后台完全一致——统计卡片网格、tab筛选、filter bar、密集badge，缺少消费级app的视觉吸引力和情感化设计。

## 保持不变（FORBIDDEN to modify）
1. `<head>` 中的所有内容保持原样，包括：
   - `<style id="theme-vars">` 品牌CSS变量
   - `<script>` Tailwind和Lucide引用
   - `<style type="text/tailwindcss">` Tailwind配置
   - `<style id="semantic-token-fallback">` 语义回退CSS
2. 所有 `data-dom-id` 属性必须保留，不可删除或重命名
3. 业务文案内容（文字、数据、金额）保持不变
4. 页面间导航交互（nav-item的data-nav-key和data-dom-id）保持不变
5. `data-viewport-mode` 和 `data-scroll-region` 属性保持不变

## 可以修改
1. `<style id="rent-components">` 中的组件CSS — 可以添加新CSS类或修改现有类
2. `<body>` 中的HTML结构和内容布局 — 完全重新设计

## 核心改进方向

### Web页面（portal布局）
1. **Portal Header消费级化**：当前白底+细边框的管理后台风格。改进方向：更友好的品牌区域，可以考虑给header加入轻微的品牌色点缀或更大的品牌标识，让用户感觉进入的是一个服务门户而非管理后台。
2. **Hero区域升级**：当前是简单的渐变色块+文字。改进方向：更有视觉冲击力的大卡片，更大的padding（40px+），更醒目的数据展示，加入装饰性视觉元素（如半透明几何图形、房产信息卡片、进度条）。
3. **去掉统计卡片网格**：当前每个页面顶部都有3-4个rent-stat-card网格。这是典型的管理后台dashboard模式。改进方向：去掉统计卡片网格，改为更消费级的数据展示——如嵌入Hero区域的摘要数据、简洁的状态条、或视觉化的进度展示。
4. **消费级组件替换**：
   - tab筛选（rent-tabs） → 更圆润的segment control（胶囊形、带滑动指示器感）
   - filter bar → 简化为单个搜索框
   - timeline（rent-timeline） → 友好的卡片列表（带图标、颜色编码）
   - 密集badge → 状态色点+文字（更克制）
5. **增加留白和视觉层次**：增大卡片间距（24-32px）、padding（24-32px）、字号（标题更大）。更多的负空间让页面呼吸。
6. **情感化元素**：加入问候语、引导提示、友好的空状态文案、视觉化的状态指示。

### Mobile页面（app布局）
1. **Header升级**：更友好的顶栏，更大的品牌标识
2. **Hero升级**：更有视觉冲击力的渐变卡片，加入装饰性元素
3. **快捷操作**：更大的图标和触控区域，更友好的颜色
4. **卡片流**：更消费级的卡片设计，更大的圆角和padding
5. **底部tab**：保持结构但优化样式

## 可用CSS变量（来自theme-vars，保持不变）
```
--rent-primary: #4263eb
--rent-background: #f5f7fa
--rent-surface: #ffffff
--rent-surface-2: #f1f5f9
--rent-ink: #0f172a
--rent-ink-2: #475569
--rent-ink-3: #94a3b8
--rent-border: #e6eaf0
--rent-sidebar-active: #eef2ff
--rent-radius-sm: 4px
--rent-radius-md: 8px
--rent-radius-lg: 16px
--rent-radius-full: 9999px
--state-success: #16a34a
--state-warning: #d97706
--state-error: #dc2626
--state-info: #0ea5e9
--rent-shadow-1: 0 1px 2px rgba(15,23,42,0.04), 0 1px 1px rgba(15,23,42,0.03)
--rent-shadow-2: 0 8px 24px -8px rgba(15,23,42,0.18)
--rent-shadow-3: 0 24px 60px -20px rgba(15,23,42,0.30)
--rent-s-1: 4px / --rent-s-2: 8px / --rent-s-3: 12px / --rent-s-4: 16px
--rent-s-5: 24px / --rent-s-6: 32px / --rent-s-7: 48px / --rent-s-8: 80px
--rent-font-sans: "Inter", "Noto Sans SC", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif
```

## Redesign Audit Snapshot
```json
{
  "primaryIssue": "管理后台视觉语言 — 统计卡片网格、tab筛选、filter bar、badge密集，缺少消费级视觉吸引力",
  "fixPriority": ["hero视觉化升级", "去掉管理风统计卡片", "降低信息密度增加留白", "消费级组件替换"],
  "preserve": ["业务文案内容", "导航结构和data-dom-id", "品牌主色#4263eb"],
  "change": ["hero区域升级为大视觉渐变卡片", "统计卡片网格改为视觉化数据展示", "tab/filter改为消费级segment", "卡片增大圆角和视觉层次", "增加情感化元素"],
  "risk": "不要破坏现有data-dom-id和页面间导航交互"
}
```

## 工具纪律
- 不要写 .design 文件
- 不要运行验证脚本（validate-design-workspace.mjs等）
- 不要创建辅助脚本
- 不要启动预览服务器或浏览器
- 不要生成图片
- 不要调用 TodoWrite
- 只写指定的输出文件
- 返回完成JSON作为唯一状态通道

## 完成JSON格式
```json
{
  "nodeId": "page-tenant-xxx",
  "page": "pages/tenant-xxx.html",
  "qualityGate": "passed",
  "domIds": ["所有data-dom-id值列表"],
  "headInfrastructureStatus": { "headPreserved": true },
  "toolDisciplineEvidence": {
    "todoWriteUsed": false,
    "previewStarted": false,
    "validationScriptsRunBySubAgent": false,
    "helperScriptsCreated": false,
    "imagesGeneratedBySubAgent": false
  },
  "toolCallLedger": {
    "todoWriteCalls": 0,
    "previewCalls": 0,
    "validationScriptCalls": 0,
    "helperScriptWrites": 0
  },
  "redesignEvidence": {
    "issuesFixed": ["解决的问题列表"],
    "contentPreserved": ["保留的内容/domId列表"],
    "domIdImpact": "none"
  },
  "blockedReason": null
}
```
