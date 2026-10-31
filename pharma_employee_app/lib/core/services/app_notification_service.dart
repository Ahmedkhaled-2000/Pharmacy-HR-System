import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:permission_handler/permission_handler.dart';

/// خدمة إدارة الإشعارات وأذونات الوصول للنظام (التخزين والإشعارات)
class AppNotificationService {
  static final FlutterLocalNotificationsPlugin _notificationsPlugin =
      FlutterLocalNotificationsPlugin();

  static bool _isInitialized = false;

  static const String channelId = 'pharma_employee_channel';
  static const String channelName = 'إشعارات بوابة الموظف';
  static const String channelDescription =
      'تنبيهات الحضور والانصراف، الورديات، مسيرات الرواتب وكشوفات الـ PDF المعتمدة';

  static const int ongoingShiftNotificationId = 99991;
  static const String shiftChannelId = 'pharma_shift_channel';
  static const String shiftChannelName = 'الوردية النشطة وحالة الدوام';
  static const String shiftChannelDescription =
      'إشعار دائم يُظهر حالة الوردية الحالية والوقت المنقضي بدقة';

  /// تهيئة محرك الإشعارات وقناة النظام
  static Future<void> initialize() async {
    if (_isInitialized) return;

    try {
      const androidSettings = AndroidInitializationSettings('@mipmap/ic_launcher');
      const initSettings = InitializationSettings(android: androidSettings);

      await _notificationsPlugin.initialize(
        settings: initSettings,
        onDidReceiveNotificationResponse: (NotificationResponse details) {
          debugPrint('Notification clicked with payload: ${details.payload}');
        },
      );

      final androidImplementation = _notificationsPlugin
          .resolvePlatformSpecificImplementation<
              AndroidFlutterLocalNotificationsPlugin>();

      if (androidImplementation != null) {
        const androidChannel = AndroidNotificationChannel(
          channelId,
          channelName,
          description: channelDescription,
          importance: Importance.high,
          playSound: true,
          enableVibration: true,
        );
        await androidImplementation.createNotificationChannel(androidChannel);

        const shiftChannel = AndroidNotificationChannel(
          shiftChannelId,
          shiftChannelName,
          description: shiftChannelDescription,
          importance: Importance.high,
          playSound: false,
          enableVibration: false,
          showBadge: true,
        );
        await androidImplementation.createNotificationChannel(shiftChannel);
      }

      _isInitialized = true;
    } catch (e) {
      debugPrint('Error initializing local notifications: $e');
    }
  }

  /// طلب إذن الإشعارات من المستخدم (Android 13+ / POST_NOTIFICATIONS)
  static Future<bool> requestNotificationPermission() async {
    try {
      final status = await Permission.notification.status;
      if (status.isGranted) return true;

      final result = await Permission.notification.request();
      return result.isGranted;
    } catch (e) {
      debugPrint('Error requesting notification permission: $e');
      return false;
    }
  }

  /// طلب إذن الوصول إلى وحدة التخزين بالجهاز لحفظ ملفات الـ PDF
  static Future<bool> requestStoragePermission() async {
    try {
      if (!Platform.isAndroid) return true;

      // 1. فحص إذن التخزين الكلاسيكي
      final storageStatus = await Permission.storage.status;
      if (storageStatus.isGranted) return true;

      final requestedStorage = await Permission.storage.request();
      if (requestedStorage.isGranted) return true;

      // 2. للأندرويد 11 فما فوق (API 30+) عند الحاجة لإدارة التخزين
      final manageStatus = await Permission.manageExternalStorage.status;
      if (manageStatus.isGranted) return true;

      // 3. لأندرويد 13 فما فوق فحص صلاحيات الوسائط المتعددة
      final mediaStatus = await Permission.photos.status;
      if (mediaStatus.isGranted) return true;
      final requestedMedia = await Permission.photos.request();
      if (requestedMedia.isGranted) return true;

      // في أنظمة Scoped Storage يتاح الحفظ لمجلد التنزيلات الخاص بالتطبيق
      return true;
    } catch (e) {
      debugPrint('Error requesting storage permission: $e');
      return true;
    }
  }

