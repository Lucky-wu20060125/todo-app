import { useRef, useState, type MouseEvent } from 'react'
import type { Todo } from '../api/todos'

type TodoItemProps = {
  todo: Todo
  busy: boolean
  canMoveUp: boolean
  canMoveDown: boolean
  onToggle: (todo: Todo) => void
  onDelete: (id: number) => void
  onRename: (todo: Todo, title: string) => void
  onMove: (todo: Todo, direction: 'up' | 'down') => void
  onContextMenu: (todo: Todo, event: MouseEvent<HTMLLIElement>) => void
}

export function TodoItem({
  todo,
  busy,
  canMoveUp,
  canMoveDown,
  onToggle,
  onDelete,
  onRename,
  onMove,
  onContextMenu,
}: TodoItemProps) {
  const [title, setTitle] = useState(todo.title)
  const cancelRef = useRef(false)
  const committedRef = useRef(false)

  function commitTitle() {
    if (committedRef.current) return
    if (cancelRef.current) {
      cancelRef.current = false
      setTitle(todo.title)
      return
    }
    const next = title.trim()
    if (!next || next === todo.title) {
      setTitle(todo.title)
      return
    }
    committedRef.current = true
    onRename(todo, next)
  }

  return (
    <li
      className={`todo color-${todo.color}${todo.completed ? ' completed' : ''}${busy ? ' is-busy' : ''}`}
      aria-busy={busy}
      onContextMenu={(event) => onContextMenu(todo, event)}
    >
      <input
        type="checkbox"
        className="todo-check"
        checked={todo.completed}
        disabled={busy}
        onChange={() => onToggle(todo)}
        aria-label={`将「${todo.title}」标记为${todo.completed ? '未完成' : '已完成'}`}
      />
      <input
        className="todo-edit"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        onBlur={commitTitle}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            commitTitle()
            event.currentTarget.blur()
          } else if (event.key === 'Escape') {
            event.preventDefault()
            cancelRef.current = true
            setTitle(todo.title)
            event.currentTarget.blur()
          }
        }}
        disabled={busy}
        maxLength={200}
        aria-label={`编辑 ${todo.title}`}
      />
      <span className="todo-move">
        <button
          type="button"
          className="move-button"
          onClick={() => onMove(todo, 'up')}
          disabled={busy || !canMoveUp}
          aria-label={`上移 ${todo.title}`}
        >↑</button>
        <button
          type="button"
          className="move-button"
          onClick={() => onMove(todo, 'down')}
          disabled={busy || !canMoveDown}
          aria-label={`下移 ${todo.title}`}
        >↓</button>
      </span>
      <button
        type="button"
        className="button delete"
        disabled={busy}
        onClick={() => onDelete(todo.id)}
        aria-label={`删除 ${todo.title}`}
      >
        删除
      </button>
    </li>
  )
}
