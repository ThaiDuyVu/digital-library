import { useEffect, useRef } from 'react'

/** Hộp thoại xác nhận đơn giản; Esc hoặc bấm ra ngoài = Hủy. */
export function ConfirmDialog({ title, message, confirmLabel, onConfirm, onCancel }) {
  const confirmRef = useRef(null)
  const cancelRef = useRef(onCancel)

  useEffect(() => {
    cancelRef.current = onCancel
  })

  // Chỉ chạy lúc mở: trang đọc render lại liên tục khi cuộn, không được giật focus mỗi lần đó
  useEffect(() => {
    confirmRef.current?.focus()
    function onKey(event) {
      if (event.key === 'Escape') cancelRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="dialog-backdrop" onClick={onCancel}>
      <div
        className="dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-message"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 id="confirm-title">{title}</h3>
        <p id="confirm-message">{message}</p>
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onCancel}>Hủy</button>
          <button ref={confirmRef} type="button" className="btn primary" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
