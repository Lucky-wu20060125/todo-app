import { request } from './http'

export type User = {
  id: number
  username: string
  created_at: string
}

export type TokenResponse = {
  access_token: string
  token_type: string
}

export function register(
  username: string,
  password: string,
  signal?: AbortSignal,
): Promise<User> {
  return request<User>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username: username.trim(), password }),
    signal,
  })
}

export function login(
  username: string,
  password: string,
  signal?: AbortSignal,
): Promise<TokenResponse> {
  return request<TokenResponse>('/api/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ username, password }),
    signal,
  })
}

export function getMe(token: string, signal?: AbortSignal): Promise<User> {
  return request<User>('/api/auth/me', { signal }, token)
}

export type AccountUpdateResponse = {
  user: User
  access_token: string
  token_type: string
}

export function updateAccount(
  token: string,
  payload: { current_password: string; username: string; password?: string },
  signal?: AbortSignal,
): Promise<AccountUpdateResponse> {
  return request<AccountUpdateResponse>(
    '/api/auth/account',
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
      signal,
    },
    token,
  )
}
