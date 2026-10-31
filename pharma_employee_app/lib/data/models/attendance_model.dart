enum AttendanceStatus {
  present,
  late,
  absent,
  leave,
  dayOff;

  String get labelAr {
    switch (this) {
      case AttendanceStatus.present:
        return 'حاضر 🟢';
      case AttendanceStatus.late:
        return 'تأخير 🟡';
      case AttendanceStatus.absent:
        return 'غياب 🔴';
      case AttendanceStatus.leave:
        return 'إجازة 🔵';
      case AttendanceStatus.dayOff:
        return 'راحة 🏖️';
    }
  }
}

class AttendanceRecord {
  final String id;
  final String employeeId;
  final String date;
  final String checkIn;
  final String checkOut;
  final String? breakStart;
  final String? breakEnd;
  final double workedHours;
  final double requiredHours;
  final int delayMinutes;
  final int overtimeMinutes;
  final AttendanceStatus status;
  final String branchId;
  final String branchName;
  final String? note;

  const AttendanceRecord({
    required this.id,
    required this.employeeId,
    required this.date,
    required this.checkIn,
    required this.checkOut,
    this.breakStart,
    this.breakEnd,
    required this.workedHours,
    required this.requiredHours,
    required this.delayMinutes,
    required this.overtimeMinutes,
    required this.status,
    required this.branchId,
    required this.branchName,
    this.note,
  });

  String get timeIn => checkIn;
  String get timeOut => checkOut;

  Map<String, dynamic> toJson() => {
    'id': id,
    'employeeId': employeeId,
    'date': date,
    'checkIn': checkIn,
    'checkOut': checkOut,
    'breakStart': breakStart,
    'breakEnd': breakEnd,
    'workedHours': workedHours,
    'requiredHours': requiredHours,
    'delayMinutes': delayMinutes,
    'overtimeMinutes': overtimeMinutes,
    'status': status.name,
    'branchId': branchId,
    'branchName': branchName,
    'note': note,
  };

  factory AttendanceRecord.fromJson(Map<String, dynamic> json) {
    final rawCheckIn = json['timeIn'] ?? json['checkIn'] ?? json['punchIn'] ?? json['startTime'] ?? '--:--';
    final rawCheckOut = json['timeOut'] ?? json['checkOut'] ?? json['punchOut'] ?? json['endTime'] ?? '--:--';

    final num? rawHours = (json['hours'] ?? json['netHours'] ?? json['actualWorkedHours'] ?? json['workHours'] ?? json['workedHours']) as num?;
    final workedH = rawHours?.toDouble() ?? 0.0;

    final num? rawSched = (json['scheduledHours'] ?? json['requiredHours'] ?? 8) as num?;
    final requiredH = rawSched?.toDouble() ?? 8.0;

    final statusStr = (json['statusLabel'] ?? json['status'] ?? '').toString().toLowerCase();
    AttendanceStatus attStatus = AttendanceStatus.present;
    if (statusStr.contains('تأخير') || statusStr.contains('late')) {
      attStatus = AttendanceStatus.late;
    } else if (statusStr.contains('غياب') || statusStr.contains('absent')) {
      attStatus = AttendanceStatus.absent;
    } else if (statusStr.contains('إجازة') || statusStr.contains('leave')) {
      attStatus = AttendanceStatus.leave;
    } else if (statusStr.contains('راحة') || statusStr.contains('off') || statusStr.contains('dayoff')) {
      attStatus = AttendanceStatus.dayOff;
    }

    return AttendanceRecord(
      id: (json['id'] ?? 'shift_${DateTime.now().millisecondsSinceEpoch}').toString(),
      employeeId: (json['employeeId'] ?? json['employeeCode'] ?? '').toString(),
      date: (json['date'] ?? '').toString(),
      checkIn: rawCheckIn.toString(),
      checkOut: rawCheckOut.toString(),
      breakStart: json['breakStart']?.toString(),
      breakEnd: json['breakEnd']?.toString(),
      workedHours: workedH,
      requiredHours: requiredH,
      delayMinutes: (json['delayMinutes'] as num?)?.toInt() ?? (json['latenessMinutes'] as num?)?.toInt() ?? 0,
      overtimeMinutes: (json['overtimeMinutes'] as num?)?.toInt() ?? 0,
      status: attStatus,
      branchId: (json['branchId'] ?? '').toString(),
      branchName: (json['branchName'] ?? json['branch'] ?? '').toString(),
      note: json['note']?.toString() ?? json['notes']?.toString(),
    );
  }
}

