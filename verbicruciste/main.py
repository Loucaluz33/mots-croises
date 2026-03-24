"""
Verbicruciste — Logiciel d'aide à la création de mots croisés.
Application PyQt5.
"""
import sys
import os
import json
import re
from pathlib import Path

from PyQt5.QtWidgets import (
    QApplication, QMainWindow, QWidget, QVBoxLayout, QHBoxLayout,
    QGridLayout, QLabel, QPushButton, QLineEdit, QTextEdit, QComboBox,
    QTabWidget, QTableWidget, QTableWidgetItem, QHeaderView, QSplitter,
    QFileDialog, QMessageBox, QInputDialog, QStatusBar, QToolBar,
    QAction, QSpinBox, QCheckBox, QGroupBox, QListWidget, QListWidgetItem,
    QDialog, QFormLayout, QDialogButtonBox, QProgressDialog, QMenu,
    QAbstractItemView, QFrame, QScrollArea
)
from PyQt5.QtCore import Qt, QSize, QTimer, pyqtSignal
from PyQt5.QtGui import (
    QFont, QColor, QPainter, QKeySequence, QIcon, QPalette, QBrush, QPen
)

import database

# ========== CONSTANTES ==========
CELL_SIZE = 44
HEADER_SIZE = 30  # Taille des en-têtes ligne/colonne
BLACK_COLOR = QColor(26, 26, 46)
WHITE_COLOR = QColor(255, 255, 255)
SELECTED_COLOR = QColor(180, 210, 255)
HIGHLIGHT_COLOR = QColor(220, 235, 255)
PERSONAL_HIGHLIGHT = QColor(255, 240, 200)
HEADER_BG_COLOR = QColor(240, 242, 245)
HEADER_TEXT_COLOR = QColor(74, 108, 247)
NUMBER_COLOR = QColor(100, 100, 100)
LETTER_COLOR = QColor(30, 30, 30)
GRID_LINE_COLOR = QColor(140, 140, 140)


def to_roman(n):
    """Convertit un entier en chiffres romains."""
    vals = [(1000, 'M'), (900, 'CM'), (500, 'D'), (400, 'CD'),
            (100, 'C'), (90, 'XC'), (50, 'L'), (40, 'XL'),
            (10, 'X'), (9, 'IX'), (5, 'V'), (4, 'IV'), (1, 'I')]
    result = ''
    for val, numeral in vals:
        while n >= val:
            result += numeral
            n -= val
    return result


# ========== SEARCH DIALOG ==========
class PatternSearchDialog(QDialog):
    """Dialogue de recherche par pattern."""

    def __init__(self, parent=None, initial_pattern=''):
        super().__init__(parent)
        self.setWindowTitle("Recherche par pattern")
        self.setMinimumWidth(500)
        self.setMinimumHeight(400)

        layout = QVBoxLayout(self)

        # Aide
        help_label = QLabel("Utilisez ? pour une lettre inconnue. Ex: ??E?ER")
        help_label.setStyleSheet("color: #888; font-style: italic; margin-bottom: 8px;")
        layout.addWidget(help_label)

        # Champ de recherche
        search_layout = QHBoxLayout()
        self.pattern_input = QLineEdit(initial_pattern)
        self.pattern_input.setFont(QFont("Menlo", 16))
        self.pattern_input.setPlaceholderText("??E?ER")
        self.pattern_input.returnPressed.connect(self.do_search)
        search_layout.addWidget(self.pattern_input)

        self.search_btn = QPushButton("Chercher")
        self.search_btn.clicked.connect(self.do_search)
        search_layout.addWidget(self.search_btn)
        layout.addLayout(search_layout)

        # Résultats
        self.result_count = QLabel("")
        layout.addWidget(self.result_count)

        self.results_table = QTableWidget()
        self.results_table.setColumnCount(4)
        self.results_table.setHorizontalHeaderLabels(["Mot", "Catégorie", "Lemme/Déf", "Source"])
        self.results_table.horizontalHeader().setSectionResizeMode(0, QHeaderView.ResizeToContents)
        self.results_table.horizontalHeader().setSectionResizeMode(1, QHeaderView.ResizeToContents)
        self.results_table.horizontalHeader().setSectionResizeMode(2, QHeaderView.Stretch)
        self.results_table.horizontalHeader().setSectionResizeMode(3, QHeaderView.ResizeToContents)
        self.results_table.setSelectionBehavior(QAbstractItemView.SelectRows)
        self.results_table.setEditTriggers(QAbstractItemView.NoEditTriggers)
        layout.addWidget(self.results_table)

        if initial_pattern:
            QTimer.singleShot(100, self.do_search)

    def do_search(self):
        pattern = self.pattern_input.text().strip().upper()
        if not pattern:
            return

        results = database.search_by_pattern(pattern, limit=500)
        self.result_count.setText(f"{len(results)} résultat(s)")
        self.results_table.setRowCount(len(results))

        for i, r in enumerate(results):
            self.results_table.setItem(i, 0, QTableWidgetItem(r['ortho_upper']))
            self.results_table.setItem(i, 1, QTableWidgetItem(r.get('categorie', '')))
            info = r.get('definition', '') or r.get('lemme', '')
            self.results_table.setItem(i, 2, QTableWidgetItem(info))
            source_item = QTableWidgetItem(r['source'])
            if r['source'] == 'personnel':
                source_item.setBackground(QBrush(PERSONAL_HIGHLIGHT))
            self.results_table.setItem(i, 3, source_item)


# ========== WORD DETAIL DIALOG ==========
class WordDetailDialog(QDialog):
    """Dialogue pour voir les formes dérivées d'un mot."""

    def __init__(self, lemme, parent=None):
        super().__init__(parent)
        self.setWindowTitle(f"Formes dérivées de « {lemme} »")
        self.setMinimumWidth(500)
        self.setMinimumHeight(350)

        layout = QVBoxLayout(self)

        forms = database.get_derived_forms(lemme)
        layout.addWidget(QLabel(f"{len(forms)} forme(s) trouvée(s) pour le lemme « {lemme} » :"))

        table = QTableWidget()
        table.setColumnCount(4)
        table.setHorizontalHeaderLabels(["Forme", "Catégorie", "Genre/Nombre", "Info"])
        table.horizontalHeader().setSectionResizeMode(QHeaderView.Stretch)
        table.setRowCount(len(forms))
        table.setEditTriggers(QAbstractItemView.NoEditTriggers)

        for i, f in enumerate(forms):
            table.setItem(i, 0, QTableWidgetItem(f['ortho']))
            table.setItem(i, 1, QTableWidgetItem(f.get('cgram', '')))
            gn = f"{f.get('genre', '')} {f.get('nombre', '')}".strip()
            table.setItem(i, 2, QTableWidgetItem(gn))
            table.setItem(i, 3, QTableWidgetItem(f.get('infover', '')))

        layout.addWidget(table)

        btn = QDialogButtonBox(QDialogButtonBox.Close)
        btn.rejected.connect(self.close)
        layout.addWidget(btn)


# ========== NUMERIC TABLE ITEM (pour tri numérique) ==========
class NumericTableItem(QTableWidgetItem):
    """QTableWidgetItem qui trie numériquement au lieu d'alphabétiquement."""
    def __lt__(self, other):
        try:
            return int(self.text()) < int(other.text())
        except ValueError:
            return self.text() < other.text()


