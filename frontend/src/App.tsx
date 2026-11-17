import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { getMe, type User } from './api/auth'
import { ApiError } from './api/http'
import { createTodo, deleteTodo, listTodos, updateTodo, type Todo } from './api/todos'
import { LoginPage } from './components/LoginPage'
import { TodoForm } from './components/TodoForm'
import { TodoItem } from './components/TodoItem'
import './App.css'

const TOKEN_KEY = 'todo_token'
const REMEMBER_KEY = 'todo_remember'

function readStoredToken(): string | null {
  const remembered = localStorage.getItem(REMEMBER_KEY) === '1'
  if (!remembered) {
    // Tokens saved by the old version had no explicit remember choice.
    localStorage.removeItem(TOKEN_KEY)
  }
  const sessionToken = sessionStorage.getItem(TOKEN_KEY)
  if (sessionToken) {
    return sessionToken
  }
  return remembered ? localStorage.getItem(TOKEN_KEY) : null
}

function persistToken(token: string, remember: boolean) {
  sessionStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(REMEMBER_KEY)
  if (remember) {
    localStorage.setItem(TOKEN_KEY, token)
    localStorage.setItem(REMEMBER_KEY, '1')
    return
  }
  sessionStorage.setItem(TOKEN_KEY, token)
}

function clearStoredToken() {
  sessionStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(REMEMBER_KEY)
}

type Session = { token: string; revision: number }
type EndSession = (session: Session, message?: string) => void

