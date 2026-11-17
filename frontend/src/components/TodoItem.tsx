import {
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

const LONG_PRESS_MS = 280
const MOVE_TOLERANCE = 8

type TodoItemProps = {
  todo: Todo
  busy: boolean
  canDrag: boolean
  onToggle: (todo: Todo) => void
  onDelete: (id: number) => void
  onRename: (todo: Todo, title: string) => void
  onContextMenu: (todo: Todo, event: MouseEvent<HTMLLIElement>) => void
  onDragStart: (todo: Todo, clientY: number) => void
  onDragMove: (clientY: number) => void
  onDragEnd: (cancelled: boolean) => void
}

export function TodoItem({
  todo,
  busy,
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
  const submittedRef = useRef(todo.title)
  const suppressClickRef = useRef(false)
  const pressTimerRef = useRef<number | null>(null)
  const pressRef = useRef<{ pointerId: number; x: number; y: number } | null>(null)
  const draggingRef = useRef(false)
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    submittedRef.current = todo.title
    const element = textRef.current
    if (element && document.activeElement !== element && element.textContent !== todo.title) {
      element.textContent = todo.title
    }
  }, [todo.title])

  useEffect(() => () => {
    if (pressTimerRef.current !== null) window.clearTimeout(pressTimerRef.current)
    document.body.classList.remove('is-sorting')
  }, [])

  function cancelPressTimer() {
    if (pressTimerRef.current !== null) {
      window.clearTimeout(pressTimerRef.current)
      pressTimerRef.current = null
    }
  }

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
    cancelPressTimer()
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

  function handlePointerDown(event: ReactPointerEvent<HTMLLIElement>) {
    if (document.activeElement === textRef.current) commitTitle()
    if (!canDrag || event.button !== 0 || !event.isPrimary) return
    if (event.target instanceof Element && event.target.closest('input, button')) return

    cancelPressTimer()
    pressRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY }
    event.currentTarget.setPointerCapture(event.pointerId)

    pressTimerRef.current = window.setTimeout(() => {
      pressTimerRef.current = null
      const press = pressRef.current
      if (!press) return
      draggingRef.current = true
      suppressClickRef.current = true
      setDragging(true)
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
      window.getSelection()?.removeAllRanges()
      onDragStart(todo, press.y)
    }, LONG_PRESS_MS)
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLLIElement>) {
    const press = pressRef.current
    if (!press || event.pointerId !== press.pointerId) return
    if (!draggingRef.current) {
      const distance = Math.hypot(event.clientX - press.x, event.clientY - press.y)
      if (distance > MOVE_TOLERANCE) cancelPressTimer()
      return
    }
    event.preventDefault()
    onDragMove(event.clientY)
  }

  function finishPointer(event: ReactPointerEvent<HTMLLIElement>, cancelled: boolean) {
    const press = pressRef.current
    if (!press || event.pointerId !== press.pointerId) return
    cancelPressTimer()
    pressRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    if (!draggingRef.current) return
    draggingRef.current = false
    setDragging(false)
    onDragEnd(cancelled)
    window.setTimeout(() => { suppressClickRef.current = false }, 400)
  }

  return (
    <li
      className={`todo color-${todo.color}${todo.completed ? ' completed' : ''}${busy ? ' is-busy' : ''}${dragging ? ' is-dragging' : ''}`}
      aria-busy={busy}
      data-todo-id={todo.id}
      title="长按拖动排序，右键更换颜色，点击文字编辑"
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
      <button
        type="button"
        className="button delete"
        disabled={busy}
        onClick={() => onDelete(todo.id)}
        aria-label={`删除 ${todo.title}`}
      >
        删除
      </button>
    </li>
  )
}
