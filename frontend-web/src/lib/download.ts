import api from './api'

/** 触发浏览器保存一个 Blob。 */
function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

/** 从 Content-Disposition 里取后端给的文件名（取不到时用兜底名）。 */
function filenameFrom(disposition?: string, fallback = 'export.csv') {
  const match = /filename="?([^";]+)"?/.exec(disposition || '')
  return match ? match[1] : fallback
}

/**
 * 保存前端本地生成的文本报表（如按当前筛选汇总出的账单）。
 *
 * 与 `downloadReport` 的区别：数据来自页面已取回的明细，不需要再打后端接口。
 */
export function saveTextFile(
  content: string,
  filename: string,
  mime = 'text/csv;charset=utf-8',
) {
  saveBlob(new Blob([content], { type: mime }), filename)
}

/**
 * 下载后端报表（CSV）。
 *
 * 用 axios 取 blob 而不是 `window.open`：导出接口同样需要 Authorization 头，
 * 直接开新窗口带不上令牌会被 401 拦掉。
 */
export async function downloadReport(
  path: string,
  params: Record<string, unknown> = {},
  fallbackName = 'export.csv',
) {
  const res = await api.get(path, {
    params,
    responseType: 'blob',
    // 报表可能比普通接口慢，放宽到 60s
    timeout: 60000,
  })
  saveBlob(
    res.data as Blob,
    filenameFrom(res.headers['content-disposition'] as string | undefined, fallbackName),
  )
}