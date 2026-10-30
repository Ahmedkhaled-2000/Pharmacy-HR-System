import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:pharma_employee_app/data/models/user_model.dart';
import 'package:pharma_employee_app/data/repositories/auth_repository.dart';

void main() {
  group('Instant Cold-Start Tests', () {
    test('tryRestoreSessionFast restores user profile from JSON cache without network delay', () async {
      final sampleUser = UserModel(
        id: 'emp_99',
        code: '00',
        name: 'احمد خالد',
        jobTitle: 'صيدلي أول',
        branchId: 'b_main',
        branchName: 'الفرع الرئيسي',
      );

      final userJson = jsonEncode(sampleUser.toMap());
      final restored = AuthRepository.parseCachedUser(userJson);

      expect(restored, isNotNull);
      expect(restored!.id, equals('emp_99'));
      expect(restored.code, equals('00'));
      expect(restored.name, equals('احمد خالد'));
    });

    test('parseCachedUser safely returns null on empty or corrupted string', () {
      expect(AuthRepository.parseCachedUser(null), isNull);
      expect(AuthRepository.parseCachedUser(''), isNull);
      expect(AuthRepository.parseCachedUser('{corrupted-json}'), isNull);
    });
  });
}
