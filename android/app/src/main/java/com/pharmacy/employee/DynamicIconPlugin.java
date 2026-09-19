package com.pharmacy.employee;

import android.content.Context;
import android.content.Intent;
import android.content.pm.ShortcutInfo;
import android.content.pm.ShortcutManager;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Rect;
import android.graphics.drawable.Icon;
import android.os.Build;
import android.util.Base64;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * DynamicIconPlugin.java
 * بلجن كاباسيتور الأصلي للتحكم وتحديث أيقونة واسم التطبيق على شاشة الهاتف الرئيسية
 * - يدعم تثبيت أيقونة مخصصة (Pinned Shortcut) بشعار الصيدلية المرفوع من الاستوديو
 * - يدعم تعيين الاسم المخصص للتطبيق ليظهر تحت الأيقونة على شاشة الهاتف
 * - متوافق مع كافة إصدارات أندرويد الحديثة (Android 8.0 Oreo حتى Android 15+)
 */
@CapacitorPlugin(name = "DynamicIcon")
public class DynamicIconPlugin extends Plugin {
    private static final String TAG = "DynamicIconPlugin";

    @PluginMethod
    public void isPinShortcutSupported(PluginCall call) {
        JSObject ret = new JSObject();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            ShortcutManager shortcutManager = getContext().getSystemService(ShortcutManager.class);
            boolean supported = shortcutManager != null && shortcutManager.isRequestPinShortcutSupported();
            ret.put("supported", supported);
        } else {
            ret.put("supported", true);
        }
        call.resolve(ret);
    }

    @PluginMethod
    public void pinCustomShortcut(PluginCall call) {
        String base64Image = call.getString("base64Image");
        String appName = call.getString("appName", "بوابة الموظف");

        if (appName == null || appName.trim().isEmpty()) {
            appName = "بوابة الموظف";
        }
        appName = appName.trim();

        try {
            Context context = getContext();
            Bitmap iconBitmap = null;

            // 1. فك تشفير وتجهيز صورة الشعار المرفوعة
            if (base64Image != null && !base64Image.isEmpty()) {
                String cleanBase64 = base64Image;
                if (cleanBase64.contains(",")) {
                    cleanBase64 = cleanBase64.substring(cleanBase64.indexOf(",") + 1);
                }
                byte[] decodedBytes = Base64.decode(cleanBase64, Base64.DEFAULT);
                Bitmap rawBitmap = BitmapFactory.decodeByteArray(decodedBytes, 0, decodedBytes.length);
                if (rawBitmap != null) {
                    iconBitmap = createAdaptiveLauncherBitmap(rawBitmap);
                }
            }

            // إذا لم تتوفر صورة مخصصة، نستخدم أيقونة التطبيق الافتراضية
            if (iconBitmap == null) {
                iconBitmap = BitmapFactory.decodeResource(context.getResources(), R.mipmap.ic_launcher);
                if (iconBitmap != null) {
                    iconBitmap = createAdaptiveLauncherBitmap(iconBitmap);
                }
            }

            if (iconBitmap == null) {
                call.reject("فشل معالجة صورة الأيقونة");
                return;
            }

            // 2. إعداد نية فتح التطبيق (Launch Intent)
            Intent launchIntent = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
            if (launchIntent == null) {
                launchIntent = new Intent(context, MainActivity.class);
            }
            launchIntent.setAction(Intent.ACTION_MAIN);
            launchIntent.addCategory(Intent.CATEGORY_LAUNCHER);
            launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED);

            // 3. تثبيت الأيقونة على الشاشة الرئيسية (Android 8.0+ ShortcutManager)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                ShortcutManager shortcutManager = context.getSystemService(ShortcutManager.class);
                if (shortcutManager != null && shortcutManager.isRequestPinShortcutSupported()) {
                    String shortcutId = "pharmacy_custom_pin_shortcut";

                    ShortcutInfo pinShortcutInfo = new ShortcutInfo.Builder(context, shortcutId)
                            .setIcon(Icon.createWithBitmap(iconBitmap))
                            .setShortLabel(appName)
                            .setLongLabel(appName)
                            .setIntent(launchIntent)
                            .build();

                    shortcutManager.requestPinShortcut(pinShortcutInfo, null);

                    JSObject ret = new JSObject();
                    ret.put("success", true);
                    ret.put("message", "تم إرسال طلب تثبيت الأيقونة بالاسم والشعار المخصصين على شاشة الهاتف بنجاح");
                    call.resolve(ret);
                    return;
                } else {
                    call.reject("مشغل الواجهة الحالي (Launcher) في هذا الهاتف لا يدعم تثبيت الاختصارات تلقائياً");
                    return;
                }
            } else {
                // للأجهزة القديمة (Android 7 وما دون) عبر Intent Broadcast
                Intent addIntent = new Intent();
                addIntent.putExtra(Intent.EXTRA_SHORTCUT_INTENT, launchIntent);
                addIntent.putExtra(Intent.EXTRA_SHORTCUT_NAME, appName);
                addIntent.putExtra(Intent.EXTRA_SHORTCUT_ICON, iconBitmap);
                addIntent.setAction("com.android.launcher.action.INSTALL_SHORTCUT");
                context.sendBroadcast(addIntent);

                JSObject ret = new JSObject();
                ret.put("success", true);
                ret.put("message", "تم إرسال أمر تثبيت الاختصار بنجاح");
                call.resolve(ret);
            }

        } catch (Exception e) {
            Log.e(TAG, "Error in pinCustomShortcut: " + e.getMessage(), e);
            call.reject("حدث خطأ أثناء تثبيت أيقونة التطبيق: " + e.getMessage());
        }
    }

    /**
     * تشكيل صورة أيقونة أندرويد دائرية متناسقة بأعلى دقة مع خلفية بيضاء ناعمة
     * لتلائم معايير أيقونات أندرويد الحديثة (Adaptive Round Icon)
     */
    private Bitmap createAdaptiveLauncherBitmap(Bitmap src) {
        int targetSize = 256;
        Bitmap output = Bitmap.createBitmap(targetSize, targetSize, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(output);

        Paint paint = new Paint();
        paint.setAntiAlias(true);
        paint.setFilterBitmap(true);
        paint.setDither(true);

        // 1. رسم خلفية دائرية بيضاء أنيقة
        paint.setColor(Color.WHITE);
        float radius = targetSize / 2f;
        canvas.drawCircle(radius, radius, radius - 4f, paint);

        // 2. رسم حدود ناعمة
        Paint borderPaint = new Paint();
        borderPaint.setAntiAlias(true);
        borderPaint.setStyle(Paint.Style.STROKE);
        borderPaint.setStrokeWidth(3f);
        borderPaint.setColor(Color.parseColor("#E2E8F0"));
        canvas.drawCircle(radius, radius, radius - 5f, borderPaint);

        // 3. تحجيم ورسم الشعار في المنتصف بمسافة داخلية مريحة (Padding 20%)
        int padding = 34;
        Rect destRect = new Rect(padding, padding, targetSize - padding, targetSize - padding);
        canvas.drawBitmap(src, null, destRect, paint);

        return output;
    }
}
