import 'package:flutter_test/flutter_test.dart';
import 'package:pharma_employee_app/core/services/app_notification_service.dart';

void main() {
  group('Ongoing Shift Notification Tests', () {
    test('getOngoingShiftNotificationDetails configures chronometer and ongoing persistence', () {
      final startEpoch = DateTime.now().subtract(const Duration(hours: 2)).millisecondsSinceEpoch;
      final details = AppNotificationService.getOngoingShiftNotificationDetails(
        shiftStartEpochMs: startEpoch,
        isOnBreak: false,
      );

      expect(details.ongoing, isTrue);
      expect(details.autoCancel, isFalse);
      expect(details.usesChronometer, isTrue);
      expect(details.chronometerCountDown, isFalse);
      expect(details.when, equals(startEpoch));
      expect(details.channelId, equals('pharma_shift_channel'));
    });

    test('getOngoingShiftNotificationDetails updates for break state', () {
      final details = AppNotificationService.getOngoingShiftNotificationDetails(
        isOnBreak: true,
      );

      expect(details.ongoing, isTrue);
      expect(details.usesChronometer, isTrue);
    });
  });
}

