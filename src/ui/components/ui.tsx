import type { ComponentChildren, JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { STATUSES, STATUS_INFO } from '../../core/constants';
import type { Status } from '../../core/types';
import { mediaUrl, mediaUrlSync } from '../../native/media';
import { haptic } from '../../native/platform';
import { Icon, type IconName } from '../icons';
import { goBack, interceptBack } from '../nav';

/** Image from the media store (thumbnail or full photo). */
export function MediaImg({ name, alt = '', class: cls = '', style, eager = false, onLoad }: { name: string; alt?: string; class?: string; style?: JSX.CSSProperties; eager?: boolean; onLoad?: (e: Event) => void }) {
  const [url, setUrl] = useState<string | null>(() => mediaUrlSync(name));
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    setFailed(false);
    const sync = mediaUrlSync(name);
    if (sync) setUrl(sync);
    else
      mediaUrl(name)
        .then((u) => alive && setUrl(u))
        .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [name]);
  if (failed) return <div class={`img-missing ${cls}`} style={style} role="img" aria-label="Foto fehlt" />;
  if (!url) return <div class={`img-loading ${cls}`} style={style} />;
  return <img src={url} alt={alt} class={cls} style={style} loading={eager ? 'eager' : 'lazy'} decoding="async" onLoad={onLoad} onError={() => setFailed(true)} draggable={false} />;
}

/** Full-screen page with a top bar. */
export function Page({ title, onBack, actions, children, class: cls = '', bare = false }: { title?: ComponentChildren; onBack?: () => void; actions?: ComponentChildren; children: ComponentChildren; class?: string; bare?: boolean }) {
  return (
    <div class={`page ${cls}`} role="dialog" aria-modal="true">
      {!bare && (
        <header class="topbar">
          <button type="button" class="icon-btn" onClick={onBack ?? goBack} aria-label="Zurück">
            <Icon name="back" />
          </button>
          <h1 class="topbar-title">{title}</h1>
          <div class="topbar-actions">{actions}</div>
        </header>
      )}
      <div class="page-body">{children}</div>
    </div>
  );
}

/** Bottom sheet. Tapping the backdrop or "back" closes it. */
export function Sheet({ title, onClose, children, class: cls = '' }: { title?: ComponentChildren; onClose: () => void; children: ComponentChildren; class?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(
    () =>
      interceptBack(() => {
        close.current();
        return true;
      }),
    [],
  );
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close.current();
      }
    };
    window.addEventListener('keydown', onKey, true);
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('[autofocus]')?.focus();
    return () => {
      window.removeEventListener('keydown', onKey, true);
      prev?.focus?.();
    };
  }, []);
  return (
    <div class="sheet-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div class={`sheet ${cls}`} role="dialog" aria-modal="true" ref={ref}>
        <div class="sheet-grip" aria-hidden="true" />
        {title && <h2 class="sheet-title">{title}</h2>}
        {children}
      </div>
    </div>
  );
}

/** Centered dialog; registers itself with the back button. */
export function Dialog({ title, onClose, children, class: cls = '' }: { title?: ComponentChildren; onClose: () => void; children: ComponentChildren; class?: string }) {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(
    () =>
      interceptBack(() => {
        close.current();
        return true;
      }),
    [],
  );
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close.current();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);
  return (
    <div class="dialog-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div class={`dialog ${cls}`} role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined}>
        {title && <h2 class="dialog-title">{title}</h2>}
        {children}
      </div>
    </div>
  );
}

export function SheetAction({ icon, label, hint, onClick, tone }: { icon: IconName; label: string; hint?: string; onClick: () => void; tone?: 'danger' }) {
  return (
    <button type="button" class={`sheet-action ${tone ?? ''}`} onClick={onClick}>
      <span class="sheet-action-icon">
        <Icon name={icon} />
      </span>
      <span class="sheet-action-text">
        <strong>{label}</strong>
        {hint && <small>{hint}</small>}
      </span>
    </button>
  );
}

