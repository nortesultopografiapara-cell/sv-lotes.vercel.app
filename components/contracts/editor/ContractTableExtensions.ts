import { Table, TableView } from '@tiptap/extension-table';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { TableRow } from '@tiptap/extension-table-row';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';

const verticalAlignAttr = {
  verticalAlign: {
    default: 'top',
    parseHTML: (element: HTMLElement) => {
      const value = String(
        element.getAttribute('data-v-align') || element.style.verticalAlign || 'top',
      ).toLowerCase();
      if (value === 'middle' || value === 'bottom') return value;
      return 'top';
    },
    renderHTML: (attributes: { verticalAlign?: string }) => {
      const value = attributes.verticalAlign || 'top';
      return {
        'data-v-align': value,
        style: `vertical-align:${value}`,
      };
    },
  },
};

export const ContractTableRow = TableRow;

export const ContractTableCell = TableCell.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      ...verticalAlignAttr,
    };
  },
});

export const ContractTableHeader = TableHeader.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      ...verticalAlignAttr,
    };
  },
});

class ContractTableView extends TableView {
  constructor(node: ProseMirrorNode, cellMinWidth: number) {
    super(node, cellMinWidth);
    this.applyBorders(node);
  }

  update(node: ProseMirrorNode) {
    const ok = super.update(node);
    if (ok) this.applyBorders(node);
    return ok;
  }

  applyBorders(node: ProseMirrorNode) {
    const borders = node.attrs.borders === 'none' ? 'none' : 'normal';
    this.table.setAttribute('data-sv-table-borders', borders);
    this.table.classList.toggle('sv-table-borderless', borders === 'none');
    this.table.classList.toggle('sv-table-bordered', borders !== 'none');
  }
}

export const ContractTable = Table.extend({
  addAttributes() {
    return {
      borders: {
        default: 'normal',
        parseHTML: (element) => {
          const attr = String(element.getAttribute('data-sv-table-borders') || '').toLowerCase();
          if (attr === 'none' || element.classList.contains('sv-table-borderless')) return 'none';
          return 'normal';
        },
        renderHTML: (attributes) => ({
          'data-sv-table-borders': attributes.borders || 'normal',
          class:
            attributes.borders === 'none' ? 'sv-table-borderless' : 'sv-table-bordered',
        }),
      },
    };
  },
});

export const CONTRACT_TABLE_EXTENSIONS = [
  ContractTable.configure({
    resizable: true,
    handleWidth: 6,
    cellMinWidth: 48,
    lastColumnResizable: true,
    allowTableNodeSelection: true,
    View: ContractTableView,
  }),
  ContractTableRow,
  ContractTableHeader,
  ContractTableCell,
];
