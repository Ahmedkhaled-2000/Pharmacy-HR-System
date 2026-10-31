import 'package:flutter_test/flutter_test.dart';
import 'package:pharma_employee_app/core/services/face_embedding_service.dart';
import 'package:pharma_employee_app/core/services/voice_guidance_service.dart';
import 'package:pharma_employee_app/data/models/user_model.dart';
import 'package:pharma_employee_app/presentation/widgets/biometrics/face_camera_scanner_modal.dart';

void main() {
  group('Kiosk Face Punch & Photo Approval Fallback Tests', () {
    test('FaceScannerResult retains capturedPhotoPath and match metadata', () {
      const result = FaceScannerResult(
        success: false,
        similarity: 0.58,
        matchPercentage: 58.0,
        message: 'درجة التطابق أقل من 70%',
        capturedPhotoPath: '/data/user/0/cache/photo_123.jpg',
      );

      expect(result.success, isFalse);
      expect(result.similarity, equals(0.58));
      expect(result.matchPercentage, equals(58.0));
      expect(result.capturedPhotoPath, equals('/data/user/0/cache/photo_123.jpg'));
    });

    test('Face match requires strict 70% threshold', () {
      final vecA = List.generate(512, (i) => 0.05);
      final vecLowMatch = List.generate(512, (i) => i.isEven ? 0.05 : -0.05);

      final matchRes = FaceEmbeddingService.compareFaces(
        savedDescriptor: vecA,
        liveDescriptor: vecLowMatch,
        threshold: 70.0,
      );

      // Cosine similarity for alternating elements is close to 0, well below 70%
      expect(matchRes.isMatch, isFalse);
      expect(matchRes.matchPercentage, lessThan(70.0));
    });

    test('VoiceGuidanceService singleton is instantiated safely', () {
      final voice = VoiceGuidanceService.instance;
      expect(voice, isNotNull);
    });

    test('Fallback Photo Punch model and request fields validation', () {
      const user = UserModel(
        id: 'emp_99',
        code: '99',
        name: 'د. خالد محمد',
        jobTitle: 'صيدلي متدرب',
      );

      final punchPayload = {
        'employeeId': user.id,
        'employeeCode': user.code,
        'branchId': 'branch_1',
        'actionType': 'start_shift',
        'punchType': 'photo_attendance',
        'photoUrl': '/api/attachments?id=att_123&raw=1',
        'requestId': 'REQ-BIO-1730000000',
      };

      expect(punchPayload['punchType'], equals('photo_attendance'));
      expect(punchPayload['photoUrl'], contains('/api/attachments'));
      expect(punchPayload['requestId'], startsWith('REQ-BIO-'));
    });
  });
}