# ========== PERSONAL DICTIONARY TAB ==========
class DictionaryTab(QWidget):
    """Onglet du dictionnaire personnel avec tri et filtres."""

    def __init__(self, parent=None):
        super().__init__(parent)
        self.all_words = []  # Données brutes chargées depuis la DB
        layout = QVBoxLayout(self)

        # Toolbar ligne 1 : recherche + boutons
        toolbar = QHBoxLayout()

        self.search_input = QLineEdit()
        self.search_input.setPlaceholderText("Rechercher un mot...")
        self.search_input.textChanged.connect(self.apply_filters)
        toolbar.addWidget(self.search_input)

        add_btn = QPushButton("+ Ajouter un mot")
        add_btn.clicked.connect(self.add_word)
        toolbar.addWidget(add_btn)

        export_btn = QPushButton("Exporter")
        export_btn.clicked.connect(self.export_dict)
        toolbar.addWidget(export_btn)

        import_btn = QPushButton("Importer")
        import_btn.clicked.connect(self.import_dict)
        toolbar.addWidget(import_btn)

        layout.addLayout(toolbar)

        # Toolbar ligne 2 : filtres
        filter_layout = QHBoxLayout()

        filter_layout.addWidget(QLabel("Filtres :"))

        filter_layout.addWidget(QLabel("Longueur :"))
        self.len_min_spin = QSpinBox()
        self.len_min_spin.setRange(0, 30)
        self.len_min_spin.setValue(0)
        self.len_min_spin.setSpecialValueText("min")
        self.len_min_spin.valueChanged.connect(self.apply_filters)
        filter_layout.addWidget(self.len_min_spin)

        filter_layout.addWidget(QLabel("à"))
        self.len_max_spin = QSpinBox()
        self.len_max_spin.setRange(0, 30)
        self.len_max_spin.setValue(0)
        self.len_max_spin.setSpecialValueText("max")
        self.len_max_spin.valueChanged.connect(self.apply_filters)
        filter_layout.addWidget(self.len_max_spin)

        filter_layout.addWidget(QLabel("  Catégorie :"))
        self.cat_filter = QComboBox()
        self.cat_filter.addItem("Toutes")
        self.cat_filter.setMinimumWidth(100)
        self.cat_filter.currentIndexChanged.connect(self.apply_filters)
        filter_layout.addWidget(self.cat_filter)

        reset_btn = QPushButton("Réinitialiser")
        reset_btn.clicked.connect(self.reset_filters)
        filter_layout.addWidget(reset_btn)

        filter_layout.addStretch()
        layout.addLayout(filter_layout)

        # Stats
        self.stats_label = QLabel()
        self.stats_label.setStyleSheet("color: #888; font-size: 11px;")
        layout.addWidget(self.stats_label)

        # Table
        self.table = QTableWidget()
        self.table.setColumnCount(6)
        self.table.setHorizontalHeaderLabels(["Mot", "Lettres", "Définition(s)", "Catégorie", "Notes", "Modifié"])
        self.table.horizontalHeader().setSectionResizeMode(0, QHeaderView.ResizeToContents)
        self.table.horizontalHeader().setSectionResizeMode(1, QHeaderView.ResizeToContents)
        self.table.horizontalHeader().setSectionResizeMode(2, QHeaderView.Stretch)
        self.table.horizontalHeader().setSectionResizeMode(3, QHeaderView.ResizeToContents)
        self.table.horizontalHeader().setSectionResizeMode(4, QHeaderView.ResizeToContents)
        self.table.horizontalHeader().setSectionResizeMode(5, QHeaderView.ResizeToContents)
        self.table.setSelectionBehavior(QAbstractItemView.SelectRows)
        self.table.setEditTriggers(QAbstractItemView.NoEditTriggers)
        self.table.setSortingEnabled(True)
        self.table.setContextMenuPolicy(Qt.CustomContextMenu)
        self.table.customContextMenuRequested.connect(self.context_menu)
        self.table.doubleClicked.connect(self.edit_word)
        layout.addWidget(self.table)

        self.reload_data()

    def reload_data(self):
        """Recharge toutes les données depuis la DB et met à jour le combo catégorie."""
        self.all_words = database.get_personal_words('', limit=10000)
        # Mettre à jour le combo des catégories
        cats = sorted(set(w.get('categorie', '') for w in self.all_words if w.get('categorie', '')))
        current_cat = self.cat_filter.currentText()
        self.cat_filter.blockSignals(True)
        self.cat_filter.clear()
        self.cat_filter.addItem("Toutes")
        for cat in cats:
            self.cat_filter.addItem(cat)
        idx = self.cat_filter.findText(current_cat)
        if idx >= 0:
            self.cat_filter.setCurrentIndex(idx)
        self.cat_filter.blockSignals(False)
        self.apply_filters()

    def apply_filters(self):
        """Applique tous les filtres et rafraîchit la table."""
        search = self.search_input.text().strip().upper()
        len_min = self.len_min_spin.value()
        len_max = self.len_max_spin.value()
        cat_filter = self.cat_filter.currentText()

        filtered = []
        for w in self.all_words:
            mot = w['mot']
            mot_len = len(mot.replace('-', '').replace("'", ""))

            # Filtre recherche
            if search and search not in mot.upper():
                continue
            # Filtre longueur min
            if len_min > 0 and mot_len < len_min:
                continue
            # Filtre longueur max
            if len_max > 0 and mot_len > len_max:
                continue
            # Filtre catégorie
            if cat_filter != "Toutes" and w.get('categorie', '') != cat_filter:
                continue
            filtered.append(w)

        self.table.setSortingEnabled(False)
        self.table.setRowCount(len(filtered))

        for i, w in enumerate(filtered):
            mot = w['mot']
            mot_len = len(mot.replace('-', '').replace("'", ""))

            self.table.setItem(i, 0, QTableWidgetItem(mot))

            len_item = NumericTableItem(str(mot_len))
            len_item.setTextAlignment(Qt.AlignCenter)
            self.table.setItem(i, 1, len_item)

            defs = json.loads(w['definitions']) if w['definitions'] else []
            self.table.setItem(i, 2, QTableWidgetItem(' | '.join(defs)))
            self.table.setItem(i, 3, QTableWidgetItem(w.get('categorie', '')))
            self.table.setItem(i, 4, QTableWidgetItem(w.get('notes', '')))
            self.table.setItem(i, 5, QTableWidgetItem(w.get('date_modif', '')))

        self.table.setSortingEnabled(True)

        total = database.get_personal_stats()['total_words']
        self.stats_label.setText(f"{len(filtered)} mot(s) affiché(s) sur {total} au total")

    def reset_filters(self):
        self.search_input.clear()
        self.len_min_spin.setValue(0)
        self.len_max_spin.setValue(0)
        self.cat_filter.setCurrentIndex(0)

    def add_word(self):
        dialog = WordEditDialog(parent=self)
        if dialog.exec_() == QDialog.Accepted:
            data = dialog.get_data()
            if database.add_personal_word(data['mot'], data['definitions'], data['categorie'], data['notes']):
                self.reload_data()
            else:
                QMessageBox.warning(self, "Doublon", f"Le mot « {data['mot']} » existe déjà.")

    def edit_word(self):
        row = self.table.currentRow()
        if row < 0:
            return
        mot = self.table.item(row, 0).text()
        word_data = database.get_personal_word(mot)
        if not word_data:
            return

        dialog = WordEditDialog(word_data, parent=self)
        if dialog.exec_() == QDialog.Accepted:
            data = dialog.get_data()
            database.update_personal_word(mot, data['definitions'], data['categorie'], data['notes'])
            self.reload_data()

    def context_menu(self, pos):
        row = self.table.rowAt(pos.y())
        if row < 0:
            return
        mot = self.table.item(row, 0).text()
        menu = QMenu()
        edit_action = menu.addAction("Modifier")
        derived_action = menu.addAction("Formes dérivées (Lexique)")
        menu.addSeparator()
        delete_action = menu.addAction("Supprimer")

        action = menu.exec_(self.table.viewport().mapToGlobal(pos))
        if action == edit_action:
            self.edit_word()
        elif action == derived_action:
            dlg = WordDetailDialog(mot.lower(), self)
            dlg.exec_()
        elif action == delete_action:
            if QMessageBox.question(self, "Supprimer", f"Supprimer « {mot} » ?") == QMessageBox.Yes:
                database.delete_personal_word(mot)
                self.reload_data()

    def export_dict(self):
        path, _ = QFileDialog.getSaveFileName(self, "Exporter le dictionnaire", "mon_dictionnaire.json", "JSON (*.json)")
        if path:
            count = database.export_personal_dictionary(path)
            QMessageBox.information(self, "Exporté", f"{count} mot(s) exporté(s) dans :\n{path}")

    def import_dict(self):
        path, _ = QFileDialog.getOpenFileName(self, "Importer un dictionnaire", "", "JSON (*.json)")
        if path:
            try:
                count = database.import_personal_dictionary(path)
                QMessageBox.information(self, "Importé", f"{count} nouveau(x) mot(s) importé(s).")
                self.reload_data()
            except Exception as e:
                QMessageBox.critical(self, "Erreur", str(e))


