import 'package:flutter_test/flutter_test.dart';
import 'package:pharma_employee_app/core/services/face_embedding_service.dart';

void main() {
  group('Face Liveness & BlinkTracker Tests', () {
    test('BlinkTracker detects natural eye blink transition (open -> closed -> open)', () {
      final tracker = BlinkTracker();
      expect(tracker.isBlinkVerified, isFalse);

      // Phase 1: Eyes are naturally open looking at camera
      expect(tracker.feedEyeOpen(0.85), isFalse);
      expect(tracker.isBlinkVerified, isFalse);

      // Phase 2: Employee blinks (eyes close)
      expect(tracker.feedEyeOpen(0.12), isFalse);
      expect(tracker.sawClosed, isTrue);
      expect(tracker.isBlinkVerified, isFalse);

      // Phase 3: Eyes reopen
      expect(tracker.feedEyeOpen(0.80), isTrue);
      expect(tracker.isBlinkVerified, isTrue);
    });

    test('BlinkTracker ignores closed eyes if not preceded by open state', () {
      final tracker = BlinkTracker();
      expect(tracker.feedEyeOpen(0.10), isFalse);
      expect(tracker.sawClosed, isFalse);
      expect(tracker.isBlinkVerified, isFalse);
    });

    test('BlinkTracker reset clears all tracking state', () {
      final tracker = BlinkTracker();
      tracker.feedEyeOpen(0.9);
      tracker.feedEyeOpen(0.1);
      tracker.feedEyeOpen(0.9);
      expect(tracker.isBlinkVerified, isTrue);

      tracker.reset();
      expect(tracker.isBlinkVerified, isFalse);
      expect(tracker.sawClosed, isFalse);
    });
  });
}
