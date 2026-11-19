import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from 'react'
import {
  createTodo,
  deleteTodo,
  errorMessage,
  listTodos,
  reorderTodos,
  updateTodo,
  type Todo,
  type TodoColor,
} from './api/todos'
import { TodoItem } from './components/TodoItem'
import './App.css'

type ToggleJob = {
  desired: boolean
  confirmed: boolean
  version: number
  sentVersion: number
  running: boolean
  timer: number | null
}

function App() {
  const [todos, setTodos] = useState<Todo[]>([])
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [busyIds, setBusyIds] = useState<Set<number>>(() => new Set())
  const [error, setError] = useState('')
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [draftOpen, setDraftOpen] = useState(false)
  const [draftTitle, setDraftTitle] = useState('')
  const [contextMenu, setContextMenu] = useState<{ todo: Todo; x: number; y: number } | null>(null)
  const [draggingId, setDraggingId] = useState<number | null>(null)

  const tempIdRef = useRef(-1)
  const draftOpenRef = useRef(false)
  const draftInputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const todosRef = useRef<Todo[]>([])
  const completedRef = useRef(new Map<number, boolean>())
  const toggleJobsRef = useRef(new Map<number, ToggleJob>())
  const reorderChainRef = useRef<Promise<void>>(Promise.resolve())
  const reorderVersionRef = useRef(0)
  const dragStartTodosRef = useRef<Todo[]>([])
  const draggingIdRef = useRef<number | null>(null)
  const dragPointerYRef = useRef(0)
  const mountedRef = useRef(true)

  useLayoutEffect(() => {
    todosRef.current = todos
  }, [todos])

  useEffect(() => {
    mountedRef.current = true
    const jobs = toggleJobsRef.current
    return () => {
      mountedRef.current = false
      jobs.forEach((job) => {
        if (job.timer !== null) window.clearTimeout(job.timer)
      })
      jobs.clear()
      document.body.classList.remove('is-sorting')
    }
  }, [])

  useEffect(() => {
    let active = true

    listTodos()
      .then((data) => {
        if (!active) return
        setTodos(data)
        completedRef.current = new Map(data.map((todo) => [todo.id, todo.completed]))
      })
      .catch((err: unknown) => {
        if (!active) return
        setLoadFailed(true)
        setError(errorMessage(err))
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [loadAttempt])

  useEffect(() => {
    if (draftOpen) draftInputRef.current?.focus()
  }, [draftOpen])

  function handleRetryLoad() {
    setLoading(true)
    setLoadFailed(false)
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
    if (!ready) return

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
      const todo = await createTodo(title)
      if (!mountedRef.current) return
      completedRef.current.set(todo.id, todo.completed)
      setTodos((current) => current.map((item) => item.id === tempId ? todo : item))
    } catch (err) {
      if (!mountedRef.current) return
      setTodos((current) => current.filter((item) => item.id !== tempId))
      draftOpenRef.current = true
      setDraftOpen(true)
      setDraftTitle(title)
      setError(errorMessage(err))
    } finally {
      if (mountedRef.current) clearPending(tempId)
    }
  }

  function handleToggle(todo: Todo) {
    if (todo.id < 0 || loading || loadFailed) return

    const current = todosRef.current.find((item) => item.id === todo.id) ?? todo
    const nextCompleted = !(completedRef.current.get(todo.id) ?? current.completed)
    completedRef.current.set(todo.id, nextCompleted)

    setTodos((currentTodos) =>
      currentTodos.map((item) => item.id === todo.id ? { ...item, completed: nextCompleted } : item),
    )
    setError('')

    let job = toggleJobsRef.current.get(todo.id)
    if (!job) {
      job = {
        desired: nextCompleted,
        confirmed: current.completed,
        version: 0,
        sentVersion: 0,
        running: false,
        timer: null,
      }
      toggleJobsRef.current.set(todo.id, job)
    }
    job.desired = nextCompleted
    job.version += 1

    if (job.timer !== null) {
      window.clearTimeout(job.timer)
      job.timer = null
    }
    if (!job.running) {
      job.timer = window.setTimeout(() => {
        job.timer = null
        void flushToggle(todo.id)
      }, 60)
    }
  }

  async function flushToggle(id: number) {
    const job = toggleJobsRef.current.get(id)
    if (!job || job.running) return
    job.running = true

    try {
      while (job.sentVersion < job.version) {
        const version = job.version
        const desired = job.desired
        const updated = await updateTodo(id, { completed: desired })
        if (!mountedRef.current) return

        job.sentVersion = version
        job.confirmed = updated.completed
        if (job.version === version) {
          completedRef.current.set(id, updated.completed)
          setTodos((current) => current.map((item) =>
            item.id === id
              ? { ...item, completed: updated.completed, updated_at: updated.updated_at }
              : item,
          ))
        } else {
          setTodos((current) => current.map((item) =>
            item.id === id ? { ...item, updated_at: updated.updated_at } : item,
          ))
        }
      }
      if (toggleJobsRef.current.get(id) === job) {
        toggleJobsRef.current.delete(id)
      }
    } catch (err) {
      if (!mountedRef.current) return
      if (!todosRef.current.some((item) => item.id === id)) {
        toggleJobsRef.current.delete(id)
        return
      }
      const confirmed = job.confirmed
      completedRef.current.set(id, confirmed)
      setTodos((current) =>
        current.map((item) => item.id === id ? { ...item, completed: confirmed } : item),
      )
      if (toggleJobsRef.current.get(id) === job) {
        toggleJobsRef.current.delete(id)
      }
      setError(errorMessage(err))
    } finally {
      job.running = false
    }
  }

  async function handleRename(todo: Todo, title: string) {
    if (todo.id < 0 || title === todo.title || loading || loadFailed) return

    setTodos((current) =>
      current.map((item) => item.id === todo.id ? { ...item, title } : item),
    )

    try {
      const updated = await updateTodo(todo.id, { title })
      if (!mountedRef.current) return
      setTodos((current) => current.map((item) =>
        item.id === updated.id
          ? { ...item, title: updated.title, updated_at: updated.updated_at }
          : item,
      ))
    } catch (err) {
      if (!mountedRef.current) return
      setTodos((current) =>
        current.map((item) => item.id === todo.id ? { ...item, title: todo.title } : item),
      )
      setError(errorMessage(err))
    }
  }

  async function handleDelete(id: number) {
    if (id < 0 || loading || loadFailed) return

    const current = todosRef.current
    const index = current.findIndex((item) => item.id === id)
    if (index < 0) return
    const removed = current[index]

    const job = toggleJobsRef.current.get(id)
    if (job) {
      if (job.timer !== null) window.clearTimeout(job.timer)
      toggleJobsRef.current.delete(id)
    }
    completedRef.current.delete(id)

    setTodos((currentTodos) => currentTodos.filter((item) => item.id !== id))
    setError('')

    try {
      await deleteTodo(id)
    } catch (err) {
      if (!mountedRef.current) return
      setTodos((currentTodos) => {
        const next = [...currentTodos]
        next.splice(Math.min(index, next.length), 0, removed)
        return next
      })
      completedRef.current.set(id, removed.completed)
      setError(errorMessage(err))
    }
  }

  async function handleColor(todo: Todo, color: TodoColor) {
    setContextMenu(null)
    if (todo.id < 0 || todo.color === color || loading || loadFailed) return

    setTodos((current) =>
      current.map((item) => item.id === todo.id ? { ...item, color } : item),
    )

    try {
      const updated = await updateTodo(todo.id, { color })
      if (!mountedRef.current) return
      setTodos((current) => current.map((item) =>
        item.id === updated.id
          ? { ...item, color: updated.color, updated_at: updated.updated_at }
          : item,
      ))
    } catch (err) {
      if (!mountedRef.current) return
      setTodos((current) =>
        current.map((item) => item.id === todo.id ? { ...item, color: todo.color } : item),
      )
      setError(errorMessage(err))
    }
  }

  function handleDragStart(todo: Todo, clientY: number) {
    if (loading || loadFailed || todo.id < 0) return
    if (todosRef.current.some((item) => item.id < 0)) return
    dragStartTodosRef.current = todosRef.current
    draggingIdRef.current = todo.id
    dragPointerYRef.current = clientY
    setDraggingId(todo.id)
    setContextMenu(null)
    setError('')
    document.body.classList.add('is-sorting')
  }

  function reorderToPointer(clientY: number) {
    const list = listRef.current
    const id = draggingIdRef.current
    if (!list || id === null) return
    const rows = Array.from(list.querySelectorAll<HTMLElement>('[data-todo-id]'))
    if (rows.length === 0) return

    const current = todosRef.current
    const from = current.findIndex((item) => item.id === id)
    if (from < 0) return

    let target = rows.length
    for (let index = 0; index < rows.length; index += 1) {
      const rect = rows[index].getBoundingClientRect()
      if (clientY < rect.top + rect.height / 2) {
        target = index
        break
      }
    }
    const insertAt = target > from ? target - 1 : target
    if (insertAt === from) return

    const next = [...current]
    const [moved] = next.splice(from, 1)
    next.splice(insertAt, 0, moved)
    todosRef.current = next
    setTodos(next)
  }

  function handleDragMove(clientY: number) {
    if (draggingIdRef.current === null) return
    dragPointerYRef.current = clientY
    reorderToPointer(clientY)
  }

  function handleDragEnd(cancelled: boolean) {
    const id = draggingIdRef.current
    draggingIdRef.current = null
    setDraggingId(null)
    document.body.classList.remove('is-sorting')
    if (id === null) return

    if (cancelled) {
      const fallback = dragStartTodosRef.current
      todosRef.current = fallback
      setTodos(fallback)
      return
    }

    const order = todosRef.current
    const fallback = dragStartTodosRef.current
    const unchanged = order.length === fallback.length
      && order.every((item, index) => item.id === fallback[index].id)
    if (!unchanged) persistOrder(order, fallback)
  }

  function persistOrder(order: Todo[], fallback: Todo[]) {
    const version = reorderVersionRef.current + 1
    reorderVersionRef.current = version
    const ids = order.map((item) => item.id)

    reorderChainRef.current = reorderChainRef.current
      .catch(() => {})
      .then(async () => {
        const ordered = await reorderTodos(ids)
        if (!mountedRef.current || version !== reorderVersionRef.current) return
        setTodos(ordered)
      })
      .catch((err: unknown) => {
        if (!mountedRef.current || version !== reorderVersionRef.current) return
        setTodos(fallback)
        setError(errorMessage(err))
      })
  }

  useEffect(() => {
    if (draggingId === null) return
    let frame = 0

    function step() {
      const list = listRef.current
      if (list) {
        const rect = list.getBoundingClientRect()
        const pointerY = dragPointerYRef.current
        const edge = 56
        if (pointerY < rect.top + edge) {
          list.scrollTop -= Math.min(20, (rect.top + edge - pointerY) / 2)
        } else if (pointerY > rect.bottom - edge) {
          list.scrollTop += Math.min(20, (pointerY - (rect.bottom - edge)) / 2)
        }
        reorderToPointer(pointerY)
      }
      frame = window.requestAnimationFrame(step)
    }

    frame = window.requestAnimationFrame(step)
    return () => window.cancelAnimationFrame(frame)
  }, [draggingId])

  function handleContextMenu(todo: Todo, event: MouseEvent<HTMLLIElement>) {
    event.preventDefault()
    if (draggingIdRef.current !== null) return
    setContextMenu({
      todo,
      x: Math.min(event.clientX, window.innerWidth - 168),
      y: Math.min(event.clientY, window.innerHeight - 200),
    })
  }

  const remaining = todos.filter((todo) => !todo.completed).length
  const completed = todos.length - remaining
  const ready = !loading && !loadFailed
  const hasTemp = todos.some((todo) => todo.id < 0)
  const completion = todos.length ? Math.round(completed / todos.length * 100) : 0

  return (
    <main className="site-shell workspace">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true"><span /></span>
          <span>待办任务清单</span>
        </div>
        <span className="edition-label">本机</span>
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
        ) : loadFailed ? (
          <div className="empty-state"><p>本机数据加载失败。</p><button className="button button-secondary" type="button" onClick={handleRetryLoad}>重新加载</button></div>
        ) : (
          <ul className="todo-list" ref={listRef}>
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
            {todos.map((todo) => (
              <TodoItem
                key={todo.id}
                todo={todo}
                busy={busyIds.has(todo.id)}
                canDrag={ready && todo.id > 0 && !hasTemp}
                onToggle={handleToggle}
                onDelete={handleDelete}
                onRename={handleRename}
                onDragStart={handleDragStart}
                onDragMove={handleDragMove}
                onDragEnd={handleDragEnd}
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
    </main>
  )
}

export default App