export function Toggle({ checked, onChange, label, hint, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: ComponentChildren; hint?: ComponentChildren; disabled?: boolean }) {
  return (
    <label class={`toggle ${disabled ? 'disabled' : ''}`}>
      <span class="toggle-label">
        <span>{label}</span>
        {hint && <small>{hint}</small>}
      </span>
      <input type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={(e) => onChange((e.target as HTMLInputElement).checked)} />
      <span class="switch" aria-hidden="true" />
    </label>
  );
}

export function Chip({ active, onClick, children, icon, class: cls = '', title }: { active?: boolean; onClick?: () => void; children: ComponentChildren; icon?: IconName; class?: string; title?: string }) {
  return (
    <button type="button" class={`chip ${active ? 'active' : ''} ${cls}`} aria-pressed={onClick ? !!active : undefined} onClick={onClick} title={title}>
      {icon && <Icon name={icon} size={16} />}
      {children}
    </button>
  );
}

export function Segmented<T extends string | number>({ value, options, onChange, label }: { value: T; options: { value: T; label: ComponentChildren; icon?: IconName }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div class="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button type="button" role="radio" aria-checked={o.value === value} class={o.value === value ? 'on' : ''} onClick={() => onChange(o.value)} key={String(o.value)}>
          {o.icon && <Icon name={o.icon} size={17} />}
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function StatusDot({ status }: { status: Status }) {
  return <span class={`status-dot s-${status}`} aria-hidden="true" />;
}

export function StatusPill({ status }: { status: Status }) {
  return (
    <span class={`status-pill s-${status}`}>
      <StatusDot status={status} />
      {STATUS_INFO[status].name}
    </span>
  );
}

/** The four painting stages as a tappable progress line. */
export function StatusStepper({ value, onChange }: { value: Status; onChange: (s: Status) => void }) {
  const idx = STATUSES.indexOf(value);
  return (
    <div class="stepper" role="radiogroup" aria-label="Fortschritt">
      {STATUSES.map((s, i) => (
        <button
          type="button"
          role="radio"
          aria-checked={s === value}
          class={`step s-${s} ${i <= idx ? 'reached' : ''} ${s === value ? 'current' : ''}`}
          onClick={() => {
            haptic('tap');
            onChange(s);
          }}
          key={s}
        >
          <span class="step-dot" />
          <span class="step-label">{STATUS_INFO[s].short}</span>
        </button>
      ))}
    </div>
  );
}

export function Counter({ value, onChange, min = 1, max = 999, label }: { value: number; onChange: (v: number) => void; min?: number; max?: number; label: string }) {
  return (
    <div class="counter" role="group" aria-label={label}>
      <button type="button" class="icon-btn" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label="weniger">
        <Icon name="minus" size={18} />
      </button>
      <input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={value}
        onChange={(e) => {
          const v = Math.round(Number((e.target as HTMLInputElement).value));
          onChange(Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : min);
        }}
        aria-label={label}
      />
      <button type="button" class="icon-btn" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label="mehr">
        <Icon name="plus" size={18} />
      </button>
    </div>
  );
}

/** Two-step button: first tap arms, second tap fires. */
export function ConfirmButton({ onConfirm, children, confirmText = 'Wirklich?', class: cls = 'btn danger' }: { onConfirm: () => void; children: ComponentChildren; confirmText?: ComponentChildren; class?: string }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3500);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button
      type="button"
      class={`${cls} ${armed ? 'armed' : ''}`}
      onClick={() => {
        if (armed) {
          setArmed(false);
          onConfirm();
        } else {
          haptic('warn');
          setArmed(true);
        }
      }}
    >
      {armed ? confirmText : children}
    </button>
  );
}

export function Empty({ icon, title, children, action }: { icon: IconName; title: ComponentChildren; children?: ComponentChildren; action?: ComponentChildren }) {
  return (
    <div class="empty">
      <div class="empty-icon">
        <Icon name={icon} size={30} />
      </div>
      <h2>{title}</h2>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function Section({ title, children, hint, class: cls = '' }: { title?: ComponentChildren; children: ComponentChildren; hint?: ComponentChildren; class?: string }) {
  return (
    <section class={`section ${cls}`}>
      {title && <h2 class="section-title">{title}</h2>}
      {children}
      {hint && <p class="section-hint">{hint}</p>}
    </section>
  );
}

export function fmtNum(n: number): string {
  return n.toLocaleString('de-DE');
}