# ========== WORD EDIT DIALOG ==========
class WordEditDialog(QDialog):
    """Dialogue pour ajouter/modifier un mot personnel."""

    def __init__(self, word_data=None, parent=None):
        super().__init__(parent)
        self.word_data = word_data
        self.setWindowTitle("Modifier un mot" if word_data else "Ajouter un mot")
        self.setMinimumWidth(450)

        layout = QFormLayout(self)

        self.mot_input = QLineEdit()
        self.mot_input.setFont(QFont("Menlo", 14))
        if word_data:
            self.mot_input.setText(word_data['mot'])
            self.mot_input.setReadOnly(True)
        layout.addRow("Mot :", self.mot_input)

        self.cat_input = QLineEdit()
        self.cat_input.setPlaceholderText("NOM, VER, ADJ, etc.")
        if word_data:
            self.cat_input.setText(word_data.get('categorie', ''))
        layout.addRow("Catégorie :", self.cat_input)

        layout.addRow(QLabel("Définitions (une par ligne) :"))
        self.defs_input = QTextEdit()
        self.defs_input.setMaximumHeight(120)
        if word_data:
            defs = json.loads(word_data['definitions']) if word_data.get('definitions') else []
            self.defs_input.setPlainText('\n'.join(defs))
        layout.addRow(self.defs_input)

        self.notes_input = QTextEdit()
        self.notes_input.setMaximumHeight(80)
        self.notes_input.setPlaceholderText("Notes personnelles...")
        if word_data:
            self.notes_input.setPlainText(word_data.get('notes', ''))
        layout.addRow("Notes :", self.notes_input)

        buttons = QDialogButtonBox(QDialogButtonBox.Ok | QDialogButtonBox.Cancel)
        buttons.accepted.connect(self.validate)
        buttons.rejected.connect(self.reject)
        layout.addRow(buttons)

    def validate(self):
        if not self.mot_input.text().strip():
            QMessageBox.warning(self, "Erreur", "Le mot ne peut pas être vide.")
            return
        self.accept()

    def get_data(self):
        defs_text = self.defs_input.toPlainText().strip()
        definitions = [d.strip() for d in defs_text.split('\n') if d.strip()]
        return {
            'mot': self.mot_input.text().strip().upper(),
            'definitions': definitions,
            'categorie': self.cat_input.text().strip(),
            'notes': self.notes_input.toPlainText().strip()
        }


# ========== GRID WIDGET ==========
class GridWidget(QWidget):
    """Widget de la grille de mots croisés avec en-têtes ligne/colonne."""

    cellClicked = pyqtSignal(int, int)

    def __init__(self, parent=None):
        super().__init__(parent)
        self.grid_data = []
        self.rows = 0
        self.cols = 0
        self.selected = None
        self.direction = 'across'
        self.highlighted_cells = set()
        self.setFocusPolicy(Qt.StrongFocus)
        self.setMinimumSize(200, 200)

    def set_grid(self, grid_data, rows, cols):
        self.grid_data = grid_data
        self.rows = rows
        self.cols = cols
        self.setFixedSize(HEADER_SIZE + cols * CELL_SIZE + 2, HEADER_SIZE + rows * CELL_SIZE + 2)
        self.update()

    def get_word_cells(self, r, c, direction):
        """Retourne les cellules du mot passant par (r,c) dans la direction donnée."""
        if not self.grid_data or self.grid_data[r][c]['black']:
            return []
        cells = []
        if direction == 'across':
            sc = c
            while sc > 0 and not self.grid_data[r][sc - 1]['black']:
                sc -= 1
            cc = sc
            while cc < self.cols and not self.grid_data[r][cc]['black']:
                cells.append((r, cc))
                cc += 1
        else:
            sr = r
            while sr > 0 and not self.grid_data[sr - 1][c]['black']:
                sr -= 1
            rr = sr
            while rr < self.rows and not self.grid_data[rr][c]['black']:
                cells.append((rr, c))
                rr += 1
        return cells

    def update_highlight(self):
        self.highlighted_cells = set()
        if self.selected:
            r, c = self.selected
            if not self.grid_data[r][c]['black']:
                for cell in self.get_word_cells(r, c, self.direction):
                    self.highlighted_cells.add(cell)
        self.update()

    def paintEvent(self, event):
        if not self.grid_data:
            return
        painter = QPainter(self)
        painter.setRenderHint(QPainter.Antialiasing)

        header_font = QFont(".AppleSystemUIFont", 10, QFont.Bold)
        letter_font = QFont(".AppleSystemUIFont", 18, QFont.Bold)

        ox = HEADER_SIZE  # offset X pour les en-têtes
        oy = HEADER_SIZE  # offset Y pour les en-têtes

        # En-têtes de colonnes (1, 2, 3...) — pour le vertical
        painter.setFont(header_font)
        painter.setPen(QPen(HEADER_TEXT_COLOR))
        for c in range(self.cols):
            x = ox + c * CELL_SIZE + 1
            painter.fillRect(x, 0, CELL_SIZE, HEADER_SIZE, HEADER_BG_COLOR)
            painter.drawText(x, 0, CELL_SIZE, HEADER_SIZE, Qt.AlignCenter, str(c + 1))

        # En-têtes de lignes (I, II, III...) — pour l'horizontal
        for r in range(self.rows):
            y = oy + r * CELL_SIZE + 1
            painter.fillRect(0, y, HEADER_SIZE, CELL_SIZE, HEADER_BG_COLOR)
            painter.setPen(QPen(HEADER_TEXT_COLOR))
            painter.setFont(header_font)
            roman = to_roman(r + 1)
            painter.drawText(0, y, HEADER_SIZE, CELL_SIZE, Qt.AlignCenter, roman)

        # Grille
        for r in range(self.rows):
            for c in range(self.cols):
                x = ox + c * CELL_SIZE + 1
                y = oy + r * CELL_SIZE + 1
                cell = self.grid_data[r][c]

                # Background
                if cell['black']:
                    painter.fillRect(x, y, CELL_SIZE, CELL_SIZE, BLACK_COLOR)
                else:
                    if self.selected and self.selected == (r, c):
                        painter.fillRect(x, y, CELL_SIZE, CELL_SIZE, SELECTED_COLOR)
                    elif (r, c) in self.highlighted_cells:
                        painter.fillRect(x, y, CELL_SIZE, CELL_SIZE, HIGHLIGHT_COLOR)
                    else:
                        painter.fillRect(x, y, CELL_SIZE, CELL_SIZE, WHITE_COLOR)

                    # Letter
                    if cell.get('letter', ''):
                        painter.setFont(letter_font)
                        painter.setPen(QPen(LETTER_COLOR))
                        painter.drawText(x, y, CELL_SIZE, CELL_SIZE, Qt.AlignCenter, cell['letter'].upper())

                # Border — normal solid lines
                painter.setPen(QPen(GRID_LINE_COLOR, 1.2, Qt.SolidLine))
                painter.drawRect(x, y, CELL_SIZE, CELL_SIZE)

                # Dotted borders overlay
                dotted = cell.get('dotted')
                if dotted:
                    dash_pen = QPen(QColor(80, 80, 80), 2.0, Qt.DashLine)
                    if dotted.get('top'):
                        painter.setPen(dash_pen)
                        painter.drawLine(x, y, x + CELL_SIZE, y)
                    if dotted.get('bottom'):
                        painter.setPen(dash_pen)
                        painter.drawLine(x, y + CELL_SIZE, x + CELL_SIZE, y + CELL_SIZE)
                    if dotted.get('left'):
                        painter.setPen(dash_pen)
                        painter.drawLine(x, y, x, y + CELL_SIZE)
                    if dotted.get('right'):
                        painter.setPen(dash_pen)
                        painter.drawLine(x + CELL_SIZE, y, x + CELL_SIZE, y + CELL_SIZE)

        # Dotted first pick highlight (purple tint)
        if hasattr(self, '_dotted_first_cell') and self._dotted_first_cell:
            dr, dc = self._dotted_first_cell
            if 0 <= dr < self.rows and 0 <= dc < self.cols:
                px = ox + dc * CELL_SIZE + 1
                py = oy + dr * CELL_SIZE + 1
                painter.fillRect(px, py, CELL_SIZE, CELL_SIZE, QColor(232, 218, 239, 150))

        painter.end()

    def mousePressEvent(self, event):
        if not self.grid_data:
            return
        c = int((event.x() - HEADER_SIZE - 1) / CELL_SIZE)
        r = int((event.y() - HEADER_SIZE - 1) / CELL_SIZE)
        if 0 <= r < self.rows and 0 <= c < self.cols:
            if self.selected == (r, c) and not self.grid_data[r][c]['black']:
                self.direction = 'down' if self.direction == 'across' else 'across'
            self.selected = (r, c)
            self.update_highlight()
            self.cellClicked.emit(r, c)


