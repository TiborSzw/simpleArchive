package io.github.tiborszw.simplearchive;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.Intent;
import android.net.Uri;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.zip.Deflater;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import java.util.zip.ZipOutputStream;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Whole archive as one ZIP file, saved wherever the user likes via the system
 * file dialog: Google Drive, a USB stick, the Downloads folder … – no account
 * setup needed. Import reads such a ZIP back.
 *
 * ZIP layout: archive.json, photos/p_….jpg, thumbs/t_….jpg
 */
@CapacitorPlugin(name = "ArchiveZip")
public class ArchiveZipPlugin extends Plugin {

    private static final Pattern MEDIA_ENTRY = Pattern.compile("^(?:.*/)?(photos|thumbs)/([pt]_[A-Za-z0-9._-]+\\.jpe?g)$");
    private static final long MAX_JSON = 64L * 1024 * 1024;

    private File mediaRoot() throws IOException {
        return new File(getContext().getFilesDir(), "media").getCanonicalFile();
    }

    // ------------------------------------------------------------------ export

    @PluginMethod
    public void exportZip(PluginCall call) {
        if (call.getString("json") == null || call.getArray("entries") == null) {
            call.reject("Nichts zu exportieren.");
            return;
        }
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("application/zip");
        intent.putExtra(Intent.EXTRA_TITLE, call.getString("fileName", "simpleArchive.zip"));
        startActivityForResult(call, intent, "exportPicked");
    }

    @ActivityCallback
    private void exportPicked(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
            call.reject("Abgebrochen.", "CANCELLED");
            return;
        }
        final Uri target = result.getData().getData();
        new Thread(() -> writeZip(call, target)).start();
    }

    private void writeZip(PluginCall call, Uri target) {
        ContentResolver resolver = getContext().getContentResolver();
        JSArray entries = call.getArray("entries");
        String json = call.getString("json", "");
        int total = entries.length();
        long bytes = 0;
        try (OutputStream raw = resolver.openOutputStream(target, "wt")) {
            if (raw == null) throw new IOException("Ziel nicht beschreibbar.");
            ZipOutputStream zip = new ZipOutputStream(new BufferedOutputStream(raw, 256 * 1024));
            zip.setLevel(Deflater.DEFAULT_COMPRESSION);
            zip.putNextEntry(new ZipEntry("archive.json"));
            byte[] jsonBytes = json.getBytes(StandardCharsets.UTF_8);
            zip.write(jsonBytes);
            zip.closeEntry();
            bytes += jsonBytes.length;

            // JPEGs don't compress – store them fast.
            zip.setLevel(Deflater.NO_COMPRESSION);
            File root = mediaRoot();
            byte[] buf = new byte[128 * 1024];
            for (int i = 0; i < total; i++) {
                JSONObject entry = entries.getJSONObject(i);
                File file = new File(entry.getString("path").replaceFirst("^file://", "")).getCanonicalFile();
                if (!file.getPath().startsWith(root.getPath() + File.separator) || !file.isFile()) continue;
                zip.putNextEntry(new ZipEntry(entry.getString("name")));
                try (InputStream in = new BufferedInputStream(new FileInputStream(file))) {
                    int n;
                    while ((n = in.read(buf)) != -1) {
                        zip.write(buf, 0, n);
                        bytes += n;
                    }
                }
                zip.closeEntry();
                if (i % 5 == 0 || i == total - 1) progress("export", i + 1, total);
            }
            zip.finish();
            zip.flush();
            JSObject res = new JSObject();
            res.put("uri", target.toString());
            res.put("bytes", bytes);
            res.put("files", total);
            call.resolve(res);
        } catch (IOException | JSONException | SecurityException e) {
            call.reject("ZIP-Export fehlgeschlagen: " + e.getMessage());
        }
    }

    // ------------------------------------------------------------------ import

    @PluginMethod
    public void importZip(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("*/*");
        intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[] { "application/zip", "application/x-zip-compressed", "application/octet-stream" });
        startActivityForResult(call, intent, "importPicked");
    }

    @ActivityCallback
    private void importPicked(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
            call.reject("Abgebrochen.", "CANCELLED");
            return;
        }
        final Uri source = result.getData().getData();
        new Thread(() -> readZip(call, source)).start();
    }

    private void readZip(PluginCall call, Uri source) {
        ContentResolver resolver = getContext().getContentResolver();
        String json = null;
        int extracted = 0;
        int skipped = 0;
        try (InputStream raw = resolver.openInputStream(source)) {
            if (raw == null) throw new IOException("Datei nicht lesbar.");
            ZipInputStream zip = new ZipInputStream(new BufferedInputStream(raw, 256 * 1024));
            File root = mediaRoot();
            byte[] buf = new byte[128 * 1024];
            ZipEntry entry;
            while ((entry = zip.getNextEntry()) != null) {
                if (entry.isDirectory()) continue;
                String name = entry.getName().replace('\\', '/');
                if (name.equals("archive.json") || name.endsWith("/archive.json")) {
                    ByteArrayOutputStream out = new ByteArrayOutputStream();
                    int n;
                    while ((n = zip.read(buf)) != -1) {
                        out.write(buf, 0, n);
                        if (out.size() > MAX_JSON) throw new IOException("archive.json ist zu groß.");
                    }
                    json = out.toString("UTF-8");
                    continue;
                }
                Matcher m = MEDIA_ENTRY.matcher(name);
                if (!m.matches()) continue;
                // Only the base name is used – entries can never escape the media folder.
                File dir = new File(root, m.group(1));
                File target = new File(dir, m.group(2));
                if (target.isFile() && target.length() > 0) {
                    skipped++;
                    continue;
                }
                if (!dir.isDirectory() && !dir.mkdirs()) throw new IOException("Ordner konnte nicht angelegt werden.");
                File tmp = new File(dir, m.group(2) + ".part");
                try (OutputStream out = new FileOutputStream(tmp)) {
                    int n;
                    while ((n = zip.read(buf)) != -1) out.write(buf, 0, n);
                }
                if (!tmp.renameTo(target)) {
                    tmp.delete();
                    throw new IOException("Foto konnte nicht gespeichert werden.");
                }
                extracted++;
                if (extracted % 5 == 0) progress("import", extracted, 0);
            }
            if (json == null) throw new IOException("Kein simpleArchive-Export (archive.json fehlt).");
            JSObject res = new JSObject();
            res.put("json", json);
            res.put("extracted", extracted);
            res.put("skipped", skipped);
            call.resolve(res);
        } catch (IOException | SecurityException e) {
            call.reject("ZIP-Import fehlgeschlagen: " + e.getMessage());
        }
    }

    private void progress(String phase, int done, int total) {
        JSObject data = new JSObject();
        data.put("phase", phase);
        data.put("done", done);
        data.put("total", total);
        notifyListeners("progress", data);
    }
}
