import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/services/period_cycle_service.dart';
import '../../../data/models/attendance_model.dart';
import '../../providers/employee_data_provider.dart';

class AttendanceHistoryScreen extends ConsumerStatefulWidget {
  const AttendanceHistoryScreen({super.key});

  @override
  ConsumerState<AttendanceHistoryScreen> createState() => _AttendanceHistoryScreenState();
}

class _AttendanceHistoryScreenState extends ConsumerState<AttendanceHistoryScreen> {
  String _selectedCycleMonth = '';
  bool _showAllRecords = false;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final empData = ref.watch(employeeDataProvider);
    final snapshot = empData.snapshot;
    final allRecords = snapshot?.attendanceRecords ?? [];
    final orgSettings = snapshot?.orgSettings;

    final availableCycles = PeriodCycleService.getAvailableCycles(orgSettings);
    final activePayrollMonth = PeriodCycleService.getActivePayrollMonth(orgSettings);

    if (_selectedCycleMonth.isEmpty && !_showAllRecords) {
      _selectedCycleMonth = activePayrollMonth;
    }

    final currentCycleRange = _showAllRecords
        ? null
        : PeriodCycleService.getCycleDateRange(_selectedCycleMonth, orgSettings);

    // فلترة السجلات وفق الدورة المختارة
    final filteredRecords = _showAllRecords
        ? allRecords
        : (currentCycleRange != null
            ? allRecords.where((r) => currentCycleRange.containsDateStr(r.date)).toList()
            : allRecords);

    // حساب إجمالي الساعات في الدورة المحددة
    final totalHoursInCycle = filteredRecords.fold<double>(0.0, (acc, r) => acc + r.workedHours);
    final completedShiftsCount = filteredRecords.where((r) => r.workedHours > 0).length;

