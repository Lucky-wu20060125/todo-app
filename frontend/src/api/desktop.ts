import { invoke } from '@tauri-apps/api/core'

export type PetMode = {
  mode: 'notebook' | 'edge'
  side: 'left' | 'right' | null
}

export type PetColor = 'white' | 'yellow' | 'green' | 'red'

export type PetPreferences = {
  color: PetColor
  width: number
}

export function getPetPreferences(): Promise<PetPreferences> {
  return invoke<PetPreferences>('get_pet_preferences')
}

export function setPetSize(width: number): Promise<void> {
  return invoke<void>('set_pet_size', { width })
}

export type CursorDirection = { x: number; y: number }

export function getCursorDirection(): Promise<CursorDirection> {
  return invoke<CursorDirection>('pet_cursor_direction')
}

export function openMain(): Promise<void> {
  return invoke<void>('open_main')
}

export function closeMain(): Promise<void> {
  return invoke<void>('close_main')
}

export function snapPet(): Promise<PetMode> {
  return invoke<PetMode>('snap_pet')
}

export function expandPet(): Promise<PetMode> {
  return invoke<PetMode>('expand_pet')
}

export function showPetMenu(): Promise<void> {
  return invoke<void>('show_pet_menu')
}
