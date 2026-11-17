import { request } from './http'

export type TodoColor = 'none' | 'red' | 'green' | 'yellow'

export type Todo = {
  id: number
  title: string
  completed: boolean
  color: TodoColor
  created_at: string
  updated_at: string
}

export function listTodos(token: string, signal?: AbortSignal): Promise<Todo[]> {
  return request<Todo[]>('/api/todos', { signal }, token)
}

export function createTodo(
  token: string,
  title: string,
  signal?: AbortSignal,
): Promise<Todo> {
  return request<Todo>(
    '/api/todos',
    {
      method: 'POST',
      body: JSON.stringify({ title }),
      signal,
    },
    token,
  )
}

export function updateTodo(
  token: string,
  id: number,
  payload: { title?: string; completed?: boolean; color?: TodoColor },
  signal?: AbortSignal,
): Promise<Todo> {
  return request<Todo>(
    `/api/todos/${id}`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
      signal,
    },
    token,
  )
}

export function reorderTodos(
  token: string,
  ids: number[],
  signal?: AbortSignal,
): Promise<Todo[]> {
  return request<Todo[]>(
    '/api/todos/order',
    {
      method: 'PUT',
      body: JSON.stringify({ ids }),
      signal,
    },
    token,
  )
}

export function deleteTodo(
  token: string,
  id: number,
  signal?: AbortSignal,
): Promise<void> {
  return request<void>(
    `/api/todos/${id}`,
    {
      method: 'DELETE',
      signal,
    },
    token,
  )
}
