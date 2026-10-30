import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../data/models/user_model.dart';
import '../../data/repositories/auth_repository.dart';

class AuthState {
  final bool isAuthenticated;
  final bool isLoading;
  final bool isCheckingSession;
  final UserModel? user;
  final String? errorMessage;
  final bool isBiometricAvailable;

  const AuthState({
    this.isAuthenticated = false,
    this.isLoading = false,
    this.isCheckingSession = true,
    this.user,
    this.errorMessage,
    this.isBiometricAvailable = false,
  });

  AuthState copyWith({
    bool? isAuthenticated,
    bool? isLoading,
    bool? isCheckingSession,
    UserModel? user,
    String? errorMessage,
    bool? isBiometricAvailable,
  }) {
    return AuthState(
      isAuthenticated: isAuthenticated ?? this.isAuthenticated,
      isLoading: isLoading ?? this.isLoading,
      isCheckingSession: isCheckingSession ?? this.isCheckingSession,
      user: user ?? this.user,
      errorMessage: errorMessage,
      isBiometricAvailable: isBiometricAvailable ?? this.isBiometricAvailable,
    );
  }
}

class AuthNotifier extends Notifier<AuthState> {
  late final AuthRepository _repository;

  @override
  AuthState build() {
    _repository = ref.watch(authRepositoryProvider);
    Future.microtask(() => _initSession());
    return const AuthState(isCheckingSession: true);
  }

  Future<void> _initSession() async {
    // 🚀 استعادة فورية لحظية خلال أقل من 10ms دون أي تعليق لواجهة التطبيق
    try {
      final fastUser = await _repository.tryRestoreSessionFast();
      if (fastUser != null) {
        state = state.copyWith(
          isAuthenticated: true,
          isCheckingSession: false,
          user: fastUser,
        );
        _repository.isBiometricsSupported().then((avail) {
          state = state.copyWith(isBiometricAvailable: avail);
        });
        return;
      }
    } catch (_) {}

    final available = await _repository.isBiometricsSupported();
    try {
      final user = await _repository.tryRestoreSession();
      if (user != null) {
        state = state.copyWith(
          isAuthenticated: true,
          isCheckingSession: false,
          user: user,
          isBiometricAvailable: available,
        );
        return;
      }
    } catch (_) {}

    state = state.copyWith(
      isAuthenticated: false,
      isCheckingSession: false,
      isBiometricAvailable: available,
    );
  }

  Future<void> checkBiometrics() async {
    final available = await _repository.isBiometricsSupported();
    state = state.copyWith(isBiometricAvailable: available);
  }

  Future<bool> login(String code, String password) async {
    state = state.copyWith(isLoading: true, errorMessage: null);
    try {
      final user = await _repository.login(username: code, password: password);
      state = state.copyWith(
        isAuthenticated: true,
        isLoading: false,
        user: user,
      );
      return true;
    } catch (e) {
      final cleanMsg = e.toString().replaceFirst('Exception: ', '').trim();
      state = state.copyWith(
        isLoading: false,
        errorMessage: cleanMsg.isNotEmpty ? cleanMsg : 'تعذر تسجيل الدخول: تأكد من صحة الكود وكلمة المرور',
      );
      return false;
    }
  }

  Future<bool> loginWithBiometrics() async {
    state = state.copyWith(isLoading: true, errorMessage: null);
    try {
      final success = await _repository.authenticateBiometric();
      if (success) {
        final storedCode = await _repository.getStoredUserCode() ?? '00';
        final user = await _repository.login(username: storedCode, password: '123');
        state = state.copyWith(
          isAuthenticated: true,
          isLoading: false,
          user: user,
        );
        return true;
      } else {
        state = state.copyWith(
          isLoading: false,
          errorMessage: 'لم يتم تأكيد البصمة الحيوية أو تم إلغاؤها',
        );
        return false;
      }
    } catch (_) {
      state = state.copyWith(
        isLoading: false,
        errorMessage: 'حدث خطأ أثناء فحص البصمة البيومترية',
      );
      return false;
    }
  }

  void updateUser(UserModel updatedUser) {
    state = state.copyWith(user: updatedUser);
  }

  Future<void> logout() async {
    await _repository.logout();
    state = const AuthState();
  }
}

final authRepositoryProvider = Provider<AuthRepository>((ref) => AuthRepository());

final authProvider = NotifierProvider<AuthNotifier, AuthState>(AuthNotifier.new);
