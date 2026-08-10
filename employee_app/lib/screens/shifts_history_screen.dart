import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../services/supabase_service.dart';
import 'package:intl/intl.dart';

class ShiftsHistoryScreen extends StatefulWidget {
  const ShiftsHistoryScreen({super.key});

  @override
  State<ShiftsHistoryScreen> createState() => _ShiftsHistoryScreenState();
}

class _ShiftsHistoryScreenState extends State<ShiftsHistoryScreen> {
  String _filterMode = 'month'; // 'month' or 'range'
  String _rangeStart = '';
  String _rangeEnd = '';
  
  bool _isLoading = true;
  String _empId = '';
  List<dynamic> _allShifts = [];
  List<dynamic> _filteredShifts = [];

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    final prefs = await SharedPreferences.getInstance();
    _empId = prefs.getString('loggedInEmpId') ?? '';
    if (_empId.isEmpty) return;

    final settings = await SupabaseService.fetchAppSettings();
    if (settings.isNotEmpty) {
      final shifts = settings['shifts'] as List<dynamic>? ?? [];
      _allShifts = shifts.where((s) => s['employeeId'] == _empId).toList();
    }
    
    _applyFilter();
  }

  void _applyFilter() {
    setState(() {
      _isLoading = false;
      if (_filterMode == 'month') {
        final currentMonthPrefix = DateFormat('yyyy-MM').format(DateTime.now());
        _filteredShifts = _allShifts.where((s) => s['date'].toString().startsWith(currentMonthPrefix)).toList();
      } else {
        if (_rangeStart.isNotEmpty && _rangeEnd.isNotEmpty) {
          _filteredShifts = _allShifts.where((s) {
            final d = s['date'].toString();
            return d.compareTo(_rangeStart) >= 0 && d.compareTo(_rangeEnd) <= 0;
          }).toList();
        } else {
          _filteredShifts = List.from(_allShifts);
        }
      }
      
      // Sort descending by date
      _filteredShifts.sort((a, b) => b['date'].toString().compareTo(a['date'].toString()));
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('سجل الورديات'),
      ),
      body: Column(
        children: [
          // Filter Section
          Container(
            padding: const EdgeInsets.all(16),
            color: Theme.of(context).cardColor,
            child: Column(
              children: [
                Row(
                  children: [
                    const Icon(Icons.calendar_month, color: Colors.grey),
                    const SizedBox(width: 8),
                    const Text('تصفية الفترة:', style: TextStyle(fontWeight: FontWeight.bold)),
                    const SizedBox(width: 16),
                    Expanded(
                      child: DropdownButtonFormField<String>(
                        value: _filterMode,
                        decoration: const InputDecoration(
                          contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                          border: OutlineInputBorder(),
                        ),
                        items: const [
                          DropdownMenuItem(value: 'month', child: Text('الشهر الحالي')),
                          DropdownMenuItem(value: 'range', child: Text('فترة مخصصة')),
                        ],
                        onChanged: (val) {
                          if (val != null) {
                            _filterMode = val;
                            _applyFilter();
                          }
                        },
                      ),
                    ),
                  ],
                ),
                if (_filterMode == 'range') ...[
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      Expanded(
                        child: TextFormField(
                          readOnly: true,
                          decoration: const InputDecoration(labelText: 'من تاريخ', border: OutlineInputBorder()),
                          onTap: () async {
                            final date = await showDatePicker(
                              context: context,
                              initialDate: DateTime.now(),
                              firstDate: DateTime(2020),
                              lastDate: DateTime(2030),
                            );
                            if (date != null) {
                              _rangeStart = date.toIso8601String().split('T')[0];
                              _applyFilter();
                            }
                          },
                          controller: TextEditingController(text: _rangeStart),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: TextFormField(
                          readOnly: true,
                          decoration: const InputDecoration(labelText: 'إلى تاريخ', border: OutlineInputBorder()),
                          onTap: () async {
                            final date = await showDatePicker(
                              context: context,
                              initialDate: DateTime.now(),
                              firstDate: DateTime(2020),
                              lastDate: DateTime(2030),
                            );
                            if (date != null) {
                              _rangeEnd = date.toIso8601String().split('T')[0];
                              _applyFilter();
                            }
                          },
                          controller: TextEditingController(text: _rangeEnd),
                        ),
                      ),
                    ],
                  ),
                ],
              ],
            ),
          ),
          
          const Divider(height: 1),
          
          // Shifts List
          Expanded(
            child: _isLoading 
                ? const Center(child: CircularProgressIndicator())
                : _filteredShifts.isEmpty
                    ? const Center(child: Text('لا توجد ورديات مسجلة'))
                    : ListView.builder(
                        padding: const EdgeInsets.all(16),
                        itemCount: _filteredShifts.length,
                        itemBuilder: (context, index) {
                          final shift = _filteredShifts[index];
                          return Card(
                            margin: const EdgeInsets.only(bottom: 12),
                            child: ListTile(
                              leading: CircleAvatar(
                                backgroundColor: Theme.of(context).primaryColor.withOpacity(0.1),
                                child: Icon(Icons.work_history, color: Theme.of(context).primaryColor),
                              ),
                              title: Text("وردية - \${shift['date']}"),
                              subtitle: Text("حضور: \${shift['timeIn']} | انصراف: \${shift['timeOut']}"),
                              trailing: Text(
                                "\${shift['hours']} ساعة",
                                style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
                              ),
                            ),
                          );
                        },
                      ),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () {
          // Manual shift logic typically restricted to admin, but if allowed can be added here
          ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('إضافة الوردية اليدوية متوفرة في لوحة الإدارة')));
        },
        icon: const Icon(Icons.add),
        label: const Text('إضافة وردية يدوية'),
      ),
    );
  }
}
