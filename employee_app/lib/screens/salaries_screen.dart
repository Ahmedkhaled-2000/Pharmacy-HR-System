import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../services/supabase_service.dart';
import 'package:intl/intl.dart' hide TextDirection;
import 'package:excel/excel.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';
import 'dart:io';

class SalariesScreen extends StatefulWidget {
  const SalariesScreen({super.key});

  @override
  State<SalariesScreen> createState() => _SalariesScreenState();
}

class _SalariesScreenState extends State<SalariesScreen> {
  bool _isLoading = true;
  String _empId = '';
  
  double _totalHours = 0;
  double _baseEarnings = 0;
  double _totalBonus = 0;
  double _totalDeduction = 0;
  double _netSalary = 0;

  List<dynamic> _shifts = [];
  List<dynamic> _adjustments = [];

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
    if (settings.isEmpty) {
      if (mounted) setState(() => _isLoading = false);
      return;
    }

    final employees = settings['employees'] as List<dynamic>? ?? [];
    final emp = employees.firstWhere((e) => e['id'] == _empId, orElse: () => null);
    
    if (emp == null) {
      if (mounted) setState(() => _isLoading = false);
      return;
    }

    final allShifts = settings['shifts'] as List<dynamic>? ?? [];
    final allAdjustments = settings['adjustments'] as List<dynamic>? ?? [];

    final currentMonthPrefix = DateFormat('yyyy-MM').format(DateTime.now());

    _shifts = allShifts.where((s) => s['employeeId'] == _empId && s['date'].toString().startsWith(currentMonthPrefix)).toList();
    _adjustments = allAdjustments.where((a) => (a['employeeId'] == _empId || a['employeeId'] == 'all') && a['date'].toString().startsWith(currentMonthPrefix)).toList();

    double salary = double.tryParse(emp['salary']?.toString() ?? '0') ?? 0;
    double workHoursPerDay = double.tryParse(emp['workHoursPerDay']?.toString() ?? '8') ?? 8;
    double workDaysPerMonth = double.tryParse(emp['workDaysPerMonth']?.toString() ?? '26') ?? 26;

    double dailyRate = workDaysPerMonth > 0 ? (workHoursPerDay * salary) / workDaysPerMonth : 0;
    double rate = workHoursPerDay > 0 ? dailyRate / workHoursPerDay : 0;

    _totalHours = _shifts.fold(0.0, (sum, s) => sum + (double.tryParse(s['hours']?.toString() ?? '0') ?? 0));
    _baseEarnings = _totalHours * rate;

    _totalBonus = _adjustments.where((a) => a['type'] == 'bonus').fold(0.0, (sum, a) => sum + (double.tryParse(a['amount']?.toString() ?? '0') ?? 0));
    _totalDeduction = _adjustments.where((a) => a['type'] == 'deduction').fold(0.0, (sum, a) => sum + (double.tryParse(a['amount']?.toString() ?? '0') ?? 0));

    _netSalary = _baseEarnings + _totalBonus - _totalDeduction;

