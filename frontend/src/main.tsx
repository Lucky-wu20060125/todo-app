import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { getCurrentWindow } from '@tauri-apps/api/window'
import './index.css'
import App from './App.tsx'
import { Pet } from './components/Pet.tsx'

const currentWindow = getCurrentWindow()
document.documentElement.dataset.window = currentWindow.label

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {currentWindow.label === 'pet' ? <Pet /> : <App />}
  </StrictMode>,
)
