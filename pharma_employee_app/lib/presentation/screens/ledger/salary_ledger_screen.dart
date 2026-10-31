import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/services/period_cycle_service.dart';
import '../../../core/services/attendance_pdf_service.dart';
import '../../../data/models/attendance_model.dart';
import '../../../data/models/salary_slip_model.dart';
import '../../../data/models/request_models.dart';
import '../../../data/models/user_model.dart';
import '../../providers/auth_provider.dart';
import '../../providers/employee_data_provider.dart';

class SalaryLedgerScreen extends ConsumerStatefulWidget {
  const SalaryLedgerScreen({super.key});

  @override
  ConsumerState<SalaryLedgerScreen> createState() => _SalaryLedgerScreenState();
}

class _SalaryLedgerScreenState extends ConsumerState<SalaryLedgerScreen> {
  late String _selectedMonth;

  @override
  void initState() {
    super.initState();
    final now = DateTime.now();
    _selectedMonth = '${now.year}-${now.month.toString().padLeft(2, '0')}';
  }

  void _showOfficialPayslipSheet(
    SalarySlipModel slip,
    UserModel? user,
    List<AttendanceRecord> records,
  ) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final employeeName = user?.name ?? 'الموظف';
    final employeeCode = user?.code ?? '';
    final jobTitle = user?.jobTitle ?? '';

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) {
        return Container(
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            color:
                Theme.of(context).cardTheme.color ??
                (isDark ? AppColors.darkSurface : Colors.white),
            borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              // رأس المستند الرسمي
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.all(8),
                        decoration: BoxDecoration(
                          color: AppColors.primary.withValues(alpha: 0.15),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: const Icon(
                          Icons.local_pharmacy_rounded,
                          color: AppColors.primary,
                          size: 24,
                        ),
                      ),
                      const SizedBox(width: 10),
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            'مجموعة إدارة الصيدليات الموحدة',
                            style: TextStyle(
                              fontWeight: FontWeight.bold,
                              fontSize: 13,
                            ),
                          ),
                          Text(
                            'مسير الرواتب والأجور المعتمد رسمياً',
                            style: TextStyle(
                              fontSize: 10,
                              color: isDark
                                  ? Colors.grey
                                  : const Color(0xFF64748B),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: 4,
                    ),
                    decoration: BoxDecoration(
                      color: AppColors.primary.withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(
                        color: AppColors.primary.withValues(alpha: 0.3),
                      ),
                    ),
                    child: const Text(
                      'معتمد إلكترونياً ✅',
                      style: TextStyle(
                        color: AppColors.primary,
                        fontWeight: FontWeight.bold,
                        fontSize: 11,
                      ),
                    ),
                  ),
                ],
              ),
              const Divider(height: 24),

              // بيانات الموظف
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: isDark
                      ? Colors.black.withValues(alpha: 0.25)
                      : const Color(0xFFF8FAFC),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(
                    color: isDark
                        ? AppColors.darkBorder
                        : const Color(0xFFE2E8F0),
                  ),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'اسم الموظف: $employeeName',
                          style: const TextStyle(
                            fontWeight: FontWeight.bold,
                            fontSize: 12,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          'الوظيفة: $jobTitle • كود: $employeeCode',
                          style: const TextStyle(
                            fontSize: 11,
                            color: Colors.grey,
                          ),
                        ),
                      ],
                    ),
                    Text(
                      'دورة: ${slip.month}',
                      style: const TextStyle(
                        fontWeight: FontWeight.bold,
                        fontSize: 12,
                        color: AppColors.primary,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 14),

              // جدول الاستحقاقات والاستقطاعات
              Table(
                border: TableBorder.all(
                  color: isDark
                      ? AppColors.darkBorder
                      : const Color(0xFFE2E8F0),
                  width: 1,
                  borderRadius: BorderRadius.circular(8),
                ),
                children: [
                  TableRow(
                    decoration: BoxDecoration(
                      color: isDark
                          ? Colors.black.withValues(alpha: 0.2)
                          : const Color(0xFFF1F5F9),
                    ),
                    children: const [
                      Padding(
                        padding: EdgeInsets.all(8),
                        child: Text(
                          'بند الاستحقاق',
                          style: TextStyle(
                            fontWeight: FontWeight.bold,
                            fontSize: 11,
                          ),
                        ),
                      ),
                      Padding(
                        padding: EdgeInsets.all(8),
                        child: Text(
                          'القيمة (ج.م)',
                          textAlign: TextAlign.center,
                          style: TextStyle(
                            fontWeight: FontWeight.bold,
                            fontSize: 11,
                          ),
                        ),
                      ),
                    ],
                  ),
                  TableRow(
                    children: [
                      Padding(
                        padding: const EdgeInsets.all(8),
                        child: Text(
                          'أجر الساعات الفعلية (${slip.workedHours} س × ${slip.hourlyRate.toStringAsFixed(1)} ج.م)',
                          style: const TextStyle(fontSize: 11),
                        ),
                      ),
                      Padding(
                        padding: const EdgeInsets.all(8),
                        child: Text(
                          '+${(slip.workedHours * slip.hourlyRate).toStringAsFixed(2)}',
                          textAlign: TextAlign.center,
                          style: const TextStyle(
                            fontWeight: FontWeight.bold,
                            fontSize: 11,
                            color: AppColors.primary,
                          ),
                        ),
                      ),
                    ],
                  ),
                  TableRow(
                    children: [
                      const Padding(
                        padding: EdgeInsets.all(8),
                        child: Text(
                          'مكافآت وحوافز التميز',
                          style: TextStyle(fontSize: 11),
                        ),
                      ),
                      Padding(
                        padding: const EdgeInsets.all(8),
                        child: Text(
                          '+${slip.bonuses.toStringAsFixed(2)}',
                          textAlign: TextAlign.center,
                          style: const TextStyle(
                            fontWeight: FontWeight.bold,
                            fontSize: 11,
                            color: AppColors.primary,
                          ),
                        ),
                      ),
                    ],
                  ),
                  TableRow(
                    children: [
                      const Padding(
                        padding: EdgeInsets.all(8),
                        child: Text(
                          'استقطاعات وسلف سارية',
                          style: TextStyle(fontSize: 11),
                        ),
                      ),
                      Padding(
                        padding: const EdgeInsets.all(8),
                        child: Text(
                          '-${slip.advances.toStringAsFixed(2)}',
                          textAlign: TextAlign.center,
                          style: const TextStyle(
                            fontWeight: FontWeight.bold,
                            fontSize: 11,
                            color: AppColors.danger,
                          ),
                        ),
                      ),
                    ],
                  ),
                  TableRow(
                    children: [
                      const Padding(
                        padding: EdgeInsets.all(8),
                        child: Text(
                          'جزاءات وخصومات تأخير',
                          style: TextStyle(fontSize: 11),
                        ),
                      ),
                      Padding(
                        padding: const EdgeInsets.all(8),
                        child: Text(
                          '-${slip.penalties.toStringAsFixed(2)}',
                          textAlign: TextAlign.center,
                          style: const TextStyle(
                            fontWeight: FontWeight.bold,
                            fontSize: 11,
                            color: AppColors.danger,
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
              const SizedBox(height: 14),

              // صافي الراتب المستحق
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: AppColors.primary.withValues(
                    alpha: isDark ? 0.2 : 0.1,
                  ),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(
                    color: AppColors.primary.withValues(alpha: 0.3),
                  ),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text(
                      'صافي الأجر المستحق النهائي:',
                      style: TextStyle(
                        fontWeight: FontWeight.bold,
                        fontSize: 13,
                        color: AppColors.primary,
                      ),
                    ),
                    Text(
                      '${slip.netSalary.toStringAsFixed(2)} ج.م',
                      style: const TextStyle(
                        fontWeight: FontWeight.w900,
                        fontSize: 18,
                        color: AppColors.primary,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 18),

              // أزرار الحفظ في التخزين والمشاركة والطباعة
              Column(
                children: [
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton.icon(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppColors.primary,
                        foregroundColor: Colors.white,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                        padding: const EdgeInsets.symmetric(vertical: 13),
                      ),
                      icon: const Icon(
                        Icons.download_for_offline_rounded,
                        size: 20,
                      ),
                      label: const Text(
                        'حفظ كشف الراتب في وحدة التخزين (Downloads)',
                        style: TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      onPressed: () async {
                        Navigator.pop(ctx);
                        if (user != null) {
                          final path =
                              await AttendancePdfService.savePdfToStorage(
                                user: user,
                                records: records,
                                salarySlip: slip,
                                month: slip.month,
                              );
                          if (mounted && path != null) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(
                                content: Text(
                                  '✅ تم حفظ كشف الراتب بنجاح وإرسال إشعار للنظام:\n$path',
                                ),
                                backgroundColor: AppColors.primary,
                                duration: const Duration(seconds: 4),
                              ),
                            );
                          }
                        }
                      },
                    ),
                  ),
                  const SizedBox(height: 10),
                  Row(
                    children: [
                      Expanded(
                        child: OutlinedButton.icon(
                          style: OutlinedButton.styleFrom(
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(12),
                            ),
                            padding: const EdgeInsets.symmetric(vertical: 12),
                          ),
                          icon: const Icon(Icons.share_rounded, size: 18),
                          label: const Text(
                            'مشاركة PDF',
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                          onPressed: () {
                            Navigator.pop(ctx);
                            if (user != null) {
                              AttendancePdfService.sharePdf(
                                user: user,
                                records: records,
                                salarySlip: slip,
                                month: slip.month,
                              );
                            }
                          },
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: OutlinedButton.icon(
                          style: OutlinedButton.styleFrom(
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(12),
                            ),
                            padding: const EdgeInsets.symmetric(vertical: 12),
                          ),
                          icon: const Icon(Icons.print_rounded, size: 18),
                          label: const Text(
                            'معاينة وطباعة',
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                          onPressed: () {
                            Navigator.pop(ctx);
                            if (user != null) {
                              AttendancePdfService.printOrExportPdf(
                                user: user,
                                records: records,
                                salarySlip: slip,
                                month: slip.month,
                              );
                            }
                          },
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ],
          ),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final user = ref.watch(authProvider).user;
    final empDataState = ref.watch(employeeDataProvider);
    final snapshot = empDataState.snapshot;
    final orgSettings = snapshot?.orgSettings;

    final availableCycles = PeriodCycleService.getAvailableCycles(orgSettings);
    final activePayrollMonth = PeriodCycleService.getActivePayrollMonth(
      orgSettings,
    );

    if (_selectedMonth.isEmpty) {
      _selectedMonth = activePayrollMonth;
    }

    final cycleRange = PeriodCycleService.getCycleDateRange(
      _selectedMonth,
      orgSettings,
    );

    // 1. حساب الساعات الفعلية من سجلات البصمات الخاصة بالدورة المحاسبية المعتمدة حصراً
    final allAttendanceRecords = snapshot?.attendanceRecords ?? [];
    final monthAttendanceRecords = allAttendanceRecords.where((r) {
      return cycleRange.containsDateStr(r.date);
    }).toList();

    final totalWorkedHours = monthAttendanceRecords.fold<double>(
      0.0,
      (acc, r) => acc + r.workedHours,
    );

    // 2. سعر الساعة الحقيقي المحسوب
    final hourlyRate = (user?.hourlyRate ?? 0.0) > 0
        ? user!.hourlyRate
        : ((user?.monthlySalary ?? 0.0) > 0
              ? (user!.monthlySalary / 208.0)
              : 25.0);

    // 3. المكافآت والبدلات
    final bonuses = 0.0;

    // 4. إجمالي الجزاءات الموقعة الحقيقية
    final penaltiesList = snapshot?.penalties ?? [];
    final totalPenalties = penaltiesList.fold<double>(0.0, (acc, p) {
      final amt = double.tryParse(p['amount']?.toString() ?? '0') ?? 0.0;
      return acc + amt;
    });

    // 5. أقساط السلف النشطة المعتمدة
    final activeLoans = (snapshot?.loans ?? []).where(
      (l) => l.status == RequestStatus.approved,
    );
    final totalAdvances = activeLoans.fold<double>(
      0.0,
      (acc, l) => acc + l.monthlyDeduction,
    );

    // 6. صافي الراتب الفعلي المحسوب
    final grossSalary = totalWorkedHours * hourlyRate;
    final netSalary = grossSalary + bonuses - totalPenalties - totalAdvances;

    // 7. توزيع الساعات والمستحقات حسب الفروع المصرح بها للموظف
    final branches = user?.branches ?? [];
    final branchShares = branches.map((b) {
      final branchHours = monthAttendanceRecords
          .where((r) => r.branchId == b.id || r.branchName == b.name)
          .fold<double>(0.0, (acc, r) => acc + r.workedHours);
      return BranchSalaryShare(
        branchId: b.id,
        branchName: b.name,
        workedHours: branchHours,
        shareAmount: branchHours * hourlyRate,
      );
    }).toList();

    final realSlip = SalarySlipModel(
      id: 'sal-$_selectedMonth',
      employeeId: user?.id ?? '',
      month: _selectedMonth,
      baseSalary: user?.monthlySalary ?? 6200.0,
      hourlyRate: hourlyRate,
      workedHours: totalWorkedHours,
      targetHours: 208.0,
      allowances: 0.0,
      bonuses: bonuses,
      penalties: totalPenalties,
      advances: totalAdvances,
      netSalary: netSalary,
      isPaid: false,
      branchShares: branchShares,
    );

    return Scaffold(
      appBar: AppBar(
        title: Text(
          'كشف الراتب ومسير الأجور',
          style: TextStyle(
            fontWeight: FontWeight.bold,
            fontSize: 16,
            color: isDark ? Colors.white : const Color(0xFF0F172A),
          ),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.download_for_offline_rounded),
            tooltip: 'حفظ كشف الراتب في التخزين (Downloads)',
            onPressed: () async {
              if (user != null) {
                final path = await AttendancePdfService.savePdfToStorage(
                  user: user,
                  records: monthAttendanceRecords,
                  salarySlip: realSlip,
                  month: _selectedMonth,
                );
                if (context.mounted && path != null) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      content: Text(
                        '✅ تم حفظ كشف الراتب بنجاح وإرسال إشعار للنظام:\n$path',
                      ),
                      backgroundColor: AppColors.primary,
                      duration: const Duration(seconds: 4),
                    ),
                  );
                }
              }
            },
          ),
          IconButton(
            icon: const Icon(Icons.picture_as_pdf_rounded),
            tooltip: 'طباعة وتصدير كشف البصمة والراتب PDF',
            onPressed: () {
              if (user != null) {
                AttendancePdfService.printOrExportPdf(
                  user: user,
                  records: monthAttendanceRecords,
                  salarySlip: realSlip,
                  month: _selectedMonth,
                );
              }
            },
          ),
          IconButton(
            icon: const Icon(Icons.receipt_long_rounded),
            tooltip: 'معاينة المسير المعتمد',
            onPressed: () {
              _showOfficialPayslipSheet(realSlip, user, monthAttendanceRecords);
            },
          ),
          IconButton(
            icon: const Icon(Icons.refresh_rounded),
            tooltip: 'تحديث البيانات',
            onPressed: () => ref.read(employeeDataProvider.notifier).refresh(),
          ),
        ],
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // محدد فترة الاحتساب
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              decoration: BoxDecoration(
                color:
                    Theme.of(context).cardTheme.color ??
                    (isDark ? AppColors.darkSurface : Colors.white),
                borderRadius: BorderRadius.circular(16),
                border: Border.all(
                  color: isDark
                      ? AppColors.darkBorder
                      : const Color(0xFFE2E8F0),
                  width: 1.2,
                ),
              ),
              child: Row(
                children: [
                  const Icon(
                    Icons.calendar_today,
                    color: AppColors.primary,
                    size: 20,
                  ),
                  const SizedBox(width: 12),
                  Text(
                    'الفترة المعتمدة للرواتب:',
                    style: TextStyle(
                      fontSize: 12.5,
                      fontWeight: FontWeight.bold,
                      color: isDark ? Colors.white : const Color(0xFF0F172A),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: DropdownButton<String>(
                      value:
                          availableCycles.any(
                            (c) => c.cycleMonth == _selectedMonth,
                          )
                          ? _selectedMonth
                          : (availableCycles.isNotEmpty
                                ? availableCycles.first.cycleMonth
                                : activePayrollMonth),
                      isExpanded: true,
                      dropdownColor: isDark
                          ? AppColors.darkSurface
                          : Colors.white,
                      underline: const SizedBox(),
                      items: availableCycles.map((c) {
                        final isCur = c.cycleMonth == activePayrollMonth;
                        return DropdownMenuItem(
                          value: c.cycleMonth,
                          child: Text(
                            '${c.label} ${isCur ? "★" : ""}',
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight: isCur
                                  ? FontWeight.bold
                                  : FontWeight.normal,
                              color: isCur
                                  ? AppColors.primary
                                  : (isDark
                                        ? Colors.white
                                        : const Color(0xFF0F172A)),
                            ),
                            overflow: TextOverflow.ellipsis,
                          ),
                        );
                      }).toList(),
                      onChanged: (val) {
                        if (val != null) setState(() => _selectedMonth = val);
                      },
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),

            // لافتة نظام الدوام المرن
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: AppColors.eveningShift.withValues(
                  alpha: isDark ? 0.12 : 0.08,
                ),
                borderRadius: BorderRadius.circular(16),
                border: Border.all(
                  color: AppColors.eveningShift.withValues(alpha: 0.3),
                ),
              ),
              child: Row(
                children: [
                  const Icon(
                    Icons.access_time_filled,
                    color: AppColors.eveningShift,
                    size: 22,
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      'نظام العمل باحتساب ساعات الحضور الفعلية\nيتم احتساب الراتب والمستحقات والخصومات وفقاً لسجلات البصمات ومسيرات السيرفر المعتمدة.',
                      style: TextStyle(
                        fontSize: 11.5,
                        height: 1.4,
                        color: isDark
                            ? Colors.white70
                            : const Color(0xFF334155),
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),

            // شبكة ملخص المستحقات والخصومات
            Row(
              children: [
                Expanded(
                  child: _buildMetricTile(
                    context,
                    'إجمالي ساعات العمل',
                    '${realSlip.workedHours.toStringAsFixed(1)} ساعة',
                    'من أصل 208 ساعة',
                    AppColors.primary,
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: _buildMetricTile(
                    context,
                    'سعر الساعة التقديري',
                    '${realSlip.hourlyRate.toStringAsFixed(2)} ج.م/س',
                    'الراتب الشامل',
                    AppColors.accentCyan,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: _buildMetricTile(
                    context,
                    'أقساط السلف الجارية',
                    '-${realSlip.advances.toStringAsFixed(2)} ج.م',
                    'سلف شهرية وأدوية',
                    AppColors.warning,
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: _buildMetricTile(
                    context,
                    'إجمالي الخصومات والجزاءات',
                    '-${realSlip.penalties.toStringAsFixed(2)} ج.م',
                    'خصومات معتمدة',
                    AppColors.danger,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 14),

            // بطاقة صافي الصرف الكبرى
            Container(
              padding: const EdgeInsets.all(18),
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: [
                    (realSlip.netSalary >= 0
                            ? AppColors.primary
                            : AppColors.danger)
                        .withValues(alpha: isDark ? 0.2 : 0.1),
                    isDark ? AppColors.darkSurface : Colors.white,
                  ],
                  begin: Alignment.topRight,
                  end: Alignment.bottomLeft,
                ),
                borderRadius: BorderRadius.circular(20),
                border: Border.all(
                  color:
                      (realSlip.netSalary >= 0
                              ? AppColors.primary
                              : AppColors.danger)
                          .withValues(alpha: 0.4),
                  width: 1.2,
                ),
                boxShadow: isDark
                    ? null
                    : [
                        BoxShadow(
                          color:
                              (realSlip.netSalary >= 0
                                      ? AppColors.primary
                                      : AppColors.danger)
                                  .withValues(alpha: 0.05),
                          blurRadius: 10,
                          offset: const Offset(0, 4),
                        ),
                      ],
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'صافي الصرف الفعلي المعتمد',
                        style: TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.bold,
                          color: isDark
                              ? Colors.white70
                              : const Color(0xFF0F172A),
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        cycleRange.label,
                        style: TextStyle(
                          fontSize: 11,
                          color: isDark ? Colors.grey : const Color(0xFF64748B),
                        ),
                      ),
                    ],
                  ),
                  Text(
                    '${realSlip.netSalary.toStringAsFixed(2)} ج.م',
                    style: TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.w900,
                      color: realSlip.netSalary >= 0
                          ? AppColors.primary
                          : AppColors.danger,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 14),

            // زر إصدار وطباعة كشف البصمة والراتب PDF
            SizedBox(
              width: double.infinity,
              height: 50,
              child: ElevatedButton.icon(
                onPressed: () {
                  if (user != null) {
                    AttendancePdfService.printOrExportPdf(
                      user: user,
                      records: monthAttendanceRecords,
                      salarySlip: realSlip,
                      month: _selectedMonth,
                    );
                  }
                },
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.primary,
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(14),
                  ),
                  elevation: 2,
                ),
                icon: const Icon(Icons.picture_as_pdf_rounded, size: 20),
                label: const Text(
                  'إصدار وطباعة كشف البصمة والراتب PDF',
                  style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13.5),
                ),
              ),
            ),
            const SizedBox(height: 20),

            // جدول تفصيل الاستحقاق حسب الفروع
            if (realSlip.branchShares.isNotEmpty) ...[
              Text(
                'توزيع ساعات العمل والمستحقات حسب الفروع المصرح بها',
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.bold,
                  color: isDark ? Colors.white : const Color(0xFF0F172A),
                ),
              ),
              const SizedBox(height: 10),
              ...realSlip.branchShares.map((bs) {
                return Container(
                  margin: const EdgeInsets.only(bottom: 8),
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color:
                        Theme.of(context).cardTheme.color ??
                        (isDark ? AppColors.darkSurface : Colors.white),
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(
                      color: isDark
                          ? AppColors.darkBorder
                          : const Color(0xFFE2E8F0),
                      width: 1.1,
                    ),
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Row(
                        children: [
                          const Icon(
                            Icons.storefront,
                            color: AppColors.primary,
                            size: 18,
                          ),
                          const SizedBox(width: 8),
                          Text(
                            bs.branchName,
                            style: TextStyle(
                              fontWeight: FontWeight.bold,
                              fontSize: 13,
                              color: isDark
                                  ? Colors.white
                                  : const Color(0xFF0F172A),
                            ),
                          ),
                        ],
                      ),
                      Text(
                        '${bs.workedHours.toStringAsFixed(1)} س • ${bs.shareAmount.toStringAsFixed(2)} ج.م',
                        style: const TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.bold,
                          color: AppColors.primary,
                        ),
                      ),
                    ],
                  ),
                );
              }),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildMetricTile(
    BuildContext context,
    String title,
    String val,
    String sub,
    Color color,
  ) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color:
            Theme.of(context).cardTheme.color ??
            (isDark ? AppColors.darkSurface : Colors.white),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: isDark ? AppColors.darkBorder : const Color(0xFFE2E8F0),
          width: 1.1,
        ),
        boxShadow: isDark
            ? null
            : [
                BoxShadow(
                  color: const Color(0xFF0F172A).withValues(alpha: 0.03),
                  blurRadius: 8,
                  offset: const Offset(0, 2),
                ),
              ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: TextStyle(
              fontSize: 10.5,
              color: isDark ? Colors.grey.shade400 : const Color(0xFF64748B),
            ),
          ),
          const SizedBox(height: 4),
          Text(
            val,
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.bold,
              color: color,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            sub,
            style: TextStyle(
              fontSize: 9.5,
              color: isDark ? Colors.grey : const Color(0xFF94A3B8),
            ),
          ),
        ],
      ),
    );
  }
}
