import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import useAuthStore from '@/stores/auth'
import SealCropperModal from '@/components/SealCropperModal'
import './sign.css'
import { pageStyle } from './constants'
import { useSignDocument } from './hooks/useSignDocument'
import { useSignAssets } from './hooks/useSignAssets'
import { usePlacement } from './hooks/usePlacement'
import { useSignSubmit } from './hooks/useSignSubmit'
import DocumentPanel from './components/DocumentPanel'
import SignerAside from './components/SignerAside'
import SignModal from './components/SignModal'
import SealModal from './components/SealModal'
import RealNameModal from './components/RealNameModal'
import DeclineModal from './components/DeclineModal'
import { FailView, DeclinedView, SuccessView, LoadingView } from './components/StatusViews'

const Sign = () => {
  const { token = '' } = useParams()
  const { t } = useTranslation()
  // 登录态：站内员工持有登录令牌时走 contracts/sign-batch；匿名访客走公开 token 端点
  const authToken = useAuthStore((s) => s.token)
  const { phase, setPhase, doc, setDoc, fail, setFail } = useSignDocument(token)
  const assets = useSignAssets()
  const { currentPage, setCurrentPage, placed, ghost, movingKey, docRef, signOnField, removePlaced, beginCarry, beginMove } =
    usePlacement({ seal: assets.seal, signature: assets.signature })
  const submit = useSignSubmit({
    token,
    doc,
    placed,
    authToken,
    setPhase,
    setFail,
    onNameVerified: (name) =>
      setDoc((d) => (d ? { ...d, real_name_verified: true, party: { ...d.party, name } } : d)),
  })

  // 逾期 / 已签 等失败态
  if (fail) return <FailView fail={fail} />
  // 已拒签
  if (submit.declined) return <DeclinedView />
  // 签署完成
  if (phase === 'done' && submit.result?.signed) {
    return <SuccessView download={submit.result?.download} />
  }
  if (phase === 'loading') return <LoadingView />

  // ===== 单屏签署台：左=文档区，右=签署方组件托盘 =====
  const pdfCount = doc?.pdf_available ? doc?.pdf_page_count || 1 : 0
  const page = Math.min(Math.max(currentPage, 1), pdfCount || 1)
  const pageItems = placed.filter((p) => p.page === page)
  // 发起方预置的签署区（本签署方可见、未签的那部分）。点击即按该区坐标落章。
  const pageFields = (doc?.sign_fields || []).filter((f) => (f.page || 1) === page)

  // 串行签署：未轮到本方时禁止落章提交，并明确提示等待前序签署方
  const waitingTurn = doc?.can_sign_now === false

  return (
    <div style={pageStyle}>
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
        <h2 style={{ fontSize: 20, margin: 0 }}>{doc?.title || ''}</h2>
        {/* v2 角标仅用于自证设备已加载新 bundle */}
        <span className="kf-ver">v2</span>
      </div>

      {doc?.sign_deadline && (
        <div className="rent-text-sm rent-text-muted" style={{ marginBottom: 8 }}>
          {t('contracts.signDeadline', { at: new Date(doc.sign_deadline).toLocaleString() })}
        </div>
      )}
      {waitingTurn && (
        <div
          className="rent-badge rent-badge--warning"
          style={{ display: 'block', padding: '10px 12px', marginBottom: 12, whiteSpace: 'normal' }}
        >
          {t('contracts.waitingTurnHint')}
        </div>
      )}

      <div className="kf-layout">
        <DocumentPanel
          token={token}
          doc={doc}
          pdfCount={pdfCount}
          page={page}
          placed={placed}
          pageItems={pageItems}
          pageFields={pageFields}
          allFields={doc?.sign_fields || []}
          docRef={docRef}
          onPageChange={setCurrentPage}
          movingKey={movingKey}
          beginMove={beginMove}
          removePlaced={removePlaced}
          signOnField={signOnField}
        />
        <SignerAside
          doc={doc}
          seal={assets.seal}
          signature={assets.signature}
          ghostKind={ghost?.kind || null}
          onOpenMake={assets.openMake}
          beginCarry={beginCarry}
          onDecline={() => submit.setDeclineOpen(true)}
        />
      </div>

      {/* 底部【签署】：恒显示「签署」文案，未落章时置灰；一次性提交全部落框 */}
      <div className="kf-signbar">
        <button
          type="button"
          className="rent-btn rent-btn--primary rent-btn--lg"
          style={{ width: '100%' }}
          disabled={submit.submitting || placed.length === 0 || waitingTurn}
          onClick={submit.submitPlaced}
        >
          {t('contracts.signNow')}
        </button>
      </div>

      {/* 拖拽浮层：跟手反馈（落点是否在文档区一眼可见；纯点按路径不会出现） */}
      {ghost && (
        <div className="kf-ghost" style={{ left: ghost.x, top: ghost.y }}>
          <img src={ghost.kind === 'seal' ? assets.seal?.dataUrl : assets.signature?.png} alt="" draggable={false} loading="eager" decoding="async" />
        </div>
      )}

      <SignModal
        open={assets.signModalOpen}
        draft={assets.signDraft}
        rasterizing={assets.signRasterizing}
        onChangeDraft={assets.setSignDraft}
        onOk={assets.onSignModalOk}
        onCancel={() => assets.setSignModalOpen(false)}
      />

      <SealModal
        open={assets.sealModalOpen}
        onCancel={() => assets.setSealModalOpen(false)}
        createType={assets.sealCreateType}
        onChangeCreateType={assets.setSealCreateType}
        companyName={assets.sealCompanyName}
        onChangeCompanyName={assets.setSealCompanyName}
        middleText={assets.sealMiddleText}
        onChangeMiddleText={assets.setSealMiddleText}
        partyName={doc?.party?.name || doc?.party_name_masked || ''}
        generating={assets.sealGenerating}
        onGenerate={assets.onGenerateSealPreview}
        preview={assets.sealPreview}
        onUsePreview={assets.usePreviewSeal}
        seal={assets.seal}
        onFile={assets.onSealFile}
        fileRef={assets.sealFileRef}
      />

      {/* 印模上传裁剪弹窗 */}
      <SealCropperModal
        open={assets.sealCropOpen}
        src={assets.sealCropSrc}
        onOk={assets.onSealCropOk}
        onCancel={() => assets.setSealCropOpen(false)}
      />

      <RealNameModal
        open={submit.realOpen}
        step={submit.realStep}
        contact={submit.contact}
        onChangeContact={submit.setContact}
        realName={submit.realName}
        onChangeRealName={submit.setRealName}
        idNumber={submit.idNumber}
        onChangeIdNumber={submit.setIdNumber}
        code={submit.code}
        onChangeCode={submit.setCode}
        sendLoading={submit.sendLoading}
        devCode={submit.devCode}
        onOk={submit.realStep === 'send' ? submit.sendCode : submit.verifyIdentity}
        onCancel={() => submit.setRealOpen(false)}
      />

      <DeclineModal
        open={submit.declineOpen}
        reason={submit.declineReason}
        onChangeReason={submit.setDeclineReason}
        onOk={submit.confirmDecline}
        onCancel={() => submit.setDeclineOpen(false)}
      />
    </div>
  )
}

export default Sign
