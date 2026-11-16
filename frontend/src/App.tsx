import { useEffect, useState } from 'react'
import './App.css'

type Health = {
  status: string
}

function App() {
  const [status, setStatus] = useState('正在检查后端连接...')

  useEffect(() => {
    fetch('/api/health')
      .then((response) => {
        if (!response.ok) {
          throw new Error('请求失败')
        }
        return response.json() as Promise<Health>
      })
      .then((data) => {
        setStatus(data.status === 'ok' ? '后端连接成功' : '后端返回异常')
      })
      .catch(() => {
        setStatus('后端未连接，请先启动 FastAPI 服务')
      })
  }, [])

  return (
    <main className="app">
      <p className="eyebrow">全栈学习项目</p>
      <h1>待办任务清单</h1>
      <p className={`status ${status === '后端连接成功' ? 'ok' : ''}`}>
        {status}
      </p>
      <p className="hint">阶段 1：React 前端 + FastAPI 后端骨架已就绪</p>
    </main>
  )
}

export default App
