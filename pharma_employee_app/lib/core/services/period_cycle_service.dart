import '../../data/models/attendance_model.dart';

class PayrollCycleSettings {
  final int startDay;
  final int endDay;
  final String startTime;
  final String endTime;
  final String periodType;
  final String customFrom;
  final String customTo;

  const PayrollCycleSettings({
    this.startDay = 21,
    this.endDay = 20,
    this.startTime = '00:00',
    this.endTime = '23:59',
    this.periodType = 'cycle',
    this.customFrom = '',
    this.customTo = '',
  });
}

class PayrollCycleRange {
  final String startDate;
  final String endDate;
  final String label;
  final String shortLabel;
  final String cycleMonth; // YYYY-MM
  final int daysCount;
  final bool isCustom;
  final DateTime startDateTime;
  final DateTime endDateTime;

  const PayrollCycleRange({
    required this.startDate,
    required this.endDate,
    required this.label,
    required this.shortLabel,
    required this.cycleMonth,
    required this.daysCount,
    this.isCustom = false,
    required this.startDateTime,
    required this.endDateTime,
  });

  bool containsDate(DateTime date) {
    final d = DateTime(date.year, date.month, date.day);
    final s = DateTime(startDateTime.year, startDateTime.month, startDateTime.day);
    final e = DateTime(endDateTime.year, endDateTime.month, endDateTime.day);
    return !d.isBefore(s) && !d.isAfter(e);
  }

  bool containsDateStr(String dateStr) {
    if (dateStr.length < 10) return false;
    final clean = dateStr.substring(0, 10);
    return clean.compareTo(startDate) >= 0 && clean.compareTo(endDate) <= 0;
  }
}

class PeriodCycleService {
  static const List<String> arabicMonths = [
    'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
    'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
  ];

  static int getDaysInMonth(int year, int month) {
    if (month < 1 || month > 12) return 30;
    return DateTime(year, month + 1, 0).day;
  }

  static int clampDayToMonth(int year, int month, int targetDay) {
    final maxDays = getDaysInMonth(year, month);
    return targetDay.clamp(1, maxDays);
  }

  /// استخراج إعدادات دورة الرواتب والدوام من إعدادات المؤسسة
  static PayrollCycleSettings extractPayrollSettings(Map<String, dynamic>? orgSettings) {
    if (orgSettings == null) return const PayrollCycleSettings();

    final sDayRaw = orgSettings['payrollPayoutStartDay'];
    final eDayRaw = orgSettings['payrollPayoutEndDay'] ?? orgSettings['payrollPayoutDay'];

    int startDay = int.tryParse(sDayRaw?.toString() ?? '') ?? 21;
    int endDay = int.tryParse(eDayRaw?.toString() ?? '') ?? 20;

    // إذا كانت البداية بعد اليوم الأول والنهاية مساوية للبداية، نجعل النهاية تلقائياً اليوم السابق
    if (startDay > 1 && endDay == startDay) {
      endDay = startDay - 1;
    }

    final sTime = orgSettings['payrollPayoutStartTime']?.toString() ?? '00:00';
    final eTime = orgSettings['payrollPayoutEndTime']?.toString() ?? '23:59';
    final pType = orgSettings['payrollPeriodType']?.toString() ?? 'cycle';
    final cFrom = orgSettings['payrollCustomFrom']?.toString() ?? '';
    final cTo = orgSettings['payrollCustomTo']?.toString() ?? '';

    return PayrollCycleSettings(
      startDay: startDay,
      endDay: endDay,
      startTime: sTime,
      endTime: eTime,
      periodType: pType,
      customFrom: cFrom,
      customTo: cTo,
    );
  }

  /// تحديد الشهر المالي المعتمد النشط حالياً وفق التوقيت الفعلي وتاريخ الإغلاق
  static String getActivePayrollMonth(Map<String, dynamic>? orgSettings, [DateTime? refDate]) {
    final settings = extractPayrollSettings(orgSettings);

    if (settings.periodType == 'custom' && settings.customFrom.length >= 7) {
      return settings.customFrom.substring(0, 7);
    }

    final now = refDate ?? DateTime.now();
    final y = now.year;
    final m = now.month;
    final day = now.day;
    final timeStr = '${now.hour.toString().padLeft(2, '0')}:${now.minute.toString().padLeft(2, '0')}';

    final effectiveEndTime = (settings.endTime.isEmpty || settings.endTime == '00:00' || settings.endTime == '0:00')
        ? '23:59'
        : settings.endTime;

    final isPastCutoff = day > settings.endDay || (day == settings.endDay && timeStr.compareTo(effectiveEndTime) >= 0);

    if (isPastCutoff) {
      int nextY = y;
      int nextM = m + 1;
      if (nextM > 12) {
        nextM = 1;
        nextY = y + 1;
      }
      return '$nextY-${nextM.toString().padLeft(2, '0')}';
    } else {
      return '$y-${m.toString().padLeft(2, '0')}';
    }
  }

