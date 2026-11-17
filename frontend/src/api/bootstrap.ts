import type { User } from './auth'
import { request } from './http'
import type { Todo } from './todos'

export type BootstrapData = {
  user: User
  todos: Todo[]
}

export function getBootstrap(
  token: string,
  signal?: AbortSignal,
): Promise<BootstrapData> {
  return request<BootstrapData>('/api/bootstrap', { signal }, token)
}
