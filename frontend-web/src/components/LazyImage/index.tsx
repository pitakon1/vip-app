import { useEffect, useState } from 'react'
import type { CSSProperties, ReactEventHandler, ReactNode } from 'react'
import './LazyImage.css'

export type LazyImageProps = {
  src?: string | null
  alt?: string
  className?: string
  width?: number | string
  height?: number | string
  style?: CSSProperties
  loading?: 'lazy' | 'eager'
  onError?: ReactEventHandler<HTMLImageElement>
  fallback?: ReactNode
  /** 容器自身尺寸（默认由 className / style 决定），用于需要撑满父级的场景 */
  containerStyle?: CSSProperties
}

/**
 * 内容图片懒加载组件。
 *
 * 外层容器沿用原 img 的 className / style 占位，图片加载完成后淡入，
 * 避免懒加载造成的布局跳动；src 为空时不发请求，直接渲染占位块。
 */
const LazyImage = ({
  src,
  alt,
  className,
  width,
  height,
  style,
  loading = 'lazy',
  onError,
  fallback,
  containerStyle,
}: LazyImageProps) => {
  const [state, setState] = useState<'loading' | 'loaded' | 'error'>('loading')

  useEffect(() => {
    setState('loading')
  }, [src])

  const boxStyle: CSSProperties = { ...style, ...containerStyle }
  if (width != null) boxStyle.width = width
  if (height != null) boxStyle.height = height

  if (!src) {
    return (
      <div className={`lazy-img${className ? ` ${className}` : ''}`} style={boxStyle}>
        {fallback ? <span className="lazy-img__fallback">{fallback}</span> : null}
      </div>
    )
  }

  return (
    <div className={`lazy-img${className ? ` ${className}` : ''}`} style={boxStyle}>
      {state === 'error' ? (
        <span className="lazy-img__fallback">{fallback}</span>
      ) : (
        <img
          className={`lazy-img__img${state === 'loaded' ? ' lazy-img__img--loaded' : ''}`}
          src={src}
          alt={alt}
          width={width}
          height={height}
          loading={loading}
          decoding="async"
          onLoad={() => setState('loaded')}
          onError={(event) => {
            setState('error')
            onError?.(event)
          }}
        />
      )}
    </div>
  )
}

export default LazyImage