  /// حساب تاريخ البداية والنهاية الدقيق للدورة الشهرية المعتمدة
  static PayrollCycleRange getCycleDateRange(String? monthStr, Map<String, dynamic>? orgSettings) {
    final settings = extractPayrollSettings(orgSettings);

    // حالة الفترة المخصصة
    if (settings.periodType == 'custom' && settings.customFrom.isNotEmpty && settings.customTo.isNotEmpty) {
      final from = settings.customFrom.compareTo(settings.customTo) <= 0 ? settings.customFrom : settings.customTo;
      final to = settings.customFrom.compareTo(settings.customTo) <= 0 ? settings.customTo : settings.customFrom;
      final d1 = DateTime.tryParse('$from 00:00:00') ?? DateTime.now();
      final d2 = DateTime.tryParse('$to 23:59:59') ?? DateTime.now();
      final daysCount = (d2.difference(d1).inDays + 1).clamp(1, 365);

      return PayrollCycleRange(
        startDate: from,
        endDate: to,
        label: 'فترة مخصصة ($from إلى $to)',
        shortLabel: '${from.substring(5)} ➔ ${to.substring(5)}',
        cycleMonth: from.substring(0, 7),
        daysCount: daysCount,
        isCustom: true,
        startDateTime: d1,
        endDateTime: d2,
      );
    }

    String targetMonth = monthStr ?? '';
    if (targetMonth.length < 7) {
      targetMonth = getActivePayrollMonth(orgSettings);
    }

    final parts = targetMonth.split('-');
    final y = int.tryParse(parts[0]) ?? DateTime.now().year;
    final m = int.tryParse(parts.length > 1 ? parts[1] : '') ?? DateTime.now().month;

    final startDay = settings.startDay;
    final endDay = settings.endDay;

    final isCrossMonth = startDay > endDay || (startDay > 1 && (endDay - startDay) < 20);

    String startDate;
    String endDate;

    if (isCrossMonth) {
      // دورة عبر شهرين (من الشهر السابق إلى الشهر الحالي)
      int prevY = y;
      int prevM = m - 1;
      if (prevM < 1) {
        prevM = 12;
        prevY = y - 1;
      }

      final clampedStart = clampDayToMonth(prevY, prevM, startDay);
      final clampedEnd = clampDayToMonth(y, m, endDay);

      startDate = '$prevY-${prevM.toString().padLeft(2, '0')}-${clampedStart.toString().padLeft(2, '0')}';
      endDate = '$y-${m.toString().padLeft(2, '0')}-${clampedEnd.toString().padLeft(2, '0')}';
    } else {
      // دورة في نفس الشهر (من 1 إلى 30 أو 31)
      final clampedStart = clampDayToMonth(y, m, startDay);
      final clampedEnd = clampDayToMonth(y, m, endDay);

      startDate = '$y-${m.toString().padLeft(2, '0')}-${clampedStart.toString().padLeft(2, '0')}';
      endDate = '$y-${m.toString().padLeft(2, '0')}-${clampedEnd.toString().padLeft(2, '0')}';
    }

    final d1 = DateTime.tryParse('$startDate 00:00:00') ?? DateTime.now();
    final d2 = DateTime.tryParse('$endDate 23:59:59') ?? DateTime.now();
    final daysCount = (d2.difference(d1).inDays + 1).clamp(1, 365);

    final monthName = arabicMonths[(m - 1 + 12) % 12];
    final label = 'دورة شهر $monthName $y (من $startDate إلى $endDate)';
    final shortLabel = '[${startDate.substring(5)} ➔ ${endDate.substring(5)}]';

    return PayrollCycleRange(
      startDate: startDate,
      endDate: endDate,
      label: label,
      shortLabel: shortLabel,
      cycleMonth: targetMonth,
      daysCount: daysCount,
      isCustom: false,
      startDateTime: d1,
      endDateTime: d2,
    );
  }

  /// إنشاء قائمة بالدورات الشهرية المتاحة للاختيار من القوائم المنسدلة
  static List<PayrollCycleRange> getAvailableCycles(
    Map<String, dynamic>? orgSettings, {
    int pastMonths = 5,
    int futureMonths = 2,
  }) {
    final activeMonth = getActivePayrollMonth(orgSettings);
    final parts = activeMonth.split('-');
    final activeY = int.tryParse(parts[0]) ?? DateTime.now().year;
    final activeM = int.tryParse(parts.length > 1 ? parts[1] : '') ?? DateTime.now().month;

    final List<PayrollCycleRange> list = [];

    // من الأشهر المستقبلية للأشهر السابقة
    for (int offset = futureMonths; offset >= -pastMonths; offset--) {
      int curM = activeM + offset;
      int curY = activeY;
      while (curM > 12) {
        curM -= 12;
        curY += 1;
      }
      while (curM < 1) {
        curM += 12;
        curY -= 1;
      }

      final monthStr = '$curY-${curM.toString().padLeft(2, '0')}';
      list.add(getCycleDateRange(monthStr, orgSettings));
    }

    return list;
  }

  /// فلترة سجلات البصمات وفق الدورة المعتمدة
  static List<AttendanceRecord> filterShiftsByCycle(
    List<AttendanceRecord> shifts,
    PayrollCycleRange range,
  ) {
    return shifts.where((s) {
      final dStr = s.date.substring(0, 10);
      return dStr.compareTo(range.startDate) >= 0 && dStr.compareTo(range.endDate) <= 0;
    }).toList();
  }

  /// حساب ساعات العمل الفعلية داخل نطاق الدورة المعتمدة بدقة
  static double calculateWorkingHoursInCycle(
    List<AttendanceRecord> shifts,
    PayrollCycleRange range,
  ) {
    final cycleShifts = filterShiftsByCycle(shifts, range);
    double total = 0.0;
    for (final s in cycleShifts) {
      total += s.workedHours;
    }
    return total;
  }
}
