import type { Component } from 'vue'

export interface MenuOption<V> {
  value: V
  label: string
  icon?: Component
  active?: boolean
  disabled?: boolean
  danger?: boolean
  /** Inline style for the label (e.g. font preview). */
  style?: Record<string, string>
  hint?: string
  separatorBefore?: boolean
}