# ========== SUGGESTION COLUMN ==========
COLUMN_WIDTH = 130
COLUMN_STYLE = """
    QListWidget {
        font-family: Menlo;
        font-size: 10px;
    }
    QListWidget::item {
        padding: 1px 2px;
    }
    QScrollBar:vertical {
        width: 6px;
    }
    QScrollBar::handle:vertical {
        background: #bbb;
        border-radius: 3px;
        min-height: 20px;
    }
    QScrollBar::add-line:vertical, QScrollBar::sub-line:vertical {
        height: 0px;
    }
"""


class SuggestionColumn(QWidget):
    """Une colonne de suggestions pour une longueur donnée."""

    wordDoubleClicked = pyqtSignal(str)

    def __init__(self, length, parent=None):
        super().__init__(parent)
        self.length = length
        self.setFixedWidth(COLUMN_WIDTH)
        layout = QVBoxLayout(self)
        layout.setContentsMargins(2, 0, 2, 0)
        layout.setSpacing(2)

        # En-tête
        header = QLabel(f"{length}L")
        header.setFont(QFont(".AppleSystemUIFont", 10, QFont.Bold))
        header.setAlignment(Qt.AlignCenter)
        header.setStyleSheet("color: #4a6cf7;")
        layout.addWidget(header)

        # Dictionnaire général
        lex_label = QLabel("Général")
        lex_label.setFont(QFont(".AppleSystemUIFont", 8))
        lex_label.setStyleSheet("color: #555; margin-top: 2px;")
        layout.addWidget(lex_label)
        self.lex_label = lex_label

        self.lexique_list = QListWidget()
        self.lexique_list.setStyleSheet(COLUMN_STYLE)
        self.lexique_list.itemDoubleClicked.connect(self._on_dblclick)
        layout.addWidget(self.lexique_list, 3)

        # Dictionnaire personnel
        perso_label = QLabel("Personnel")
        perso_label.setFont(QFont(".AppleSystemUIFont", 8))
        perso_label.setStyleSheet("color: #b8860b; margin-top: 2px;")
        layout.addWidget(perso_label)
        self.perso_label = perso_label

        self.perso_list = QListWidget()
        self.perso_list.setStyleSheet(COLUMN_STYLE)
        self.perso_list.itemDoubleClicked.connect(self._on_dblclick)
        layout.addWidget(self.perso_list, 1)

    def set_results(self, personal, lexique):
        self.lexique_list.clear()
        for r in lexique:
            self.lexique_list.addItem(QListWidgetItem(r['ortho_upper']))
        self.lex_label.setText(f"Général ({len(lexique)})")

        self.perso_list.clear()
        for r in personal:
            item = QListWidgetItem(r['ortho_upper'])
            item.setBackground(QBrush(PERSONAL_HIGHLIGHT))
            self.perso_list.addItem(item)
        self.perso_label.setText(f"Personnel ({len(personal)})")

    def _on_dblclick(self, item):
        text = item.text().strip()
        if text:
            self.wordDoubleClicked.emit(text)


# ========== SUGGESTION PANEL ==========
class SuggestionPanel(QWidget):
    """Panneau de suggestions avec colonnes par longueur de mot."""

    wordSelected = pyqtSignal(str)  # mot choisi par double-clic

    def __init__(self, parent=None):
        super().__init__(parent)
        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(4)

        self.title_label = QLabel("Suggestions")
        self.title_label.setFont(QFont(".AppleSystemUIFont", 12, QFont.Bold))
        layout.addWidget(self.title_label)

        self.pattern_label = QLabel("")
        self.pattern_label.setFont(QFont("Menlo", 14))
        self.pattern_label.setStyleSheet("color: #4a6cf7; margin: 2px 0;")
        layout.addWidget(self.pattern_label)

        self.count_label = QLabel("")
        self.count_label.setStyleSheet("color: #888; font-size: 11px;")
        layout.addWidget(self.count_label)

        # Zone scrollable horizontalement pour les colonnes
        self.scroll_area = QScrollArea()
        self.scroll_area.setWidgetResizable(True)
        self.scroll_area.setHorizontalScrollBarPolicy(Qt.ScrollBarAsNeeded)
        self.scroll_area.setVerticalScrollBarPolicy(Qt.ScrollBarAlwaysOff)

        self.columns_container = QWidget()
        self.columns_layout = QHBoxLayout(self.columns_container)
        self.columns_layout.setContentsMargins(0, 0, 0, 0)
        self.columns_layout.setSpacing(4)
        self.columns_layout.setAlignment(Qt.AlignLeft)

        self.scroll_area.setWidget(self.columns_container)
        layout.addWidget(self.scroll_area)

        self.columns = []  # Liste des SuggestionColumn
        self._bg_timer = None  # Timer pour chargement en arrière-plan
        self._bg_pattern = ''  # Pattern en cours de chargement
        self._bg_lengths = []  # Longueurs restant à charger
        self._bg_results = {}  # Résultats accumulés {length: (personal, lexique)}
        self._bg_generation = 0  # Compteur pour annuler les anciens chargements

    def _clear_columns(self):
        for col in self.columns:
            col.setParent(None)
            col.deleteLater()
        self.columns = []

    def update_suggestions(self, pattern, direction_label=""):
        # Annuler tout chargement en cours
        self._bg_generation += 1
        if self._bg_timer:
            self._bg_timer.stop()
            self._bg_timer = None

        self._clear_columns()

        if not pattern or len(pattern) < 2:
            self.pattern_label.setText("")
            self.count_label.setText("")
            self.title_label.setText("Suggestions")
            return

        self.title_label.setText(f"Suggestions — {direction_label}")
        display_pattern = pattern.replace('?', '·')
        self.pattern_label.setText(display_pattern)

        max_len = len(pattern)

        # Charger immédiatement la colonne de longueur max
        personal, lexique = database.search_by_pattern_split(pattern)
        self._bg_results = {max_len: (personal, lexique)}

        # Préparer le chargement différé des autres colonnes
        self._bg_pattern = pattern
        self._bg_lengths = list(range(max_len - 1, 1, -1))

        if self._bg_lengths:
            self.count_label.setText("Chargement...")
            gen = self._bg_generation
            self._bg_timer = QTimer()
            self._bg_timer.setSingleShot(True)
            self._bg_timer.timeout.connect(lambda: self._load_next_column(gen))
            self._bg_timer.start(0)  # Dès que l'event loop est libre
        else:
            # Une seule colonne, afficher directement
            self._display_all_columns()

    def _load_next_column(self, generation):
        """Charge une colonne en arrière-plan, puis planifie la suivante."""
        # Si une nouvelle recherche a été lancée entre-temps, on arrête
        if generation != self._bg_generation:
            return

        if not self._bg_lengths:
            # Tout est chargé, afficher d'un coup
            self._display_all_columns()
            return

        length = self._bg_lengths.pop(0)
        sub_pattern = self._bg_pattern[:length]
        personal, lexique = database.search_by_pattern_split(sub_pattern)
        self._bg_results[length] = (personal, lexique)

        if self._bg_lengths:
            # Planifier la prochaine colonne
            self._bg_timer = QTimer()
            self._bg_timer.setSingleShot(True)
            self._bg_timer.timeout.connect(lambda: self._load_next_column(generation))
            self._bg_timer.start(0)
        else:
            # Terminé
            self._display_all_columns()

    def _display_all_columns(self):
        """Affiche toutes les colonnes d'un coup une fois le chargement terminé."""
        self._clear_columns()
        total_count = 0

        # Afficher les colonnes de la plus longue à la plus courte
        for length in sorted(self._bg_results.keys(), reverse=True):
            personal, lexique = self._bg_results[length]
            col = SuggestionColumn(length)
            col.set_results(personal, lexique)
            col.wordDoubleClicked.connect(self.wordSelected.emit)
            self.columns_layout.addWidget(col)
            self.columns.append(col)
            total_count += len(personal) + len(lexique)

        # Dimensionner le conteneur pour le scroll horizontal
        total_width = len(self.columns) * (COLUMN_WIDTH + 4) + 10
        self.columns_container.setMinimumWidth(total_width)

        self.count_label.setText(f"{total_count} mot(s) au total — {len(self.columns)} colonnes")
        self.scroll_area.horizontalScrollBar().setValue(0)


