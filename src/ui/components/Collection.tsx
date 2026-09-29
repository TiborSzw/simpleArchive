import { useMemo, useState } from 'preact/hooks';
import { KIND_INFO, STATUSES, STATUS_INFO } from '../../core/constants';
import { monthLabel, monthShort, nowLocal, relativeLabel } from '../../core/dates';
import { EMPTY_FILTER, itemTitle } from '../../core/query';
import { collectionStats, formatBytes } from '../../core/stats';
import type { Status } from '../../core/types';
import { Icon } from '../icons';
import { push, setTab } from '../nav';
import { archive, useStore } from '../store';
import { galleryFilter, galleryView } from './Gallery';
import { Chip, Empty, fmtNum } from './ui';

function showInGallery(patch: Partial<typeof EMPTY_FILTER>) {
  galleryFilter.set({ ...EMPTY_FILTER, ...patch });
  galleryView.set('works');
  setTab('gallery');
}

function Tile({ value, label, sub, onClick }: { value: string; label: string; sub?: string; onClick?: () => void }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag type={onClick ? 'button' : undefined} class="tile" onClick={onClick}>
      <strong class="tile-value">{value}</strong>
      <span class="tile-label">{label}</span>
      {sub && <small class="tile-sub">{sub}</small>}
    </Tag>
  );
}

/** Painted models per month – one series, so no legend; tap a bar for its value. */
function MonthChart({ data }: { data: { month: string; items: number; models: number }[] }) {
  const [active, setActive] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const max = Math.max(1, ...data.map((d) => d.models));
  const best = data.reduce((b, d, i) => (d.models > data[b].models ? i : b), 0);
  const H = 132;
  if (table)
    return (
      <div class="chart">
        <table class="chart-table">
          <thead>
            <tr>
              <th>Monat</th>
              <th>Werke</th>
              <th>Modelle</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.month}>
                <td>{monthLabel(d.month)}</td>
                <td>{d.items}</td>
                <td>{d.models}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <button type="button" class="link-btn" onClick={() => setTable(false)}>
          Als Diagramm
        </button>
      </div>
    );
  const shown = active ?? (data[best].models ? best : null);
  return (
    <div class="chart">
      <div class="bars" style={{ height: `${H + 20}px` }} role="img" aria-label={`Fertig bemalte Modelle pro Monat, höchster Wert ${data[best].models} im ${monthLabel(data[best].month)}`}>
        {data.map((d, i) => {
          const h = d.models ? Math.max(6, Math.round((d.models / max) * H)) : 0;
          return (
            <button
              type="button"
              key={d.month}
              class={`bar-col ${i === active ? 'active' : ''}`}
              onClick={() => setActive(i === active ? null : i)}
              aria-label={`${monthLabel(d.month)}: ${d.models} Modelle, ${d.items} Werke`}
            >
              {i === shown && d.models > 0 && <span class="bar-label">{d.models}</span>}
              <span class="bar" style={{ height: `${h}px` }} />
              <span class={`bar-x ${(data.length - 1 - i) % 2 === 0 ? '' : 'faint'}`}>{monthShort(d.month)}</span>
            </button>
          );
        })}
      </div>
      <p class="chart-note">
        {active !== null ? (
          <>
            <strong>{monthLabel(data[active].month)}:</strong> {data[active].models} {data[active].models === 1 ? 'Modell' : 'Modelle'} in {data[active].items}{' '}
            {data[active].items === 1 ? 'Werk' : 'Werken'} fertig
          </>
        ) : (
          'Tippe auf einen Monat für Details.'
        )}
        <button type="button" class="link-btn" onClick={() => setTable(true)}>
          Tabelle
        </button>
      </p>
    </div>
  );
}

/** Where the collection stands: one bar, four ordered segments, labelled below. */
function ProgressBar({ byStatus, total }: { byStatus: Record<Status, { items: number; models: number }>; total: number }) {
  return (
    <div class="pile">
      <div class="pile-bar" role="img" aria-label={STATUSES.map((s) => `${STATUS_INFO[s].name}: ${byStatus[s].models} Modelle`).join(', ')}>
        {STATUSES.map((s) =>
          byStatus[s].models ? <span key={s} class={`pile-seg s-${s}`} style={{ flexGrow: byStatus[s].models }} title={`${STATUS_INFO[s].name}: ${byStatus[s].models}`} /> : null,
        )}
      </div>
      <div class="pile-legend">
        {STATUSES.map((s) => (
          <button type="button" key={s} class="pile-key" onClick={() => showInGallery({ statuses: [s] })}>
            <span class={`status-dot s-${s}`} />
            <span>{STATUS_INFO[s].name}</span>
            <strong>{fmtNum(byStatus[s].models)}</strong>
            <small>{total ? Math.round((byStatus[s].models / total) * 100) : 0} %</small>
          </button>
        ))}
      </div>
    </div>
  );
}

