import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:provider/provider.dart';
import '../main.dart';
import 'login_screen.dart';
import 'shifts_history_screen.dart';
import 'salaries_screen.dart';
import '../services/supabase_service.dart';
import 'dart:async';
import 'package:intl/intl.dart' hide TextDirection;

class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  String _empName = '';
  String _empId = '';
  int _currentIndex = 0;
  
  String _currentTime = '';
  Timer? _timer;

  bool _isLoading = true;
  bool _isPunchedIn = false;
  Map<String, dynamic> _appSettings = {};

  double _totalHours = 0;
  double _netSalary = 0;

  @override
  void initState() {
    super.initState();
    _startTimer();
    _loadEmpData();
  }

  void _startTimer() {
    _timer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (mounted) {
        setState(() {
          _currentTime = DateFormat('hh:mm:ss a').format(DateTime.now());
        });
      }
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _loadEmpData() async {
    final prefs = await SharedPreferences.getInstance();
    _empId = prefs.getString('loggedInEmpId') ?? '';
    _empName = prefs.getString('loggedInEmpName') ?? 'موظف';
    
    await _fetchData();
  }

  Future<void> _fetchData() async {
    setState(() => _isLoading = true);
    
    _appSettings = await SupabaseService.fetchAppSettings();
    
    if (_appSettings.isNotEmpty) {
      final activeShifts = _appSettings['activeShifts'] as Map<String, dynamic>? ?? {};
      _isPunchedIn = activeShifts.containsKey(_empId);

      _calculateStats();
    }
    
    if (mounted) setState(() => _isLoading = false);
  }

  void _calculateStats() {
    final employees = _appSettings['employees'] as List<dynamic>? ?? [];
    final emp = employees.firstWhere((e) => e['id'] == _empId, orElse: () => null);
    
    if (emp != null) {
      final allShifts = _appSettings['shifts'] as List<dynamic>? ?? [];
      final allAdjustments = _appSettings['adjustments'] as List<dynamic>? ?? [];

      final currentMonthPrefix = DateFormat('yyyy-MM').format(DateTime.now());

      final myShifts = allShifts.where((s) => s['employeeId'] == _empId && s['date'].toString().startsWith(currentMonthPrefix)).toList();
      final myAdjustments = allAdjustments.where((a) => (a['employeeId'] == _empId || a['employeeId'] == 'all') && a['date'].toString().startsWith(currentMonthPrefix)).toList();

      double salary = double.tryParse(emp['salary']?.toString() ?? '0') ?? 0;
      double workHoursPerDay = double.tryParse(emp['workHoursPerDay']?.toString() ?? '8') ?? 8;
      double workDaysPerMonth = double.tryParse(emp['workDaysPerMonth']?.toString() ?? '26') ?? 26;

      double dailyRate = workDaysPerMonth > 0 ? (workHoursPerDay * salary) / workDaysPerMonth : 0;
      double rate = workHoursPerDay > 0 ? dailyRate / workHoursPerDay : 0;

      _totalHours = myShifts.fold(0.0, (sum, s) => sum + (double.tryParse(s['hours']?.toString() ?? '0') ?? 0));
      double baseEarnings = _totalHours * rate;

      double totalBonus = myAdjustments.where((a) => a['type'] == 'bonus').fold(0.0, (sum, a) => sum + (double.tryParse(a['amount']?.toString() ?? '0') ?? 0));
      double totalDeduction = myAdjustments.where((a) => a['type'] == 'deduction').fold(0.0, (sum, a) => sum + (double.tryParse(a['amount']?.toString() ?? '0') ?? 0));

      _netSalary = baseEarnings + totalBonus - totalDeduction;
    }
  }

  Future<void> _handlePunch() async {
    setState(() => _isLoading = true);
    // Re-fetch to avoid conflicts
    _appSettings = await SupabaseService.fetchAppSettings();
    Map<String, dynamic> activeShifts = Map<String, dynamic>.from(_appSettings['activeShifts'] ?? {});
    List<dynamic> shifts = List<dynamic>.from(_appSettings['shifts'] ?? []);
    
    final now = DateTime.now();
    final dateStr = DateFormat('yyyy-MM-dd').format(now);
    final timeStr = DateFormat('HH:mm').format(now);

    if (_isPunchedIn) {
      // Punch Out
      final activeShift = activeShifts[_empId];
      if (activeShift != null) {
        String timeIn = activeShift['timeIn'];
        
        // Calculate hours
        final partsIn = timeIn.split(':');
        final partsOut = timeStr.split(':');
        int inH = int.parse(partsIn[0]);
        int inM = int.parse(partsIn[1]);
        int outH = int.parse(partsOut[0]);
        int outM = int.parse(partsOut[1]);
        
        int start = inH * 60 + inM;
        int end = outH * 60 + outM;
        if (end <= start) end += 24 * 60;
        
        double totalHours = (end - start) / 60.0;
        totalHours = double.parse(totalHours.toStringAsFixed(2));

        shifts.add({
          'id': 'shift_\${DateTime.now().millisecondsSinceEpoch}',
          'employeeId': _empId,
          'date': activeShift['date'] ?? dateStr,
          'timeIn': timeIn,
          'timeOut': timeStr,
          'hours': totalHours,
          'breakHours': 0,
          'note': 'تم التسجيل بواسطة التطبيق'
        });
      }
      activeShifts.remove(_empId);
      _isPunchedIn = false;
      
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('تم تسجيل الانصراف بنجاح')));
      }
    } else {
      // Punch In
      activeShifts[_empId] = {
        'date': dateStr,
        'timeIn': timeStr,
        'isPaused': false,
        'since': now.toIso8601String(),
      };
      _isPunchedIn = true;

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('تم تسجيل الحضور بنجاح')));
      }
    }

    _appSettings['activeShifts'] = activeShifts;
    _appSettings['shifts'] = shifts;
    
    await SupabaseService.updateAppSettings(_appSettings);
    _calculateStats();
    
    if (mounted) setState(() => _isLoading = false);
  }

  Future<void> _logout() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('loggedInEmpId');
    await prefs.remove('loggedInEmpName');
    
    if (!mounted) return;
    Navigator.pushReplacement(
      context,
      MaterialPageRoute(builder: (_) => const LoginScreen()),
    );
  }

  Widget _buildDashboardContent(BuildContext context, ThemeProvider themeProvider) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Welcome Card
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16.0),
              child: Row(
                children: [
                  CircleAvatar(
                    radius: 30,
                    backgroundColor: Theme.of(context).primaryColor.withOpacity(0.2),
                    child: Icon(Icons.person, size: 40, color: Theme.of(context).primaryColor),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'مرحباً بك،',
                          style: TextStyle(color: Colors.grey[600], fontSize: 14),
                        ),
                        Text(
                          _empName,
                          style: const TextStyle(
                            fontSize: 20,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
          
          const SizedBox(height: 24),
          
          // Live Clock Section
          Container(
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(
              color: Theme.of(context).primaryColor.withOpacity(0.1),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: Theme.of(context).primaryColor.withOpacity(0.3)),
            ),
            child: Column(
              children: [
                const Text('الوقت الحالي', style: TextStyle(fontSize: 16)),
                const SizedBox(height: 8),
                Text(
                  _currentTime,
                  style: TextStyle(
                    fontSize: 40,
                    fontWeight: FontWeight.bold,
                    color: Theme.of(context).primaryColor,
                  ),
                  textDirection: TextDirection.ltr,
                ),
                const SizedBox(height: 16),
                _isLoading
                    ? const CircularProgressIndicator()
                    : ElevatedButton.icon(
                        onPressed: _handlePunch,
                        icon: Icon(_isPunchedIn ? Icons.exit_to_app : Icons.fingerprint, size: 28),
                        label: Text(
                          _isPunchedIn ? 'تسجيل انصراف' : 'تسجيل حضور', 
                          style: const TextStyle(fontSize: 18)
                        ),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: _isPunchedIn ? Colors.red : Theme.of(context).primaryColor,
                          padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 16),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(30)),
                        ),
                      ),
              ],
            ),
          ),
          
          const SizedBox(height: 24),
          
          // Stats Grid
          GridView.count(
            crossAxisCount: 2,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            crossAxisSpacing: 16,
            mainAxisSpacing: 16,
            childAspectRatio: 1.5,
            children: [
              _buildStatCard(context, 'ساعات العمل', '\${_totalHours.toStringAsFixed(2)}', Icons.timer),
              _buildStatCard(context, 'الصافي', '\${_netSalary.toStringAsFixed(2)} ج.م', Icons.account_balance_wallet),
            ],
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final themeProvider = Provider.of<ThemeProvider>(context);

    final List<Widget> pages = [
      _buildDashboardContent(context, themeProvider),
      const ShiftsHistoryScreen(),
      const SalariesScreen(), // Replace Adjustments with Salaries
    ];

    return Scaffold(
      appBar: _currentIndex == 0 ? AppBar(
        title: const Text('بوابة الموظف', style: TextStyle(fontWeight: FontWeight.bold)),
        actions: [
          IconButton(
            icon: Icon(themeProvider.isDarkMode ? Icons.light_mode : Icons.dark_mode),
            onPressed: () {
              themeProvider.toggleTheme();
            },
          ),
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _fetchData,
          ),
          IconButton(
            icon: const Icon(Icons.logout),
            onPressed: _logout,
          ),
        ],
      ) : null,
      body: pages[_currentIndex],
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: _currentIndex,
        onTap: (index) {
          setState(() {
            _currentIndex = index;
          });
        },
        items: const [
          BottomNavigationBarItem(icon: Icon(Icons.dashboard), label: 'الرئيسية'),
          BottomNavigationBarItem(icon: Icon(Icons.history), label: 'الورديات'),
          BottomNavigationBarItem(icon: Icon(Icons.attach_money), label: 'المرتبات'),
        ],
      ),
    );
  }

  Widget _buildStatCard(BuildContext context, String title, String value, IconData icon) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12.0),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, color: Theme.of(context).primaryColor),
            const SizedBox(height: 8),
            Text(title, style: TextStyle(fontSize: 12, color: Colors.grey[600])),
            Text(
              value,
              style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
              textDirection: TextDirection.ltr,
            ),
          ],
        ),
      ),
    );
  }
}
