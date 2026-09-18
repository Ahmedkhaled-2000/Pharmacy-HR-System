package com.pharmacy.employee;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.util.Log;

/**
 * BootReceiver
 * يستمع لإعادة تشغيل الهاتف لإعادة إطلاق خدمة المزامنة والإشعارات في الخلفية تلقائياً
 */
public class BootReceiver extends BroadcastReceiver {
    private static final String TAG = "PharmacyBootReceiver";

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent != null ? intent.getAction() : "";
        if (Intent.ACTION_BOOT_COMPLETED.equals(action) || "android.intent.action.QUICKBOOT_POWERON".equals(action)) {
            Log.i(TAG, "Device booted. Starting BackgroundNotificationService...");
            try {
                Intent serviceIntent = new Intent(context, BackgroundNotificationService.class);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    context.startForegroundService(serviceIntent);
                } else {
                    context.startService(serviceIntent);
                }
            } catch (Exception e) {
                Log.e(TAG, "Failed to start service after boot: " + e.getMessage(), e);
            }
        }
    }
}
