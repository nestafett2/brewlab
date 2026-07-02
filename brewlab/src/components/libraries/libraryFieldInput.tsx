/**
 * Shared field-input renderer for the library modals.
 *
 * Both the single Add/Edit modal (LibraryEntryModal) and the bulk-edit
 * modal (LibraryBulkEditModal) call `renderLibFieldInput` so the two
 * surfaces can never visually drift on field types.
 *
 * Originally lived inline in LibraryEntryModal.tsx (renderInput +
 * SupplierSelect). Bulk-edit had its own narrower copy missing
 * supplier-select and checkbox — extracted here as the single source.
 *
 * Only the input element is rendered. Layout (label, two-column rows,
 * enable-checkbox prefix) stays in each caller.
 */

import { useStore } from '../../store';
import type { FieldDef } from './libraryShared';

export type LibFieldValue = string | boolean;

interface RenderOpts {
  disabled?: boolean;
}

export function renderLibFieldInput(
  d: FieldDef,
  value: LibFieldValue,
  onChange: (v: LibFieldValue) => void,
  opts: RenderOpts = {},
): React.ReactNode {
  const disabled = opts.disabled === true;

  if (d.type === 'text') {
    return (
      <input
        type="text"
        disabled={disabled}
        value={String(value ?? '')}
        onChange={e => onChange(e.target.value)}
        style={inputStyle}
      />
    );
  }
  if (d.type === 'number') {
    return (
      <input
        type="number"
        disabled={disabled}
        value={String(value ?? '')}
        onChange={e => onChange(e.target.value)}
        style={inputStyle}
      />
    );
  }
  if (d.type === 'select') {
    // Default-to-first-option matches the single-edit modal so empty
    // strings round-trip predictably to a valid selection.
    return (
      <select
        disabled={disabled}
        value={String(value ?? (d.opts?.[0] ?? ''))}
        onChange={e => onChange(e.target.value)}
        style={inputStyle}
      >
        {(d.opts || []).map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }
  if (d.type === 'supplier-select') {
    return (
      <SupplierSelect
        value={String(value ?? '')}
        onChange={s => onChange(s)}
        disabled={disabled}
      />
    );
  }
  if (d.type === 'checkbox') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', padding: '5px 0' }}>
        <input
          type="checkbox"
          disabled={disabled}
          checked={!!value}
          onChange={e => onChange(e.target.checked)}
          style={{ width: 14, height: 14, cursor: disabled ? 'not-allowed' : 'pointer', accentColor: 'var(--amber)' }}
        />
      </div>
    );
  }
  return null;
}

function SupplierSelect({
  value, onChange, disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const suppliers = useStore(s => s.suppliers);
  return (
    <select
      disabled={disabled}
      value={value}
      onChange={e => onChange(e.target.value)}
      style={inputStyle}
    >
      <option value="">— None —</option>
      {suppliers.map(s => <option key={s} value={s}>{s}</option>)}
    </select>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  background: 'var(--panel2)', border: '1px solid var(--border2)',
  color: 'var(--text)', fontFamily: 'var(--mono)', fontSize: 10,
  padding: '4px 6px', outline: 'none',
};