# ========== CLUE PANEL ==========
class CluePanel(QWidget):
    """Panneau des définitions."""

    clueClicked = pyqtSignal(str, str)  # direction, key

    def __init__(self, parent=None):
        super().__init__(parent)
        layout = QHBoxLayout(self)  # Côte à côte
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(4)

        # Colonne horizontale
        across_container = QVBoxLayout()
        across_container.setSpacing(2)
        self.across_label = QLabel("Horizontalement")
        self.across_label.setFont(QFont(".AppleSystemUIFont", 11, QFont.Bold))
        across_container.addWidget(self.across_label)
        self.across_list = QListWidget()
        self.across_list.setFont(QFont(".AppleSystemUIFont", 11))
        self.across_list.itemClicked.connect(lambda item: self._on_click('across', item))
        self.across_list.itemDoubleClicked.connect(lambda item: self._on_dblclick('across', item))
        across_container.addWidget(self.across_list)
        layout.addLayout(across_container)

        # Colonne verticale
        down_container = QVBoxLayout()
        down_container.setSpacing(2)
        self.down_label = QLabel("Verticalement")
        self.down_label.setFont(QFont(".AppleSystemUIFont", 11, QFont.Bold))
        down_container.addWidget(self.down_label)
        self.down_list = QListWidget()
        self.down_list.setFont(QFont(".AppleSystemUIFont", 11))
        self.down_list.itemClicked.connect(lambda item: self._on_click('down', item))
        self.down_list.itemDoubleClicked.connect(lambda item: self._on_dblclick('down', item))
        down_container.addWidget(self.down_list)
        layout.addLayout(down_container)

        self.clues = {'across': {}, 'down': {}}
        self.edit_callback = None

    def _on_click(self, direction, item):
        num = item.data(Qt.UserRole)
        if num is not None:
            self.clueClicked.emit(direction, num)

    def _on_dblclick(self, direction, item):
        num = item.data(Qt.UserRole)
        if num is not None and self.edit_callback:
            self.edit_callback(direction, num)

    def _roman_to_int(self, roman):
        """Convertit un chiffre romain en entier."""
        roman_vals = {'I': 1, 'V': 5, 'X': 10, 'L': 50, 'C': 100}
        val = 0
        for i, ch in enumerate(roman):
            v = roman_vals.get(ch, 0)
            if i + 1 < len(roman) and roman_vals.get(roman[i + 1], 0) > v:
                val -= v
            else:
                val += v
        return val

    def _sort_key(self, key, direction):
        """Clé de tri pour les numéros français."""
        parts = key.split('.')
        suffix = parts[1] if len(parts) > 1 else ''
        if direction == 'across':
            # Horizontal = romain : "III.a" → (3, 'a')
            return (self._roman_to_int(parts[0]), suffix)
        else:
            # Vertical = arabe : "3.a" → (3, 'a')
            return (int(parts[0]), suffix)

    def update_clues(self, clues, grid_data, rows, cols):
        self.clues = clues

        for direction, listw in [('across', self.across_list), ('down', self.down_list)]:
            listw.clear()
            keys = sorted(clues[direction].keys(), key=lambda k: self._sort_key(k, direction))
            for key in keys:
                c = clues[direction][key]
                word = self._get_word(grid_data, c['row'], c['col'], direction, rows, cols)
                display_word = word.replace(' ', '·')
                clue_text = c.get('clue', '')
                label = f"{key}.  {clue_text or 'Sans définition'}"
                if display_word:
                    label += f"  [{display_word}]"

                item = QListWidgetItem(label)
                item.setData(Qt.UserRole, key)
                if not clue_text:
                    item.setForeground(QBrush(QColor(180, 180, 180)))
                listw.addItem(item)

    def _get_word(self, grid, r, c, direction, rows, cols):
        word = ''
        if direction == 'across':
            for cc in range(c, cols):
                if grid[r][cc]['black']:
                    break
                word += grid[r][cc].get('letter', '') or ' '
        else:
            for rr in range(r, rows):
                if grid[rr][c]['black']:
                    break
                word += grid[rr][c].get('letter', '') or ' '
        return word


