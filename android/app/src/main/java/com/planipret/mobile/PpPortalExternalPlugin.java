package com.planipret.mobile;

import android.content.Intent;
import android.net.Uri;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.Locale;

/**
 * Ouvre uniquement un relais AVA Planiprêt validé dans le navigateur système.
 * Ce plugin ne gère aucun appel, audio ni connexion de communication.
 */
@CapacitorPlugin(name = "PpPortalExternal")
public class PpPortalExternalPlugin extends Plugin {
  private boolean isAllowedPortalUrl(Uri uri) {
    if (uri == null || !"https".equalsIgnoreCase(uri.getScheme())) return false;
    String host = uri.getHost();
    if (host == null) return false;
    host = host.toLowerCase(Locale.ROOT);
    if (!("courtierai.planipret.com".equals(host) || "avastatistic.ca".equals(host))) return false;

    String path = uri.getPath();
    if (path == null || path.contains("..") || path.contains("//")) return false;
    boolean allowedPath = "/planipret/portal-handoff".equals(path)
      || "/planipret/broker".equals(path) || path.startsWith("/planipret/broker/")
      || "/planipret/admin".equals(path) || path.startsWith("/planipret/admin/");
    if (!allowedPath) return false;

    String tokenHash = uri.getQueryParameter("th");
    String email = uri.getQueryParameter("em");
    return tokenHash != null && !tokenHash.isEmpty() && email != null && !email.isEmpty();
  }

  @PluginMethod
  public void open(PluginCall call) {
    Uri uri;
    try { uri = Uri.parse(call.getString("url", "")); }
    catch (Exception e) { call.reject("invalid_portal_url"); return; }
    if (!isAllowedPortalUrl(uri)) { call.reject("invalid_portal_url"); return; }

    try {
      Intent intent = new Intent(Intent.ACTION_VIEW, uri).addCategory(Intent.CATEGORY_BROWSABLE);
      if (intent.resolveActivity(getContext().getPackageManager()) == null) {
        call.reject("system_browser_unavailable");
        return;
      }
      getActivity().startActivity(intent);
      call.resolve(new JSObject().put("ok", true));
    } catch (Exception e) {
      call.reject("system_browser_unavailable");
    }
  }
}