export function Collection() {
  const a = useStore(archive);
  const now = nowLocal();
  const s = useMemo(() => collectionStats(a, now), [a, now.slice(0, 10)]);

  if (!s.items)
    return (
      <div class="collection">
        <header class="tab-header">
          <div class="tab-heading">
            <h1 class="display">Sammlung</h1>
          </div>
        </header>
        <Empty icon="chart" title="Noch nichts zu zählen">
          Sobald du Werke anlegst, siehst du hier deinen Pile of Shame, deine Mal-Serie und was du pro Monat fertig bekommst.
        </Empty>
      </div>
    );

  const maxKind = Math.max(1, ...s.byKind.map((k) => k.models));

  return (
    <div class="collection">
      <header class="tab-header">
        <div class="tab-heading">
          <h1 class="display">Sammlung</h1>
          <p class="muted">
            {fmtNum(s.models)} Modelle in {fmtNum(s.items)} Werken
          </p>
        </div>
      </header>

      <div class="tiles">
        <Tile value={`${Math.round(s.paintedShare * 100)} %`} label="bemalt" sub={`${fmtNum(s.byStatus.done.models)} von ${fmtNum(s.models)} Modellen`} onClick={() => showInGallery({ statuses: ['done'] })} />
        <Tile value={fmtNum(s.shameModels)} label="Pile of Shame" sub="unbemalt + grundiert" onClick={() => showInGallery({ statuses: ['unpainted', 'primed'] })} />
        <Tile value={fmtNum(s.thisYear.models)} label={`fertig ${now.slice(0, 4)}`} sub={`in ${fmtNum(s.thisYear.items)} ${s.thisYear.items === 1 ? 'Werk' : 'Werken'}`} />
        <Tile value={fmtNum(s.photos)} label="Fotos" sub={formatBytes(s.photoBytes)} onClick={() => {
          galleryFilter.set({ ...EMPTY_FILTER });
          galleryView.set('photos');
          setTab('gallery');
        }} />
      </div>

      <section class="section card-section">
        <h2 class="section-title">Stand der Sammlung</h2>
        <ProgressBar byStatus={s.byStatus} total={s.models} />
      </section>

      <section class="section card-section">
        <h2 class="section-title">Fertig bemalt pro Monat</h2>
        <p class="section-sub muted">Modelle, letzte 12 Monate</p>
        <MonthChart data={s.perMonth} />
      </section>

      <section class="section card-section facts">
        <h2 class="section-title">Werkbank-Fakten</h2>
        <ul class="fact-list">
          <li>
            <Icon name="sparkle" size={18} />
            <span>
              {s.monthStreak > 1 ? (
                <>
                  <strong>{s.monthStreak} Monate in Folge</strong> etwas fertig bemalt – weiter so!
                </>
              ) : s.monthStreak === 1 ? (
                <>Diesen oder letzten Monat etwas fertig bemalt. Nächsten Monat wird's eine Serie.</>
              ) : (
                <>Noch keine Mal-Serie – ein fertiges Werk pro Monat startet eine.</>
              )}
            </span>
          </li>
          {s.avgDaysToFinish !== null && (
            <li>
              <Icon name="clock" size={18} />
              <span>
                Von „in Arbeit“ bis „fertig“ brauchst du im Schnitt <strong>{s.avgDaysToFinish} {s.avgDaysToFinish === 1 ? 'Tag' : 'Tage'}</strong>.
              </span>
            </li>
          )}
          {s.oldestShame && (
            <li>
              <Icon name="box" size={18} />
              <span>
                Am längsten wartet{' '}
                <button type="button" class="link-btn inline" onClick={() => push({ type: 'item', id: s.oldestShame!.item.id })}>
                  {itemTitle(s.oldestShame.item)}
                </button>{' '}
                – seit {relativeLabel(s.oldestShame.item.createdAt, now).replace(/^vor /, '')}.
              </span>
            </li>
          )}
          {s.favorites > 0 && (
            <li>
              <Icon name="heart" size={18} />
              <span>
                <button type="button" class="link-btn inline" onClick={() => showInGallery({ favorites: true })}>
                  {s.favorites} {s.favorites === 1 ? 'Lieblingsstück' : 'Lieblingsstücke'}
                </button>{' '}
                in der Vitrine.
              </span>
            </li>
          )}
        </ul>
      </section>

      {s.byKind.length > 1 && (
        <section class="section card-section">
          <h2 class="section-title">Nach Art</h2>
          <div class="hbars">
            {[...s.byKind]
              .sort((x, y) => y.models - x.models)
              .map((k) => (
                <button type="button" class="hbar-row" key={k.kind} onClick={() => showInGallery({ kinds: [k.kind] })}>
                  <span class="hbar-label">{KIND_INFO[k.kind].plural}</span>
                  <span class="hbar-track">
                    <span class="hbar" style={{ width: `${(k.models / maxKind) * 100}%` }} />
                  </span>
                  <span class="hbar-value">{fmtNum(k.models)}</span>
                </button>
              ))}
          </div>
        </section>
      )}

      {s.topTags.length > 0 && (
        <section class="section card-section">
          <h2 class="section-title">Häufigste Tags</h2>
          <div class="chip-wrap">
            {s.topTags.map((t) => (
              <Chip key={t.tag} icon="tag" onClick={() => showInGallery({ tags: [t.tag] })}>
                {t.tag} <small>{t.count}</small>
              </Chip>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