# ========== EDITOR TAB ==========
class EditorTab(QWidget):
    """Onglet principal de l'éditeur de grilles."""

    def __init__(self, parent=None):
        super().__init__(parent)
        self.grid_data = []
        self.rows = 0
        self.cols = 0
        self.current_tool = 'letter'
        self.dotted_mode = False
        self.dotted_first_cell = None
        self.clues = {'across': {}, 'down': {}}
        self.symmetry = False
        self.current_grid_name = None
        self.modified = False
        self.undo_stack = []  # Pile d'états pour Ctrl+Z
        self.max_undo = 100

        self.init_ui()

    def init_ui(self):
        main_layout = QVBoxLayout(self)
        main_layout.setContentsMargins(4, 2, 4, 2)
        main_layout.setSpacing(2)

        # === Toolbar (compact, tout en haut) ===
        toolbar_layout = QHBoxLayout()
        toolbar_layout.setSpacing(4)

        toolbar_layout.addWidget(QLabel("Lignes:"))
        self.rows_spin = QSpinBox()
        self.rows_spin.setRange(3, 25)
        self.rows_spin.setValue(10)
        self.rows_spin.setFixedWidth(50)
        toolbar_layout.addWidget(self.rows_spin)

        toolbar_layout.addWidget(QLabel("Col:"))
        self.cols_spin = QSpinBox()
        self.cols_spin.setRange(3, 25)
        self.cols_spin.setValue(10)
        self.cols_spin.setFixedWidth(50)
        toolbar_layout.addWidget(self.cols_spin)

        new_btn = QPushButton("Nouvelle grille")
        new_btn.clicked.connect(self.new_grid)
        toolbar_layout.addWidget(new_btn)

        toolbar_layout.addWidget(self._separator())

        self.letter_btn = QPushButton("Lettres")
        self.letter_btn.setCheckable(True)
        self.letter_btn.setChecked(True)
        self.letter_btn.clicked.connect(lambda: self.set_tool('letter'))
        toolbar_layout.addWidget(self.letter_btn)

        self.dotted_btn = QPushButton("Pointillés")
        self.dotted_btn.setCheckable(True)
        self.dotted_btn.setChecked(False)
        self.dotted_btn.clicked.connect(self.toggle_dotted_mode)
        toolbar_layout.addWidget(self.dotted_btn)

        self.black_btn = QPushButton("Cases noires")
        self.black_btn.setCheckable(True)
        self.black_btn.setChecked(False)
        self.black_btn.clicked.connect(lambda: self.set_tool('black'))
        toolbar_layout.addWidget(self.black_btn)

        self.sym_check = QCheckBox("Symétrie")
        self.sym_check.setChecked(False)
        self.sym_check.toggled.connect(lambda v: setattr(self, 'symmetry', v))
        toolbar_layout.addWidget(self.sym_check)

        toolbar_layout.addWidget(self._separator())

        save_btn = QPushButton("Sauvegarder")
        save_btn.clicked.connect(self.save_grid)
        toolbar_layout.addWidget(save_btn)

        load_btn = QPushButton("Charger")
        load_btn.clicked.connect(self.load_grid)
        toolbar_layout.addWidget(load_btn)

        export_btn = QPushButton("Exporter JSON")
        export_btn.clicked.connect(self.export_json)
        toolbar_layout.addWidget(export_btn)

        toolbar_layout.addStretch()

        self.stats_label = QLabel("Mots: 0 | Noires: 0 | Remplies: 0/0")
        self.stats_label.setStyleSheet("color: #888; font-size: 11px;")
        toolbar_layout.addWidget(self.stats_label)

        main_layout.addLayout(toolbar_layout)

        # === Contenu principal : grille à gauche, panneaux à droite ===
        content_layout = QHBoxLayout()
        content_layout.setSpacing(4)

        # Grille (taille fixe, collée en haut à gauche)
        grid_container = QWidget()
        grid_vbox = QVBoxLayout(grid_container)
        grid_vbox.setContentsMargins(0, 0, 0, 0)
        grid_vbox.setAlignment(Qt.AlignTop | Qt.AlignLeft)
        self.grid_widget = GridWidget()
        self.grid_widget.cellClicked.connect(self.on_cell_click)
        grid_vbox.addWidget(self.grid_widget)
        grid_vbox.addStretch()
        content_layout.addWidget(grid_container)

        # Panneau droit : définitions + suggestions (prend tout l'espace restant)
        right_splitter = QSplitter(Qt.Vertical)

        # Définitions (horizontal + vertical côte à côte)
        self.clue_panel = CluePanel()
        self.clue_panel.clueClicked.connect(self.on_clue_click)
        self.clue_panel.edit_callback = self.edit_clue
        right_splitter.addWidget(self.clue_panel)

        # Suggestions
        self.suggestion_panel = SuggestionPanel()
        self.suggestion_panel.wordSelected.connect(self.insert_suggested_word)
        right_splitter.addWidget(self.suggestion_panel)

        right_splitter.setSizes([250, 350])  # Plus d'espace aux suggestions
        content_layout.addWidget(right_splitter, 1)  # stretch=1 pour prendre tout l'espace

        main_layout.addLayout(content_layout, 1)

    def _separator(self):
        sep = QFrame()
        sep.setFrameShape(QFrame.VLine)
        sep.setStyleSheet("color: #ddd;")
        return sep

    def new_grid(self):
        if self.modified:
            r = QMessageBox.question(self, "Grille non sauvegardée",
                                     "Voulez-vous sauvegarder avant de créer une nouvelle grille ?",
                                     QMessageBox.Yes | QMessageBox.No | QMessageBox.Cancel)
            if r == QMessageBox.Yes:
                self.save_grid()
            elif r == QMessageBox.Cancel:
                return

        self.rows = self.rows_spin.value()
        self.cols = self.cols_spin.value()
        self.grid_data = []
        for r in range(self.rows):
            row = []
            for c in range(self.cols):
                row.append({'black': False, 'letter': '', 'number': 0, 'dotted': {'top': False, 'right': False, 'bottom': False, 'left': False}})
            self.grid_data.append(row)
        self.clues = {'across': {}, 'down': {}}
        self.current_grid_name = None
        self.modified = False
        self.auto_number()
        self.refresh_display()

    def set_tool(self, tool):
        # Exit dotted mode if switching to another tool
        if self.dotted_mode:
            self.dotted_mode = False
            self.dotted_first_cell = None
            self.dotted_btn.setChecked(False)
            self.grid_widget.update()
        self.current_tool = tool
        self.black_btn.setChecked(tool == 'black')
        self.letter_btn.setChecked(tool == 'letter')

    def toggle_dotted_mode(self):
        if self.dotted_mode:
            # Quitter le mode
            self.dotted_mode = False
            self.dotted_first_cell = None
            self.grid_widget._dotted_first_cell = None
            self.dotted_btn.setChecked(False)
            self.set_tool('letter')
        else:
            # Entrer en mode pointillés
            self.dotted_mode = True
            self.dotted_first_cell = None
            self.current_tool = 'dotted'
            self.black_btn.setChecked(False)
            self.letter_btn.setChecked(False)
            self.dotted_btn.setChecked(True)
            self.grid_widget.update()

    def on_cell_click(self, r, c):
        if self.dotted_mode:
            self.handle_dotted_click(r, c)
            return
        if self.current_tool == 'black':
            self.toggle_black(r, c)
        else:
            self.grid_widget.setFocus()
            self.update_suggestions()
        self.refresh_display()

    def handle_dotted_click(self, r, c):
        if self.dotted_first_cell is None:
            # Premier clic : sélectionner la case
            self.dotted_first_cell = (r, c)
            self.grid_widget._dotted_first_cell = (r, c)
            self.grid_widget.update()
        else:
            fr, fc = self.dotted_first_cell
            dr = abs(r - fr)
            dc = abs(c - fc)
            if (dr == 1 and dc == 0) or (dr == 0 and dc == 1):
                # Cases adjacentes : basculer l'arête
                # Déterminer quelle arête du côté de la 1ère case
                if r < fr:
                    edge = 'top'
                elif r > fr:
                    edge = 'bottom'
                elif c < fc:
                    edge = 'left'
                else:
                    edge = 'right'
                self._toggle_dotted_edge(fr, fc, edge)
                self.modified = True
            # Dé-sélectionner dans tous les cas
            self.dotted_first_cell = None
            self.grid_widget._dotted_first_cell = None
            self.grid_widget.update()

    def _toggle_dotted_edge(self, r, c, edge):
        """Bascule une arête en pointillés et synchronise la case voisine."""
        cell = self.grid_data[r][c]
        if 'dotted' not in cell:
            cell['dotted'] = {'top': False, 'right': False, 'bottom': False, 'left': False}
        cell['dotted'][edge] = not cell['dotted'][edge]

        # Synchroniser l'arête de la case adjacente
        opposites = {'top': 'bottom', 'bottom': 'top', 'left': 'right', 'right': 'left'}
        adj = {'top': (r-1, c), 'bottom': (r+1, c), 'left': (r, c-1), 'right': (r, c+1)}
        ar, ac = adj[edge]
        if 0 <= ar < self.rows and 0 <= ac < self.cols:
            adj_cell = self.grid_data[ar][ac]
            if 'dotted' not in adj_cell:
                adj_cell['dotted'] = {'top': False, 'right': False, 'bottom': False, 'left': False}
            adj_cell['dotted'][opposites[edge]] = cell['dotted'][edge]

    def toggle_black(self, r, c):
        self.grid_data[r][c]['black'] = not self.grid_data[r][c]['black']
        self.grid_data[r][c]['letter'] = ''
        self.grid_data[r][c]['number'] = 0

        if self.symmetry:
            mr = self.rows - 1 - r
            mc = self.cols - 1 - c
            if mr != r or mc != c:
                self.grid_data[mr][mc]['black'] = self.grid_data[r][c]['black']
                self.grid_data[mr][mc]['letter'] = ''
                self.grid_data[mr][mc]['number'] = 0

        self.modified = True
        self.auto_number()

    def auto_number(self):
        """Numérotation française : lignes 1,2,3... / colonnes I,II,III...
        Si plusieurs mots sur une même ligne/colonne : 3.a, 3.b / III.a, III.b"""
        old_clues = json.loads(json.dumps(self.clues))
        self.clues = {'across': {}, 'down': {}}

        # Horizontal : grouper par ligne, numérotation romaine (I, II, III...)
        for r in range(self.rows):
            words_in_row = []
            c = 0
            while c < self.cols:
                if not self.grid_data[r][c]['black']:
                    start_c = c
                    while c < self.cols and not self.grid_data[r][c]['black']:
                        c += 1
                    if c - start_c >= 2:
                        words_in_row.append(start_c)
                else:
                    c += 1

            row_roman = to_roman(r + 1)
            if len(words_in_row) == 1:
                key = row_roman
                old_clue = self._find_old_clue(old_clues['across'], r, words_in_row[0])
                self.clues['across'][key] = {
                    'label': key, 'row': r, 'col': words_in_row[0],
                    'clue': old_clue or ''
                }
            else:
                for i, sc in enumerate(words_in_row):
                    suffix = chr(ord('a') + i)
                    key = f"{row_roman}.{suffix}"
                    old_clue = self._find_old_clue(old_clues['across'], r, sc)
                    self.clues['across'][key] = {
                        'label': key, 'row': r, 'col': sc,
                        'clue': old_clue or ''
                    }

        # Vertical : grouper par colonne, numérotation arabe (1, 2, 3...)
        for c in range(self.cols):
            words_in_col = []
            r = 0
            while r < self.rows:
                if not self.grid_data[r][c]['black']:
                    start_r = r
                    while r < self.rows and not self.grid_data[r][c]['black']:
                        r += 1
                    if r - start_r >= 2:
                        words_in_col.append(start_r)
                else:
                    r += 1

            col_num = str(c + 1)
            if len(words_in_col) == 1:
                key = col_num
                old_clue = self._find_old_clue(old_clues['down'], words_in_col[0], c)
                self.clues['down'][key] = {
                    'label': key, 'row': words_in_col[0], 'col': c,
                    'clue': old_clue or ''
                }
            else:
                for i, sr in enumerate(words_in_col):
                    suffix = chr(ord('a') + i)
                    key = f"{col_num}.{suffix}"
                    old_clue = self._find_old_clue(old_clues['down'], sr, c)
                    self.clues['down'][key] = {
                        'label': key, 'row': sr, 'col': c,
                        'clue': old_clue or ''
                    }

    def _find_old_clue(self, old_dir, r, c):
        for k, v in old_dir.items():
            if v['row'] == r and v['col'] == c:
                return v.get('clue', '')
        return ''

    # ========== UNDO ==========
    def save_undo_state(self):
        """Sauvegarde l'état actuel des lettres de la grille pour pouvoir annuler."""
        state = [[cell.get('letter', '') for cell in row] for row in self.grid_data]
        self.undo_stack.append(state)
        if len(self.undo_stack) > self.max_undo:
            self.undo_stack.pop(0)

    def undo(self):
        """Restaure le dernier état sauvegardé."""
        if not self.undo_stack:
            return
        state = self.undo_stack.pop()
        for r in range(self.rows):
            for c in range(self.cols):
                if not self.grid_data[r][c]['black']:
                    self.grid_data[r][c]['letter'] = state[r][c]
        self.modified = True
        self.auto_number()
        self.refresh_display()
        self.update_suggestions()

    # ========== INSERT SUGGESTED WORD ==========
    def insert_suggested_word(self, word):
        """Insère un mot suggéré dans la grille à la position du mot sélectionné."""
        sel = self.grid_widget.selected
        if not sel:
            return
        r, c = sel
        if self.grid_data[r][c]['black']:
            return

        direction = self.grid_widget.direction
        cells = self.grid_widget.get_word_cells(r, c, direction)
        if not cells:
            return

        # Vérifier que le mot a la bonne longueur
        word_upper = word.upper()
        if len(word_upper) != len(cells):
            return

        # Sauvegarder l'état avant modification
        self.save_undo_state()

        # Insérer les lettres
        for i, (cr, cc) in enumerate(cells):
            self.grid_data[cr][cc]['letter'] = word_upper[i]

        self.modified = True
        self.auto_number()
        self.refresh_display()
        self.update_suggestions()

    def on_clue_click(self, direction, key):
        if key in self.clues[direction]:
            c = self.clues[direction][key]
            self.grid_widget.selected = (c['row'], c['col'])
            self.grid_widget.direction = direction
            self.set_tool('letter')
            self.grid_widget.update_highlight()
            self.grid_widget.setFocus()
            self.update_suggestions()
            self.refresh_display()

    def edit_clue(self, direction, key):
        if key not in self.clues[direction]:
            return
        c = self.clues[direction][key]
        word = self._get_word(c['row'], c['col'], direction)
        dir_label = "Horizontal" if direction == 'across' else "Vertical"

        text, ok = QInputDialog.getText(
            self, f"Définition — {dir_label} {key}",
            f"Mot : {word}\nDéfinition :",
            QLineEdit.Normal,
            c.get('clue', '')
        )
        if ok:
            self.clues[direction][key]['clue'] = text.strip()
            self.modified = True
            self.refresh_display()

    def _get_word(self, r, c, direction):
        word = ''
        if direction == 'across':
            for cc in range(c, self.cols):
                if self.grid_data[r][cc]['black']:
                    break
                word += self.grid_data[r][cc].get('letter', '') or ' '
        else:
            for rr in range(r, self.rows):
                if self.grid_data[rr][c]['black']:
                    break
                word += self.grid_data[rr][c].get('letter', '') or ' '
        return word

    def update_suggestions(self):
        sel = self.grid_widget.selected
        if not sel or self.grid_data[sel[0]][sel[1]]['black']:
            self.suggestion_panel.update_suggestions('', '')
            return

        direction = self.grid_widget.direction
        cells = self.grid_widget.get_word_cells(sel[0], sel[1], direction)
        if len(cells) < 2:
            self.suggestion_panel.update_suggestions('', '')
            return

        pattern = ''
        for r, c in cells:
            letter = self.grid_data[r][c].get('letter', '')
            pattern += letter if letter else '?'

        dir_label = "Horizontal" if direction == 'across' else "Vertical"
        self.suggestion_panel.update_suggestions(pattern, dir_label)

    def refresh_display(self):
        self.grid_widget.set_grid(self.grid_data, self.rows, self.cols)
        self.grid_widget.update_highlight()
        self.clue_panel.update_clues(self.clues, self.grid_data, self.rows, self.cols)
        self.update_stats()

    def update_stats(self):
        word_count = len(self.clues['across']) + len(self.clues['down'])
        black_count = sum(1 for r in self.grid_data for c in r if c['black'])
        total_white = sum(1 for r in self.grid_data for c in r if not c['black'])
        filled = sum(1 for r in self.grid_data for c in r if not c['black'] and c.get('letter'))
        self.stats_label.setText(f"Mots: {word_count} | Noires: {black_count} | Remplies: {filled}/{total_white}")

    # Keyboard handling
    def keyPressEvent(self, event):
        # Ctrl+Z : Undo (fonctionne quel que soit le mode)
        if event.key() == Qt.Key_Z and event.modifiers() & Qt.ControlModifier:
            self.undo()
            return

        if self.current_tool != 'letter':
            return
        sel = self.grid_widget.selected
        if not sel:
            return
        r, c = sel
        if self.grid_data[r][c]['black']:
            return

        key = event.key()
        text = event.text()

        if key == Qt.Key_Space:
            self.grid_widget.direction = 'down' if self.grid_widget.direction == 'across' else 'across'
            self.grid_widget.update_highlight()
            self.update_suggestions()
            return

        if key == Qt.Key_Backspace:
            self.save_undo_state()
            self.grid_data[r][c]['letter'] = ''
            self.modified = True
            self._move_cursor(-1)
            self.auto_number()
            self.refresh_display()
            self.update_suggestions()
            return

        if key == Qt.Key_Delete:
            self.save_undo_state()
            self.grid_data[r][c]['letter'] = ''
            self.modified = True
            self.auto_number()
            self.refresh_display()
            self.update_suggestions()
            return

        if key == Qt.Key_Right:
            self._move_to(r, c + 1)
            return
        if key == Qt.Key_Left:
            self._move_to(r, c - 1)
            return
        if key == Qt.Key_Down:
            self._move_to(r + 1, c)
            return
        if key == Qt.Key_Up:
            self._move_to(r - 1, c)
            return

        if text and re.match(r'[a-zA-ZÀ-ÿ]', text):
            self.save_undo_state()
            self.grid_data[r][c]['letter'] = text.upper()
            self.modified = True
            self._move_cursor(1)
            self.auto_number()
            self.refresh_display()
            self.update_suggestions()

    def _move_cursor(self, delta):
        sel = self.grid_widget.selected
        if not sel:
            return
        r, c = sel
        if self.grid_widget.direction == 'across':
            c += delta
            while 0 <= c < self.cols and self.grid_data[r][c]['black']:
                c += delta
            if 0 <= c < self.cols:
                self.grid_widget.selected = (r, c)
        else:
            r += delta
            while 0 <= r < self.rows and self.grid_data[r][c]['black']:
                r += delta
            if 0 <= r < self.rows:
                self.grid_widget.selected = (r, c)
        self.grid_widget.update_highlight()

    def _move_to(self, r, c):
        if 0 <= r < self.rows and 0 <= c < self.cols and not self.grid_data[r][c]['black']:
            self.grid_widget.selected = (r, c)
            self.grid_widget.update_highlight()
            self.update_suggestions()
            self.refresh_display()

    # === Save / Load / Export ===
    def save_grid(self):
        if not self.grid_data:
            QMessageBox.warning(self, "Erreur", "Pas de grille à sauvegarder.")
            return

        if not self.current_grid_name:
            name, ok = QInputDialog.getText(self, "Nom de la grille", "Nom :")
            if not ok or not name.strip():
                return
            self.current_grid_name = name.strip()

        data = self._build_export_data()
        database.save_grid(self.current_grid_name, data)
        self.modified = False
        QMessageBox.information(self, "Sauvegardé", f"Grille « {self.current_grid_name} » sauvegardée.")

    def load_grid(self):
        grids = database.list_grids()
        if not grids:
            QMessageBox.information(self, "Aucune grille", "Aucune grille sauvegardée.")
            return

        names = [f"{'✓ ' if g['terminee'] else ''}{g['nom']}  ({g['date_modif']})" for g in grids]
        name, ok = QInputDialog.getItem(self, "Charger une grille", "Grille :", names, 0, False)
        if not ok:
            return

        idx = names.index(name)
        grid_entry = grids[idx]
        loaded = database.load_grid(grid_entry['nom'])
        if loaded:
            self._load_from_data(loaded['json_data'])
            self.current_grid_name = grid_entry['nom']
            self.modified = False

    def export_json(self):
        if not self.grid_data:
            return
        data = self._build_export_data()
        default_name = self.current_grid_name or "grille"
        path, _ = QFileDialog.getSaveFileName(self, "Exporter", f"{default_name}.json", "JSON (*.json)")
        if path:
            with open(path, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            QMessageBox.information(self, "Exporté", f"Grille exportée dans :\n{path}")

    def _export_cell(self, cell):
        obj = {'black': cell['black'], 'letter': cell.get('letter', ''), 'number': cell.get('number', 0)}
        dotted = cell.get('dotted')
        if dotted and any(dotted.values()):
            obj['dotted'] = dotted
        return obj

    def _build_export_data(self):
        data = {
            'format': 'verbicruciste',
            'version': 2,
            'title': self.current_grid_name or 'Sans titre',
            'author': '',
            'date': '',
            'size': {'rows': self.rows, 'cols': self.cols},
            'grid': [[self._export_cell(cell) for cell in row] for row in self.grid_data],
            'clues': {
                'across': [
                    {
                        'label': c['label'], 'clue': c.get('clue', ''),
                        'row': c['row'], 'col': c['col'],
                        'answer': self._get_word(c['row'], c['col'], 'across').strip(),
                        'length': len(self._get_word(c['row'], c['col'], 'across').rstrip())
                    }
                    for c in self.clues['across'].values()
                ],
                'down': [
                    {
                        'label': c['label'], 'clue': c.get('clue', ''),
                        'row': c['row'], 'col': c['col'],
                        'answer': self._get_word(c['row'], c['col'], 'down').strip(),
                        'length': len(self._get_word(c['row'], c['col'], 'down').rstrip())
                    }
                    for c in self.clues['down'].values()
                ]
            }
        }
        return data

    def _load_from_data(self, data):
        self.rows = data['size']['rows']
        self.cols = data['size']['cols']
        self.rows_spin.setValue(self.rows)
        self.cols_spin.setValue(self.cols)

        self.grid_data = [[{
            'black': cell['black'],
            'letter': cell.get('letter', ''),
            'number': cell.get('number', 0),
            **(({'dotted': cell['dotted']} if cell.get('dotted') else {}))
        } for cell in row] for row in data['grid']]

        # Charger les clues, puis recalculer la numérotation française
        # (auto_number retrouvera les définitions par position row/col)
        self.clues = {'across': {}, 'down': {}}
        for c in data.get('clues', {}).get('across', []):
            # Compatibilité v1 (number) et v2 (label)
            key = c.get('label', str(c.get('number', '')))
            self.clues['across'][key] = {
                'label': key, 'row': c['row'], 'col': c['col'],
                'clue': c.get('clue', '')
            }
        for c in data.get('clues', {}).get('down', []):
            key = c.get('label', str(c.get('number', '')))
            self.clues['down'][key] = {
                'label': key, 'row': c['row'], 'col': c['col'],
                'clue': c.get('clue', '')
            }

        # Recalculer la numérotation française (préserve les définitions par position)
        self.auto_number()
        self.refresh_display()


# ========== MAIN WINDOW ==========
class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("Verbicruciste")
        self.setMinimumSize(1200, 750)

        # Init database
        database.init_db()

        # Import Lexique if needed
        stats = database.get_lexique_stats()
        if stats['total_entries'] == 0:
            self.import_lexique_with_progress()

        # Central widget with tabs
        self.tabs = QTabWidget()
        self.setCentralWidget(self.tabs)

        # Editor tab
        self.editor_tab = EditorTab()
        self.tabs.addTab(self.editor_tab, "Éditeur de grille")

        # Dictionary tab
        self.dict_tab = DictionaryTab()
        self.tabs.addTab(self.dict_tab, "Dictionnaire personnel")

        # Pattern search tab
        self.search_tab = PatternSearchDialog()
        self.tabs.addTab(self.search_tab, "Recherche par pattern")

        # Menu bar
        self.create_menus()

        # Status bar
        stats = database.get_lexique_stats()
        self.statusBar().showMessage(f"Lexique : {stats['distinct_words']} mots | Dictionnaire personnel : {database.get_personal_stats()['total_words']} mots")

        # Auto-create a grid
        self.editor_tab.new_grid()

    def create_menus(self):
        menubar = self.menuBar()

        # Fichier
        file_menu = menubar.addMenu("Fichier")
        file_menu.addAction("Nouvelle grille", self.editor_tab.new_grid, QKeySequence.New)
        file_menu.addAction("Sauvegarder", self.editor_tab.save_grid, QKeySequence.Save)
        file_menu.addAction("Charger une grille", self.editor_tab.load_grid, QKeySequence.Open)
        file_menu.addSeparator()
        file_menu.addAction("Exporter JSON", self.editor_tab.export_json)
        file_menu.addSeparator()
        file_menu.addAction("Quitter", self.close, QKeySequence.Quit)

        # Outils
        tools_menu = menubar.addMenu("Outils")
        tools_menu.addAction("Recherche par pattern...", self.show_pattern_search, QKeySequence("Ctrl+F"))

        # Dictionnaire
        dict_menu = menubar.addMenu("Dictionnaire")
        dict_menu.addAction("Ajouter un mot", self.dict_tab.add_word)
        dict_menu.addAction("Exporter", self.dict_tab.export_dict)
        dict_menu.addAction("Importer", self.dict_tab.import_dict)

    def show_pattern_search(self):
        self.tabs.setCurrentWidget(self.search_tab)
        self.search_tab.pattern_input.setFocus()

    def import_lexique_with_progress(self):
        progress = QProgressDialog("Import du dictionnaire Lexique 3...", None, 0, 0, self)
        progress.setWindowModality(Qt.WindowModal)
        progress.show()
        QApplication.processEvents()

        database.import_lexique(lambda n: (progress.setLabelText(f"Import : {n} mots..."), QApplication.processEvents()))

        progress.close()

    def closeEvent(self, event):
        if self.editor_tab.modified:
            r = QMessageBox.question(
                self, "Quitter",
                "La grille n'est pas sauvegardée. Quitter quand même ?",
                QMessageBox.Yes | QMessageBox.No
            )
            if r == QMessageBox.No:
                event.ignore()
                return
        event.accept()


def main():
    app = QApplication(sys.argv)

    # Style
    app.setStyle('Fusion')
    palette = QPalette()
    palette.setColor(QPalette.Window, QColor(240, 242, 245))
    palette.setColor(QPalette.WindowText, QColor(26, 26, 46))
    palette.setColor(QPalette.Base, QColor(255, 255, 255))
    palette.setColor(QPalette.AlternateBase, QColor(240, 242, 245))
    palette.setColor(QPalette.Text, QColor(26, 26, 46))
    palette.setColor(QPalette.ButtonText, QColor(26, 26, 46))
    palette.setColor(QPalette.PlaceholderText, QColor(160, 160, 160))
    palette.setColor(QPalette.Button, QColor(240, 242, 245))
    palette.setColor(QPalette.Highlight, QColor(74, 108, 247))
    palette.setColor(QPalette.HighlightedText, QColor(255, 255, 255))
    app.setPalette(palette)

    window = MainWindow()
    window.show()
    sys.exit(app.exec_())


if __name__ == '__main__':
    main()
