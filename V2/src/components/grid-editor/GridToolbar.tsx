import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import {
  Type,
  Square,
  MoreHorizontal,
  Undo2,
  Save,
  FolderOpen,
  FilePlus,
  Download,
  Hash,
  FlipHorizontal,
} from 'lucide-react'
import type { Tool } from '@/types/grid'

interface GridToolbarProps {
  rows: number
  cols: number
  currentTool: Tool
  blackLocked: boolean
  symmetry: boolean
  onRowsChange: (rows: number) => void
  onColsChange: (cols: number) => void
  onToolChange: (tool: Tool) => void
  onBlackClick: () => void
  onSymmetryChange: (checked: boolean) => void
  onUndo: () => void
  onNew: () => void
  onSave: () => void
  onLoad: () => void
  onExport: () => void
  onNumbering: () => void
}

export function GridToolbar({
  rows, cols, currentTool, blackLocked, symmetry,
  onRowsChange, onColsChange,
  onToolChange, onBlackClick,
  onSymmetryChange, onUndo, onNew, onSave, onLoad, onExport, onNumbering,
}: GridToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-2 shadow-sm">
      {/* Size */}
      <div className="flex items-center gap-1.5">
        <Label className="text-xs text-muted-foreground">Lignes</Label>
        <Input
          type="number"
          min={3}
          max={25}
          value={rows}
          onChange={e => onRowsChange(parseInt(e.target.value) || 10)}
          className="h-8 w-14 text-center text-sm"
        />
        <span className="text-xs text-muted-foreground">×</span>
        <Label className="text-xs text-muted-foreground">Col</Label>
        <Input
          type="number"
          min={3}
          max={25}
          value={cols}
          onChange={e => onColsChange(parseInt(e.target.value) || 10)}
          className="h-8 w-14 text-center text-sm"
        />
      </div>

      <Separator orientation="vertical" className="h-6" />

      {/* Tools */}
      <div className="flex items-center gap-1">
        <ToolButton
          icon={Type}
          label="Lettres"
          active={currentTool === 'letter'}
          onClick={() => onToolChange('letter')}
        />
        <ToolButton
          icon={Square}
          label={blackLocked ? 'Cases noires (verrouillé)' : 'Cases noires'}
          active={currentTool === 'black'}
          locked={blackLocked}
          onClick={onBlackClick}
        />
        <ToolButton
          icon={MoreHorizontal}
          label="Pointillés"
          active={currentTool === 'dotted'}
          onClick={() => onToolChange('dotted')}
        />
      </div>

      <Separator orientation="vertical" className="h-6" />

      {/* Options */}
      <label className="flex items-center gap-1.5 cursor-pointer text-sm text-muted-foreground hover:text-foreground transition-colors">
        <FlipHorizontal className="h-4 w-4" />
        <input
          type="checkbox"
          checked={symmetry}
          onChange={e => onSymmetryChange(e.target.checked)}
          className="h-3.5 w-3.5 rounded border-border"
        />
        <span className="text-xs">Symétrie</span>
      </label>

      <Separator orientation="vertical" className="h-6" />

      {/* Actions */}
      <div className="flex items-center gap-1">
        <ToolButton icon={FilePlus} label="Nouvelle grille" onClick={onNew} />
        <ToolButton icon={Save} label="Sauvegarder" onClick={onSave} />
        <ToolButton icon={FolderOpen} label="Charger" onClick={onLoad} />
        <ToolButton icon={Hash} label="Numérotation" onClick={onNumbering} />
        <ToolButton icon={Download} label="Exporter JSON" onClick={onExport} />
        <ToolButton icon={Undo2} label="Annuler (Ctrl+Z)" onClick={onUndo} />
      </div>
    </div>
  )
}

function ToolButton({
  icon: Icon,
  label,
  active,
  locked,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  active?: boolean
  locked?: boolean
  onClick: () => void
}) {
  return (
    <Button
      variant={active ? 'default' : 'ghost'}
      size="icon"
      className={`h-8 w-8 ${locked ? 'ring-2 ring-amber-400' : ''}`}
      onClick={onClick}
      title={label}
    >
      <Icon className="h-4 w-4" />
    </Button>
  )
}
