import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pharma_employee_app/main.dart';
import 'package:pharma_employee_app/presentation/screens/auth/login_screen.dart';

void main() {
  testWidgets(
    'PharmaEmployeeApp launches securely into AppAuthGate and splash screen',
    (WidgetTester tester) async {
      await tester.pumpWidget(const ProviderScope(child: PharmaEmployeeApp()));
      await tester.pump();

      // Verify that launch renders system gate with employee portal splash
      expect(find.textContaining('بوابة الموظف'), findsOneWidget);
    },
  );

  testWidgets(
    'LoginScreen renders login form elements securely',
    (WidgetTester tester) async {
      await tester.pumpWidget(
        const ProviderScope(
          child: MaterialApp(
            home: LoginScreen(),
          ),
        ),
      );
      await tester.pump();

      expect(find.textContaining('تسجيل الدخول'), findsWidgets);
    },
  );
}
