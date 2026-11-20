import {
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react'
import { listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import ghostPet from '../assets/ghost-pet.png'
import { listTodos } from '../api/todos'
import {
  expandPet,
  getCursorDirection,
  getPetPreferences,
  openMain,
  setPetSize,
  showPetMenu,
  snapPet,
  type PetColor,
  type PetMode,
  type PetPreferences,
} from '../api/desktop'
import './Pet.css'

const LONG_PRESS_MS = 460
const DRAG_TOLERANCE = 6

type PressState = {
  pointerId: number
  x: number
  y: number
  timer: number | null
  moved: boolean
  long: boolean
}

type GhostArtworkProps = {
  ghostRef: RefObject<HTMLDivElement | null>
  className?: string
  jumping?: boolean
  jumpToken?: number
}

function GhostArtwork({ ghostRef, className = '', jumping = false, jumpToken = 0 }: GhostArtworkProps) {
  return (
    <div
      ref={ghostRef}
      key={jumpToken}
      className={`ghost-figure${jumping ? ' is-jumping' : ''}${className ? ` ${className}` : ''}`}
    >
      <span className="ghost-shadow" aria-hidden="true" />
      <img className="ghost-artwork" src={ghostPet} alt="小幽灵" draggable={false} />
      <span className="ghost-eye ghost-eye-left" aria-hidden="true">
        <span className="ghost-pupil" />
      </span>
      <span className="ghost-eye ghost-eye-right" aria-hidden="true">
        <span className="ghost-pupil" />
      </span>
    </div>
  )
}

export function Pet() {
  const [mode, setMode] = useState<PetMode['mode']>('notebook')
  const [side, setSide] = useState<'left' | 'right'>('right')
  const [color, setColor] = useState<PetColor>('white')
  const [holding, setHolding] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [sway, setSway] = useState<'' | 'left' | 'right'>('')
  const [jumping, setJumping] = useState(false)
  const [jumpToken, setJumpToken] = useState(0)
  const [bubble, setBubble] = useState(false)

  const pressRef = useRef<PressState | null>(null)
  const ghostRef = useRef<HTMLDivElement>(null)
  const dragActiveRef = useRef(false)
  const lastXRef = useRef<number | null>(null)
  const settleTimerRef = useRef<number | null>(null)
  const swayTimerRef = useRef<number | null>(null)
  const fallbackTimerRef = useRef<number | null>(null)
  const jumpTimerRef = useRef<number | null>(null)
  const hoverRef = useRef(false)

  function applyMode(result: PetMode) {
    setMode(result.mode)
    if (result.side === 'left' || result.side === 'right') {
      setSide(result.side)
    }
  }

  useEffect(() => {
    let disposed = false
    const unlisteners: Array<() => void> = []

    getPetPreferences()
      .then((preferences) => {
        if (!disposed) setColor(preferences.color)
      })
      .catch(() => {})

    listen<PetPreferences>('pet-color', (event) => {
      if (!disposed) setColor(event.payload.color)
    })
      .then((unlisten) => {
        if (disposed) unlisten()
        else unlisteners.push(unlisten)
      })
      .catch(() => {})

    listen<PetMode>('pet-mode', (event) => {
      if (!disposed) applyMode(event.payload)
    })
      .then((unlisten) => {
        if (disposed) unlisten()
        else unlisteners.push(unlisten)
      })
      .catch(() => {})

    listen<number>('pet-size-dialog', (event) => {
      if (disposed) return
      const input = window.prompt('请输入小幽灵宽度（120～480 像素）', String(event.payload))
      if (input === null) return
      const width = Number(input)
      if (!Number.isInteger(width)) {
        window.alert('请输入 120～480 之间的整数像素宽度')
        return
      }
      void setPetSize(width).catch((error: unknown) => {
        window.alert(typeof error === 'string' ? error : '尺寸保存失败，请重试')
      })
    })
      .then((unlisten) => {
        if (disposed) unlisten()
        else unlisteners.push(unlisten)
      })
      .catch(() => {})

    return () => {
      disposed = true
      unlisteners.forEach((unlisten) => unlisten())
      if (jumpTimerRef.current !== null) window.clearTimeout(jumpTimerRef.current)
    }
  }, [])

  useEffect(() => {
    let stopped = false
    let timer = 0

    async function tick() {
      try {
        const direction = await getCursorDirection()
        if (stopped) return
        const element = ghostRef.current
        if (!element) return
        element.style.setProperty('--eye-x', `${(direction.x * 4).toFixed(1)}px`)
        element.style.setProperty('--eye-y', `${(direction.y * 4).toFixed(1)}px`)
      } catch {
        return
      }
    }

    void tick()
    timer = window.setInterval(tick, 90)
    return () => {
      stopped = true
      window.clearInterval(timer)
    }
  }, [])

  useEffect(() => {
    let disposed = false
    let unlisten: (() => void) | undefined

    getCurrentWindow()
      .onMoved((event) => {
        if (!dragActiveRef.current) return
        const x = event.payload.x
        if (lastXRef.current !== null) {
          const delta = x - lastXRef.current
          if (Math.abs(delta) > 0.6) {
            setSway(delta > 0 ? 'right' : 'left')
            if (swayTimerRef.current !== null) window.clearTimeout(swayTimerRef.current)
            swayTimerRef.current = window.setTimeout(() => {
              swayTimerRef.current = null
              if (dragActiveRef.current) setSway('')
            }, 130)
          }
        }
        lastXRef.current = x

        if (settleTimerRef.current !== null) window.clearTimeout(settleTimerRef.current)
        settleTimerRef.current = window.setTimeout(async () => {
          settleTimerRef.current = null
          dragActiveRef.current = false
          lastXRef.current = null
          setDragging(false)
          setSway('')
          if (swayTimerRef.current !== null) {
            window.clearTimeout(swayTimerRef.current)
            swayTimerRef.current = null
          }
          if (fallbackTimerRef.current !== null) {
            window.clearTimeout(fallbackTimerRef.current)
            fallbackTimerRef.current = null
          }
          try {
            applyMode(await snapPet())
          } catch {
            return
          }
        }, 180)
      })
      .then((remove) => {
        if (disposed) remove()
        else unlisten = remove
      })
      .catch(() => {})

    return () => {
      disposed = true
      unlisten?.()
      if (settleTimerRef.current !== null) window.clearTimeout(settleTimerRef.current)
      if (swayTimerRef.current !== null) window.clearTimeout(swayTimerRef.current)
      if (fallbackTimerRef.current !== null) window.clearTimeout(fallbackTimerRef.current)
    }
  }, [])

  function clearLongPressTimer() {
    if (pressRef.current?.timer !== null && pressRef.current?.timer !== undefined) {
      window.clearTimeout(pressRef.current.timer)
      pressRef.current.timer = null
    }
  }

  function handlePointerEnter() {
    if (mode !== 'notebook' || dragActiveRef.current) return
    hoverRef.current = true
    setJumping(true)
    setJumpToken((value) => value + 1)
    if (jumpTimerRef.current !== null) window.clearTimeout(jumpTimerRef.current)
    jumpTimerRef.current = window.setTimeout(() => setJumping(false), 800)

    void listTodos()
      .then((todos) => {
        if (!hoverRef.current || dragActiveRef.current) return
        setBubble(todos.some((todo) => !todo.completed))
      })
      .catch(() => {})
  }

  function handlePointerLeave() {
    hoverRef.current = false
    setBubble(false)
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    setHolding(true)
    setBubble(false)
    const press: PressState = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      timer: null,
      moved: false,
      long: false,
    }
    press.timer = window.setTimeout(() => {
      if (pressRef.current === press) press.long = true
    }, LONG_PRESS_MS)
    pressRef.current = press
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const press = pressRef.current
    if (!press || press.pointerId !== event.pointerId || press.moved) return

    const distance = Math.hypot(event.clientX - press.x, event.clientY - press.y)
    if (distance < DRAG_TOLERANCE) return

    press.moved = true
    clearLongPressTimer()
    setHolding(false)
    setBubble(false)
    setJumping(false)
    dragActiveRef.current = true
    lastXRef.current = null
    setDragging(true)
    event.preventDefault()

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }

    void getCurrentWindow().startDragging().catch(() => {
      dragActiveRef.current = false
      setDragging(false)
      setSway('')
    })

    if (fallbackTimerRef.current !== null) window.clearTimeout(fallbackTimerRef.current)
    fallbackTimerRef.current = window.setTimeout(async () => {
      fallbackTimerRef.current = null
      if (!dragActiveRef.current) return
      dragActiveRef.current = false
      lastXRef.current = null
      setDragging(false)
      setSway('')
      try {
        applyMode(await snapPet())
      } catch {
        return
      }
    }, 1800)
  }

  function finishPress(event: ReactPointerEvent<HTMLDivElement>, cancelled: boolean) {
    const press = pressRef.current
    if (!press || press.pointerId !== event.pointerId) return
    clearLongPressTimer()
    pressRef.current = null
    setHolding(false)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }

    if (cancelled) return
    if (press.moved || dragActiveRef.current) return
    if (!press.long) {
      void openMain()
    }
  }

  function handleContextMenu(event: MouseEvent<HTMLElement>) {
    event.preventDefault()
    if (dragActiveRef.current) return
    void showPetMenu()
  }

  async function handleExpand() {
    try {
      applyMode(await expandPet())
    } catch {
      return
    }
  }

  if (mode === 'edge') {
    return (
      <main
        className={`ghost-shell ghost-shell-edge ghost-edge-${side}`}
        data-color={color}
        onClick={() => { void handleExpand() }}
        onContextMenu={handleContextMenu}
        role="button"
        tabIndex={0}
        aria-label="展开小幽灵"
        title="点击让小幽灵出来"
      >
        <div className="ghost-peek">
          <GhostArtwork ghostRef={ghostRef} className="peek-ghost" />
          <span className="peek-hand peek-hand-top" aria-hidden="true" />
          <span className="peek-hand peek-hand-bottom" aria-hidden="true" />
        </div>
      </main>
    )
  }

  return (
    <main
      className={`ghost-shell${holding ? ' is-holding' : ''}${dragging ? ' is-dragging' : ''}${sway ? ` sway-${sway}` : ''}`}
      data-color={color}
    >
      {bubble && (
        <div className="ghost-bubble" role="status">
          <span>主人您还有待办任务没完成哦</span>
        </div>
      )}
      <div
        className="ghost-stage"
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={(event) => finishPress(event, false)}
        onPointerCancel={(event) => finishPress(event, true)}
        onContextMenu={handleContextMenu}
        title="点击打开 · 拖动移动 · 右键设置"
      >
        <div className={`ghost-sway${sway ? ` is-${sway}` : ''}`}>
          <GhostArtwork ghostRef={ghostRef} jumping={jumping} jumpToken={jumpToken} />
        </div>
      </div>
    </main>
  )
}
