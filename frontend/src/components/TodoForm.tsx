import type { FormEvent } from 'react'

type TodoFormProps = {
  value: string
  submitting: boolean
  disabled: boolean
  onChange: (value: string) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}

export function TodoForm({ value, submitting, disabled, onChange, onSubmit }: TodoFormProps) {
  return (
    <form className="todo-form" onSubmit={onSubmit} aria-busy={submitting}>
      <label className="field-label" htmlFor="new-todo">下一件想做的事</label>
      <div className="todo-input-row">
        <input
          id="new-todo"
          name="title"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="比如：读完一章书"
          maxLength={200}
          required
          disabled={disabled || submitting}
          aria-describedby="todo-hint"
          autoComplete="off"
        />
        <button className="button button-primary" type="submit" disabled={disabled || submitting || !value.trim()}>
          <span className="button-plus" aria-hidden="true">＋</span>
          <span>{submitting ? '添加中…' : '添加任务'}</span>
        </button>
      </div>
      <small className="field-hint" id="todo-hint">写下一件小事，按 Enter 添加。最多 200 个字符。</small>
    </form>
  )
}
