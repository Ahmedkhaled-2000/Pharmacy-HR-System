import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/services/period_cycle_service.dart';
import '../../../data/models/roster_model.dart';
import '../../providers/auth_provider.dart';
import '../../providers/employee_data_provider.dart';
import '../../../data/repositories/employee_repository.dart';

enum RosterViewMode { monthly, weekly }

class MonthlyRosterScreen extends ConsumerStatefulWidget {
  const MonthlyRosterScreen({super.key});

  @override
  ConsumerState<MonthlyRosterScreen> createState() =>
      _MonthlyRosterScreenState();
}

class _MonthlyRosterScreenState extends ConsumerState<MonthlyRosterScreen> {
  String? _selectedBranchId;
  RosterViewMode _viewMode = RosterViewMode.monthly;
  String _selectedCycleMonth = '';

  static const List<String> _weekDaysOrdered = [
    'السبت',
    'الأحد',
    'الاثنين',
    'الثلاثاء',
    'الأربعاء',
    'الخميس',
    'الجمعة',
  ];

  void _openRosterEditModal(Map<String, dynamic> currentWeeklySchedule) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _RosterEditModal(
        initialSchedule: currentWeeklySchedule,
        onSubmitted: () => ref.read(employeeDataProvider.notifier).refresh(),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final authState = ref.watch(authProvider);
    final user = authState.user;
    final branches = user?.branches ?? [];

    final empData = ref.watch(employeeDataProvider);
    final allRoster = empData.snapshot?.rosterItems ?? [];
    final weeklySchedule = empData.snapshot?.activeRosterSchedule ?? {};
    final orgSettings = empData.snapshot?.orgSettings;

    final availableCycles = PeriodCycleService.getAvailableCycles(orgSettings);
    final activeMonth = PeriodCycleService.getActivePayrollMonth(orgSettings);

    if (_selectedCycleMonth.isEmpty) {
      _selectedCycleMonth = activeMonth;
    }

    final List<ShiftRosterItem> effectiveRoster;
    if (_selectedCycleMonth == activeMonth) {
      effectiveRoster = allRoster;
    } else {
      final targetCycle = PeriodCycleService.getCycleDateRange(
        _selectedCycleMonth,
        orgSettings,
      );
      final weekdayNames = [
        'الاثنين',
        'الثلاثاء',
        'الأربعاء',
        'الخميس',
        'الجمعة',
        'السبت',
        'الأحد',
      ];
      final items = <ShiftRosterItem>[];
      final now = DateTime.now();
      for (int i = 0; i < targetCycle.daysCount; i++) {
        final d = targetCycle.startDateTime.add(Duration(days: i));
        final dateStr =
            '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
        final arDay = weekdayNames[d.weekday - 1];
        dynamic conf = weeklySchedule[arDay];
        final isOff =
            conf is Map && (conf['type'] == 'off' || conf['isOff'] == true);
        final st = conf is Map
            ? (conf['start']?.toString() ?? '08:00')
            : '08:00';
        final en = conf is Map ? (conf['end']?.toString() ?? '16:00') : '16:00';
        final p = isOff ? ShiftPeriod.dayOff : ShiftPeriod.morning;
        items.add(
          ShiftRosterItem(
            date: dateStr,
            dayNumber: d.day,
            dayNameAr: arDay,
            period: p,
            branchId: _selectedBranchId ?? '',
            branchName: 'الفرع',
            timeRange: isOff ? 'راحة أسبوعية' : '$st - $en',
            isToday:
                d.day == now.day && d.month == now.month && d.year == now.year,
          ),
        );
      }
      effectiveRoster = items;
    }

    if (_selectedBranchId == null && branches.isNotEmpty) {
      _selectedBranchId = branches.first.id;
    }

    final filteredRoster =
        _selectedBranchId == null || _selectedBranchId!.isEmpty
        ? effectiveRoster
        : effectiveRoster
              .where(
                (r) => r.branchId == _selectedBranchId || r.branchId.isEmpty,
              )
              .toList();

    return Scaffold(
      appBar: AppBar(
        title: Text(
          'جدول الورديات المعتمد',
          style: TextStyle(
            fontWeight: FontWeight.bold,
            fontSize: 16,
            color: isDark ? Colors.white : const Color(0xFF0F172A),
          ),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh_rounded),
            onPressed: () => ref.read(employeeDataProvider.notifier).refresh(),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        backgroundColor: AppColors.primary,
        foregroundColor: Colors.white,
        elevation: 4,
        icon: const Icon(Icons.edit_calendar_rounded, size: 20),
        label: const Text(
          'طلب اعتماد / تعديل الجدول',
          style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
        ),
        onPressed: () => _openRosterEditModal(weeklySchedule),
      ),
      body: Column(
        children: [
          // 1. شريط التبديل بين النمطين (الشهري والأسبوعي)
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
            color:
                Theme.of(context).cardTheme.color ??
                (isDark ? AppColors.darkSurface : Colors.white),
            child: Column(
              children: [
                // فلتر دورة الشهر المعتمدة
                Container(
                  margin: const EdgeInsets.only(bottom: 10),
                  padding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 2,
                  ),
                  decoration: BoxDecoration(
                    color: isDark
                        ? const Color(0xFF1E293B)
                        : const Color(0xFFF8FAFC),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(
                      color: AppColors.primary.withValues(alpha: 0.25),
                    ),
                  ),
                  child: DropdownButtonHideUnderline(
                    child: DropdownButton<String>(
                      value:
                          availableCycles.any(
                            (c) => c.cycleMonth == _selectedCycleMonth,
                          )
                          ? _selectedCycleMonth
                          : (availableCycles.isNotEmpty
                                ? availableCycles.first.cycleMonth
                                : activeMonth),
                      isExpanded: true,
                      dropdownColor: isDark
                          ? const Color(0xFF1E293B)
                          : Colors.white,
                      items: availableCycles.map((c) {
                        final isCur = c.cycleMonth == activeMonth;
                        return DropdownMenuItem<String>(
                          value: c.cycleMonth,
                          child: Text(
                            '${c.label} ${isCur ? "★ (الحالية)" : ""}',
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
                        if (val != null)
                          setState(() => _selectedCycleMonth = val);
                      },
                    ),
                  ),
                ),
                Row(
                  children: [
                    Expanded(
                      child: SegmentedButton<RosterViewMode>(
                        segments: const [
                          ButtonSegment(
                            value: RosterViewMode.monthly,
                            label: Text(
                              'النمط الشهري',
                              style: TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                            icon: Icon(Icons.calendar_month_rounded, size: 18),
                          ),
                          ButtonSegment(
                            value: RosterViewMode.weekly,
                            label: Text(
                              'النمط الأسبوعي',
                              style: TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                            icon: Icon(Icons.view_week_rounded, size: 18),
                          ),
                        ],
                        selected: {_viewMode},
                        onSelectionChanged: (val) =>
                            setState(() => _viewMode = val.first),
                        style: ButtonStyle(
                          shape: WidgetStatePropertyAll(
                            RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(12),
                            ),
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    if (branches.isNotEmpty)
                      DropdownButton<String>(
                        value: branches.any((b) => b.id == _selectedBranchId)
                            ? _selectedBranchId
                            : branches.first.id,
                        dropdownColor: isDark
                            ? AppColors.darkSurface
                            : Colors.white,
                        underline: const SizedBox.shrink(),
                        items: branches.map((b) {
                          return DropdownMenuItem(
                            value: b.id,
                            child: Row(
                              children: [
                                const Icon(
                                  Icons.storefront,
                                  size: 16,
                                  color: AppColors.primary,
                                ),
                                const SizedBox(width: 6),
                                Text(
                                  b.name,
                                  style: TextStyle(
                                    fontWeight: FontWeight.bold,
                                    fontSize: 12,
                                    color: isDark
                                        ? Colors.white
                                        : const Color(0xFF0F172A),
                                  ),
                                ),
                              ],
                            ),
                          );
                        }).toList(),
                        onChanged: (val) {
                          if (val != null)
                            setState(() => _selectedBranchId = val);
                        },
                      )
                    else
                      Text(
                        user?.branchName ?? 'الفرع',
                        style: const TextStyle(
                          fontWeight: FontWeight.bold,
                          fontSize: 12,
                        ),
                      ),
                    Row(
                      children: [
                        _buildLegend('صباحي', AppColors.morningShift),
                        const SizedBox(width: 6),
                        _buildLegend('مسائي', AppColors.eveningShift),
                        const SizedBox(width: 6),
                        _buildLegend('سهر', AppColors.nightShift),
                        const SizedBox(width: 6),
                        _buildLegend('راحة', AppColors.dayOff),
                      ],
                    ),
                  ],
                ),
              ],
            ),
          ),
          Divider(
            height: 1,
            color: isDark ? AppColors.darkBorder : const Color(0xFFE2E8F0),
          ),

          // 2. محتوى العرض حسب النمط المختار
          Expanded(
            child: empData.isLoading
                ? const Center(
                    child: CircularProgressIndicator(color: AppColors.primary),
                  )
                : _viewMode == RosterViewMode.weekly
                ? _buildWeeklyView(context, weeklySchedule, isDark)
                : _buildMonthlyView(context, filteredRoster, isDark),
          ),
        ],
      ),
    );
  }

  // 📋 عرض النمط الأسبوعي
  Widget _buildWeeklyView(
    BuildContext context,
    Map<String, dynamic> weeklySchedule,
    bool isDark,
  ) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 80),
      children: [
        Container(
          padding: const EdgeInsets.all(12),
          margin: const EdgeInsets.only(bottom: 14),
          decoration: BoxDecoration(
            color: isDark
                ? AppColors.primary.withValues(alpha: 0.15)
                : const Color(0xFFEFF6FF),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: isDark
                  ? AppColors.primary.withValues(alpha: 0.3)
                  : const Color(0xFFBFDBFE),
            ),
          ),
          child: Row(
            children: [
              const Icon(
                Icons.info_outline_rounded,
                color: AppColors.primary,
                size: 20,
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  'قالب الوردية الأسبوعي ينطبق تلقائياً على كامل أيام الشهر المعتمدة بالصيدلية',
                  style: TextStyle(
                    fontSize: 11.5,
                    fontWeight: FontWeight.bold,
                    color: isDark ? Colors.white : const Color(0xFF1E3A8A),
                  ),
                ),
              ),
            ],
          ),
        ),
        ..._weekDaysOrdered.map((dayName) {
          dynamic dayConf = weeklySchedule[dayName];
          if (dayConf == null) {
            final norm = dayName.replaceAll(RegExp(r'[إأآ]'), 'ا');
            for (final entry in weeklySchedule.entries) {
              if (entry.key.replaceAll(RegExp(r'[إأآ]'), 'ا') == norm) {
                dayConf = entry.value;
                break;
              }
            }
          }

          final isOff =
              dayConf is Map &&
              (dayConf['type'] == 'off' || dayConf['isOff'] == true);
          final start = dayConf is Map
              ? (dayConf['start']?.toString() ?? '08:00')
              : '08:00';
          final end = dayConf is Map
              ? (dayConf['end']?.toString() ?? '16:00')
              : '16:00';

          final color = isOff ? AppColors.dayOff : AppColors.morningShift;

          return Container(
            margin: const EdgeInsets.only(bottom: 10),
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color:
                  Theme.of(context).cardTheme.color ??
                  (isDark ? AppColors.darkSurface : Colors.white),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(
                color: isDark ? AppColors.darkBorder : const Color(0xFFE2E8F0),
                width: 1.2,
              ),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Row(
                  children: [
                    Container(
                      width: 44,
                      height: 44,
                      decoration: BoxDecoration(
                        color: color.withValues(alpha: isDark ? 0.2 : 0.12),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Center(
                        child: Icon(
                          isOff
                              ? Icons.beach_access_rounded
                              : Icons.access_time_filled,
                          color: color,
                          size: 22,
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          dayName,
                          style: TextStyle(
                            fontWeight: FontWeight.bold,
                            fontSize: 14,
                            color: isDark
                                ? Colors.white
                                : const Color(0xFF0F172A),
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          isOff ? 'راحة أسبوعية (عطلة)' : 'وردية عمل منتظمة',
                          style: TextStyle(
                            fontSize: 11,
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
                    horizontal: 10,
                    vertical: 5,
                  ),
                  decoration: BoxDecoration(
                    color: color.withValues(alpha: isDark ? 0.2 : 0.1),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: color.withValues(alpha: 0.3)),
                  ),
                  child: Text(
                    isOff ? 'OFF' : '$start - $end',
                    style: TextStyle(
                      fontWeight: FontWeight.bold,
                      fontSize: 12,
                      color: color,
                    ),
                  ),
                ),
              ],
            ),
          );
        }),
      ],
    );
  }

  // 🗓️ عرض النمط الشهري
  Widget _buildMonthlyView(
    BuildContext context,
    List<ShiftRosterItem> rosterList,
    bool isDark,
  ) {
    if (rosterList.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                Icons.calendar_month_outlined,
                size: 64,
                color: isDark ? Colors.grey.shade700 : const Color(0xFFCBD5E1),
              ),
              const SizedBox(height: 16),
              Text(
                'لا يوجد جدول معتمد معروض لهذا الفرع حالياً',
                style: TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.bold,
                  color: isDark ? Colors.white70 : const Color(0xFF64748B),
                ),
              ),
              const SizedBox(height: 6),
              const Text(
                'اضغط على زر "طلب اعتماد / تعديل الجدول" بالأسفل لتقديم مقترح جدولك الشهري',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 12, color: Color(0xFF94A3B8)),
              ),
            ],
          ),
        ),
      );
    }

    return ListView.separated(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 80),
      itemCount: rosterList.length,
      separatorBuilder: (_, __) => const SizedBox(height: 10),
      itemBuilder: (context, index) {
        final item = rosterList[index];
        Color periodColor;
        switch (item.period) {
          case ShiftPeriod.morning:
            periodColor = AppColors.morningShift;
            break;
          case ShiftPeriod.evening:
            periodColor = AppColors.eveningShift;
            break;
          case ShiftPeriod.night:
            periodColor = AppColors.nightShift;
            break;
          case ShiftPeriod.dayOff:
            periodColor = AppColors.dayOff;
            break;
        }

        return Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color:
                Theme.of(context).cardTheme.color ??
                (isDark ? AppColors.darkSurface : Colors.white),
            borderRadius: BorderRadius.circular(16),
            border: Border.all(
              color: item.isToday
                  ? AppColors.primary
                  : (isDark ? AppColors.darkBorder : const Color(0xFFE2E8F0)),
              width: item.isToday ? 2.0 : 1.2,
            ),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: [
                  Container(
                    width: 44,
                    height: 44,
                    decoration: BoxDecoration(
                      color: periodColor.withValues(
                        alpha: isDark ? 0.25 : 0.15,
                      ),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Center(
                      child: Text(
                        '${item.dayNumber}',
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.bold,
                          color: periodColor,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Text(
                            item.dayNameAr,
                            style: TextStyle(
                              fontWeight: FontWeight.bold,
                              fontSize: 13.5,
                              color: isDark
                                  ? Colors.white
                                  : const Color(0xFF0F172A),
                            ),
                          ),
                          if (item.isToday) ...[
                            const SizedBox(width: 6),
                            Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 6,
                                vertical: 2,
                              ),
                              decoration: BoxDecoration(
                                color: AppColors.primary,
                                borderRadius: BorderRadius.circular(6),
                              ),
                              child: const Text(
                                'اليوم',
                                style: TextStyle(
                                  color: Colors.white,
                                  fontSize: 9.5,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                            ),
                          ],
                        ],
                      ),
                      const SizedBox(height: 2),
                      Text(
                        item.date,
                        style: TextStyle(
                          fontSize: 11,
                          color: isDark ? Colors.grey : const Color(0xFF64748B),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: 3,
                    ),
                    decoration: BoxDecoration(
                      color: periodColor.withValues(alpha: isDark ? 0.2 : 0.1),
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(
                        color: periodColor.withValues(alpha: 0.3),
                      ),
                    ),
                    child: Text(
                      item.period.labelAr,
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.bold,
                        color: periodColor,
                      ),
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    item.timeRange,
                    style: TextStyle(
                      fontSize: 11.5,
                      fontWeight: FontWeight.bold,
                      color: isDark ? Colors.white70 : const Color(0xFF334155),
                    ),
                  ),
                ],
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _buildLegend(String label, Color color) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 7,
          height: 7,
          decoration: BoxDecoration(color: color, shape: BoxShape.circle),
        ),
        const SizedBox(width: 3),
        Text(
          label,
          style: const TextStyle(
            fontSize: 10,
            color: Colors.grey,
            fontWeight: FontWeight.bold,
          ),
        ),
      ],
    );
  }
}

