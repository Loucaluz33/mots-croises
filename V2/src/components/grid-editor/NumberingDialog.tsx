import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { NumberingStyle, LabelFormat } from '@/types/grid'

interface NumberingDialogProps {
  open: boolean
  onClose: () => void
  numberingStyle: NumberingStyle
  rowNumbering: LabelFormat
  colNumbering: LabelFormat
  useSuffixes: boolean
  onApply: (style: NumberingStyle, row: LabelFormat, col: LabelFormat, suffixes: boolean) => void
}

export function NumberingDialog({
  open, onClose,
  numberingStyle, rowNumbering, colNumbering, useSuffixes,
  onApply,
}: NumberingDialogProps) {
  const [style, setStyle] = useState<NumberingStyle>(numberingStyle)
  const [rowNum, setRowNum] = useState<LabelFormat>(rowNumbering)
  const [colNum, setColNum] = useState<LabelFormat>(colNumbering)
  const [suffixes, setSuffixes] = useState(useSuffixes)

  const handleApply = () => {
    onApply(style, rowNum, colNum, suffixes)
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Style de numérotation</DialogTitle>
          <DialogDescription>
            Choisissez le format d'affichage des indices de la grille
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Style cards */}
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setStyle('european')}
              className={`rounded-lg border-2 p-4 text-left transition-colors ${
                style === 'european'
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/30'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <div className={`h-3 w-3 rounded-full border-2 ${
                  style === 'european' ? 'border-primary bg-primary' : 'border-muted-foreground'
                }`} />
                <span className="font-medium text-sm">Européenne</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Lignes et colonnes numérotées séparément
              </p>
            </button>

            <button
              type="button"
              onClick={() => setStyle('american')}
              className={`rounded-lg border-2 p-4 text-left transition-colors ${
                style === 'american'
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/30'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <div className={`h-3 w-3 rounded-full border-2 ${
                  style === 'american' ? 'border-primary bg-primary' : 'border-muted-foreground'
                }`} />
                <span className="font-medium text-sm">Américaine</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Numéros séquentiels dans les cases
              </p>
            </button>
          </div>

          {/* European options */}
          {style === 'european' && (
            <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
              <div className="flex items-center gap-3">
                <Label className="w-20 text-sm">Lignes</Label>
                <Select value={rowNum} onValueChange={v => setRowNum(v as LabelFormat)}>
                  <SelectTrigger className="h-9 flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="roman">I, II, III (Romains)</SelectItem>
                    <SelectItem value="arabic">1, 2, 3 (Arabes)</SelectItem>
                    <SelectItem value="alpha">A, B, C (Alpha)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-3">
                <Label className="w-20 text-sm">Colonnes</Label>
                <Select value={colNum} onValueChange={v => setColNum(v as LabelFormat)}>
                  <SelectTrigger className="h-9 flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="roman">I, II, III (Romains)</SelectItem>
                    <SelectItem value="arabic">1, 2, 3 (Arabes)</SelectItem>
                    <SelectItem value="alpha">A, B, C (Alpha)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={suffixes}
                  onChange={e => setSuffixes(e.target.checked)}
                  className="h-4 w-4 rounded border-border"
                />
                <span className="text-sm">
                  Suffixes (.a, .b) pour les mots multiples
                </span>
              </label>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button onClick={handleApply}>
            Valider
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
