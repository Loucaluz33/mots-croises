// ========== GRID TYPES ==========

export interface DottedBorders {
  top?: boolean
  bottom?: boolean
  left?: boolean
  right?: boolean
}

export interface GridCell {
  black: boolean
  letter: string
  number: number
  dotted: DottedBorders | null
}

export type NumberingStyle = 'european' | 'american'
export type LabelFormat = 'roman' | 'arabic' | 'alpha'
export type Direction = 'across' | 'down'
export type Tool = 'letter' | 'black' | 'dotted'

export interface GridSize {
  rows: number
  cols: number
}

export interface Clue {
  label: string
  clue: string
  row: number
  col: number
  key: string
}

export interface GridClues {
  across: Record<string, Clue>
  down: Record<string, Clue>
}

export interface GridMetadata {
  title: string
  author: string
  difficulty: string
  theme: string
  description: string
}

export interface GridData {
  format: 'verbicruciste'
  title: string
  author: string
  size: GridSize
  grid: GridCell[][]
  clues: GridClues
  answers: string[][]
  numberingStyle: NumberingStyle
  rowNumbering: LabelFormat
  colNumbering: LabelFormat
  useSuffixes: boolean
  metadata?: GridMetadata
}

export interface GridSummary {
  nom: string
  rows: number
  cols: number
  terminee: boolean
  date_creation: string
  date_modif: string
  metadata?: GridMetadata
}

// ========== DICTIONARY TYPES ==========

export interface DictWord {
  id: number
  mot: string
  definitions: string[]
  categorie: string
  notes: string
}

export interface PersonalDict {
  id: number
  name: string
  date_creation: string
}

export interface DictSetting {
  source: string
  enabled: boolean
  word_count: number
  custom_label: string
}

export interface DictGroup {
  id: number
  name: string
  position: number
  sources: string[]
}

// ========== SUGGESTION TYPES ==========

export interface Suggestion {
  word: string
  source: string
  definition?: string
}

export interface SuggestionResult {
  phase: 1 | 2
  words: Suggestion[]
}

// ========== MEMO TYPES ==========

export interface Memo {
  id: number
  mot: string
  dict_target: string
  categorie: string
  note: string
  date_creation: string
  date_modif: string
}
