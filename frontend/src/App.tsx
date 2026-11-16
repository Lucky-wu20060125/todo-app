import { useEffect, useState, type FormEvent } from 'react'
import { getMe, login as loginRequest, type User } from './api/auth'
import { ApiError } from './api/http'
import {
  createTodo,
  deleteTodo,
  listTodos,
  updateTodo,
  type Todo,
} from './api/todos'
import { LoginPage } from './components/LoginPage'
import { TodoForm } from './components/TodoForm'
import { TodoItem } from './components/TodoItem'
import './App.css'

const TOKEN_KEY = 'todo_token'

function App() {
  const [token, setToken] = useState<string | null>(() =>
    localStorage.getItem(TOKEN_KEY),
  )
  const [user, setUser] = useState<User | null>(null)
  const [todos, setTodos] = useState<Todo[]>([])
  const [newTitle, setNewTitle] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [loginSubmitting, setLoginSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [loginError, setLoginError] = useState('')

  function handleLogout() {
    localStorage.removeItem(TOKEN_KEY)
    setToken(null)
    setUser(null)
    setTodos([])
    setNewTitle('')
    setError('')
  }

  function handleApiError(err: unknown) {
    if (err instanceof ApiError && err.status === 401) {
      handleLogout()
      setLoginError('登录已过期，请重新登录')
      return
    }
    setError(err instanceof Error ? err.message : '操作失败')
  }

  useEffect(() => {
    if (!token) {
      setLoading(false)
      return
    }

    setLoading(true)
    Promise.all([getMe(token), listTodos(token)])
      .then(([currentUser, items]) => {
        setUser(currentUser)
        setTodos(items)
      })
      .catch(handleApiError)
      .finally(() => setLoading(false))
  }, [token])

  async function handleLogin(username: string, password: string) {
    setLoginSubmitting(true)
    setLoginError('')

    try {
      const response = await loginRequest(username, password)
      localStorage.setItem(TOKEN_KEY, response.access_token)
      setToken(response.access_token)
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : '登录失败')
    } finally {
      setLoginSubmitting(false)
    }
  }

  async function handleAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const title = newTitle.trim()
    if (!token || !title || submitting) {
      return
    }

    setSubmitting(true)
    setError('')

    try {
      const todo = await createTodo(token, title)
      setTodos((current) => [todo, ...current])
      setNewTitle('')
    } catch (err) {
      handleApiError(err)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleToggle(todo: Todo) {
    if (!token) {
      return
    }

    setError('')

    try {
      const updated = await updateTodo(token, todo.id, {
        completed: !todo.completed,
      })
      setTodos((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      )
    } catch (err) {
      handleApiError(err)
    }
  }

  async function handleDelete(id: number) {
    if (!token) {
      return
    }

    setError('')

    try {
      await deleteTodo(token, id)
      setTodos((current) => current.filter((item) => item.id !== id))
    } catch (err) {
      handleApiError(err)
    }
  }

  const remaining = todos.filter((todo) => !todo.completed).length
  const greeting = user ? `你好，${user.username}。` : ''

  if (!token) {
    return (
      <LoginPage
        error={loginError}
        submitting={loginSubmitting}
        onLogin={handleLogin}
      />
    )
  }

  return (
    <main className="app">
      <header className="header">
        <div className="header-top">
          <div>
            <p className="eyebrow">全栈学习项目</p>
            <h1>待办任务清单</h1>
          </div>
          <button className="logout" type="button" onClick={handleLogout}>
            退出登录
          </button>
        </div>
        <p className="summary">
          {loading
            ? '正在加载...'
            : `${greeting}共 ${todos.length} 项，未完成 ${remaining} 项`}
        </p>
      </header>

      <TodoForm
        value={newTitle}
        submitting={submitting}
        onChange={setNewTitle}
        onSubmit={handleAdd}
      />

      {error && <p className="error">{error}</p>}

      {loading ? (
        <p className="empty">正在加载待办事项...</p>
      ) : todos.length === 0 ? (
        <p className="empty">还没有待办事项，先添加一条吧。</p>
      ) : (
        <ul className="todo-list">
          {todos.map((todo) => (
            <TodoItem
              key={todo.id}
              todo={todo}
              onToggle={handleToggle}
              onDelete={handleDelete}
            />
          ))}
        </ul>
      )}
    </main>
  )
}

export default App
