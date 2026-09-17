package com.pharmacy.employee;

import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;

@CapacitorPlugin(name = "ApkUpdate")
public class ApkUpdatePlugin extends Plugin {

    @PluginMethod
    public void getAppInfo(PluginCall call) {
        try {
            Context context = getContext();
            PackageManager pm = context.getPackageManager();
            PackageInfo pInfo = pm.getPackageInfo(context.getPackageName(), 0);

            long versionCode;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                versionCode = pInfo.getLongVersionCode();
            } else {
                versionCode = pInfo.versionCode;
            }

            JSObject ret = new JSObject();
            ret.put("packageName", context.getPackageName());
            ret.put("versionName", pInfo.versionName);
            ret.put("versionCode", versionCode);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to retrieve app info: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void checkInstallPermission(PluginCall call) {
        JSObject ret = new JSObject();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            boolean canInstall = getContext().getPackageManager().canRequestPackageInstalls();
            ret.put("granted", canInstall);
        } else {
            ret.put("granted", true);
        }
        call.resolve(ret);
    }

    @PluginMethod
    public void openInstallPermissionSettings(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            try {
                Intent intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
                intent.setData(Uri.parse("package:" + getContext().getPackageName()));
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(intent);
                call.resolve();
            } catch (Exception e) {
                call.reject("Failed to open install settings: " + e.getMessage(), e);
            }
        } else {
            call.resolve();
        }
    }

    @PluginMethod
    public void downloadAndInstall(PluginCall call) {
        String downloadUrl = call.getString("downloadUrl");
        String expectedSha256 = call.getString("expectedSha256", "");
        String fileName = call.getString("fileName", "update.apk");

        if (downloadUrl == null || downloadUrl.trim().isEmpty()) {
            call.reject("downloadUrl parameter is required");
            return;
        }

        // Execute download in background thread
        new Thread(() -> {
            InputStream input = null;
            OutputStream output = null;
            HttpURLConnection connection = null;
            try {
                URL currentUrl = new URL(downloadUrl);
                boolean redirect = false;
                int redirectCount = 0;

                do {
                    connection = (HttpURLConnection) currentUrl.openConnection();
                    connection.setInstanceFollowRedirects(true);
                    connection.setRequestProperty("User-Agent", "Pharmacy-HR-AutoUpdater");
                    connection.setConnectTimeout(30000);
                    connection.setReadTimeout(90000);
                    connection.connect();

                    int status = connection.getResponseCode();
                    if (status == HttpURLConnection.HTTP_MOVED_TEMP || status == HttpURLConnection.HTTP_MOVED_PERM || status == HttpURLConnection.HTTP_SEE_OTHER || status == 307 || status == 308) {
                        String newUrl = connection.getHeaderField("Location");
                        if (newUrl != null && !newUrl.isEmpty()) {
                            currentUrl = new URL(newUrl);
                            redirect = true;
                            redirectCount++;
                            connection.disconnect();
                        } else {
                            redirect = false;
                        }
                    } else {
                        redirect = false;
                    }
                } while (redirect && redirectCount < 8);

                if (connection.getResponseCode() != HttpURLConnection.HTTP_OK) {
                    notifyDownloadError("Server returned HTTP " + connection.getResponseCode() + " " + connection.getResponseMessage());
                    call.reject("Server returned HTTP " + connection.getResponseCode());
                    return;
                }

                int fileLength = connection.getContentLength();

                File cacheDir = getContext().getCacheDir();
                File outputFile = new File(cacheDir, fileName);
                if (outputFile.exists()) {
                    outputFile.delete();
                }

                input = new BufferedInputStream(connection.getInputStream());
                output = new FileOutputStream(outputFile);

                byte[] data = new byte[8192];
                long total = 0;
                int count;
                long lastProgressTime = 0;

                while ((count = input.read(data)) != -1) {
                    total += count;
                    output.write(data, 0, count);

                    long now = System.currentTimeMillis();
                    if (now - lastProgressTime > 200 && fileLength > 0) {
                        lastProgressTime = now;
                        int percent = (int) ((total * 100) / fileLength);
                        notifyDownloadProgress(percent, total, fileLength);
                    }
                }

                output.flush();
                output.close();
                input.close();

                notifyDownloadProgress(100, total, fileLength > 0 ? fileLength : total);

                // Verify SHA-256 Checksum if provided
                if (expectedSha256 != null && !expectedSha256.trim().isEmpty()) {
                    String actualSha256 = calculateSha256(outputFile);
                    if (!actualSha256.equalsIgnoreCase(expectedSha256.trim())) {
                        outputFile.delete();
                        notifyDownloadError("SHA-256 Checksum mismatch. Download corrupted or tampered.");
                        call.reject("SHA-256 mismatch. Expected: " + expectedSha256 + ", Actual: " + actualSha256);
                        return;
                    }
                }

                // Trigger Android PackageInstaller
                boolean launchSuccess = triggerApkInstallation(outputFile);
                if (launchSuccess) {
                    JSObject ret = new JSObject();
                    ret.put("success", true);
                    ret.put("filePath", outputFile.getAbsolutePath());
                    call.resolve(ret);
                } else {
                    call.reject("Failed to trigger Android Package Installer");
                }

            } catch (Exception e) {
                notifyDownloadError(e.getMessage());
                call.reject("Download or installation failed: " + e.getMessage(), e);
            } finally {
                try {
                    if (output != null) output.close();
                    if (input != null) input.close();
                } catch (Exception ignored) {}
                if (connection != null) connection.disconnect();
            }
        }).start();
    }

    @PluginMethod
    public void installApk(PluginCall call) {
        String filePath = call.getString("filePath");
        if (filePath == null) {
            call.reject("filePath parameter is required");
            return;
        }

        File file = new File(filePath);
        if (!file.exists()) {
            call.reject("APK file does not exist at: " + filePath);
            return;
        }

        boolean success = triggerApkInstallation(file);
        if (success) {
            call.resolve();
        } else {
            call.reject("Could not launch package installer");
        }
    }

    private boolean triggerApkInstallation(File apkFile) {
        try {
            Context context = getContext();
            String authority = context.getPackageName() + ".fileprovider";
            Uri apkUri = FileProvider.getUriForFile(context, authority, apkFile);

            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(apkUri, "application/vnd.android.package-archive");
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

            context.startActivity(intent);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    private String calculateSha256(File file) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            InputStream is = new BufferedInputStream(new java.io.FileInputStream(file));
            byte[] buffer = new byte[8192];
            int read;
            while ((read = is.read(buffer)) > 0) {
                digest.update(buffer, 0, read);
            }
            is.close();
            byte[] hash = digest.digest();
            StringBuilder hexString = new StringBuilder();
            for (byte b : hash) {
                String hex = Integer.toHexString(0xff & b);
                if (hex.length() == 1) hexString.append('0');
                hexString.append(hex);
            }
            return hexString.toString();
        } catch (Exception e) {
            return "";
        }
    }

    private void notifyDownloadProgress(int percent, long currentBytes, long totalBytes) {
        JSObject data = new JSObject();
        data.put("percent", percent);
        data.put("currentBytes", currentBytes);
        data.put("totalBytes", totalBytes);
        notifyListeners("downloadProgress", data);
    }

    private void notifyDownloadError(String errorMessage) {
        JSObject data = new JSObject();
        data.put("error", errorMessage);
        notifyListeners("downloadError", data);
    }
}
