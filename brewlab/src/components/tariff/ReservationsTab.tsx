/**
 * Reservations — Tariff sub-tab 2.
 *
 * Port of brewlab-desktop.html:9221–9410 (renderTariffReservations +
 * reservation/malt CRUD: addTariffReservation, removeTariffReservation,
 * updateTariffRes, markTariffResReceived, markTariffResReceivedIfDate,
 * addTariffResMalt, removeTariffResMalt, updateTariffResMalt).
 *
 * Card-per-reservation layout with Mark Received button + supplier /
 * date sent / date received / notes header fields, then a nested malts
 * table (Malt / TRQ / Kg Reserved / Kg Received / ✕). The TRQ flag is
 * always re-derived from the malt library — see the comment on
 * TariffReservationMalt in types/index.ts.
 */

import { useStore } from '../../store';
import type {
  TariffData, TariffReservation, TariffReservationMalt, MaltLib,
} from '../../types';

interface Props {
  year: number;
  data: TariffData;
}

const isMalted = (m: MaltLib): boolean => m.malted !== false;

export default function ReservationsTab({ year, data }: Props) {
  const setTariff = useStore(s => s.setTariff);
  const maltLib = useStore(s => s.maltLib);
  const suppliers = useStore(s => s.suppliers);
  const pushToast = useStore(s => s.pushToast);

  const reservations = data.reservations ?? [];
  const maltedLib = maltLib.filter(isMalted);

  const isTrqMalt = (name: string): boolean =>
    !!maltedLib.find(e => e.name === name)?.tariff;

  // ── Persistence helpers ──────────────────────────────────────────────

  const saveData = (next: TariffData) => setTariff(year, next);

  const addReservation = () => {
    const next: TariffReservation = {
      supplier: '',
      dateSent: '',
      dateReceived: '',
      status: 'pending',
      notes: '',
      malts: [],
    };
    saveData({ ...data, reservations: [...reservations, next] });
  };

  const removeReservation = (ri: number) => {
    const beforeData = data;
    saveData({ ...data, reservations: reservations.filter((_, i) => i !== ri) });
    pushToast({
      message: 'Removed reservation',
      undo: () => saveData(beforeData),
    });
  };

  const updateReservation = <K extends keyof TariffReservation>(
    ri: number, key: K, val: TariffReservation[K],
  ) => {
    const updated = reservations.map((r, i) => i === ri ? { ...r, [key]: val } : r);
    saveData({ ...data, reservations: updated });
  };

  const markReceived = (ri: number, autoIfDate: boolean) => {
    const r = reservations[ri];
    if (!r) return;
    // autoIfDate: only flip status if a dateReceived is set (HTML 9369)
    if (autoIfDate && !r.dateReceived) return;
    const updated = reservations.map((res, i) => i === ri ? {
      ...res,
      status: 'received' as const,
      dateReceived: res.dateReceived || new Date().toISOString().slice(0, 10),
    } : res);
    saveData({ ...data, reservations: updated });
  };

  const addMalt = (ri: number) => {
    const updated = reservations.map((res, i) => {
      if (i !== ri) return res;
      const next: TariffReservationMalt = { malt: '', kgReserved: '', kgReceived: '' };
      return { ...res, malts: [...(res.malts ?? []), next] };
    });
    saveData({ ...data, reservations: updated });
  };

  const removeMalt = (ri: number, mi: number) => {
    const updated = reservations.map((res, i) => {
      if (i !== ri) return res;
      return { ...res, malts: (res.malts ?? []).filter((_, j) => j !== mi) };
    });
    saveData({ ...data, reservations: updated });
  };

  const updateMalt = <K extends keyof TariffReservationMalt>(
    ri: number, mi: number, key: K, val: TariffReservationMalt[K],
  ) => {
    const updated = reservations.map((res, i) => {
      if (i !== ri) return res;
      const malts = (res.malts ?? []).map((m, j) => {
        if (j !== mi) return m;
        const nm = { ...m, [key]: val };
        // When malt is first selected, default kgReceived to kgReserved (HTML 9403)
        if (key === 'malt' && !nm.kgReceived) nm.kgReceived = nm.kgReserved;
        return nm;
      });
      return { ...res, malts };
    });
    saveData({ ...data, reservations: updated });
  };

  // ── Aggregated summary ──────────────────────────────────────────────

  const allMalts: Record<string, { trq: number; std: number; received: number }> = {};
  for (const res of reservations) {
    for (const m of (res.malts ?? [])) {
      if (!m.malt) continue;
      const isTrq = isTrqMalt(m.malt);
      if (!allMalts[m.malt]) allMalts[m.malt] = { trq: 0, std: 0, received: 0 };
      const kg = parseFloat(m.kgReserved) || 0;
      if (isTrq) allMalts[m.malt].trq += kg;
      else       allMalts[m.malt].std += kg;
      if (res.status === 'received') {
        allMalts[m.malt].received += parseFloat(m.kgReceived ?? m.kgReserved) || 0;
      }
    }
  }
  const summaryNames = Object.keys(allMalts).sort();

  return (
    <div className="tariff-content-wrap">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-muted)' }}>
          Each box = one reservation order. Add malts within each reservation. ★ = Tariff Quota malt.
        </div>
        <button className="btn" onClick={addReservation}>＋ New Reservation</button>
      </div>

      {reservations.length === 0 && (
        <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>
          No reservations yet — click ＋ New Reservation to start
        </div>
      )}

      {reservations.map((res, ri) => {
        const malts = res.malts ?? [];
        const isReceived = res.status === 'received';
        const totalKg = malts.reduce((s, m) => s + (parseFloat(m.kgReserved) || 0), 0);
        const trqKg = malts.filter(m => isTrqMalt(m.malt)).reduce((s, m) => s + (parseFloat(m.kgReserved) || 0), 0);

        return (
          <div className="tariff-section" key={ri} style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
              <span style={{ fontFamily: 'var(--display)', fontSize: 13, letterSpacing: 1, color: 'var(--amber)' }}>
                RESERVATION {ri + 1}
              </span>
              <span className={`tariff-badge ${isReceived ? 'received' : 'pending'}`}>
                {isReceived ? 'RECEIVED' : 'PENDING'}
              </span>
              {totalKg > 0 && (
                <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-muted)' }}>
                  {totalKg.toFixed(1)} kg total{trqKg > 0 ? ` · ${trqKg.toFixed(1)} kg TRQ` : ''}
                </span>
              )}
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                {!isReceived && (
                  <button className="btn sm" onClick={() => markReceived(ri, false)}>Mark Received</button>
                )}
                <button
                  onClick={() => removeReservation(ri)}
                  style={{ background: 'none', border: '1px solid var(--border2)', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 11, padding: '2px 8px', borderRadius: 4 }}
                >Remove</button>
              </div>
            </div>

            {/* Header fields */}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
              <Field label="SUPPLIER">
                <select
                  className="tariff-inp"
                  style={{ width: 160 }}
                  value={res.supplier}
                  onChange={e => updateReservation(ri, 'supplier', e.target.value)}
                >
                  <option value="">—</option>
                  {suppliers.map(s => <option key={s} value={s}>{s}</option>)}
                  {res.supplier && !suppliers.includes(res.supplier) && (
                    <option value={res.supplier}>{res.supplier}</option>
                  )}
                </select>
              </Field>
              <Field label="DATE SENT">
                <input
                  className="tariff-inp"
                  style={{ width: 120 }}
                  value={res.dateSent}
                  placeholder="YYYY-MM-DD"
                  onChange={e => updateReservation(ri, 'dateSent', e.target.value)}
                />
              </Field>
              <Field label="DATE RECEIVED">
                <input
                  className="tariff-inp"
                  style={{ width: 120 }}
                  value={res.dateReceived}
                  placeholder="YYYY-MM-DD"
                  onChange={e => {
                    updateReservation(ri, 'dateReceived', e.target.value);
                  }}
                  onBlur={() => markReceived(ri, true)}
                />
              </Field>
              <Field label="NOTES">
                <input
                  className="tariff-inp"
                  style={{ width: 200 }}
                  value={res.notes}
                  placeholder="Notes…"
                  onChange={e => updateReservation(ri, 'notes', e.target.value)}
                />
              </Field>
            </div>

            {/* Malts table */}
            <table className="tariff-table" style={{ marginBottom: 8 }}>
              <thead><tr>
                <th>Malt</th><th>TRQ</th><th className="r">Kg Reserved</th><th className="r">Kg Received</th><th></th>
              </tr></thead>
              <tbody>
                {malts.length === 0 ? (
                  <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 8, fontSize: 9 }}>
                    No malts added yet
                  </td></tr>
                ) : malts.map((m, mi) => {
                  const isTrq = isTrqMalt(m.malt);
                  return (
                    <tr key={mi}>
                      <td>
                        <select
                          className="tariff-inp"
                          style={{ width: 180 }}
                          value={m.malt}
                          onChange={e => updateMalt(ri, mi, 'malt', e.target.value)}
                        >
                          <option value="">— select malt —</option>
                          {maltedLib.map(e => (
                            <option key={e.id} value={e.name}>
                              {e.name}{e.tariff ? ' ★' : ''}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span className={`tariff-badge ${isTrq ? 'received' : 'pending'}`}>
                          {isTrq ? 'TRQ' : 'Std'}
                        </span>
                      </td>
                      <td className="r">
                        <input
                          className="tariff-inp"
                          type="number"
                          value={m.kgReserved}
                          placeholder="kg"
                          onChange={e => updateMalt(ri, mi, 'kgReserved', e.target.value)}
                        />
                      </td>
                      <td className="r">
                        <input
                          className="tariff-inp"
                          type="number"
                          value={m.kgReceived ?? m.kgReserved}
                          placeholder="kg"
                          onChange={e => updateMalt(ri, mi, 'kgReceived', e.target.value)}
                        />
                      </td>
                      <td>
                        <button
                          onClick={() => removeMalt(ri, mi)}
                          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                        >✕</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <button className="btn sm" onClick={() => addMalt(ri)}>＋ Add Malt</button>
          </div>
        );
      })}

      {/* Summary across all reservations */}
      {summaryNames.length > 0 && (
        <div className="tariff-section" style={{ marginTop: 8 }}>
          <div className="tariff-section-title">FY {year}–{year + 1} — Total Reserved</div>
          <table className="tariff-table">
            <thead><tr>
              <th>Malt</th>
              <th className="r">TRQ (kg)</th>
              <th className="r">Standard (kg)</th>
              <th className="r">Total Reserved (kg)</th>
              <th className="r">Received (kg)</th>
            </tr></thead>
            <tbody>
              {summaryNames.map(name => {
                const d = allMalts[name];
                const total = d.trq + d.std;
                return (
                  <tr key={name}>
                    <td style={{ fontWeight: 600 }}>{name}</td>
                    <td className="r">{d.trq > 0 ? d.trq.toFixed(1) : '—'}</td>
                    <td className="r">{d.std > 0 ? d.std.toFixed(1) : '—'}</td>
                    <td className="r" style={{ color: 'var(--amber)', fontWeight: 600 }}>{total.toFixed(1)}</td>
                    <td className="r" style={{ color: d.received >= total ? '#32d74b' : 'var(--text-muted)' }}>
                      {d.received > 0 ? d.received.toFixed(1) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span style={{ fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--text-muted)', letterSpacing: 1 }}>{label}</span>
      {children}
    </div>
  );
}
