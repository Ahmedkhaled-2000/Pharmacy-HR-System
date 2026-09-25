package com.pharmacy.employee;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.BitmapFactory;
import android.os.Build;
import android.os.IBinder;
import android.util.Log;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

/**
 * BackgroundNotificationService
 * خدمة أندرويد تعمل في الخلفية على مدار 24 ساعة لاستقبال التنبيهات حتى عند إغلاق التطبيق
 */
public class BackgroundNotificationService extends Service {

    private static final String TAG = "PharmacyBgService";
    private static final String PERSISTENT_CHANNEL_ID = "pharmacy_bg_service_channel";
    private static final String ALERTS_CHANNEL_ID = "pharmacy_hr_system_notifications";
    private static final int FOREGROUND_NOTIFICATION_ID = 9911;

    private static final String PREFS_NAME = "pharmacy_bg_prefs";
    private static final String KEY_SEEN_REQUEST_IDS = "seen_request_ids";
    private static final String KEY_LAST_SYNC_TS = "last_sync_timestamp";

    private ScheduledExecutorService scheduler;

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannels();
        startForeground(FOREGROUND_NOTIFICATION_ID, buildForegroundNotification());
        startBackgroundPolling();
        Log.i(TAG, "BackgroundNotificationService created and running in foreground.");
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        return START_STICKY; // إعادة تشغيل الخدمة تلقائياً إذا أغلقتها الذاكرة
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onDestroy() {
        if (scheduler != null && !scheduler.isShutdown()) {
            scheduler.shutdown();
        }
        Log.i(TAG, "BackgroundNotificationService stopped.");
        super.onDestroy();
    }

    private void createNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager == null) return;

            // 1. قناة الخدمة الخفية (Low Priority) لإبقاء التطبيق حياً
            NotificationChannel serviceChannel = new NotificationChannel(
                PERSISTENT_CHANNEL_ID,
                "خدمة المزامنة الحية في الخلفية",
                NotificationManager.IMPORTANCE_LOW
            );
            serviceChannel.setDescription("الحفاظ على تلقي التنبيهات الإدارية وطلبات الإجازات 24/7");
            serviceChannel.setShowBadge(false);
            manager.createNotificationChannel(serviceChannel);

            // 2. قناة التنبيهات الفورية ذات الأولوية القصوى (High Priority مع صوت واهتزاز)
            NotificationChannel alertChannel = new NotificationChannel(
                ALERTS_CHANNEL_ID,
                "إشعارات Pharma System",
                NotificationManager.IMPORTANCE_HIGH
            );
            alertChannel.setDescription("تنبيهات فورية بالطلبات والردود والتعليمات الإدارية");
            alertChannel.enableLights(true);
            alertChannel.enableVibration(true);
            alertChannel.setVibrationPattern(new long[]{0, 250, 150, 250});
            manager.createNotificationChannel(alertChannel);
        }
    }

    private Notification buildForegroundNotification() {
        Intent intent = new Intent(this, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        int flags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0;
        PendingIntent pendingIntent = PendingIntent.getActivity(this, 0, intent, flags);

        return new NotificationCompat.Builder(this, PERSISTENT_CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle("Pharma System")
            .setContentText("المزامنة اللحظية نشطة لتلقي الإشعارات في الخلفية")
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .setContentIntent(pendingIntent)
            .build();
    }

    private void startBackgroundPolling() {
        if (scheduler != null && !scheduler.isShutdown()) return;

        scheduler = Executors.newSingleThreadScheduledExecutor();
        // استطلاع كل 25 ثانية من خادم VPS
        scheduler.scheduleWithFixedDelay(() -> {
            try {
                pollVpsNotifications();
            } catch (Throwable t) {
                Log.w(TAG, "Background polling tick failed: " + t.getMessage());
            }
        }, 5, 25, TimeUnit.SECONDS);
    }

    private void pollVpsNotifications() {
        HttpURLConnection conn = null;
        try {
            // الاستعلام من خادم VPS السحابي مباشرة
            URL url = new URL("http://63.183.147.199/api/settings?key=pharmacy-tracker-data");
            conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("GET");
            conn.setConnectTimeout(8000);
            conn.setReadTimeout(10000);
            conn.setRequestProperty("Accept", "application/json");

            int code = conn.getResponseCode();
            if (code == 200) {
                BufferedReader reader = new BufferedReader(new InputStreamReader(conn.getInputStream()));
                StringBuilder sb = new StringBuilder();
                String line;
                while ((line = reader.readLine()) != null) {
                    sb.append(line);
                }
                reader.close();

                processCloudData(sb.toString());
            }
        } catch (Exception e) {
            Log.d(TAG, "Poll connection error: " + e.getMessage());
        } finally {
            if (conn != null) {
                conn.disconnect();
            }
        }
    }

    private void processCloudData(String jsonString) {
        try {
            JSONObject root = new JSONObject(jsonString);
            JSONObject valObj = root.optJSONObject("value");
            if (valObj == null && root.has("value") && root.get("value") instanceof String) {
                valObj = new JSONObject(root.getString("value"));
            }
            if (valObj == null) valObj = root;

            JSONArray requests = valObj.optJSONArray("requests");
            if (requests == null || requests.length() == 0) return;

            SharedPreferences prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            Set<String> seenIds = new HashSet<>(prefs.getStringSet(KEY_SEEN_REQUEST_IDS, new HashSet<>()));

            // فحص أحدث الطلبات
            for (int i = 0; i < requests.length(); i++) {
                JSONObject req = requests.getJSONObject(i);
                String reqId = req.optString("id");
                if (reqId == null || reqId.isEmpty()) continue;

                if (!seenIds.contains(reqId)) {
                    // طلب جديد لم يسبق إرسال إشعار به!
                    seenIds.add(reqId);

                    String empName = req.optString("employeeName", "أحد الموظفين");
                    String type = req.optString("type", "طلب جديد");
                    String status = req.optString("status", "pending");

                    String title = "Pharma System 🔔";
                    String body = "طلب جديد من " + empName + " (" + type + ")";
                    if ("approved".equals(status)) {
                        body = "تمت الموافقة على طلبك: " + type;
                    } else if ("rejected".equals(status)) {
                        body = "تم رفض طلبك: " + type;
                    }

                    showHighPriorityAlert(reqId.hashCode(), title, body);
                }
            }

            // حفظ المعرفات لتجنب التكرار
            prefs.edit().putStringSet(KEY_SEEN_REQUEST_IDS, seenIds).apply();

        } catch (Exception e) {
            Log.w(TAG, "Error processing cloud data: " + e.getMessage());
        }
    }

    private void showHighPriorityAlert(int notifId, String title, String body) {
        Intent intent = new Intent(this, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        int flags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE : PendingIntent.FLAG_UPDATE_CURRENT;
        PendingIntent pendingIntent = PendingIntent.getActivity(this, notifId, intent, flags);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, ALERTS_CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setLargeIcon(BitmapFactory.decodeResource(getResources(), R.mipmap.ic_launcher))
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setDefaults(NotificationCompat.DEFAULT_ALL)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent);

        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) {
            manager.notify(notifId, builder.build());
        }
    }
}
