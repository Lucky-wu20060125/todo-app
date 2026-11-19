import { invoke } from '@tauri-apps/api/core'

export type TodoColor = 'none' | 'red' | 'green' | 'yellow'

export type Todo = {
  id: number
  title: string
  completed: boolean
  color: TodoColor
  created_at: string
  updated_at: string
}

export type TodoUpdate = {
  title?: string
  completed?: boolean
  color?: TodoColor
}

export function errorMessage(error: unknown): string {
  if (typeof error === 'string' && error.trim()) return error
  if (error instanceof Error && error.message) return error.message
  return '操作失败，请稍后重试。'
}

export function listTodos(): Promise<Todo[]> {
  return invoke<Todo[]>('list_todos')
}

export function createTodo(title: string): Promise<Todo> {
  return invoke<Todo>('create_todo', { title })
}

export function updateTodo(id: number, payload: TodoUpdate): Promise<Todo> {
  return invoke<Todo>('update_todo', { id, patch: payload })
}

export function reorderTodos(ids: number[]): Promise<Todo[]> {
  return invoke<Todo[]>('reorder_todos', { ids })
}

export function deleteTodo(id: number): Promise<void> {
  return invoke<void>('delete_todo', { id })
}
