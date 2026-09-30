# simpleArchive – Hinweise für Claude

**Zuerst [TiborSzw/simpleHub](https://github.com/TiborSzw/simpleHub) lesen** (ARBEITSWEISE.md → README.md → VERLAUF.md → IDEEN.md) und nach jedem Arbeitsschritt dort nachführen: Eintrag oben in VERLAUF.md, Stand in der README-Tabelle, offene Punkte in IDEEN.md.

Fotoarchiv für bemalte Miniaturen und Terrain: Werke mit Fotos, Tags, Favoriten, Status (Pile of Shame → Fertig), Showcase-Karten, Fotoschule, Handy-Album, Backups in Nextcloud/Google Drive/ZIP. Texte auf Deutsch (Österreich, z. B. „Jänner“), werbefrei, ohne Tracking.

## Bauen

```bash
npm ci
npm test && npm run typecheck   # muss grün sein
npm run build                   # Web-Build nach dist/
npm run android:apk             # signierte APK → android/app/build/outputs/apk/release/app-release.apk
```

- Android-SDK: `ANDROID_HOME` bzw. `android/local.properties` (`sdk.dir=…`). JDK 21.
- Version: `package.json` (Major.Minor) + Commit-Anzahl als Patch und versionCode – jeder Commit ist ein installierbares Update.
- Release: Push auf `main` → `.github/workflows/android.yml` baut, signiert und legt `v1.0.<n>` mit `simpleArchive-1.0.<n>.apk` an. Lokal alternativ `gh release create v<Version> simpleArchive-<Version>.apk`.
- Icons/Splash: `npm run icons` rendert `scripts/icon.svg` mit Chromium.
- Browser-Test: `npx vite preview` und mit Playwright (`playwright-core`, Chromium) durchklicken.

## Signierschlüssel (nie ins Repo!)

- Lokal: `~/.simplearchive/simplearchive.jks` + `~/.simplearchive/signing.properties` (storeFile, storePassword, keyAlias, keyPassword). `android/app/build.gradle` liest sie automatisch.
- CI: Secrets `SIMPLEARCHIVE_KEYSTORE_BASE64` und `SIMPLEARCHIVE_KEYSTORE_PASSWORD` (gesetzt am 2026-09-30 vom Linux-Rechner aus).
- **Schlüssel seit 2026-09-30 neu**, liegt auf dem Linux-Rechner des Nutzers unter `~/.simplearchive/`. Der erste Schlüssel (SHA-1 54:1F:8D…, Version 1.0.2) existierte nur in einer anderen Sitzung und ist nicht mehr verfügbar – die Secrets nicht mehr ersetzen.
- SHA-1 (für den Google-OAuth-Client): `9E:4D:D9:B9:3E:7F:5B:60:6C:D5:66:CB:7F:CA:3D:57:9E:58:97:53`.
- `.gitignore` sperrt `*.jks`, `*.keystore`, `signing.properties`.

## Nicht kaputt machen

- **applicationId `io.github.tiborszw.simplearchive`** nie ändern (sonst kein Update, Google-OAuth-Client passt nicht mehr).
- **Archiv-Format** (`src/core/types.ts`): neue Felder immer optional bzw. mit Default in `src/core/migrate.ts` nachziehen – alte Backups müssen ladbar bleiben. `archive.id` identifiziert ein Archiv; der Backup-Schutz (`ForeignArchiveError`) hängt daran.
- **Fotodateien sind unveränderlich:** `p_<datum>_<id>.jpg` / `t_<datum>_<id>.jpg`. Bearbeitete Fotos werden neue Dateien. Die Backup-Engine lädt nur fehlende Dateien hoch und löscht auf dem Server nur Dateien, die diesem Muster entsprechen (`MEDIA_RE` in `src/sync/sync.ts`).
- **Reihenfolge im Backup:** erst Fotos, dann `archive.json` – der Server darf nie auf fehlende Fotos zeigen.
- **Löschen geht über den Papierkorb** (30 Tage). Unreferenzierte Fotodateien werden nie automatisch gelöscht (außer abgebrochene Importe über `pending` in `src/ui/store.ts`); sie lassen sich in den Einstellungen retten.
- **Datenschutz:** Fotos werden beim Import neu kodiert (entfernt GPS/EXIF). Zugangsdaten (Nextcloud-App-Passwort) liegen nur in Preferences, nie im Archiv oder Backup. Google nur mit Scope `drive.file`.
- Status-Farben sind eine geprüfte einfarbige Gold-Rampe (`--s-*` in `src/styles/theme.css`) – bei Änderungen mit dem dataviz-Validator (ordinal) neu prüfen.
- Die vier nativen Plugins (`android/app/src/main/java/io/github/tiborszw/simplearchive/`) prüfen, dass Pfade im App-Speicher liegen – diese Prüfungen nicht entfernen.
