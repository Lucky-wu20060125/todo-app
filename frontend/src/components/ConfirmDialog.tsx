type ConfirmDialogProps = {
  count: number
  onCancel: () => void
  onConfirm: () => void
}

export function ConfirmDialog({ count, onCancel, onConfirm }: ConfirmDialogProps) {
  return (
    <div className="modal-backdrop" onMouseDown={onCancel}>
      <div
        className="confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id="confirm-title">清理已完成任务</h2>
        <p>
          将永久删除 <strong>{count}</strong> 条已完成任务，无法撤销。
        </p>
        <div className="dialog-actions">
          <button className="button button-secondary" type="button" onClick={onCancel}>
            取消
          </button>
          <button className="button button-danger" type="button" onClick={onConfirm}>
            删除
          </button>
        </div>
      </div>
    </div>
  )
}
