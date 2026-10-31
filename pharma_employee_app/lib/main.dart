import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/constants/app_colors.dart';
import 'core/services/app_notification_service.dart';
import 'core/theme/app_theme.dart';
import 'core/theme/theme_provider.dart';
import 'presentation/providers/auth_provider.dart';
import 'presentation/screens/auth/login_screen.dart';
import 'presentation/screens/dashboard_screen.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // 🔔 تهيئة محرك الإشعارات وقنوات النظام
  await AppNotificationService.initialize();

  // 🛡️ حماية متقدمة ضد أخطاء المنصة غير المعالجة
  PlatformDispatcher.instance.onError = (error, stack) {
    debugPrint('🛡️ [GlobalErrorCatcher] تم استيعاب استثناء المنصة: $error');
    return true; // منع انهيار التطبيق
  };

  FlutterError.onError = (FlutterErrorDetails details) {
    debugPrint('🛡️ [FlutterError] ${details.exceptionAsString()}');
    FlutterError.presentError(details);
  };

  // 🛡️ شاشة استعادة تفاعلية ذكية ضد الشاشات الرمادية والبيضاء (Interactive Error Boundary)
  ErrorWidget.builder = (FlutterErrorDetails details) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      home: Scaffold(
        backgroundColor: const Color(0xFFF8FAFC),
        body: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(24.0),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    width: 72,
                    height: 72,
                    decoration: BoxDecoration(
                      color: const Color(0xFFFEE2E2),
                      borderRadius: BorderRadius.circular(22),
                      boxShadow: [
                        BoxShadow(
                          color: const Color(0xFFEF4444).withValues(alpha: 0.2),
                          blurRadius: 16,
                          offset: const Offset(0, 6),
                        ),
                      ],
                    ),
                    child: const Icon(
                      Icons.refresh_rounded,
                      color: Color(0xFFEF4444),
                      size: 38,
                    ),
                  ),
                  const SizedBox(height: 20),
                  const Text(
                    'جارٍ استعادة واجهة النظام...',
                    style: TextStyle(
                      fontSize: 17,
                      fontWeight: FontWeight.bold,
                      color: Color(0xFF0F172A),
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'تم استيعاب استثناء الواجهة بأمان لمنع إغلاق التطبيق.\nيمكنك العودة للرئيسية بنقرة واحدة.',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: 13,
                      color: Colors.grey.shade600,
                      height: 1.4,
                    ),
                  ),
                  const SizedBox(height: 24),
                  ElevatedButton.icon(
                    onPressed: () {
                      runApp(const ProviderScope(child: PharmaEmployeeApp()));
                    },
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppColors.primary,
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(
                        horizontal: 24,
                        vertical: 12,
                      ),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(14),
                      ),
                      elevation: 2,
                    ),
                    icon: const Icon(Icons.home_rounded, size: 20),
                    label: const Text(
                      'العودة للواجهة الرئيسية',
                      style: TextStyle(
                        fontWeight: FontWeight.bold,
                        fontSize: 14,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  };

  runApp(const ProviderScope(child: PharmaEmployeeApp()));
}

class PharmaEmployeeApp extends ConsumerWidget {
  const PharmaEmployeeApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final themeSettings = ref.watch(themeSettingsProvider);

    return MaterialApp(
      title: 'بوابة الموظف - إدارة الصيدليات',
      debugShowCheckedModeBanner: false,
      themeMode: themeSettings.themeMode, // الافتراضي هو ThemeMode.light
      theme: AppTheme.lightTheme,
      darkTheme: AppTheme.darkTheme,
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      supportedLocales: const [Locale('ar', 'EG')],
      locale: const Locale('ar', 'EG'),
      home: const AppAuthGate(),
    );
  }
}

class AppAuthGate extends ConsumerWidget {
  const AppAuthGate({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final authState = ref.watch(authProvider);

    if (authState.isCheckingSession) {
      final isDark = Theme.of(context).brightness == Brightness.dark;
      return Scaffold(
        backgroundColor: isDark
            ? AppColors.darkBackground
            : const Color(0xFFF8FAFC),
        body: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 76,
                height: 76,
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    colors: [AppColors.primary, AppColors.accentCyan],
                    begin: Alignment.topRight,
                    end: Alignment.bottomLeft,
                  ),
                  borderRadius: BorderRadius.circular(22),
                  boxShadow: [
                    BoxShadow(
                      color: AppColors.primary.withValues(alpha: 0.3),
                      blurRadius: 18,
                      offset: const Offset(0, 8),
                    ),
                  ],
                ),
                child: const Icon(
                  Icons.local_pharmacy_rounded,
                  color: Colors.white,
                  size: 40,
                ),
              ),
              const SizedBox(height: 24),
              const CircularProgressIndicator(color: AppColors.primary),
              const SizedBox(height: 16),
              Text(
                'جارٍ فتح بوابة الموظف الذكية...',
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.bold,
                  color: isDark ? Colors.white70 : const Color(0xFF64748B),
                ),
              ),
            ],
          ),
        ),
      );
    }

    if (authState.isAuthenticated && authState.user != null) {
      return DashboardScreen(user: authState.user!);
    }

    // الدخول مباشرة لشاشة تسجيل الدخول عند فتح التطبيق أول مرة أو عدم وجود جلسة
    return const LoginScreen();
  }
}
