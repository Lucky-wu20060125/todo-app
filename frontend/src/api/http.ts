const API_BASE = import.meta.env.VITE_API_BASE_URL ?? ''

export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

const fieldNames: Record<string, string> = {
  username: '用户名',
  password: '密码',
  title: '任务标题',
}

function getErrorDetail(detail: unknown): string | undefined {
  if (typeof detail === 'string') {
    return detail.trim() || undefined
  }
  if (!Array.isArray(detail)) {
    return undefined
  }

  const messages = detail.flatMap((item: unknown) => {
    if (typeof item === 'string') {
      return item.trim() ? [item.trim()] : []
    }
    if (!item || typeof item !== 'object' || !('msg' in item)) {
      return []
    }
    if (typeof item.msg !== 'string') {
      return []
    }

    const location = 'loc' in item && Array.isArray(item.loc) ? item.loc : []
    const field = location.findLast((part: unknown) =>
      typeof part === 'string' && Object.hasOwn(fieldNames, part),
    )
    const label = typeof field === 'string' ? fieldNames[field] : ''
    let message = item.msg.replace(/^Value error,\s*/i, '').trim()
    const context = 'ctx' in item && item.ctx && typeof item.ctx === 'object'
      ? item.ctx
      : null

    if ('type' in item) {
      if (item.type === 'missing') {
        message = '请填写此项'
      } else if (item.type === 'string_too_short' && context && 'min_length' in context) {
        message = `至少需要 ${String(context.min_length)} 个字符`
      } else if (item.type === 'string_too_long' && context && 'max_length' in context) {
        message = `最多允许 ${String(context.max_length)} 个字符`
      }
    }

    return message ? [label ? `${label}：${message}` : message] : []
  })

  return messages.length ? [...new Set(messages)].join('；') : undefined
}

export async function request<T>(
  path: string,
  options: RequestInit = {},
  token?: string,
): Promise<T> {
  const headers = new Headers(options.headers)

  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  let response: Response
  try {
    response = await fetch(`${API_BASE}${path}`, { ...options, headers })
  } catch (error) {
    if (options.signal?.aborted || (error instanceof Error && error.name === 'AbortError')) {
      throw error
    }
    throw new ApiError('网络连接失败，请检查网络后重试。', 0)
  }

  if (!response.ok) {
    let message = response.status === 401
      ? '登录已过期，请重新登录。'
      : response.status === 422
        ? '输入信息不符合要求，请检查后重试。'
        : response.status >= 500
          ? '服务暂时不可用，请稍后重试。'
          : `请求失败（${response.status}），请稍后重试。`
    try {
      const body: unknown = await response.json()
      if (body && typeof body === 'object' && 'detail' in body) {
        message = getErrorDetail(body.detail) ?? message
      }
    } catch (error) {
      if (options.signal?.aborted) {
        throw error
      }
      // 响应不是 JSON 时保留默认错误信息。
    }
    throw new ApiError(message, response.status)
  }

  if (response.status === 204) {
    return undefined as T
  }

  try {
    return (await response.json()) as T
  } catch (error) {
    if (options.signal?.aborted) {
      throw error
    }
    throw new ApiError('无法读取服务器返回的数据，请稍后重试。', response.status)
  }
}
