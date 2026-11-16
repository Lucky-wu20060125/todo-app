import { useEffect, useState, type FormEvent } from 'react'
import {
  createTodo,
  deleteTodo,
  listTodos,
  updateTodo,
  type Todo,
} from './api/todos'
import { TodoForm } from './components/TodoForm'
import { TodoItem } from './components/TodoItem'
import './App.css'

function App() {
  const [todos, setTodos] = useState<Todo[]>([])
  const [newTitle, setNewTitle] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    listTodos()
      .then(setTodos)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  async function handleAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const title = newTitle.trim()
    if (!title || submitting) {
      return
    }

    setSubmitting(true)
    setError('')

    try {
      const todo = await createTodo(title)
      setTodos((current) => [todo, ...current])
      setNewTitle('')
    } catch (err) {
      setError(err instanceof Error ? err.message : '新增失败')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleToggle(todo: Todo) {
    setError('')

    try {
      const updated = await updateTodo(todo.id, {
        completed: !todo.completed,
      })
      setTodos((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新失败')
    }
  }

  async function handleDelete(id: number) {
    setError('')

    try {
      await deleteTodo(id)
      setTodos((current) => current.filter((item) => item.id !== id))
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败')
    }
  }

  const remaining = todos.filter((todo) => !todo.completed).length

  return (
    <main className="app">
      <header className="header">
        <p className="eyebrow">全栈学习项目</p>
        <h1>待办任务清单</h1>
        <p className="summary">
          {loading
            ? '正在加载...'
            : `共 ${todos.length} 项，未完成 ${remaining} 项`}
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