    if (mounted) setState(() => _isLoading = false);
  }

  Future<void> _exportToExcel() async {
    try {
      var excel = Excel.createExcel();
      Sheet sheetObject = excel['Sheet1'];
      excel.setDefaultSheet('Sheet1');
      
      final titleStyle = CellStyle(
        bold: true,
        horizontalAlign: HorizontalAlign.Center,
        fontSize: 14,
      );
      final headerStyle = CellStyle(
        bold: true,
        horizontalAlign: HorizontalAlign.Center,
        backgroundColorHex: ExcelColor.fromHexString('#E0E0E0'),
      );

      // Title
      var cell = sheetObject.cell(CellIndex.indexByString("A1"));
      cell.value = TextCellValue("تقرير المرتب لشهر \${DateFormat('yyyy-MM').format(DateTime.now())}");
      cell.cellStyle = titleStyle;

      // Summary
      sheetObject.cell(CellIndex.indexByString("A3")).value = TextCellValue("إجمالي الساعات");
      sheetObject.cell(CellIndex.indexByString("B3")).value = DoubleCellValue(_totalHours);
      
      sheetObject.cell(CellIndex.indexByString("A4")).value = TextCellValue("المستحقات الأساسية");
      sheetObject.cell(CellIndex.indexByString("B4")).value = DoubleCellValue(_baseEarnings);

      sheetObject.cell(CellIndex.indexByString("A5")).value = TextCellValue("إجمالي المكافآت");
      sheetObject.cell(CellIndex.indexByString("B5")).value = DoubleCellValue(_totalBonus);

      sheetObject.cell(CellIndex.indexByString("A6")).value = TextCellValue("إجمالي الخصومات");
      sheetObject.cell(CellIndex.indexByString("B6")).value = DoubleCellValue(_totalDeduction);

      sheetObject.cell(CellIndex.indexByString("A7")).value = TextCellValue("صافي المرتب");
      sheetObject.cell(CellIndex.indexByString("B7")).value = DoubleCellValue(_netSalary);

      // Header Shifts
      sheetObject.cell(CellIndex.indexByString("A9")).value = TextCellValue("التاريخ");
      sheetObject.cell(CellIndex.indexByString("B9")).value = TextCellValue("دخول");
      sheetObject.cell(CellIndex.indexByString("C9")).value = TextCellValue("خروج");
      sheetObject.cell(CellIndex.indexByString("D9")).value = TextCellValue("ساعات");
      sheetObject.cell(CellIndex.indexByString("A9")).cellStyle = headerStyle;
      sheetObject.cell(CellIndex.indexByString("B9")).cellStyle = headerStyle;
      sheetObject.cell(CellIndex.indexByString("C9")).cellStyle = headerStyle;
      sheetObject.cell(CellIndex.indexByString("D9")).cellStyle = headerStyle;

      int row = 10;
      for (var shift in _shifts) {
        sheetObject.cell(CellIndex.indexByColumnRow(columnIndex: 0, rowIndex: row)).value = TextCellValue(shift['date']?.toString() ?? '');
        sheetObject.cell(CellIndex.indexByColumnRow(columnIndex: 1, rowIndex: row)).value = TextCellValue(shift['timeIn']?.toString() ?? '');
        sheetObject.cell(CellIndex.indexByColumnRow(columnIndex: 2, rowIndex: row)).value = TextCellValue(shift['timeOut']?.toString() ?? '');
        sheetObject.cell(CellIndex.indexByColumnRow(columnIndex: 3, rowIndex: row)).value = DoubleCellValue(double.tryParse(shift['hours']?.toString() ?? '0') ?? 0);
        row++;
      }

      var fileBytes = excel.save();
      final directory = await getTemporaryDirectory();
      final filePath = "\${directory.path}/Salary_Report_\${_empId}.xlsx";
      
      File(filePath)
        ..createSync(recursive: true)
        ..writeAsBytesSync(fileBytes!);

      await Share.shareXFiles([XFile(filePath)], text: 'تقرير المرتب');

    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('حدث خطأ أثناء تصدير الإكسيل')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) {
      return const Center(child: CircularProgressIndicator());
    }

    return SingleChildScrollView(
      padding: const EdgeInsets.all(16.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text(
            'ملخص المرتب (الشهر الحالي)',
            style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 16),
          _buildSummaryCard(),
          const SizedBox(height: 24),
          ElevatedButton.icon(
            onPressed: _exportToExcel,
            icon: const Icon(Icons.download),
            label: const Text('تصدير إلى Excel'),
            style: ElevatedButton.styleFrom(
              padding: const EdgeInsets.symmetric(vertical: 16),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSummaryCard() {
    return Card(
      elevation: 4,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          children: [
            _buildRow('إجمالي الساعات:', '\${_totalHours.toStringAsFixed(2)} ساعة', Colors.black87),
            const Divider(),
            _buildRow('المستحقات الأساسية:', '\${_baseEarnings.toStringAsFixed(2)} ج.م', Colors.blue),
            const Divider(),
            _buildRow('إجمالي المكافآت:', '+ \${_totalBonus.toStringAsFixed(2)} ج.م', Colors.green),
            const Divider(),
            _buildRow('إجمالي الخصومات:', '- \${_totalDeduction.toStringAsFixed(2)} ج.م', Colors.red),
            const Divider(thickness: 2),
            _buildRow('صافي المرتب:', '\${_netSalary.toStringAsFixed(2)} ج.م', Theme.of(context).primaryColor, isBold: true),
          ],
        ),
      ),
    );
  }

  Widget _buildRow(String label, String value, Color color, {bool isBold = false}) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8.0),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            label,
            style: TextStyle(
              fontSize: isBold ? 18 : 16,
              fontWeight: isBold ? FontWeight.bold : FontWeight.normal,
            ),
          ),
          Text(
            value,
            style: TextStyle(
              fontSize: isBold ? 18 : 16,
              fontWeight: FontWeight.bold,
              color: color,
            ),
            textDirection: TextDirection.ltr,
          ),
        ],
      ),
    );
  }
}
