package io.github.tiborszw.simplearchive;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Iterator;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.TimeUnit;
import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.Headers;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;
import okhttp3.ResponseBody;

/**
 * Native HTTP bridge for the backups (Nextcloud/WebDAV and Google Drive).
 *
 * The WebView's fetch() is blocked by CORS on most Nextcloud servers and
 * HttpURLConnection rejects WebDAV verbs such as MKCOL and PROPFIND. OkHttp
 * supports arbitrary methods. Photos are streamed straight from and to disk
 * (bodyPath / responsePath), so large images never cross the JS bridge.
 */
@CapacitorPlugin(name = "NativeHttp")
public class NativeHttpPlugin extends Plugin {

    private static final Set<String> NEEDS_BODY = new HashSet<>(Arrays.asList("POST", "PUT", "PATCH", "PROPPATCH", "REPORT"));

    private final OkHttpClient client = new OkHttpClient.Builder()
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(120, TimeUnit.SECONDS)
        .writeTimeout(120, TimeUnit.SECONDS)
        .build();

    /** Only files inside the app's own storage may be sent or written. */
    private File safeFile(String path) throws IOException {
        if (path == null) return null;
        String p = path.startsWith("file://") ? path.substring(7) : path;
        File file = new File(p).getCanonicalFile();
        String files = getContext().getFilesDir().getCanonicalPath() + File.separator;
        String cache = getContext().getCacheDir().getCanonicalPath() + File.separator;
        if (!file.getPath().startsWith(files) && !file.getPath().startsWith(cache)) {
            throw new IOException("Pfad außerhalb des App-Speichers: " + path);
        }
        return file;
    }

    @PluginMethod
    public void request(final PluginCall call) {
        final String url = call.getString("url");
        final String method = call.getString("method", "GET").toUpperCase(Locale.ROOT);
        if (url == null || !url.regionMatches(true, 0, "https://", 0, 8)) {
            call.reject("Nur HTTPS-Adressen sind erlaubt.");
            return;
        }

        JSObject headers = call.getObject("headers", new JSObject());
        String body = call.getString("body");
        String contentType = headers.optString("Content-Type", "application/octet-stream");

        final File bodyFile;
        final File responseFile;
        try {
            bodyFile = safeFile(call.getString("bodyPath"));
            responseFile = safeFile(call.getString("responsePath"));
        } catch (IOException e) {
            call.reject(e.getMessage());
            return;
        }

        RequestBody requestBody = null;
        if (bodyFile != null) {
            if (!bodyFile.isFile()) {
                call.reject("Lokale Datei fehlt: " + bodyFile.getName());
                return;
            }
            requestBody = RequestBody.create(bodyFile, MediaType.parse(contentType));
        } else if (body != null && !method.equals("GET") && !method.equals("HEAD")) {
            requestBody = RequestBody.create(body, MediaType.parse(contentType));
        } else if (NEEDS_BODY.contains(method)) {
            requestBody = RequestBody.create(new byte[0], null);
        }

        Request.Builder builder;
        try {
            // url() and header() throw on malformed input – reject instead of leaving the call hanging.
            builder = new Request.Builder().url(url);
            Iterator<String> keys = headers.keys();
            while (keys.hasNext()) {
                String key = keys.next();
                builder.header(key, headers.optString(key));
            }
            builder.method(method, requestBody);
        } catch (IllegalArgumentException e) {
            call.reject("Ungültige Adresse oder Anfrage: " + e.getMessage());
            return;
        }

        client.newCall(builder.build()).enqueue(new Callback() {
            @Override
            public void onFailure(Call c, IOException e) {
                call.reject("Keine Verbindung: " + e.getMessage());
            }

            @Override
            public void onResponse(Call c, Response response) {
                try (ResponseBody responseBody = response.body()) {
                    JSObject result = new JSObject();
                    int status = response.code();
                    result.put("status", status);
                    result.put("headers", toJson(response.headers()));
                    if (responseFile != null && status >= 200 && status < 300 && responseBody != null) {
                        writeAtomically(responseBody.byteStream(), responseFile);
                        result.put("body", "");
                    } else {
                        result.put("body", responseBody != null ? responseBody.string() : "");
                    }
                    call.resolve(result);
                } catch (IOException e) {
                    call.reject("Antwort unvollständig: " + e.getMessage());
                }
            }
        });
    }

    private static JSObject toJson(Headers headers) {
        JSObject out = new JSObject();
        for (String name : headers.names()) {
            out.put(name.toLowerCase(Locale.ROOT), headers.get(name));
        }
        return out;
    }

    /** Downloads into a temp file first, so an interrupted transfer never leaves half an image behind. */
    private static void writeAtomically(InputStream in, File target) throws IOException {
        File dir = target.getParentFile();
        if (dir != null && !dir.isDirectory() && !dir.mkdirs()) throw new IOException("Ordner konnte nicht angelegt werden.");
        File tmp = new File(dir, target.getName() + ".part");
        try (OutputStream out = new FileOutputStream(tmp)) {
            byte[] buf = new byte[64 * 1024];
            int n;
            while ((n = in.read(buf)) != -1) out.write(buf, 0, n);
        }
        if (!tmp.renameTo(target)) {
            tmp.delete();
            throw new IOException("Datei konnte nicht gespeichert werden.");
        }
    }
}
