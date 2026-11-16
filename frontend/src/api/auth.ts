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

export function login(
  username: string,
  password: string,
): Promise<TokenResponse> {
  return request<TokenResponse>('/api/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ username, password }),
  })
}

export function getMe(token: string): Promise<User> {
  return request<User>('/api/auth/me', {}, token)
}
