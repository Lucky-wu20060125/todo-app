import type { FormEvent } from 'react'

type TodoFormProps = {
  value: string
  submitting: boolean
  onChange: (value: string) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}

export function TodoForm({
  value,
  submitting,
  onChange,
  onSubmit,
}: TodoFormProps) {
  return (
    <form className="todo-form" onSubmit={onSubmit}>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="今天要做什么？"
        maxLength={200}
        aria-label="新待办标题"
      />
      <button type="submit" disabled={submitting || !value.trim()}>
        {submitting ? '添加中...' : '添加'}
      </button>
    </form>
  )
}
