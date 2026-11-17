import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react'
import { type User } from './api/auth'
import { getBootstrap } from './api/bootstrap'
import { ApiError } from './api/http'
import {
  createTodo,
  deleteTodo,
  reorderTodos,
  updateTodo,
  type Todo,
  type TodoColor,
} from './api/todos'
import { AccountDialog } from './components/AccountDialog'
import { LoginPage } from './components/LoginPage'
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

function Workspace({
  session,
  onSessionEnd,
  onAccountUpdated,
}: {
  session: Session
  onSessionEnd: EndSession
  onAccountUpdated: (token: string) => void
}) {
  const [user, setUser] = useState<User | null>(null)
  const [todos, setTodos] = useState<Todo[]>([])
  const [loading, setLoading] = useState(true)
  const [busyIds, setBusyIds] = useState<Set<number>>(() => new Set())
  const [error, setError] = useState('')
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [draftOpen, setDraftOpen] = useState(false)
  const [draftTitle, setDraftTitle] = useState('')
  const [accountOpen, setAccountOpen] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ todo: Todo; x: number; y: number } | null>(null)
  const controllerRef = useRef<AbortController | null>(null)
  const tempIdRef = useRef(-1)
  const draftOpenRef = useRef(false)
  const draftInputRef = useRef<HTMLInputElement>(null)
  const pendingTogglesRef = useRef(new Set<number>())
  const movingRef = useRef(false)

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

    getBootstrap(session.token, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return
        setUser(data.user)
        setTodos(data.todos)
      })
      .catch((err: unknown) => handleApiError(err, controller))
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    // Each request keeps this controller, including across StrictMode effect restarts.
    return () => controller.abort()
  }, [session, handleApiError, loadAttempt])

  useEffect(() => {
    if (draftOpen) draftInputRef.current?.focus()
  }, [draftOpen])

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
    setBusyIds((current) => {
      const next = new Set(current)
      next.add(id)
      return next
    })
  }

  function clearPending(id: number) {
    setBusyIds((current) => {
      const next = new Set(current)
      next.delete(id)
      return next
    })
  }

  function openDraft() {
    if (!ready) return
    if (draftOpenRef.current) {
      draftInputRef.current?.focus()
      return
    }
    draftOpenRef.current = true
    setDraftTitle('')
    setDraftOpen(true)
  }

  function cancelDraft() {
    draftOpenRef.current = false
    setDraftOpen(false)
    setDraftTitle('')
  }

  async function commitDraft() {
    if (!draftOpenRef.current) return
    const title = draftTitle.trim()
    if (!title) {
      cancelDraft()
      return
    }

    const controller = controllerRef.current
    if (!controller || controller.signal.aborted || loading || !user) return

    const tempId = tempIdRef.current--
    const now = new Date().toISOString()
    const optimisticTodo: Todo = {
      id: tempId,
      title,
      completed: false,
      color: 'none',
      created_at: now,
      updated_at: now,
    }

    draftOpenRef.current = false
    setDraftOpen(false)
    setDraftTitle('')
    markPending(tempId)
    setTodos((current) => [optimisticTodo, ...current])
    setError('')

    try {
      const todo = await createTodo(session.token, title, controller.signal)
      if (controller.signal.aborted) return
      setTodos((current) => current.map((item) => item.id === tempId ? todo : item))
    } catch (err) {
      if (controller.signal.aborted) return
      setTodos((current) => current.filter((item) => item.id !== tempId))
      draftOpenRef.current = true
      setDraftOpen(true)
      setDraftTitle(title)
      handleApiError(err, controller)
    } finally {
      if (!controller.signal.aborted) clearPending(tempId)
    }
  }

  async function handleToggle(todo: Todo) {
    if (todo.id < 0 || pendingTogglesRef.current.has(todo.id)) return
    const controller = controllerRef.current
    if (!controller || controller.signal.aborted || loading || !user) return

    pendingTogglesRef.current.add(todo.id)
    const nextCompleted = !todo.completed
    setTodos((current) =>
      current.map((item) => item.id === todo.id ? { ...item, completed: nextCompleted } : item),
    )

    try {
      const updated = await updateTodo(session.token, todo.id, {
        completed: nextCompleted,
      }, controller.signal)
      if (controller.signal.aborted) return
      setTodos((current) => current.map((item) =>
        item.id === updated.id
          ? { ...item, completed: updated.completed, updated_at: updated.updated_at }
          : item,
      ))
    } catch (err) {
      if (controller.signal.aborted) return
      setTodos((current) =>
        current.map((item) => item.id === todo.id ? { ...item, completed: todo.completed } : item),
      )
      handleApiError(err, controller)
    } finally {
      pendingTogglesRef.current.delete(todo.id)
    }
  }

  async function handleRename(todo: Todo, title: string) {
    if (todo.id < 0 || title === todo.title) return
    const controller = controllerRef.current
    if (!controller || controller.signal.aborted || loading || !user) return

    setTodos((current) =>
      current.map((item) => item.id === todo.id ? { ...item, title } : item),
    )

    try {
      const updated = await updateTodo(session.token, todo.id, { title }, controller.signal)
      if (controller.signal.aborted) return
      setTodos((current) => current.map((item) =>
        item.id === updated.id
          ? { ...item, title: updated.title, updated_at: updated.updated_at }
          : item,
      ))
    } catch (err) {
      if (controller.signal.aborted) return
      setTodos((current) =>
        current.map((item) => item.id === todo.id ? { ...item, title: todo.title } : item),
      )
      handleApiError(err, controller)
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

    try {
      await deleteTodo(session.token, id, controller.signal)
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

  async function handleColor(todo: Todo, color: TodoColor) {
    setContextMenu(null)
    if (todo.id < 0 || todo.color === color) return
    const controller = controllerRef.current
    if (!controller || controller.signal.aborted || loading || !user) return

    setTodos((current) =>
      current.map((item) => item.id === todo.id ? { ...item, color } : item),
    )

    try {
      const updated = await updateTodo(session.token, todo.id, { color }, controller.signal)
      if (controller.signal.aborted) return
      setTodos((current) => current.map((item) =>
        item.id === updated.id
          ? { ...item, color: updated.color, updated_at: updated.updated_at }
          : item,
      ))
    } catch (err) {
      if (controller.signal.aborted) return
      setTodos((current) =>
        current.map((item) => item.id === todo.id ? { ...item, color: todo.color } : item),
      )
      handleApiError(err, controller)
    }
  }

  async function handleMove(todo: Todo, direction: 'up' | 'down') {
    if (todo.id < 0 || movingRef.current) return
    const controller = controllerRef.current
    if (!controller || controller.signal.aborted || loading || !user) return

    const index = todos.findIndex((item) => item.id === todo.id)
    const target = direction === 'up' ? index - 1 : index + 1
    if (index < 0 || target < 0 || target >= todos.length) return

    const previous = todos
    const next = [...todos]
    const [moved] = next.splice(index, 1)
    next.splice(target, 0, moved)

    setTodos(next)
    setError('')
    movingRef.current = true

    try {
      const ordered = await reorderTodos(
        session.token,
        next.map((item) => item.id),
        controller.signal,
      )
      if (!controller.signal.aborted) setTodos(ordered)
    } catch (err) {
      if (!controller.signal.aborted) {
        setTodos(previous)
        handleApiError(err, controller)
      }
    } finally {
      movingRef.current = false
    }
  }

  function handleContextMenu(todo: Todo, event: MouseEvent<HTMLLIElement>) {
    if (event.target instanceof HTMLInputElement) return
    event.preventDefault()
    setContextMenu({
      todo,
      x: Math.min(event.clientX, window.innerWidth - 168),
      y: Math.min(event.clientY, window.innerHeight - 200),
    })
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
          <span>待办任务清单</span>
        </div>
        <div className="account-bar">
          <button
            className="account-name"
            type="button"
            onClick={() => setAccountOpen(true)}
            disabled={!user}
          >
            {user ? `当前账号：${user.username}` : '加载中…'}
          </button>
          <button className="button button-secondary logout" type="button" onClick={handleLogout}>退出登录</button>
        </div>
      </header>

      <section className="todo-panel paper-panel workspace-card" aria-busy={loading}>
        <div className="progress-meta">
          <span>总数 {ready ? todos.length : '—'}</span>
          <span>已完成 {ready ? completed : '—'}</span>
          <span>待完成 {ready ? remaining : '—'}</span>
        </div>
        <div className="progress-strip">
          <progress value={completed} max={todos.length || 1} aria-label="完成进度" />
          <strong>{ready ? `${completion}%` : '—'}</strong>
          <button className="add-round" type="button" onClick={openDraft} disabled={!ready} aria-label="新增待办">
            <span aria-hidden="true">＋</span>
          </button>
        </div>

        {error && <p className="error" role="alert">{error}</p>}

        {loading ? (
          <div className="empty-state" role="status"><span className="loading-mark" aria-hidden="true" /><p>正在加载…</p></div>
        ) : !ready ? (
          <div className="empty-state"><p>加载失败。</p><button className="button button-secondary" type="button" onClick={handleRetryLoad}>重新加载</button></div>
        ) : (
          <ul className="todo-list">
            {draftOpen && (
              <li className="todo todo-draft">
                <span className="todo-check-placeholder" aria-hidden="true" />
                <input
                  ref={draftInputRef}
                  className="todo-edit"
                  value={draftTitle}
                  onChange={(event) => setDraftTitle(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      void commitDraft()
                    } else if (event.key === 'Escape') {
                      event.preventDefault()
                      cancelDraft()
                    }
                  }}
                  onBlur={() => { void commitDraft() }}
                  placeholder="输入待办内容"
                  maxLength={200}
                  aria-label="新待办内容"
                />
                <button
                  type="button"
                  className="button delete"
                  onMouseDown={(event) => {
                    event.preventDefault()
                    cancelDraft()
                  }}
                  aria-label="取消新增"
                >删除</button>
              </li>
            )}
            {todos.length === 0 && !draftOpen && (
              <li className="todo-empty">暂无待办</li>
            )}
            {todos.map((todo, index) => (
              <TodoItem
                key={`${todo.id}:${todo.title}`}
                todo={todo}
                busy={busyIds.has(todo.id)}
                canMoveUp={index > 0}
                canMoveDown={index < todos.length - 1}
                onToggle={handleToggle}
                onDelete={handleDelete}
                onRename={handleRename}
                onMove={handleMove}
                onContextMenu={handleContextMenu}
              />
            ))}
          </ul>
        )}
      </section>

      {contextMenu && (
        <>
          <div
            className="context-backdrop"
            onMouseDown={() => setContextMenu(null)}
            onContextMenu={(event) => {
              event.preventDefault()
              setContextMenu(null)
            }}
          />
          <div
            className="color-menu"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            role="menu"
            aria-label="任务颜色"
          >
            {[
              { value: 'red' as TodoColor, label: '淡红' },
              { value: 'green' as TodoColor, label: '淡绿' },
              { value: 'yellow' as TodoColor, label: '淡黄' },
              { value: 'none' as TodoColor, label: '默认' },
            ].map((option) => (
              <button
                key={option.value}
                type="button"
                className="color-option"
                role="menuitem"
                onClick={() => handleColor(contextMenu.todo, option.value)}
              >
                <span className={`color-dot color-${option.value}`} aria-hidden="true" />
                {option.label}
              </button>
            ))}
          </div>
        </>
      )}

      {accountOpen && user && (
        <AccountDialog
          user={user}
          token={session.token}
          onClose={() => setAccountOpen(false)}
          onUpdated={(_updatedUser, token) => {
            setAccountOpen(false)
            onAccountUpdated(token)
          }}
        />
      )}
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

  const handleAccountUpdated = useCallback((token: string) => {
    persistToken(token, localStorage.getItem(REMEMBER_KEY) === '1')
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

  // A new workspace owns all user data, drafts and pending operations.
  // The revision also isolates consecutive sessions that happen to share a token.
  return session
    ? (
      <Workspace
        key={session.revision}
        session={session}
        onSessionEnd={handleSessionEnd}
        onAccountUpdated={handleAccountUpdated}
      />
    )
    : <LoginPage notice={loginNotice} onAuthenticated={handleAuthenticated} />
}

export default App
