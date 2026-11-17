import type { Todo } from '../api/todos'

type TodoItemProps = {
  todo: Todo
  busy: boolean
  onToggle: (todo: Todo) => void
  onDelete: (id: number) => void
}

export function TodoItem({ todo, busy, onToggle, onDelete }: TodoItemProps) {
  return (
    <li className={`todo${todo.completed ? ' completed' : ''}${busy ? ' is-busy' : ''}`} aria-busy={busy}>
      <label className="todo-title">
        <input
          type="checkbox"
          checked={todo.completed}
          disabled={busy}
          onChange={() => onToggle(todo)}
          aria-label={`将「${todo.title}」标记为${todo.completed ? '未完成' : '已完成'}`}
        />
        <span className="todo-copy">
          <span className="todo-text">{todo.title}</span>
          <span className="task-state">{busy ? '正在保存…' : todo.completed ? '已完成 / DONE' : '待完成 / TO DO'}</span>
        </span>
      </label>
      <button
        type="button"
        className="button delete"
        disabled={busy}
        onClick={() => onDelete(todo.id)}
        aria-label={`删除 ${todo.title}`}
      >
        {busy ? '处理中…' : '删除'}
      </button>
    </li>
  )
}