// 📝 نافذة طلب اعتماد أو تعديل الجدول الشهري (إرسال إلى مدير الفرع والإدارة)
class _RosterEditModal extends ConsumerStatefulWidget {
  final Map<String, dynamic> initialSchedule;
  final VoidCallback onSubmitted;

  const _RosterEditModal({
    required this.initialSchedule,
    required this.onSubmitted,
  });

  @override
  ConsumerState<_RosterEditModal> createState() => _RosterEditModalState();
}

class _RosterEditModalState extends ConsumerState<_RosterEditModal> {
  late Map<String, Map<String, dynamic>> _schedule;
  final _notesController = TextEditingController();
  bool _isSubmitting = false;

  static const List<String> _days = [
    'السبت',
    'الأحد',
    'الاثنين',
    'الثلاثاء',
    'الأربعاء',
    'الخميس',
    'الجمعة',
  ];

  @override
  void initState() {
    super.initState();
    _schedule = {};
    for (final day in _days) {
      final conf = widget.initialSchedule[day];
      if (conf is Map) {
        _schedule[day] = {
          'type': conf['type']?.toString() ?? 'shift',
          'start': conf['start']?.toString() ?? '08:00',
          'end': conf['end']?.toString() ?? '16:00',
        };
      } else {
        _schedule[day] = {
          'type': day == 'الجمعة' ? 'off' : 'shift',
          'start': '08:00',
          'end': '16:00',
        };
      }
    }
  }