    return Scaffold(
      appBar: AppBar(
        title: Text(
          'سجل البصمات وتفاصيل الدوام',
          style: TextStyle(
            fontWeight: FontWeight.bold,
            fontSize: 16,
            color: isDark ? Colors.white : const Color(0xFF0F172A),
          ),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh_rounded),
            tooltip: 'تحديث البيانات',
            onPressed: () => ref.read(employeeDataProvider.notifier).refresh(),
          ),
        ],
      ),
      body: empData.isLoading
          ? const Center(child: CircularProgressIndicator(color: AppColors.primary))
          : Column(
              children: [
                // 📅 شريط فلتر دورة الشهر المعتمدة والفترات
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                  decoration: BoxDecoration(
                    color: Theme.of(context).cardTheme.color ?? (isDark ? AppColors.darkSurface : Colors.white),
                    border: Border(
                      bottom: BorderSide(
                        color: isDark ? AppColors.darkBorder : const Color(0xFFE2E8F0),
                        width: 1,
                      ),
                    ),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Row(
                            children: [
                              const Icon(Icons.calendar_month_rounded, color: AppColors.primary, size: 20),
                              const SizedBox(width: 8),
                              Text(
                                'فلتر دورة الشهر المعتمدة:',
                                style: TextStyle(
                                  fontSize: 12.5,
                                  fontWeight: FontWeight.bold,
                                  color: isDark ? Colors.white70 : const Color(0xFF334155),
                                ),
                              ),
                            ],
                          ),
                          TextButton(
                            onPressed: () {
                              setState(() {
                                _showAllRecords = !_showAllRecords;
                              });
                            },
                            style: TextButton.styleFrom(
                              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                              minimumSize: Size.zero,
                              tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                            ),
                            child: Text(
                              _showAllRecords ? 'عرض الدورة الحالية' : 'عرض كافة الشهور',
                              style: const TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: AppColors.primary),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),

                      if (!_showAllRecords)
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 2),
                          decoration: BoxDecoration(
                            color: isDark ? const Color(0xFF1E293B) : const Color(0xFFF8FAFC),
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(color: AppColors.primary.withValues(alpha: 0.3)),
                          ),
                          child: DropdownButtonHideUnderline(
                            child: DropdownButton<String>(
                              value: availableCycles.any((c) => c.cycleMonth == _selectedCycleMonth)
                                  ? _selectedCycleMonth
                                  : (availableCycles.isNotEmpty ? availableCycles.first.cycleMonth : activePayrollMonth),
                              isExpanded: true,
                              dropdownColor: isDark ? const Color(0xFF1E293B) : Colors.white,
                              items: availableCycles.map((c) {
                                final isCur = c.cycleMonth == activePayrollMonth;
                                return DropdownMenuItem<String>(
                                  value: c.cycleMonth,
                                  child: Text(
                                    '${c.label} ${isCur ? "★ (الحالية)" : ""}',
                                    style: TextStyle(
                                      fontSize: 12,
                                      fontWeight: isCur ? FontWeight.bold : FontWeight.normal,
                                      color: isCur ? AppColors.primary : (isDark ? Colors.white : const Color(0xFF0F172A)),
                                    ),
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                );
                              }).toList(),
                              onChanged: (val) {
                                if (val != null) {
                                  setState(() {
                                    _selectedCycleMonth = val;
                                    _showAllRecords = false;
                                  });
                                }
                              },
                            ),
                          ),
                        )
                      else
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                          decoration: BoxDecoration(
                            color: AppColors.primary.withValues(alpha: 0.08),
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: const Row(
                            children: [
                              Icon(Icons.all_inclusive_rounded, size: 16, color: AppColors.primary),
                              SizedBox(width: 8),
                              Text('يتم عرض كافة سجلات البصمات التاريخية المسجلة', style: TextStyle(fontSize: 11.5, color: AppColors.primary, fontWeight: FontWeight.bold)),
                            ],
                          ),
                        ),

                      const SizedBox(height: 10),

                      // بطاقة ملخص ساعات الدورة
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                        decoration: BoxDecoration(
                          color: isDark ? Colors.black26 : const Color(0xFFF1F5F9),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.spaceAround,
                          children: [
                            _buildSummaryMetric('ساعات العمل', '${totalHoursInCycle.toStringAsFixed(1)} س', AppColors.primary, isDark),
                            Container(width: 1, height: 28, color: Colors.grey.withValues(alpha: 0.3)),
                            _buildSummaryMetric('الورديات', '$completedShiftsCount وردية', AppColors.accentCyan, isDark),
                            Container(width: 1, height: 28, color: Colors.grey.withValues(alpha: 0.3)),
                            _buildSummaryMetric('نطاق الفترة', currentCycleRange?.shortLabel ?? 'كامل السجل', AppColors.eveningShift, isDark),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),

                // 📋 قائمة بصمات الدورة
                Expanded(
                  child: filteredRecords.isEmpty
                      ? Center(
                          child: Padding(
                            padding: const EdgeInsets.all(24),
                            child: Column(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Icon(Icons.access_time_rounded, size: 64, color: isDark ? Colors.grey.shade700 : const Color(0xFFCBD5E1)),
                                const SizedBox(height: 16),
                                Text(
                                  'لا توجد بصمات مسجلة في هذه الدورة',
                                  style: TextStyle(
                                    fontSize: 15,
                                    fontWeight: FontWeight.bold,
                                    color: isDark ? Colors.white70 : const Color(0xFF64748B),
                                  ),
                                ),
                                const SizedBox(height: 6),
                                Text(
                                  currentCycleRange != null
                                      ? 'النطاق المعتمد: من ${currentCycleRange.startDate} إلى ${currentCycleRange.endDate}'
                                      : 'يتم توثيق الحضور والانصراف تلقائياً عند بصمة الجهاز أو الفرع',
                                  textAlign: TextAlign.center,
                                  style: TextStyle(
                                    fontSize: 12,
                                    color: isDark ? Colors.grey.shade500 : const Color(0xFF94A3B8),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        )
                      : ListView.separated(
                          padding: const EdgeInsets.all(16),
                          itemCount: filteredRecords.length,
                          separatorBuilder: (_, __) => const SizedBox(height: 12),
                          itemBuilder: (context, index) {
                            final r = filteredRecords[index];
                            return Container(
                              padding: const EdgeInsets.all(16),
                              decoration: BoxDecoration(
                                color: Theme.of(context).cardTheme.color ?? (isDark ? AppColors.darkSurface : Colors.white),
                                borderRadius: BorderRadius.circular(18),
                                border: Border.all(
                                  color: isDark ? AppColors.darkBorder : const Color(0xFFE2E8F0),
                                  width: 1.2,
                                ),
                                boxShadow: isDark
                                    ? null
                                    : [
                                        BoxShadow(
                                          color: const Color(0xFF0F172A).withValues(alpha: 0.03),
                                          blurRadius: 8,
                                          offset: const Offset(0, 3),
                                        ),
                                      ],
                              ),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Row(
                                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                    children: [
                                      Row(
                                        children: [
                                          const Icon(Icons.calendar_today, size: 16, color: AppColors.primary),
                                          const SizedBox(width: 8),
                                          Text(
                                            r.date,
                                            style: TextStyle(
                                              fontWeight: FontWeight.bold,
                                              fontSize: 13.5,
                                              color: isDark ? Colors.white : const Color(0xFF0F172A),
                                            ),
                                          ),
                                          const SizedBox(width: 10),
                                          Container(
                                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                            decoration: BoxDecoration(
                                              color: isDark ? Colors.black.withValues(alpha: 0.3) : const Color(0xFFF1F5F9),
                                              borderRadius: BorderRadius.circular(6),
                                              border: Border.all(color: isDark ? Colors.transparent : const Color(0xFFE2E8F0)),
                                            ),
                                            child: Text(
                                              r.branchName.isNotEmpty ? r.branchName : 'الفرع',
                                              style: TextStyle(
                                                fontSize: 10.5,
                                                fontWeight: FontWeight.bold,
                                                color: isDark ? Colors.white70 : const Color(0xFF334155),
                                              ),
                                            ),
                                          ),
                                        ],
                                      ),
                                      Text(
                                        r.status.labelAr,
                                        style: TextStyle(
                                          fontWeight: FontWeight.bold,
                                          fontSize: 11,
                                          color: r.status == AttendanceStatus.present ? AppColors.primary : AppColors.warning,
                                        ),
                                      ),
                                    ],
                                  ),
                                  Divider(height: 20, color: isDark ? AppColors.darkBorder : const Color(0xFFE2E8F0)),
                                  Row(
                                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                    children: [
                                      _buildTimeBadge('وقت الحضور', r.checkIn, AppColors.primary, isDark),
                                      _buildTimeBadge('وقت الانصراف', r.checkOut, AppColors.eveningShift, isDark),
                                      _buildTimeBadge('الساعات الفعلية', '${r.workedHours} س', AppColors.accentCyan, isDark),
                                    ],
                                  ),
                                ],
                              ),
                            );
                          },
                        ),
                ),
              ],
            ),
    );
  }

  Widget _buildSummaryMetric(String label, String value, Color color, bool isDark) {
    return Column(
      children: [
        Text(label, style: TextStyle(fontSize: 10.5, color: isDark ? Colors.grey.shade400 : const Color(0xFF64748B))),
        const SizedBox(height: 2),
        Text(value, style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.bold, color: color)),
      ],
    );
  }

  Widget _buildTimeBadge(String title, String val, Color color, bool isDark) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          style: TextStyle(
            fontSize: 10.5,
            color: isDark ? Colors.grey.shade400 : const Color(0xFF64748B),
          ),
        ),
        const SizedBox(height: 2),
        Text(
          val,
          style: TextStyle(
            fontSize: 12.5,
            fontWeight: FontWeight.bold,
            color: color,
          ),
        ),
      ],
    );
  }
}
