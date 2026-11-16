export type Todo = {
  id: number
  title: string
  completed: boolean
  created_at: string
  updated_at: string
}

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? ''

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
    },
    ...options,
  })

  if (!response.ok) {
    let message = `请求失败：${response.status}`
    try {
      const body = (await response.json()) as { detail?: string }
      if (body.detail) {
        message = body.detail
      }
    } catch {
      // 响应不是 JSON 时保留默认错误信息
    }
    throw new Error(message)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return (await response.json()) as T
}

export function listTodos(): Promise<Todo[]> {
  return request<Todo[]>('/api/todos')
}

export function createTodo(title: string): Promise<Todo> {
  return request<Todo>('/api/todos', {
    method: 'POST',
    body: JSON.stringify({ title }),
  })
}

export function updateTodo(
  id: number,
  payload: { title?: string; completed?: boolean },
): Promise<Todo> {
  return request<Todo>(`/api/todos/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

export function deleteTodo(id: number): Promise<void> {
  return request<void>(`/api/todos/${id}`, {
    method: 'DELETE',
  })
}
