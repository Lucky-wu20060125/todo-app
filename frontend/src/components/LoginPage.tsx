import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { login, register } from '../api/auth'

type LoginPageProps = {
  notice: string
  onAuthenticated: (token: string, remember: boolean) => void
}

type AuthMode = 'login' | 'register'
type FieldErrors = Partial<Record<'username' | 'password' | 'confirmation', string>>

export function LoginPage({ notice, onAuthenticated }: LoginPageProps) {
  const [mode, setMode] = useState<AuthMode>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [remember, setRemember] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [phase, setPhase] = useState<'idle' | 'registering' | 'logging-in'>('idle')
  const requestRef = useRef<AbortController | null>(null)
  const usernameRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)
  const confirmationRef = useRef<HTMLInputElement>(null)
  const loginTabRef = useRef<HTMLButtonElement>(null)
  const registerTabRef = useRef<HTMLButtonElement>(null)
  const isRegister = mode === 'register'
  const submitting = phase !== 'idle'

  useEffect(() => () => {
    requestRef.current?.abort()
    requestRef.current = null
  }, [])

  function changeMode(next: AuthMode) {
    if (submitting || mode === next) return
    setMode(next)
    setPassword('')
    setConfirmation('')
    setFieldErrors({})
    setError('')
    setInfo('')
  }

  function handleTabKeys(event: KeyboardEvent<HTMLDivElement>) {
    if (submitting) return
    let next: AuthMode
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      next = isRegister ? 'login' : 'register'
    } else if (event.key === 'Home') {
      next = 'login'
    } else if (event.key === 'End') {
      next = 'register'
    } else {
      return
    }
    event.preventDefault()
    changeMode(next)
    const tab = next === 'login' ? loginTabRef : registerTabRef
    tab.current?.focus()
  }

  function clearErrors() {
    setFieldErrors({})
    setError('')
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting || requestRef.current) return

    const cleanUsername = username.trim()
    const errors: FieldErrors = {}
    const usernameLength = Array.from(cleanUsername).length
    const passwordLength = Array.from(password).length
    setUsername(cleanUsername)
    setError('')
    setInfo('')

    if (!cleanUsername) {
      errors.username = '请填写用户名。'
    } else if (isRegister && (usernameLength < 3 || usernameLength > 50 || /\s/u.test(cleanUsername))) {
      errors.username = '用户名需要 3–50 个字符，中间不能包含空白。'
    }
    if (!password) {
      errors.password = '请填写密码。'
    } else if (isRegister && (passwordLength < 8 || passwordLength > 128)) {
      errors.password = '密码需要 8–128 个字符。'
    }
    if (isRegister && !confirmation) {
      errors.confirmation = '请再次输入密码。'
    } else if (isRegister && password !== confirmation) {
      errors.confirmation = '两次输入的密码不一致。'
    }
    setFieldErrors(errors)
    if (Object.keys(errors).length) {
      const firstField = errors.username ? usernameRef : errors.password ? passwordRef : confirmationRef
      firstField.current?.focus()
      return
    }

    const controller = new AbortController()
    requestRef.current = controller
    setPhase(isRegister ? 'registering' : 'logging-in')
    let accountCreated = false

    try {
      if (isRegister) {
        await register(cleanUsername, password, controller.signal)
        if (controller.signal.aborted) return
        accountCreated = true
        setInfo('注册成功，正在为你登录…')
        setPhase('logging-in')
      }
      const response = await login(cleanUsername, password, controller.signal)
      if (!controller.signal.aborted) {
        onAuthenticated(response.access_token, remember)
      }
    } catch (err) {
      if (controller.signal.aborted) return
      const message = err instanceof Error ? err.message : '请求失败，请稍后重试。'
      setInfo('')
      if (accountCreated) {
        setMode('login')
        setConfirmation('')
        setError(`账号已创建，但自动登录未成功。请使用刚才的账号登录。${message}`)
      } else {
        setError(message)
      }
    } finally {
      if (!controller.signal.aborted && requestRef.current === controller) {
        requestRef.current = null
        setPhase('idle')
      }
    }
  }

  return (
    <main className="login-page login-page-simple">
      <section className="auth-card" aria-labelledby="auth-title">
        <div className="auth-brand">
          <span className="brand-mark" aria-hidden="true"><span /></span>
          <span>待办任务清单</span>
        </div>

        <h2 id="auth-title">{isRegister ? '注册账号' : '登录'}</h2>

        <div className="auth-tabs" role="tablist" aria-label="账号入口" onKeyDown={handleTabKeys}>
          <button
            ref={loginTabRef}
            id="login-tab"
            type="button"
            role="tab"
            aria-selected={!isRegister}
            aria-controls="auth-panel"
            tabIndex={isRegister ? -1 : 0}
            disabled={submitting}
            onClick={() => changeMode('login')}
          >登录</button>
          <button
            ref={registerTabRef}
            id="register-tab"
            type="button"
            role="tab"
            aria-selected={isRegister}
            aria-controls="auth-panel"
            tabIndex={isRegister ? 0 : -1}
            disabled={submitting}
            onClick={() => changeMode('register')}
          >注册账号</button>
        </div>

        <div id="auth-panel" role="tabpanel" aria-labelledby={isRegister ? 'register-tab' : 'login-tab'}>
          <form
            className="auth-form"
            onSubmit={handleSubmit}
            noValidate
            aria-busy={submitting}
            autoComplete="off"
          >
            <label className="field" htmlFor="auth-username">
              <span className="field-label">用户名</span>
              <input
                ref={usernameRef}
                id="auth-username"
                name="account"
                value={username}
                onChange={(event) => { setUsername(event.target.value); clearErrors() }}
                onBlur={() => setUsername((value) => value.trim())}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                required
                minLength={isRegister ? 3 : undefined}
                maxLength={isRegister ? 50 : undefined}
                disabled={submitting}
                aria-invalid={Boolean(fieldErrors.username)}
                aria-describedby="username-hint username-error"
                placeholder={isRegister ? '给自己取一个用户名' : '输入你的用户名'}
              />
              <small className="field-hint" id="username-hint">{isRegister ? '3–50 个字符，不含空白；两端空白会自动去除。' : '使用已有用户名登录。'}</small>
              <span className="field-error" id="username-error" aria-live="polite">{fieldErrors.username}</span>
            </label>

            <label className="field" htmlFor="auth-password">
              <span className="field-label">密码</span>
              <input
                ref={passwordRef}
                id="auth-password"
                name="secret"
                type="password"
                value={password}
                onChange={(event) => { setPassword(event.target.value); clearErrors() }}
                autoComplete="new-password"
                required
                minLength={isRegister ? 8 : undefined}
                maxLength={isRegister ? 128 : undefined}
                disabled={submitting}
                aria-invalid={Boolean(fieldErrors.password)}
                aria-describedby="password-hint password-error"
                placeholder={isRegister ? '设置 8–128 个字符的密码' : '输入你的密码'}
              />
              <small className="field-hint" id="password-hint">{isRegister ? '8–128 个字符，密码中的空白会保留。' : '输入此账号原有的密码。'}</small>
              <span className="field-error" id="password-error" aria-live="polite">{fieldErrors.password}</span>
            </label>

            {isRegister && (
              <label className="field" htmlFor="auth-confirmation">
                <span className="field-label">确认密码</span>
                <input
                  ref={confirmationRef}
                  id="auth-confirmation"
                  name="confirm-secret"
                  type="password"
                  value={confirmation}
                  onChange={(event) => { setConfirmation(event.target.value); clearErrors() }}
                  autoComplete="new-password"
                  required
                  maxLength={128}
                  disabled={submitting}
                  aria-invalid={Boolean(fieldErrors.confirmation)}
                  aria-describedby="confirmation-error"
                  placeholder="再输入一次密码"
                />
                <span className="field-error" id="confirmation-error" aria-live="polite">{fieldErrors.confirmation}</span>
              </label>
            )}

            <label className="remember-field" htmlFor="remember-me">
              <input
                id="remember-me"
                type="checkbox"
                checked={remember}
                onChange={(event) => setRemember(event.target.checked)}
                disabled={submitting}
              />
              <span className="remember-copy">
                <strong>记住我</strong>
                <small>仅限个人设备；不勾选时，关闭标签页或浏览器后需要重新登录。</small>
              </span>
            </label>

            {notice && <p className="notice" role="status">{notice}</p>}
            {error && <p className="error" role="alert">{error}</p>}
            <p className="auth-status" role="status" aria-live="polite">{info}</p>
            <button className="button button-primary login-button" type="submit" disabled={submitting}>
              <span>{phase === 'registering' ? '正在创建…' : phase === 'logging-in' ? '正在登录…' : isRegister ? '注册' : '登录'}</span>
              <span aria-hidden="true">→</span>
            </button>
          </form>
        </div>
        <p className="auth-footnote">{isRegister ? '已有账号？切换到「登录」。' : '还没有账号？切换到「注册账号」。'}</p>
      </section>
    </main>
  )
}
