import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/constants/app_colors.dart';
import '../../data/models/roster_model.dart';
import '../providers/employee_data_provider.dart';

class HorizontalShiftStrip extends ConsumerStatefulWidget {
  final ValueChanged<DateTime>? onDateSelected;

  const HorizontalShiftStrip({super.key, this.onDateSelected});

  @override
  ConsumerState<HorizontalShiftStrip> createState() => _HorizontalShiftStripState();
}

class _HorizontalShiftStripState extends ConsumerState<HorizontalShiftStrip> {
  late DateTime _selectedDate;

  @override
  void initState() {
    super.initState();
    final now = DateTime.now();
    _selectedDate = DateTime(now.year, now.month, now.day, 12, 0);
  }

  static const List<String> _arabicDayNames = [
    'الإثنين',
    'الثلاثاء',
    'الأربعاء',
    'الخميس',
    'الجمعة',
    'السبت',
    'الأحد',
  ];

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day, 12, 0);

    final roster = ref.watch(employeeDataProvider).snapshot?.rosterItems ?? [];

    // توليد أيام الأسبوع السبعة الملتفة حول تاريخ اليوم بطريقة تقويمية محكمة ومحمية ضد التوقيت الصيفي
    final weekDays = List.generate(7, (i) {
      return DateTime(today.year, today.month, today.day - 3 + i, 12, 0);
    });

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'جدول ورديات الأسبوع الحالي',
          style: TextStyle(
            fontWeight: FontWeight.bold,
            fontSize: 13,
            color: isDark ? Colors.white : const Color(0xFF0F172A),
          ),
        ),
        const SizedBox(height: 10),
        SizedBox(
          height: 84,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            itemCount: weekDays.length,
            separatorBuilder: (_, __) => const SizedBox(width: 8),
            itemBuilder: (context, index) {
              final date = weekDays[index];
              final dateStr = '${date.year}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}';
              final isToday = date.year == today.year && date.month == today.month && date.day == today.day;
              final isSelected = date.year == _selectedDate.year && date.month == _selectedDate.month && date.day == _selectedDate.day;

              // البحث عن الوردية في الجدول
              final rosterItem = roster.firstWhere(
                (r) => r.date == dateStr,
                orElse: () => ShiftRosterItem(
                  date: dateStr,
                  dayNumber: date.day,
                  dayNameAr: _arabicDayNames[date.weekday - 1],
                  period: date.weekday == DateTime.friday ? ShiftPeriod.dayOff : ShiftPeriod.morning,
                  branchId: '',
                  branchName: '',
                  timeRange: date.weekday == DateTime.friday ? 'راحة أسبوعية' : '08:00 ص - 04:00 م',
                ),
              );

              Color shiftColor;
              switch (rosterItem.period) {
                case ShiftPeriod.morning:
                  shiftColor = AppColors.morningShift;
                  break;
                case ShiftPeriod.evening:
                  shiftColor = AppColors.eveningShift;
                  break;
                case ShiftPeriod.night:
                  shiftColor = AppColors.nightShift;
                  break;
                case ShiftPeriod.dayOff:
                  shiftColor = AppColors.dayOff;
                  break;
              }

              return GestureDetector(
                onTap: () {
                  setState(() => _selectedDate = date);
                  widget.onDateSelected?.call(date);
                },
                child: Container(
                  width: 66,
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  decoration: BoxDecoration(
                    color: isSelected 
                        ? shiftColor.withValues(alpha: isDark ? 0.25 : 0.15) 
                        : (Theme.of(context).cardTheme.color ?? (isDark ? AppColors.darkSurface : Colors.white)),
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(
                      color: isSelected 
                          ? shiftColor 
                          : (isToday ? AppColors.primary : (isDark ? AppColors.darkBorder : const Color(0xFFE2E8F0))),
                      width: isSelected ? 2.0 : (isToday ? 1.5 : 1.1),
                    ),
                    boxShadow: isDark || !isSelected
                        ? null
                        : [
                            BoxShadow(
                              color: shiftColor.withValues(alpha: 0.15),
                              blurRadius: 8,
                              offset: const Offset(0, 3),
                            ),
                          ],
                  ),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        _arabicDayNames[date.weekday - 1],
                        style: TextStyle(
                          fontSize: 10,
                          fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
                          color: isSelected ? shiftColor : (isDark ? Colors.grey : const Color(0xFF64748B)),
                        ),
                      ),
                      Text(
                        '${date.day}',
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w900,
                          color: isSelected ? shiftColor : (isDark ? Colors.white : const Color(0xFF0F172A)),
                        ),
                      ),
                      Container(
                        width: 7,
                        height: 7,
                        decoration: BoxDecoration(
                          color: shiftColor,
                          shape: BoxShape.circle,
                        ),
                      ),
                    ],
                  ),
                ),
              );
            },
          ),
        ),
      ],
    );
  }
}