function Workspace({ session, onSessionEnd }: { session: Session; onSessionEnd: EndSession }) {
  const [user, setUser] = useState<User | null>(null)
  const [todos, setTodos] = useState<Todo[]>([])
  const [newTitle, setNewTitle] = useState('')
  const [loading, setLoading] = useState(true)
  const [busyIds, setBusyIds] = useState<Set<number>>(() => new Set())
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')
  const [loadAttempt, setLoadAttempt] = useState(0)
  const controllerRef = useRef<AbortController | null>(null)
  const pendingIdsRef = useRef(new Set<number>())
  const tempIdRef = useRef(-1)

  const handleApiError = useCallback((err: unknown, controller: AbortController) => {
    if (controller.signal.aborted) return
    if (err instanceof ApiError && err.status === 401) {
      controller.abort()
      onSessionEnd(session, '登录已过期，请重新登录。')
      return
    }
    setError(err instanceof Error ? err.message : '操作失败，请稍后重试。')
  }, [onSessionEnd, session])

  useEffect(() => {
    const controller = new AbortController()
    controllerRef.current = controller

    Promise.all([
      getMe(session.token, controller.signal),
      listTodos(session.token, controller.signal),
    ])
      .then(([currentUser, items]) => {
        if (controller.signal.aborted) return
        setUser(currentUser)
        setTodos(items)
      })
      .catch((err: unknown) => handleApiError(err, controller))
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    // Each request keeps this controller, including across StrictMode effect restarts.
    return () => controller.abort()
  }, [session, handleApiError, loadAttempt])

  function handleLogout() {
    controllerRef.current?.abort()
    onSessionEnd(session)
  }

  function handleRetryLoad() {
    setLoading(true)
    setError('')
    setLoadAttempt((value) => value + 1)
  }

  function markPending(id: number) {
    pendingIdsRef.current.add(id)
    setBusyIds(new Set(pendingIdsRef.current))
  }

  function clearPending(id: number) {
    pendingIdsRef.current.delete(id)
    setBusyIds(new Set(pendingIdsRef.current))
  }

  async function handleAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const controller = controllerRef.current
    const title = newTitle.trim()
    if (!controller || controller.signal.aborted || loading || !user || !title) return

    const tempId = tempIdRef.current--
    const now = new Date().toISOString()
    const optimisticTodo: Todo = {
      id: tempId,
      title,
      completed: false,
      created_at: now,
      updated_at: now,
    }

    markPending(tempId)
    setTodos((current) => [optimisticTodo, ...current])
    setNewTitle('')
    setError('')
    setFeedback('新任务已加入清单，开始行动吧！')

    try {
      const todo = await createTodo(session.token, title, controller.signal)
      if (controller.signal.aborted) return
      setTodos((current) => current.map((item) => item.id === tempId ? todo : item))
    } catch (err) {
      if (controller.signal.aborted) return
      setTodos((current) => current.filter((item) => item.id !== tempId))
      setNewTitle((current) => current ? current : title)
      setFeedback('')
      handleApiError(err, controller)
    } finally {
      if (!controller.signal.aborted) clearPending(tempId)
    }
  }

  function startItemRequest(id: number): AbortController | null {
    const controller = controllerRef.current
    if (!controller || controller.signal.aborted || loading || !user || pendingIdsRef.current.has(id)) return null
    markPending(id)
    setError('')
    setFeedback('')
    return controller
  }

  function finishItemRequest(id: number, controller: AbortController) {
    if (!controller.signal.aborted) clearPending(id)
  }

  async function handleToggle(todo: Todo) {
    if (todo.id < 0) return
    const controller = startItemRequest(todo.id)
    if (!controller) return

    const nextCompleted = !todo.completed
    setTodos((current) =>
      current.map((item) => item.id === todo.id ? { ...item, completed: nextCompleted } : item),
    )
    setFeedback(nextCompleted ? '又搞定一件，做得漂亮！' : '任务已恢复为待完成。')

    try {
      const updated = await updateTodo(session.token, todo.id, {
        completed: nextCompleted,
      }, controller.signal)
      if (controller.signal.aborted) return
      setTodos((current) => current.map((item) => item.id === updated.id ? updated : item))
    } catch (err) {
      if (controller.signal.aborted) return
      setTodos((current) =>
        current.map((item) => item.id === todo.id ? { ...item, completed: todo.completed } : item),
      )
      setFeedback('')
      handleApiError(err, controller)
    } finally {
      finishItemRequest(todo.id, controller)
    }
  }

  async function handleDelete(id: number) {
    if (id < 0) return
    const controller = controllerRef.current
    if (!controller || controller.signal.aborted || loading || !user) return

    const index = todos.findIndex((item) => item.id === id)
    if (index < 0) return
    const removed = todos[index]

    setTodos((current) => current.filter((item) => item.id !== id))
    setError('')
    setFeedback('')

    try {
      await deleteTodo(session.token, id, controller.signal)
      if (!controller.signal.aborted) setFeedback('任务已删除，给重要的事留点位置。')
    } catch (err) {
      if (controller.signal.aborted) return
      setTodos((current) => {
        const next = [...current]
        next.splice(Math.min(index, next.length), 0, removed)
        return next
      })
      handleApiError(err, controller)
    }
  }

  const remaining = todos.filter((todo) => !todo.completed).length
  const completed = todos.length - remaining
  const ready = Boolean(user) && !loading
  const completion = todos.length ? Math.round(completed / todos.length * 100) : 0

  return (
    <main className="site-shell workspace">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true"><span /></span>
          <span>待办任务清单<small>MAKE IT HAPPEN.</small></span>
        </div>
        <div className="account-bar">
          <span className="account-name">{user ? `你好，${user.username}` : '正在打开你的清单…'}</span>
          <button className="button button-secondary logout" type="button" onClick={handleLogout}>退出登录</button>
        </div>
      </header>

      <section className="workspace-hero" aria-labelledby="workspace-title">
        <div>
          <span className="sticker sticker-blue">我的待办 / MY TO-DO LIST</span>
          <h1 id="workspace-title">计划很酷，<span className="title-highlight">行动更酷。</span></h1>
          <p className="hero-description">把想做的事写下来，一件一件，变成「已完成」。</p>
        </div>
        <span className="comic-burst workspace-burst" aria-hidden="true">LET’S<br />GO!</span>
      </section>

      <div className="workspace-grid">
        <section className="todo-panel paper-panel" aria-labelledby="todo-panel-title" aria-busy={loading}>
          <div className="panel-heading">
            <div><p className="eyebrow">LESS WAITING. MORE DOING.</p><h2 id="todo-panel-title">今天，做点什么？</h2></div>
            <span className="panel-number" aria-hidden="true">01</span>
          </div>
          <TodoForm value={newTitle} disabled={!ready} onChange={setNewTitle} onSubmit={handleAdd} />

          {error && <p className="error" role="alert">{error}</p>}
          <p className="workspace-feedback" role="status" aria-live="polite">{feedback}</p>

          <div className="list-heading"><h3>行动清单</h3><span>{ready ? `${todos.length} 件事` : '准备中'}</span></div>
          {loading ? (
            <div className="empty-state" role="status"><span className="loading-mark" aria-hidden="true" /><h3>正在铺开你的清单…</h3><p>好计划，马上就来。</p></div>
          ) : !ready ? (
            <div className="empty-state"><span className="empty-mark" aria-hidden="true">!</span><h3>清单暂时没有加载成功</h3><p>请检查网络，再试一次。</p><button className="button button-secondary" type="button" onClick={handleRetryLoad}>重新加载</button></div>
          ) : todos.length === 0 ? (
            <div className="empty-state"><span className="empty-mark" aria-hidden="true">＋</span><span className="sticker sticker-mint">新的开始，无限可能</span><h3>第一件小事，就从这里开始。</h3><p>在上方写下一个待办，让今天动起来。</p></div>
          ) : (
            <>
              {remaining === 0 && <p className="all-done"><span className="drawn-check" aria-hidden="true" />全部搞定！今天的你，值得一个大大的赞。</p>}
              <ul className="todo-list">
                {todos.map((todo) => <TodoItem key={todo.id} todo={todo} busy={busyIds.has(todo.id)} onToggle={handleToggle} onDelete={handleDelete} />)}
              </ul>
            </>
          )}
        </section>

        <aside className="workspace-sidebar" aria-label="任务统计">
          <section className="stats-panel paper-panel" aria-labelledby="stats-title">
            <div className="stats-heading"><h2 id="stats-title">今日战报</h2><span aria-hidden="true">↗</span></div>
            <div className="stats-grid">
              <div className="stat stat-total"><span>全部任务</span><strong>{ready ? todos.length : '—'}</strong><small>TOTAL</small></div>
              <div className="stat stat-pending"><span>等待行动</span><strong>{ready ? remaining : '—'}</strong><small>TO DO</small></div>
              <div className="stat stat-done"><span>已经搞定</span><strong>{ready ? completed : '—'}</strong><small>DONE!</small></div>
            </div>
          </section>
          <section className="progress-panel paper-panel" aria-labelledby="progress-title">
            <span className="sticker sticker-blue">一点点，也很棒</span>
            <h2 id="progress-title">每一小步，<br />都算数。</h2>
            <div className="progress-caption"><span>完成进度</span><strong>{ready ? `${completion}%` : '—'}</strong></div>
            <progress value={completed} max={todos.length || 1} aria-label="任务完成进度" />
            <p>{!ready ? '准备好，就出发。' : todos.length === 0 ? '先写下一件小事，给行动一个起点。' : remaining === 0 ? '清单已清空待办，成就感拉满！' : `还有 ${remaining} 件小事，按自己的节奏来。`}</p>
          </section>
        </aside>
      </div>
      <footer className="page-footer"><span>少一点拖延，多一点搞定。</span><span>ONE THING AT A TIME.</span></footer>
    </main>
  )
}

