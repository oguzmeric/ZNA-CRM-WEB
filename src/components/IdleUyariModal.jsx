import { useIdleTimeout } from '../context/IdleTimeoutContext'
import { Modal, Button } from './ui'

export default function IdleUyariModal() {
  const { uyariGorunur, kalanSaniye, oturumUzat } = useIdleTimeout()
  if (!uyariGorunur) return null

  const dk = Math.floor(kalanSaniye / 60)
  const sn = kalanSaniye % 60
  const zaman = `${dk}:${String(sn).padStart(2, '0')}`

  return (
    <Modal open={true} onClose={oturumUzat} title="Oturum kapanmak üzere" width={420}>
      <div style={{ padding: '8px 4px 4px 4px' }}>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>
          Uzun süredir hareketsizsiniz.
          Güvenlik nedeniyle{' '}
          <strong style={{ color: '#dc2626', fontVariantNumeric: 'tabular-nums' }}>{zaman}</strong>
          {' '}sonra otomatik olarak çıkış yapılacak.
        </p>
        <p style={{ margin: '10px 0 0 0', fontSize: 12, color: 'var(--text-tertiary)' }}>
          Devam etmek için aşağıdaki butona basın veya sayfada hareket edin.
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
          <Button variant="primary" onClick={oturumUzat}>
            Devam et
          </Button>
        </div>
      </div>
    </Modal>
  )
}
