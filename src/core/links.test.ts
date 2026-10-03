import { describe, expect, it } from 'vitest';
import { createItem, emptyArchive } from './archive';
import { armyUnit, parseLink } from './links';
import { migrate } from './migrate';

describe('Links aus simpleArmy', () => {
  it('liest einen vollständigen Link', () => {
    const l = parseLink('simplearchive://werk?ref=simplearmy:termagants&name=Termagants&kind=unit&models=10&status=done&tags=Warhammer%2040K,Tyranids&photo=1');
    expect(l).toEqual({ ref: 'simplearmy:termagants', name: 'Termagants', kind: 'unit', models: 10, status: 'done', tags: ['Warhammer 40K', 'Tyranids'], photo: true });
  });
  it('lehnt fremde oder unvollständige Links ab und setzt sichere Standardwerte', () => {
    expect(parseLink('https://example.com/werk?ref=a&name=b')).toBeNull();
    expect(parseLink('simplearchive://werk?name=ohne-ref')).toBeNull();
    const l = parseLink('simplearchive://werk?ref=x&name=Y&kind=quatsch&status=quatsch&models=-3');
    expect(l).toMatchObject({ kind: 'unit', status: 'unpainted', models: 1, tags: [], photo: false });
  });
  it('erkennt simpleArmy-Einheiten am ref', () => {
    expect(armyUnit('simplearmy:knight-errant')).toBe('knight-errant');
    expect(armyUnit('simplearmy:../x')).toBeNull();
    expect(armyUnit(undefined)).toBeNull();
  });
  it('ref bleibt beim Anlegen und Laden erhalten, alte Werke bleiben ohne', () => {
    const now = '2026-10-03T12:00:00';
    const { archive, item } = createItem(emptyArchive(now), { name: 'Termagants', ref: 'simplearmy:termagants' }, now);
    expect(item.ref).toBe('simplearmy:termagants');
    const back = migrate(JSON.parse(JSON.stringify(archive)), now)!;
    expect(back.items[0].ref).toBe('simplearmy:termagants');
    const plain = createItem(emptyArchive(now), { name: 'Ohne' }, now).item;
    expect('ref' in plain).toBe(false);
  });
});
