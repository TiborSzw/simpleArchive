import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { updateItem } from '../../core/archive';
import { KINDS, KIND_INFO, TAG_SUGGESTIONS } from '../../core/constants';
import { nowLocal } from '../../core/dates';
import { tagIndex } from '../../core/query';
import { hasTag, mergeTags, normalizeTag, parseHashtags, removeTag, tagKey } from '../../core/tags';
import type { ItemDraft, Kind, NewPhoto, Status } from '../../core/types';
import { Icon } from '../icons';
import { createWithPhotos, discard } from '../importer';
import { pop, replaceTop } from '../nav';
import { archive, mutate, toast, useStore } from '../store';
import { Chip, Counter, MediaImg, Page, StatusStepper, Toggle } from './ui';

function TagInput({ tags, onChange }: { tags: string[]; onChange: (t: string[]) => void }) {
  const a = useStore(archive);
  const [text, setText] = useState('');
  const [focus, setFocus] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const used = useMemo(() => tagIndex(a).map((t) => t.tag), [a]);
  const known = useMemo(() => [...used, ...TAG_SUGGESTIONS.flatMap((g) => g.tags)], [used]);

  const add = (raw: string) => {
    const parts = raw.split(/[,\n]/).map(normalizeTag).filter(Boolean);
    if (parts.length) onChange(mergeTags(tags, parts, known));
    setText('');
  };

  const q = tagKey(normalizeTag(text));
  const matches = (t: string) => !hasTag(tags, t) && (!q || tagKey(t).includes(q));
  const usedMatches = used.filter(matches).slice(0, 14);
  const groups = TAG_SUGGESTIONS.map((g) => ({ group: g.group, tags: g.tags.filter((t) => matches(t) && !hasTag(usedMatches, t)) })).filter((g) => g.tags.length);

  return (
    <div class="tag-input">
      <div class="tag-box" onClick={() => input.current?.focus()}>
        {tags.map((t) => (
          <span class="tag" key={t}>
            {t}
            <button type="button" aria-label={`Tag ${t} entfernen`} onClick={() => onChange(removeTag(tags, t))}>
              <Icon name="x" size={14} />
            </button>
          </span>
        ))}
        <input
          ref={input}
          type="text"
          value={text}
          placeholder={tags.length ? 'weiterer Tag …' : 'System, Fraktion, Technik …'}
          enterKeyHint="done"
          onInput={(e) => {
            const v = (e.target as HTMLInputElement).value;
            if (/[,\n]/.test(v)) add(v);
            else setText(v);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add(text);
            } else if (e.key === 'Backspace' && !text && tags.length) onChange(tags.slice(0, -1));
          }}
          onFocus={() => setFocus(true)}
          onBlur={() => {
            if (text.trim()) add(text);
            setTimeout(() => setFocus(false), 150);
          }}
          aria-label="Tag hinzufügen"
        />
      </div>
      {focus && (
        <div class="tag-suggest">
          {text.trim() && !hasTag(tags, text) && !known.some((k) => tagKey(k) === q) && (
            <Chip icon="plus" onClick={() => add(text)}>
              „{normalizeTag(text)}“ anlegen
            </Chip>
          )}
          {usedMatches.length > 0 && (
            <div class="suggest-group">
              <small>Deine Tags</small>
              <div class="chip-wrap">
                {usedMatches.map((t) => (
                  <Chip key={t} onClick={() => add(t)}>
                    {t}
                  </Chip>
                ))}
              </div>
            </div>
          )}
          {groups.map((g) => (
            <div class="suggest-group" key={g.group}>
              <small>{g.group}</small>
              <div class="chip-wrap">
                {g.tags.slice(0, q ? 20 : 8).map((t) => (
                  <Chip key={t} onClick={() => add(t)}>
                    {t}
                  </Chip>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function Editor({ itemId, photos = [], status }: { itemId: string | null; photos?: NewPhoto[]; status?: Status }) {
  const a = useStore(archive);
  const existing = itemId ? a.items.find((it) => it.id === itemId) : null;
  const [draft, setDraft] = useState<ItemDraft>(() =>
    existing
      ? { name: existing.name, kind: existing.kind, status: existing.status, tags: existing.tags, favorite: existing.favorite, notes: existing.notes, models: existing.models }
      : { name: '', kind: 'mini', status: status ?? (photos.length ? 'done' : 'unpainted'), tags: [], favorite: false, notes: '', models: 1 },
  );
  const [finished, setFinished] = useState(existing?.finishedAt?.slice(0, 10) ?? '');
  const saved = useRef(false);
  const set = (patch: Partial<ItemDraft>) => setDraft((d) => ({ ...d, ...patch }));

  // Leaving without saving throws away freshly imported photos.
  useEffect(
    () => () => {
      if (!saved.current && photos.length) void discard(photos);
    },
    [],
  );

  const save = () => {
    const parsed = parseHashtags(draft.name);
    const final: ItemDraft = { ...draft, name: parsed.text, tags: mergeTags(draft.tags, parsed.tags) };
    saved.current = true;
    if (existing) {
      mutate((x, now) =>
        updateItem(
          x,
          existing.id,
          { ...final, finishedAt: final.status === 'done' && finished ? `${finished}T${(existing.finishedAt ?? nowLocal()).slice(11) || '12:00:00'}` : undefined },
          now,
        ),
      );
      pop();
      return;
    }
    const id = createWithPhotos(final, photos);
    toast({ text: final.name ? `„${final.name}“ angelegt` : 'Werk angelegt', sub: photos.length ? `${photos.length} ${photos.length === 1 ? 'Foto' : 'Fotos'}` : 'Ab auf den Stapel.', tone: 'good' });
    replaceTop({ type: 'item', id });
  };

  return (
    <Page
      class="editor"
      title={existing ? 'Werk bearbeiten' : 'Neues Werk'}
      actions={
        <button type="button" class="btn primary small" onClick={save}>
          Speichern
        </button>
      }
    >
      {photos.length > 0 && (
        <div class="editor-photos">
          {photos.map((p) => (
            <MediaImg key={p.file} name={p.thumb} class="editor-photo" />
          ))}
        </div>
      )}

      <label class="field">
        <span>Name</span>
        <input
          type="text"
          value={draft.name}
          maxLength={120}
          placeholder={draft.kind === 'terrain' ? 'z. B. Zerfallener Wachturm' : 'z. B. Captain Titus'}
          onInput={(e) => set({ name: (e.target as HTMLInputElement).value })}
          autoFocus={!existing}
          enterKeyHint="done"
        />
        <small class="field-hint">Tipp: #Tags direkt im Namen, z. B. „Boyz #Orks #Kill_Team“</small>
      </label>

      <div class="field">
        <span>Was ist es?</span>
        <div class="chip-wrap">
          {KINDS.map((k: Kind) => (
            <Chip key={k} active={draft.kind === k} onClick={() => set({ kind: k })}>
              {KIND_INFO[k].name}
            </Chip>
          ))}
        </div>
      </div>

      <div class="field">
        <span>Fortschritt</span>
        <StatusStepper value={draft.status} onChange={(s) => set({ status: s })} />
      </div>

      {draft.status === 'done' && existing && (
        <label class="field inline">
          <span>Fertig am</span>
          <input type="date" value={finished} max={nowLocal().slice(0, 10)} onInput={(e) => setFinished((e.target as HTMLInputElement).value)} />
        </label>
      )}

      <div class="field inline">
        <span>
          Anzahl Modelle
          <small class="field-hint">zählt für den Pile of Shame</small>
        </span>
        <Counter value={draft.models} onChange={(v) => set({ models: v })} label="Anzahl Modelle" />
      </div>

      <div class="field">
        <span>Tags</span>
        <TagInput tags={draft.tags} onChange={(t) => set({ tags: t })} />
      </div>

      <Toggle checked={draft.favorite} onChange={(v) => set({ favorite: v })} label="Favorit" hint="Erscheint unter ♥ Favoriten" />

      <label class="field">
        <span>Rezept & Notizen</span>
        <textarea
          rows={5}
          value={draft.notes}
          placeholder={'Grundierung: Wraithbone\nHaut: Contrast Guilliman Flesh, Highlight Kislev Flesh\nBase: Stirland Mud, Grasbüschel'}
          onInput={(e) => set({ notes: (e.target as HTMLTextAreaElement).value })}
        />
      </label>

      <div class="editor-footer">
        <button type="button" class="btn primary wide" onClick={save}>
          <Icon name="check" size={18} /> Speichern
        </button>
      </div>
    </Page>
  );
}