  /// فحص حالة إذن الإشعارات الحالية
  static Future<bool> isNotificationPermissionGranted() async {
    try {
      final status = await Permission.notification.status;
      return status.isGranted;
    } catch (_) {
      return false;
    }
  }

  /// فحص حالة إذن التخزين الحالية
  static Future<bool> isStoragePermissionGranted() async {
    try {
      if (!Platform.isAndroid) return true;
      final status = await Permission.storage.status;
      if (status.isGranted) return true;
      final manageStatus = await Permission.manageExternalStorage.status;
      return manageStatus.isGranted;
    } catch (_) {
      return false;
    }
  }

  /// إظهار إشعار نظام فوري في شريط إشعارات الهاتف
  static Future<void> showNotification({
    required int id,
    required String title,
    required String body,
    String? payload,
  }) async {
    try {
      await initialize();

      const androidDetails = AndroidNotificationDetails(
        channelId,
        channelName,
        channelDescription: channelDescription,
        importance: Importance.max,
        priority: Priority.high,
        playSound: true,
        enableVibration: true,
        icon: '@mipmap/ic_launcher',
      );

      const notificationDetails = NotificationDetails(android: androidDetails);

      await _notificationsPlugin.show(
        id: id,
        title: title,
        body: body,
        notificationDetails: notificationDetails,
        payload: payload,
      );
    } catch (e) {
      debugPrint('Error displaying notification: $e');
    }
  }

  /// إظهار إشعار فوري عند نجاح حفظ كشف الراتب بصيغة PDF في وحدة التخزين
  static Future<void> showPdfSavedNotification({
    required String fileName,
    required String filePath,
  }) async {
    final notificationId = DateTime.now().millisecondsSinceEpoch ~/ 1000;
    await showNotification(
      id: notificationId,
      title: '📄 تم حفظ كشف الراتب بنجاح',
      body: 'تم حفظ $fileName في وحدة تخزين الجهاز (التنزيلات Downloads)',
      payload: filePath,
    );
  }

  /// إعداد وتكوين تفاصيل الإشعار الدائم مع العداد الزمني الحي
  static AndroidNotificationDetails getOngoingShiftNotificationDetails({
    int? shiftStartEpochMs,
    bool isOnBreak = false,
  }) {
    return AndroidNotificationDetails(
      shiftChannelId,
      shiftChannelName,
      channelDescription: shiftChannelDescription,
      importance: Importance.high,
      priority: Priority.high,
      ongoing: true,
      autoCancel: false,
      showWhen: true,
      when: shiftStartEpochMs,
      usesChronometer: true,
      chronometerCountDown: false,
      icon: '@mipmap/ic_launcher',
    );
  }

  /// إظهار أو تحديث الإشعار الدائم للوردية النشطة
  static Future<void> showOngoingShiftNotification({
    required String branchName,
    required DateTime startTime,
    bool isOnBreak = false,
  }) async {
    try {
      await initialize();

      final title = isOnBreak
          ? '☕ استراحة بريك مؤقتة • $branchName'
          : '🟢 وردية نشطة الآن • $branchName';

      final body = isOnBreak
          ? 'الوردية معلقة مؤقتاً في وضع الاستراحة، المس لاستئناف العمل'
          : 'تم توثيق الحضور بنجاح، العداد الزمني يعمل مباشرة بالهاتف';

      final androidDetails = getOngoingShiftNotificationDetails(
        shiftStartEpochMs: startTime.millisecondsSinceEpoch,
        isOnBreak: isOnBreak,
      );

      final details = NotificationDetails(android: androidDetails);

      await _notificationsPlugin.show(
        id: ongoingShiftNotificationId,
        title: title,
        body: body,
        notificationDetails: details,
        payload: 'active_shift',
      );
    } catch (e) {
      debugPrint('Error showing ongoing shift notification: $e');
    }
  }

  /// إلغاء الإشعار الدائم عند إنهاء الوردية
  static Future<void> cancelOngoingShiftNotification() async {
    try {
      await initialize();
      await _notificationsPlugin.cancel(id: ongoingShiftNotificationId);
    } catch (e) {
      debugPrint('Error canceling ongoing shift notification: $e');
    }
  }
}