function App() {
  const [session, setSession] = useState<Session | null>(() => {
    const token = readStoredToken()
    return token ? { token, revision: 0 } : null
  })
  const [loginNotice, setLoginNotice] = useState('')
  const sessionRef = useRef(session)
  const nextRevisionRef = useRef(0)

  const replaceSession = useCallback((token: string | null) => {
    const next = token ? { token, revision: ++nextRevisionRef.current } : null
    sessionRef.current = next
    setSession(next)
  }, [])

  const handleAuthenticated = useCallback((token: string, remember: boolean) => {
    persistToken(token, remember)
    setLoginNotice('')
    replaceSession(token)
  }, [replaceSession])

  const handleSessionEnd = useCallback<EndSession>((endingSession, message = '') => {
    // A late 401 from a previous workspace must never log out the current user.
    if (sessionRef.current !== endingSession) return
    if (readStoredToken() === endingSession.token) {
      clearStoredToken()
    }
    replaceSession(null)
    setLoginNotice(message)
  }, [replaceSession])

  useEffect(() => {
    function handleStorage(event: StorageEvent) {
      if (event.storageArea !== localStorage) return
      if (event.key !== TOKEN_KEY && event.key !== REMEMBER_KEY && event.key !== null) return
      // A tab with its own sessionStorage session is independent of remembered sessions.
      if (sessionStorage.getItem(TOKEN_KEY)) return
      const token = localStorage.getItem(REMEMBER_KEY) === '1'
        ? localStorage.getItem(TOKEN_KEY)
        : null
      if ((sessionRef.current?.token ?? null) === token) return
      replaceSession(token)
      setLoginNotice(token ? '' : '你已在其他页面退出，请重新登录。')
    }
    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [replaceSession])

  // A new workspace owns all user data, drafts, feedback and pending operations.
  // The revision also isolates consecutive sessions that happen to share a token.
  return session
    ? <Workspace key={session.revision} session={session} onSessionEnd={handleSessionEnd} />
    : <LoginPage notice={loginNotice} onAuthenticated={handleAuthenticated} />
}

export default App