  @override
  void dispose() {
    _notesController.dispose();
    super.dispose();
  }

  Future<void> _submitRequest() async {
    setState(() => _isSubmitting = true);
    final user = ref.read(authProvider).user;
    if (user == null) return;

    final repo = ref.read(employeeRepositoryProvider);
    final now = DateTime.now();
    final monthStr = '${now.year}-${now.month.toString().padLeft(2, '0')}';

    final success = await repo.submitRequestToServer(
      user: user,
      requestType: 'roster_update',
      reqId: 'roster_req_${DateTime.now().millisecondsSinceEpoch}',
      reason: _notesController.text.trim().isNotEmpty
          ? _notesController.text.trim()
          : 'طلب اعتماد جدول الورديات الشهري',
      details: 'طلب اعتماد جدول العمل وتوزيع الورديات لشهر $monthStr',
      targetBranchId: user.branchId,
      targetBranchName: user.branchName,
      extraPayload: {
        'month': monthStr,
        'schedule': _schedule,
        'requestType': 'roster_update',
      },
    );

    setState(() => _isSubmitting = false);
    if (mounted) {
      Navigator.pop(context);
      widget.onSubmitted();
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            success
                ? '✅ تم إرسال طلب اعتماد وتعديل الجدول الشهري إلى الإدارة بنجاح'
                : '⚠️ تم حفظ الطلب ومزامنته محلياً',
          ),
          backgroundColor: AppColors.primary,
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Container(
      height: MediaQuery.of(context).size.height * 0.85,
      padding: EdgeInsets.only(
        top: 20,
        left: 20,
        right: 20,
        bottom: MediaQuery.of(context).viewInsets.bottom + 20,
      ),
      decoration: BoxDecoration(
        color:
            Theme.of(context).cardTheme.color ??
            (isDark ? AppColors.darkSurface : Colors.white),
        borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Row(
                children: [
                  Icon(
                    Icons.edit_calendar_rounded,
                    color: AppColors.primary,
                    size: 22,
                  ),
                  SizedBox(width: 8),
                  Text(
                    'طلب اعتماد وتعديل الجدول الشهري',
                    style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
                  ),
                ],
              ),
              IconButton(
                icon: const Icon(Icons.close),
                onPressed: () => Navigator.pop(context),
              ),
            ],
          ),
          const SizedBox(height: 6),
          const Text(
            'حدد مواعيد العمل وأيام الراحة للأسبوع، وسيتم تطبيقها تلقائياً على مدار الشهر فور اعتماد الإدارة',
            style: TextStyle(fontSize: 11.5, color: Colors.grey),
          ),
          const Divider(height: 20),

          Expanded(
            child: ListView.separated(
              itemCount: _days.length,
              separatorBuilder: (_, __) => const SizedBox(height: 10),
              itemBuilder: (context, index) {
                final day = _days[index];
                final conf = _schedule[day]!;
                final isOff = conf['type'] == 'off';

                return Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 14,
                    vertical: 8,
                  ),
                  decoration: BoxDecoration(
                    color: isDark
                        ? Colors.black.withValues(alpha: 0.25)
                        : const Color(0xFFF8FAFC),
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(
                      color: isDark
                          ? AppColors.darkBorder
                          : const Color(0xFFE2E8F0),
                    ),
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        day,
                        style: const TextStyle(
                          fontWeight: FontWeight.bold,
                          fontSize: 13.5,
                        ),
                      ),
                      Row(
                        children: [
                          ChoiceChip(
                            label: const Text(
                              'عمل',
                              style: TextStyle(fontSize: 11),
                            ),
                            selected: !isOff,
                            onSelected: (val) =>
                                setState(() => conf['type'] = 'shift'),
                            selectedColor: AppColors.morningShift.withValues(
                              alpha: 0.2,
                            ),
                          ),
                          const SizedBox(width: 6),
                          ChoiceChip(
                            label: const Text(
                              'راحة OFF',
                              style: TextStyle(fontSize: 11),
                            ),
                            selected: isOff,
                            onSelected: (val) =>
                                setState(() => conf['type'] = 'off'),
                            selectedColor: AppColors.dayOff.withValues(
                              alpha: 0.2,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                );
              },
            ),
          ),

          const SizedBox(height: 10),
          TextField(
            controller: _notesController,
            decoration: InputDecoration(
              hintText: 'ملاحظات إضافية لمدير الفرع والإدارة (اختياري)...',
              filled: true,
              fillColor: isDark
                  ? Colors.black.withValues(alpha: 0.2)
                  : const Color(0xFFF8FAFC),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
              ),
            ),
          ),
          const SizedBox(height: 14),

          SizedBox(
            width: double.infinity,
            height: 48,
            child: ElevatedButton.icon(
              onPressed: _isSubmitting ? null : _submitRequest,
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.primary,
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
              icon: _isSubmitting
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(
                        color: Colors.white,
                        strokeWidth: 2,
                      ),
                    )
                  : const Icon(Icons.send_rounded, size: 18),
              label: const Text(
                'إرسال طلب الاعتماد إلى الإدارة',
                style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
