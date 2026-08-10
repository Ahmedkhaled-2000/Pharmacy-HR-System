import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../services/supabase_service.dart';
import 'dashboard_screen.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _codeController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _isLoading = false;
  String _errorMessage = '';
  String? _logoUrl;

  @override
  void initState() {
    super.initState();
    _loadLogo();
  }

  Future<void> _loadLogo() async {
    final prefs = await SharedPreferences.getInstance();
    setState(() {
      _logoUrl = prefs.getString('orgLogoUrl');
    });
  }

  Future<void> _login() async {
    final code = _codeController.text.trim();
    final password = _passwordController.text.trim();

    if (code.isEmpty || password.isEmpty) {
      setState(() => _errorMessage = 'يرجى إدخال الكود وكلمة المرور');
      return;
    }

    setState(() {
      _isLoading = true;
      _errorMessage = '';
    });

    try {
      final settings = await SupabaseService.fetchAppSettings();
      final employees = settings['employees'] as List<dynamic>? ?? [];
      
      final employee = employees.firstWhere(
        (emp) => emp['code'].toString() == code && emp['password'].toString() == password,
        orElse: () => null,
      );
      
      if (employee != null) {
        final prefs = await SharedPreferences.getInstance();
        await prefs.setString('loggedInEmpId', employee['id'].toString());
        await prefs.setString('loggedInEmpName', employee['name'].toString());
        
        if (!mounted) return;
        Navigator.pushReplacement(
          context,
          MaterialPageRoute(builder: (_) => const DashboardScreen()),
        );
      } else {
        setState(() => _errorMessage = 'بيانات الدخول غير صحيحة');
      }
    } catch (e) {
      setState(() => _errorMessage = 'حدث خطأ في الاتصال بالخادم');
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24.0),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              _logoUrl != null && _logoUrl!.isNotEmpty
                  ? Image.network(
                      _logoUrl!,
                      height: 100,
                      errorBuilder: (context, error, stackTrace) => Icon(
                        Icons.account_circle,
                        size: 80,
                        color: Theme.of(context).primaryColor,
                      ),
                    )
                  : Icon(
                      Icons.account_circle,
                      size: 80,
                      color: Theme.of(context).primaryColor,
                    ),
              const SizedBox(height: 16),
              Text(
                'تسجيل الدخول',
                style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                  fontWeight: FontWeight.bold,
                  color: Theme.of(context).primaryColor,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                'الرجاء إدخال كود الموظف وكلمة المرور',
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: Colors.grey[600],
                ),
              ),
              const SizedBox(height: 32),
              
              if (_errorMessage.isNotEmpty)
                Container(
                  padding: const EdgeInsets.all(12),
                  margin: const EdgeInsets.only(bottom: 16),
                  decoration: BoxDecoration(
                    color: Colors.red.shade50,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: Colors.red.shade200),
                  ),
                  child: Row(
                    children: [
                      Icon(Icons.error_outline, color: Colors.red.shade700),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          _errorMessage,
                          style: TextStyle(color: Colors.red.shade700),
                        ),
                      ),
                    ],
                  ),
                ),

              TextField(
                controller: _codeController,
                decoration: InputDecoration(
                  labelText: 'كود الموظف',
                  prefixIcon: const Icon(Icons.badge),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
                keyboardType: TextInputType.number,
              ),
              const SizedBox(height: 16),
              TextField(
                controller: _passwordController,
                obscureText: true,
                decoration: InputDecoration(
                  labelText: 'كلمة المرور',
                  prefixIcon: const Icon(Icons.lock),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
              ),
              const SizedBox(height: 32),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: _isLoading ? null : _login,
                  child: _isLoading
                      ? const SizedBox(
                          height: 20,
                          width: 20,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                          ),
                        )
                      : const Text(
                          'تسجيل الدخول',
                          style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                        ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
