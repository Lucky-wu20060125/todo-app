import type { Todo } from '../api/todos'

type TodoItemProps = {
  todo: Todo
  onToggle: (todo: Todo) => void
  onDelete: (id: number) => void
}

export function TodoItem({ todo, onToggle, onDelete }: TodoItemProps) {
  return (
    <li className={todo.completed ? 'todo completed' : 'todo'}>
      <label className="todo-title">
        <input
          type="checkbox"
          checked={todo.completed}
          onChange={() => onToggle(todo)}
        />
        <span>{todo.title}</span>
      </label>
      <button
        type="button"
        className="delete"
        onClick={() => onDelete(todo.id)}
        aria-label={`删除 ${todo.title}`}
      >
        删除
      </button>
    </li>
  )
}
