import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../services/supabase_service.dart';
import 'login_screen.dart';
import 'dashboard_screen.dart';

class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen> with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _fadeAnimation;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      duration: const Duration(seconds: 2),
      vsync: this,
    );
    _fadeAnimation = Tween<double>(begin: 0.0, end: 1.0).animate(_controller);
    
    _controller.forward();
    
    _checkLoginStatus();
  }

  Future<void> _checkLoginStatus() async {
    // Wait for animation briefly
    await Future.delayed(const Duration(seconds: 1));
    
    // Fetch settings from Supabase
    final settings = await SupabaseService.fetchAppSettings();
    final prefs = await SharedPreferences.getInstance();
    
    if (settings.isNotEmpty && settings['orgSettings'] != null) {
      final logoUrl = settings['orgSettings']['logoUrl']?.toString();
      if (logoUrl != null && logoUrl.isNotEmpty) {
        await prefs.setString('orgLogoUrl', logoUrl);
      }
    }

    if (!mounted) return;
    
    final loggedInEmpId = prefs.getString('loggedInEmpId');
    
    if (loggedInEmpId != null && loggedInEmpId.isNotEmpty) {
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(builder: (_) => const DashboardScreen()),
      );
    } else {
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(builder: (_) => const LoginScreen()),
      );
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Theme.of(context).primaryColor,
      body: Center(
        child: FadeTransition(
          opacity: _fadeAnimation,
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(
                Icons.medical_services_rounded,
                size: 100,
                color: Colors.white,
              ),
              const SizedBox(height: 20),
              Text(
                'بوابة الموظفين',
                style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                  color: Colors.white,
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: 10),
              const CircularProgressIndicator(
                valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
