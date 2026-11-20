import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import type { Todo } from '../api/todos'

const AXIS_THRESHOLD = 7
const SWIPE_THRESHOLD = 96

type GestureMode = 'swipe' | 'drag' | null

type TodoItemProps = {
  todo: Todo
  busy: boolean
  removing: boolean
  canDrag: boolean
  onToggle: (todo: Todo) => void
  onDelete: (id: number) => void
  onRename: (todo: Todo, title: string) => void
  onContextMenu: (todo: Todo, event: MouseEvent<HTMLLIElement>) => void
  onDragStart: (todo: Todo, clientY: number) => void
  onDragMove: (clientY: number) => void
  onDragEnd: (cancelled: boolean) => void
}

function SwipeTrashIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v6M14 11v6" />
    </svg>
  )
}

export function TodoItem({
  todo,
  busy,
  removing,
  canDrag,
  onToggle,
  onDelete,
  onRename,
  onContextMenu,
  onDragStart,
  onDragMove,
  onDragEnd,
}: TodoItemProps) {
  const textRef = useRef<HTMLDivElement>(null)
  const rowRef = useRef<HTMLLIElement>(null)
  const submittedRef = useRef(todo.title)
  const suppressClickRef = useRef(false)
  const pressRef = useRef<{ pointerId: number; x: number; y: number } | null>(null)
  const modeRef = useRef<GestureMode>(null)
  const offsetRef = useRef(0)
  const gestureFinishedRef = useRef(false)
  const dragMoveRef = useRef(onDragMove)
  const dragEndRef = useRef(onDragEnd)
  const [offset, setOffset] = useState(0)
  const [swiping, setSwiping] = useState(false)
  const [swipeRemoving, setSwipeRemoving] = useState(false)
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    dragMoveRef.current = onDragMove
    dragEndRef.current = onDragEnd
  }, [onDragMove, onDragEnd])

  const completeDrag = useCallback((cancelled: boolean) => {
    if (gestureFinishedRef.current) return
    gestureFinishedRef.current = true
    pressRef.current = null
    modeRef.current = null
    setDragging(false)
    dragEndRef.current(cancelled)
    if (!cancelled) {
      suppressClickRef.current = true
      window.setTimeout(() => { suppressClickRef.current = false }, 350)
    }
  }, [])

  useEffect(() => {
    if (!dragging) return

    function handleMove(event: PointerEvent) {
      if (gestureFinishedRef.current) return
      dragMoveRef.current(event.clientY)
    }

    function handleFinish() {
      completeDrag(false)
    }

    function handleCancel() {
      completeDrag(true)
    }

    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleFinish)
    window.addEventListener('pointercancel', handleCancel)
    return () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleFinish)
      window.removeEventListener('pointercancel', handleCancel)
    }
  }, [dragging, completeDrag])

  useEffect(() => {
    submittedRef.current = todo.title
    const element = textRef.current
    if (element && document.activeElement !== element && element.textContent !== todo.title) {
      element.textContent = todo.title
    }
  }, [todo.title])

  useEffect(() => () => {
    document.body.classList.remove('is-sorting')
  }, [])

  function commitTitle() {
    const element = textRef.current
    if (!element) return
    const next = (element.textContent ?? '').replace(/\r?\n/g, ' ').trim()
    if (!next) {
      element.textContent = todo.title
      submittedRef.current = todo.title
      return
    }
    const clipped = next.slice(0, 200)
    element.textContent = clipped
    if (clipped === submittedRef.current) return
    submittedRef.current = clipped
    onRename(todo, clipped)
  }

  function limitLength(event: FormEvent<HTMLDivElement>) {
    const element = event.currentTarget
    const text = element.textContent ?? ''
    if (text.length <= 200) return
    element.textContent = text.slice(0, 200)
    const range = document.createRange()
    range.selectNodeContents(element)
    range.collapse(false)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
  }

  function handlePaste(event: ClipboardEvent<HTMLDivElement>) {
    event.preventDefault()
    const text = event.clipboardData.getData('text/plain').replace(/\r?\n/g, ' ')
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) return
    const range = selection.getRangeAt(0)
    range.deleteContents()
    const node = document.createTextNode(text)
    range.insertNode(node)
    range.setStartAfter(node)
    range.collapse(true)
    selection.removeAllRanges()
    selection.addRange(range)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Enter') {
      event.preventDefault()
      commitTitle()
      event.currentTarget.blur()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      event.currentTarget.textContent = todo.title
      submittedRef.current = todo.title
      event.currentTarget.blur()
    }
  }

  function blurEditor() {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur()
    }
    window.getSelection()?.removeAllRanges()
  }

  function resetGesture() {
    pressRef.current = null
    modeRef.current = null
    offsetRef.current = 0
    setOffset(0)
    setSwiping(false)
    setDragging(false)
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLLIElement>) {
    if (event.button !== 0 || !event.isPrimary) return
    if (busy || removing || swipeRemoving) return
    if (event.target instanceof Element && event.target.closest('input, button')) return

    pressRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    }
    modeRef.current = null
    gestureFinishedRef.current = false
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLLIElement>) {
    const press = pressRef.current
    if (!press || event.pointerId !== press.pointerId) return

    const deltaX = event.clientX - press.x
    const deltaY = event.clientY - press.y

    if (modeRef.current === null) {
      const horizontal = Math.abs(deltaX)
      const vertical = Math.abs(deltaY)
      if (horizontal > AXIS_THRESHOLD && horizontal > vertical * 1.15) {
        modeRef.current = 'swipe'
        setSwiping(true)
        const nextOffset = Math.max(0, deltaX)
        offsetRef.current = nextOffset
        suppressClickRef.current = true
        setOffset(nextOffset)
        blurEditor()
        event.preventDefault()
      } else if (
        canDrag
        && vertical > AXIS_THRESHOLD
        && vertical > horizontal * 1.15
      ) {
        modeRef.current = 'drag'
        setDragging(true)
        blurEditor()
        suppressClickRef.current = true
        onDragStart(todo, event.clientY)
        dragMoveRef.current(event.clientY)
        event.preventDefault()
      }
      return
    }

    if (modeRef.current === 'swipe') {
      const nextOffset = Math.max(0, deltaX)
      offsetRef.current = nextOffset
      setOffset(nextOffset)
      event.preventDefault()
    } else if (modeRef.current === 'drag') {
      onDragMove(event.clientY)
      event.preventDefault()
    }
  }

  function finishPointer(event: ReactPointerEvent<HTMLLIElement>, cancelled: boolean) {
    const press = pressRef.current
    if (!press || event.pointerId !== press.pointerId) return

    pressRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }

    const mode = modeRef.current
    modeRef.current = null

    if (cancelled) {
      if (mode === 'drag') {
        completeDrag(true)
      } else {
        resetGesture()
      }
      return
    }

    if (mode === 'drag') {
      completeDrag(false)
      return
    }

    if (mode === 'swipe') {
      const width = rowRef.current?.offsetWidth ?? window.innerWidth
      const shouldDelete = offsetRef.current > SWIPE_THRESHOLD || offsetRef.current > width * 0.35
      setSwiping(false)
      if (shouldDelete) {
        suppressClickRef.current = true
        setSwipeRemoving(true)
        offsetRef.current = 0
        setOffset(0)
        window.setTimeout(() => onDelete(todo.id), 230)
      } else {
        offsetRef.current = 0
        setOffset(0)
      }
      return
    }

    // A plain click keeps the native contentEditable caret behavior.
  }

  return (
    <li
      ref={rowRef}
      className={`todo-row${removing ? ' is-removing' : ''}${swipeRemoving ? ' is-swiping-away' : ''}`}
      aria-busy={busy}
      data-todo-id={todo.id}
      title="按住上下拖动排序，向右滑动删除，右键更换颜色"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={(event) => finishPointer(event, false)}
      onPointerCancel={(event) => finishPointer(event, true)}
      onClickCapture={(event) => {
        if (!suppressClickRef.current) return
        suppressClickRef.current = false
        event.preventDefault()
        event.stopPropagation()
      }}
      onContextMenu={(event) => onContextMenu(todo, event)}
    >
      <div className="todo-swipe-underlay" aria-hidden="true">
        <SwipeTrashIcon />
        <span>删除</span>
      </div>
      <div
        className={`todo color-${todo.color}${todo.completed ? ' completed' : ''}${busy ? ' is-busy' : ''}${dragging ? ' is-dragging' : ''}${swiping ? ' is-swiping' : ''}`}
        style={offset ? { transform: `translateX(${offset}px)` } : undefined}
      >
        <input
          type="checkbox"
          className="todo-check"
          checked={todo.completed}
          disabled={busy}
          onChange={() => onToggle(todo)}
          aria-label={`将「${todo.title}」标记为${todo.completed ? '未完成' : '已完成'}`}
        />
        <div
          ref={textRef}
          className="todo-title-text"
          role="textbox"
          aria-multiline={false}
          aria-label={`编辑 ${todo.title}`}
          contentEditable={!busy}
          suppressContentEditableWarning
          spellCheck={false}
          onInput={limitLength}
          onPaste={handlePaste}
          onKeyDown={handleKeyDown}
          onBlur={commitTitle}
        >{todo.title}</div>
      </div>
    </li>
  )
}
