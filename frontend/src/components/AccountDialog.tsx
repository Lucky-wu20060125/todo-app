import { useState, type FormEvent } from 'react'
import { updateAccount, type User } from '../api/auth'

type AccountDialogProps = {
  user: User
  token: string
  onClose: () => void
  onUpdated: (user: User, token: string) => void
}

export function AccountDialog({ user, token, onClose, onUpdated }: AccountDialogProps) {
  const [username, setUsername] = useState(user.username)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return

    const nextUsername = username.trim()
    if (!nextUsername || Array.from(nextUsername).length < 3 || Array.from(nextUsername).length > 50 || /\s/u.test(nextUsername)) {
      setError('用户名需要 3–50 个字符，中间不能包含空白。')
      return
    }
    if (!currentPassword) {
      setError('请输入当前密码。')
      return
    }
    if (newPassword && (Array.from(newPassword).length < 8 || Array.from(newPassword).length > 128)) {
      setError('新密码需要 8–128 个字符。')
      return
    }
    if (newPassword !== confirmation) {
      setError('两次输入的新密码不一致。')
      return
    }

    setSubmitting(true)
    setError('')
    try {
      const result = await updateAccount(token, {
        current_password: currentPassword,
        username: nextUsername,
        ...(newPassword ? { password: newPassword } : {}),
      })
      onUpdated(result.user, result.access_token)
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败，请稍后重试。')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section className="account-dialog" role="dialog" aria-modal="true" aria-labelledby="account-title">
        <h2 id="account-title">更改账号和密码</h2>
        <form className="auth-form" onSubmit={handleSubmit} noValidate autoComplete="off">
          <label className="field" htmlFor="account-username">
            <span className="field-label">用户名</span>
            <input
              id="account-username"
              name="account-name"
              value={username}
              onChange={(event) => { setUsername(event.target.value); setError('') }}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={50}
              required
            />
          </label>

          <label className="field" htmlFor="account-current-password">
            <span className="field-label">当前密码</span>
            <input
              id="account-current-password"
              name="current-secret"
              type="password"
              value={currentPassword}
              onChange={(event) => { setCurrentPassword(event.target.value); setError('') }}
              autoComplete="off"
              required
            />
          </label>

          <label className="field" htmlFor="account-new-password">
            <span className="field-label">新密码（可选）</span>
            <input
              id="account-new-password"
              name="new-secret"
              type="password"
              value={newPassword}
              onChange={(event) => { setNewPassword(event.target.value); setError('') }}
              autoComplete="new-password"
              maxLength={128}
              placeholder="留空则不修改"
            />
          </label>

          <label className="field" htmlFor="account-confirm-password">
            <span className="field-label">确认新密码</span>
            <input
              id="account-confirm-password"
              name="confirm-secret"
              type="password"
              value={confirmation}
              onChange={(event) => { setConfirmation(event.target.value); setError('') }}
              autoComplete="new-password"
              maxLength={128}
              placeholder="再次输入新密码"
            />
          </label>

          {error && <p className="error" role="alert">{error}</p>}

          <div className="dialog-actions">
            <button className="button button-secondary" type="button" onClick={onClose} disabled={submitting}>取消</button>
            <button className="button button-primary" type="submit" disabled={submitting}>
              {submitting ? '保存中…' : '保存修改'}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}
