import 'dart:async';
import 'dart:convert';
import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:local_auth/local_auth.dart';
import '../../core/network/api_client.dart';
import '../models/user_model.dart';
import 'employee_repository.dart';

class AuthRepository {
  final FlutterSecureStorage _storage;
  final LocalAuthentication _localAuth;
  final EmployeeRepository _employeeRepo;
  final ApiClient _apiClient;

  AuthRepository({
    FlutterSecureStorage? storage,
    LocalAuthentication? localAuth,
    EmployeeRepository? employeeRepo,
    ApiClient? apiClient,
  })  : _storage = storage ?? const FlutterSecureStorage(),
        _localAuth = localAuth ?? LocalAuthentication(),
        _employeeRepo = employeeRepo ?? EmployeeRepository(),
        _apiClient = apiClient ?? ApiClient();

  static const String _keyToken = 'app_auth_token';
  static const String _keyUserCode = 'app_user_code';
  static const String _keyUserPass = 'app_user_pass';
  static const String _keyBiometricsEnabled = 'app_biometrics_enabled';
  static const String _keyCachedUserProfile = 'app_cached_user_profile';

  /// فك تشفير بيانات الموظف المحفوظة محلياً بسرعة فائقة دون انتظار الشبكة
  static UserModel? parseCachedUser(String? raw) {
    if (raw == null || raw.trim().isEmpty) return null;
    try {
      final decoded = jsonDecode(raw);
      if (decoded is Map<String, dynamic>) {
        return UserModel.fromMap(decoded);
      } else if (decoded is Map) {
        return UserModel.fromMap(Map<String, dynamic>.from(decoded));
      }
    } catch (_) {}
    return null;
  }

  /// استعادة الجلسة والملف الشخصي فورياً من الذاكرة المحلية (< 10ms)
  Future<UserModel?> tryRestoreSessionFast() async {
    try {
      final cachedJson = await _storage.read(key: _keyCachedUserProfile);
      final user = parseCachedUser(cachedJson);
      if (user != null && user.id.isNotEmpty) {
        return user;
      }
    } catch (_) {}
    return null;
  }

  Future<bool> isBiometricsSupported() async {
    try {
      final canCheck = await _localAuth.canCheckBiometrics;
      final isSupported = await _localAuth.isDeviceSupported();
      return canCheck || isSupported;
    } catch (_) {
      return false;
    }
  }

  Future<bool> authenticateBiometric() async {
    try {
      final isAvailable = await isBiometricsSupported();
      if (!isAvailable) return false;

      return await _localAuth.authenticate(
        localizedReason: 'يرجى تأكيد بصمة الإصبع للوصول إلى بوابتك الشخصية',
        biometricOnly: true,
        persistAcrossBackgrounding: true,
      );
    } catch (_) {
      return false;
    }
  }

  Future<UserModel> login({
    required String username,
    required String password,
    String role = 'auto',
  }) async {
    final userCode = username.trim();
    final userPass = password.trim();
    if (userCode.isEmpty) {
      throw Exception('يرجى إدخال كود الموظف أو اسم المستخدم');
    }
    if (userPass.isEmpty) {
      throw Exception('يرجى إدخال كلمة المرور');
    }

    // 1. التحقق الصارم من صحة الحساب وكلمة المرور عبر نقطة الدخول الرسمية
    try {
      final res = await _apiClient.post('/auth/login', data: {
        'username': userCode,
        'password': userPass,
        'role': 'auto',
      });

      final data = res.data;
      if (res.statusCode != 200 || data == null || data['success'] != true) {
        final errMsg = data?['error']?.toString() ?? 'بيانات الدخول غير صحيحة';
        throw Exception(errMsg);
      }

      final token = data['token']?.toString();
      if (token != null && token.isNotEmpty) {
        await _storage.write(key: 'jwt_token', value: token);
      }
    } on DioException catch (dioErr) {
      String msg = 'بيانات الدخول غير صحيحة: تأكد من كود الموظف وكلمة المرور';
      if (dioErr.response?.data is Map && dioErr.response?.data['error'] != null) {
        msg = dioErr.response!.data['error'].toString();
      }
      throw Exception(msg);
    }

    await _storage.write(key: _keyUserCode, value: userCode);
    await _storage.write(key: _keyUserPass, value: userPass);

    // 2. جلب البيانات المعتمدة الكاملة للموظف من السيرفر
    final snapshot = await _employeeRepo.fetchEmployeeData(employeeCode: userCode);
    try {
      await _storage.write(
        key: _keyCachedUserProfile,
        value: jsonEncode(snapshot.user.toMap()),
      );
    } catch (_) {}
    return snapshot.user;
  }

  Future<UserModel?> tryRestoreSession() async {
    // 1. استعادة سريعة وفورية من الكاش المحلي (Instant Restore < 10ms)
    final cached = await tryRestoreSessionFast();
    if (cached != null) return cached;

    // 2. محاولة الاستعادة من السيرفر إذا لم يتوفر الكاش
    try {
      final code = await _storage.read(key: _keyUserCode);
      if (code == null || code.trim().isEmpty) return null;
      final snapshot = await _employeeRepo
          .fetchEmployeeData(employeeCode: code.trim())
          .timeout(
            const Duration(seconds: 4),
            onTimeout: () => throw TimeoutException('استجابة السيرفر تجاوزت المهلة المحددة'),
          );
      if (snapshot.user.id.isNotEmpty) {
        await _storage.write(
          key: _keyCachedUserProfile,
          value: jsonEncode(snapshot.user.toMap()),
        );
        return snapshot.user;
      }
    } catch (_) {}
    return null;
  }

  Future<void> logout() async {
    await _storage.delete(key: _keyToken);
    await _storage.delete(key: _keyUserCode);
    await _storage.delete(key: _keyUserPass);
    await _storage.delete(key: _keyCachedUserProfile);
  }

  Future<String?> getStoredUserCode() async {
    return await _storage.read(key: _keyUserCode);
  }

  Future<bool> isBiometricsEnabled() async {
    final val = await _storage.read(key: _keyBiometricsEnabled);
    return val == 'true';
  }

  Future<void> setBiometricsEnabled(bool enabled) async {
    await _storage.write(key: _keyBiometricsEnabled, value: enabled ? 'true' : 'false');
  }
}
