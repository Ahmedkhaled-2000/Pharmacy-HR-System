enum ShiftPeriod {
  morning,
  evening,
  night,
  dayOff;

  String get labelAr {
    switch (this) {
      case ShiftPeriod.morning:
        return 'صباحي ☀️';
      case ShiftPeriod.evening:
        return 'مسائي 🌙';
      case ShiftPeriod.night:
        return 'سهر 🌌';
      case ShiftPeriod.dayOff:
        return 'راحة 🏖️';
    }
  }

  String get defaultTimeRange {
    switch (this) {
      case ShiftPeriod.morning:
        return '08:00 ص - 04:00 م';
      case ShiftPeriod.evening:
        return '04:00 م - 12:00 ص';
      case ShiftPeriod.night:
        return '12:00 ص - 08:00 ص';
      case ShiftPeriod.dayOff:
        return 'عطلة رسمية';
    }
  }
}

class ShiftRosterItem {
  final String date; // '2026-11-01'
  final int dayNumber;
  final String dayNameAr;
  final ShiftPeriod period;
  final String branchId;
  final String branchName;
  final String timeRange;
  final bool isToday;

  const ShiftRosterItem({
    required this.date,
    required this.dayNumber,
    required this.dayNameAr,
    required this.period,
    required this.branchId,
    required this.branchName,
    required this.timeRange,
    this.isToday = false,
  });

  Map<String, dynamic> toJson() => {
    'date': date,
    'dayNumber': dayNumber,
    'dayNameAr': dayNameAr,
    'period': period.name,
    'branchId': branchId,
    'branchName': branchName,
    'timeRange': timeRange,
    'isToday': isToday,
  };

  factory ShiftRosterItem.fromJson(Map<String, dynamic> json) => ShiftRosterItem(
    date: json['date'] as String,
    dayNumber: (json['dayNumber'] as num).toInt(),
    dayNameAr: json['dayNameAr'] as String? ?? '',
    period: ShiftPeriod.values.firstWhere(
      (e) => e.name == json['period'],
      orElse: () => ShiftPeriod.morning,
    ),
    branchId: json['branchId'] as String? ?? '',
    branchName: json['branchName'] as String? ?? '',
    timeRange: json['timeRange'] as String? ?? '',
    isToday: json['isToday'] as bool? ?? false,
  );
}

