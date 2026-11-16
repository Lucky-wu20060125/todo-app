import { request } from './http'

export type Todo = {
  id: number
  title: string
  completed: boolean
  created_at: string
  updated_at: string
}

export function listTodos(token: string): Promise<Todo[]> {
  return request<Todo[]>('/api/todos', {}, token)
}

export function createTodo(token: string, title: string): Promise<Todo> {
  return request<Todo>(
    '/api/todos',
    {
      method: 'POST',
      body: JSON.stringify({ title }),
    },
    token,
  )
}

export function updateTodo(
  token: string,
  id: number,
  payload: { title?: string; completed?: boolean },
): Promise<Todo> {
  return request<Todo>(
    `/api/todos/${id}`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    },
    token,
  )
}

export function deleteTodo(token: string, id: number): Promise<void> {
  return request<void>(
    `/api/todos/${id}`,
    {
      method: 'DELETE',
    },
    token,
  )
}
