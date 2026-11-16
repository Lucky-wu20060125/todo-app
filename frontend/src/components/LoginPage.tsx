import { useState, type FormEvent } from 'react'

type LoginPageProps = {
  error: string
  submitting: boolean
  onLogin: (username: string, password: string) => Promise<void>
}

export function LoginPage({ error, submitting, onLogin }: LoginPageProps) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await onLogin(username.trim(), password)
  }

  return (
    <main className="login-page">
      <form className="login-card" onSubmit={handleSubmit}>
        <p className="eyebrow">全栈学习项目</p>
        <h1>登录待办清单</h1>
        <p className="summary">输入你在后端创建的用户名和密码</p>

        <label className="field">
          <span>用户名</span>
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            placeholder="例如 wuzhi"
          />
        </label>

        <label className="field">
          <span>密码</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            placeholder="至少 8 位"
          />
        </label>

        {error && <p className="error">{error}</p>}

        <button
          className="login-button"
          type="submit"
          disabled={submitting || !username.trim() || !password}
        >
          {submitting ? '登录中...' : '登录'}
        </button>
      </form>
    </main>
  )
}
