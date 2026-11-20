import { getCurrentWindow } from '@tauri-apps/api/window'

type ResizeDirection =
  | 'East'
  | 'North'
  | 'NorthEast'
  | 'NorthWest'
  | 'South'
  | 'SouthEast'
  | 'SouthWest'
  | 'West'

const handles: Array<{ direction: ResizeDirection; className: string }> = [
  { direction: 'North', className: 'resize-north' },
  { direction: 'South', className: 'resize-south' },
  { direction: 'East', className: 'resize-east' },
  { direction: 'West', className: 'resize-west' },
  { direction: 'NorthWest', className: 'resize-north-west' },
  { direction: 'NorthEast', className: 'resize-north-east' },
  { direction: 'SouthWest', className: 'resize-south-west' },
  { direction: 'SouthEast', className: 'resize-south-east' },
]

export function ResizeHandles() {
  return (
    <>
      {handles.map((handle) => (
        <div
          key={handle.direction}
          className={`resize-handle ${handle.className}`}
          onPointerDown={(event) => {
            event.preventDefault()
            event.stopPropagation()
            void getCurrentWindow().startResizeDragging(handle.direction).catch(() => {})
          }}
        />
      ))}
    </>
  )
}
