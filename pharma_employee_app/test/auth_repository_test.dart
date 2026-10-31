import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:pharma_employee_app/data/repositories/auth_repository.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  FlutterSecureStorage.setMockInitialValues({});

  group('AuthRepository Unit Tests', () {
    test('Empty employee code or password throws validation exception', () async {
      final repo = AuthRepository();

      expect(
        () => repo.login(username: '', password: '123'),
        throwsA(isA<Exception>()),
      );

      expect(
        () => repo.login(username: '101', password: ''),
        throwsA(isA<Exception>()),
      );
    });

    test('Invalid credentials or offline without server connection throws authentication error', () async {
      final repo = AuthRepository();

      expect(
        () => repo.login(username: '00', password: '123'),
        throwsA(predicate((e) => e is Exception && e.toString().contains('بيانات الدخول'))),
      );
    });
  });
}
