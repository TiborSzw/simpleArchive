package io.github.tiborszw.simplearchive;

import android.Manifest;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;

/**
 * Saves copies of archive photos into their own album of the phone's gallery
 * (Pictures/simpleArchive), so they show up in Google Photos & Co.
 * Android 10+ uses MediaStore and needs no permission; older versions write
 * to the public Pictures folder and ask for storage access once.
 */
@CapacitorPlugin(
    name = "Gallery",
    permissions = { @Permission(strings = { Manifest.permission.WRITE_EXTERNAL_STORAGE }, alias = "storage") }
)
public class GalleryPlugin extends Plugin {

    @PluginMethod
    public void saveToAlbum(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q && getPermissionState("storage") != PermissionState.GRANTED) {
            requestPermissionForAlias("storage", call, "storagePermissionCallback");
            return;
        }
        save(call);
    }

    @PermissionCallback
    private void storagePermissionCallback(PluginCall call) {
        if (getPermissionState("storage") == PermissionState.GRANTED) {
            save(call);
        } else {
            call.reject("Ohne Speicher-Berechtigung kann kein Album angelegt werden.");
        }
    }

    private static String clean(String s, String fallback) {
        if (s == null) return fallback;
        String out = s.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "_").trim();
        if (out.length() > 80) out = out.substring(0, 80).trim();
        return out.isEmpty() ? fallback : out;
    }

    private void save(final PluginCall call) {
        final String path = call.getString("path");
        final String album = clean(call.getString("album"), "simpleArchive");
        String name = clean(call.getString("fileName"), "simpleArchive_" + System.currentTimeMillis());
        if (!name.toLowerCase().endsWith(".jpg") && !name.toLowerCase().endsWith(".jpeg")) name = name + ".jpg";
        final String fileName = name;
        final Long takenAt = call.getLong("takenAt");
        if (path == null) {
            call.reject("Kein Foto angegeben.");
            return;
        }
        final File source;
        try {
            source = new File(path.startsWith("file://") ? path.substring(7) : path).getCanonicalFile();
            String files = getContext().getFilesDir().getCanonicalPath() + File.separator;
            String cache = getContext().getCacheDir().getCanonicalPath() + File.separator;
            if (!source.getPath().startsWith(files) && !source.getPath().startsWith(cache)) throw new IOException("Pfad außerhalb des App-Speichers.");
        } catch (IOException e) {
            call.reject(e.getMessage());
            return;
        }
        if (!source.isFile()) {
            call.reject("Foto nicht gefunden.");
            return;
        }

        new Thread(() -> {
            try {
                Uri uri = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
                    ? saveMediaStore(source, album, fileName, takenAt)
                    : saveLegacy(source, album, fileName);
                JSObject result = new JSObject();
                result.put("uri", uri.toString());
                call.resolve(result);
            } catch (Exception e) {
                call.reject("Speichern im Album fehlgeschlagen: " + e.getMessage());
            }
        }).start();
    }

    private Uri saveMediaStore(File source, String album, String fileName, Long takenAt) throws IOException {
        ContentResolver resolver = getContext().getContentResolver();
        ContentValues values = new ContentValues();
        values.put(MediaStore.Images.Media.DISPLAY_NAME, fileName);
        values.put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg");
        values.put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + File.separator + album);
        values.put(MediaStore.Images.Media.IS_PENDING, 1);
        if (takenAt != null && takenAt > 0) values.put(MediaStore.Images.Media.DATE_TAKEN, takenAt);

        Uri collection = MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY);
        Uri uri = resolver.insert(collection, values);
        if (uri == null) throw new IOException("MediaStore hat keinen Eintrag angelegt.");
        try (OutputStream out = resolver.openOutputStream(uri); InputStream in = new FileInputStream(source)) {
            if (out == null) throw new IOException("Album nicht beschreibbar.");
            copy(in, out);
        } catch (IOException e) {
            resolver.delete(uri, null, null);
            throw e;
        }
        values.clear();
        values.put(MediaStore.Images.Media.IS_PENDING, 0);
        resolver.update(uri, values, null, null);
        return uri;
    }

    @SuppressWarnings("deprecation")
    private Uri saveLegacy(File source, String album, String fileName) throws IOException {
        File dir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES), album);
        if (!dir.isDirectory() && !dir.mkdirs()) throw new IOException("Album-Ordner konnte nicht angelegt werden.");
        File target = new File(dir, fileName);
        String base = fileName.replaceAll("\\.jpe?g$", "");
        for (int i = 2; target.exists(); i++) target = new File(dir, base + " (" + i + ").jpg");
        try (InputStream in = new FileInputStream(source); OutputStream out = new FileOutputStream(target)) {
            copy(in, out);
        }
        MediaScannerConnection.scanFile(getContext(), new String[] { target.getAbsolutePath() }, new String[] { "image/jpeg" }, null);
        return Uri.fromFile(target);
    }

    private static void copy(InputStream in, OutputStream out) throws IOException {
        byte[] buf = new byte[64 * 1024];
        int n;
        while ((n = in.read(buf)) != -1) out.write(buf, 0, n);
    }
}
