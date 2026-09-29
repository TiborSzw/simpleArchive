package io.github.tiborszw.simplearchive;

import android.accounts.Account;
import android.app.Activity;
import android.app.PendingIntent;
import androidx.activity.result.ActivityResult;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.IntentSenderRequest;
import androidx.activity.result.contract.ActivityResultContracts;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.auth.api.identity.AuthorizationRequest;
import com.google.android.gms.auth.api.identity.AuthorizationResult;
import com.google.android.gms.auth.api.identity.ClearTokenRequest;
import com.google.android.gms.auth.api.identity.Identity;
import com.google.android.gms.auth.api.identity.RevokeAccessRequest;
import com.google.android.gms.auth.api.signin.GoogleSignInAccount;
import com.google.android.gms.common.api.ApiException;
import com.google.android.gms.common.api.CommonStatusCodes;
import com.google.android.gms.common.api.Scope;
import java.util.Collections;
import java.util.List;

/**
 * Google sign-in for the Drive backup. Asks only for "drive.file": the app can
 * see and change the files it created itself – nothing else in your Drive.
 * Returns short-lived access tokens; the Drive REST calls happen in JS.
 *
 * Needs a one-time OAuth client (type Android) for this package name and the
 * signing key's SHA-1 in a Google Cloud project – see README.
 */
@CapacitorPlugin(name = "GoogleAuth")
public class GoogleAuthPlugin extends Plugin {

    private static final List<Scope> SCOPES = Collections.singletonList(new Scope("https://www.googleapis.com/auth/drive.file"));

    private ActivityResultLauncher<IntentSenderRequest> consentLauncher;
    private PluginCall pendingCall;

    @Override
    public void load() {
        // Plugins load while the activity is being created, so registering here is allowed.
        consentLauncher = getActivity().registerForActivityResult(new ActivityResultContracts.StartIntentSenderForResult(), this::onConsentResult);
    }

    @PluginMethod
    public void authorize(final PluginCall call) {
        final boolean interactive = Boolean.TRUE.equals(call.getBoolean("interactive", true));
        AuthorizationRequest request = AuthorizationRequest.builder().setRequestedScopes(SCOPES).build();
        Identity.getAuthorizationClient(getActivity())
            .authorize(request)
            .addOnSuccessListener(result -> {
                if (!result.hasResolution()) {
                    resolveToken(call, result);
                    return;
                }
                if (!interactive) {
                    call.reject("Google-Anmeldung nötig.", "NEEDS_CONSENT");
                    return;
                }
                PendingIntent intent = result.getPendingIntent();
                if (intent == null) {
                    call.reject("Google-Anmeldung konnte nicht gestartet werden.");
                    return;
                }
                if (pendingCall != null) pendingCall.reject("Abgebrochen.", "CANCELLED");
                pendingCall = call;
                consentLauncher.launch(new IntentSenderRequest.Builder(intent.getIntentSender()).build());
            })
            .addOnFailureListener(e -> rejectWith(call, e));
    }

    private void onConsentResult(ActivityResult activityResult) {
        PluginCall call = pendingCall;
        pendingCall = null;
        if (call == null) return;
        if (activityResult.getResultCode() != Activity.RESULT_OK) {
            call.reject("Anmeldung abgebrochen.", "CANCELLED");
            return;
        }
        try {
            AuthorizationResult result = Identity.getAuthorizationClient(getActivity()).getAuthorizationResultFromIntent(activityResult.getData());
            resolveToken(call, result);
        } catch (ApiException e) {
            rejectWith(call, e);
        }
    }

    private void resolveToken(PluginCall call, AuthorizationResult result) {
        String token = result.getAccessToken();
        if (token == null) {
            call.reject("Google hat keinen Zugriffsschlüssel geliefert.");
            return;
        }
        JSObject out = new JSObject();
        out.put("accessToken", token);
        GoogleSignInAccount account = result.toGoogleSignInAccount();
        if (account != null && account.getEmail() != null) out.put("email", account.getEmail());
        call.resolve(out);
    }

    /** Forgets a (possibly expired) token so the next authorize() returns a fresh one. */
    @PluginMethod
    public void clearToken(final PluginCall call) {
        String token = call.getString("token");
        if (token == null) {
            call.resolve();
            return;
        }
        Identity.getAuthorizationClient(getActivity())
            .clearToken(ClearTokenRequest.builder().setToken(token).build())
            .addOnSuccessListener(v -> call.resolve())
            .addOnFailureListener(e -> call.resolve());
    }

    /** Disconnects the app from the Google account (the Drive files stay). */
    @PluginMethod
    public void revoke(final PluginCall call) {
        String email = call.getString("email");
        if (email == null || email.isEmpty()) {
            call.resolve();
            return;
        }
        RevokeAccessRequest request = RevokeAccessRequest.builder().setAccount(new Account(email, "com.google")).setScopes(SCOPES).build();
        Identity.getAuthorizationClient(getActivity())
            .revokeAccess(request)
            .addOnSuccessListener(v -> call.resolve())
            .addOnFailureListener(e -> rejectWith(call, e));
    }

    private void rejectWith(PluginCall call, Exception e) {
        if (e instanceof ApiException) {
            int code = ((ApiException) e).getStatusCode();
            if (code == CommonStatusCodes.DEVELOPER_ERROR) {
                call.reject("Google Drive ist für diese App noch nicht freigeschaltet (OAuth-Client fehlt) – siehe Anleitung im README.", "NOT_CONFIGURED");
            } else if (code == CommonStatusCodes.CANCELED) {
                call.reject("Anmeldung abgebrochen.", "CANCELLED");
            } else if (code == CommonStatusCodes.NETWORK_ERROR) {
                call.reject("Keine Verbindung zu Google.", "NETWORK");
            } else {
                call.reject("Google-Anmeldung fehlgeschlagen (Code " + code + ").", String.valueOf(code));
            }
            return;
        }
        call.reject(e.getMessage() != null ? e.getMessage() : "Google-Anmeldung fehlgeschlagen.");
    }
}
