import { useTranslation } from 'react-i18next'
import LazyImage from '@/components/LazyImage'
import { ICONS, Icon } from '../icons'

interface Props {
  photos: string[]
  photoIndex: number
  onSelectPhoto: (idx: number) => void
  displayName: string
  videoUrl?: string
}

/** 房源图集（主图 + 计数 + 视频入口 + 缩略图） */
const PropertyGallery = ({ photos, photoIndex, onSelectPhoto, displayName, videoUrl }: Props) => {
  const { t } = useTranslation()

  return (
    <section className="rent-detail-card rent-detail-card--pad0 rent-detail-gallery">
      <div className="rent-detail-gallery__stage">
        <div className="rent-detail-gallery__art">
          {photos.length ? (
            <LazyImage
              src={photos[Math.min(photoIndex, photos.length - 1)]}
              alt={displayName}
              containerStyle={{ width: '100%', height: '100%' }}
            />
          ) : (
            <svg
              className="rent-detail-gallery__building"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d={ICONS.building} />
            </svg>
          )}
        </div>
        {photos.length > 1 && (
          <span className="rent-detail-gallery__count">
            {Math.min(photoIndex, photos.length - 1) + 1}/{photos.length}
          </span>
        )}
        <span className="rent-detail-gallery__views">
          {videoUrl && (
            <a
              className="rent-detail-gallery__video"
              href={videoUrl}
              target="_blank"
              rel="noreferrer"
            >
              <Icon d={ICONS.play} /> {t('tenantPropertyDetail.videoTour')}
            </a>
          )}
        </span>
      </div>
      {photos.length > 1 && (
        <div className="rent-detail-gallery__thumbs">
          {photos.map((src, idx) => (
            <span
              key={`${src}-${idx}`}
              className="rent-detail-gallery__thumb"
              data-active={idx === photoIndex}
              style={{ backgroundImage: `url(${src})` }}
              onClick={() => onSelectPhoto(idx)}
            />
          ))}
        </div>
      )}
    </section>
  )
}

export default PropertyGallery
