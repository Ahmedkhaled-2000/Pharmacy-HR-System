enum RequestStatus {
  pending,
  approved,
  rejected,
  cancelled;

  String get labelAr {
    switch (this) {
      case RequestStatus.pending:
        return 'قيد المراجعة ⏳';
      case RequestStatus.approved:
        return 'معتمد ✅';
      case RequestStatus.rejected:
        return 'مرفوض ❌';
      case RequestStatus.cancelled:
        return 'ملغي 🚫';
    }
  }
}

enum LeaveType {
  annual,
  sick,
  casual,
  unpaid,
  paternity,
  bereavement,
  compOff,
  weeklyRest;

  String get labelAr {
    switch (this) {
      case LeaveType.annual:
        return 'إجازة سنوية اعتيادية';
      case LeaveType.sick:
        return 'إجازة مرضية (بتقرير طبي)';
      case LeaveType.casual:
        return 'إجازة عارضة';
      case LeaveType.unpaid:
        return 'إجازة بدون راتب';
      case LeaveType.paternity:
        return 'إجازة رعاية / أبوة';
      case LeaveType.bereavement:
        return 'إجازة وفاة / حداد';
      case LeaveType.compOff:
        return 'بدل راحة (تعويض)';
      case LeaveType.weeklyRest:
        return 'راحة أسبوعية';
    }
  }
}

class LeaveRequest {
  final String id;
  final String employeeId;
  final LeaveType type;
  final DateTime startDate;
  final DateTime endDate;
  final int daysCount;
  final String reason;
  final RequestStatus status;
  final String? adminNote;
  final DateTime createdAt;

  const LeaveRequest({
    required this.id,
    required this.employeeId,
    required this.type,
    required this.startDate,
    required this.endDate,
    required this.daysCount,
    required this.reason,
    this.status = RequestStatus.pending,
    this.adminNote,
    required this.createdAt,
  });

  Map<String, dynamic> toJson() => {
    'id': id,
    'employeeId': employeeId,
    'type': type.name,
    'startDate': startDate.toIso8601String(),
    'endDate': endDate.toIso8601String(),
    'daysCount': daysCount,
    'reason': reason,
    'status': status.name,
    'adminNote': adminNote,
    'createdAt': createdAt.toIso8601String(),
  };

  factory LeaveRequest.fromJson(Map<String, dynamic> json) => LeaveRequest(
    id: json['id'] as String,
    employeeId: json['employeeId'] as String? ?? '',
    type: LeaveType.values.firstWhere(
      (e) => e.name == json['type'],
      orElse: () => LeaveType.annual,
    ),
    startDate: DateTime.parse(json['startDate'] as String),
    endDate: DateTime.parse(json['endDate'] as String),
    daysCount: (json['daysCount'] as num).toInt(),
    reason: json['reason'] as String? ?? '',
    status: RequestStatus.values.firstWhere(
      (e) => e.name == json['status'],
      orElse: () => RequestStatus.pending,
    ),
    adminNote: json['adminNote'] as String?,
    createdAt: DateTime.parse(json['createdAt'] as String),
  );
}

class PermissionRequest {
  final String id;
  final String employeeId;
  final DateTime date;
  final String exitTime;
  final String returnTime;
  final double hours;
  final bool isDeducted;
  final String reason;
  final RequestStatus status;
  final String? adminNote;
  final DateTime createdAt;

  const PermissionRequest({
    required this.id,
    required this.employeeId,
    required this.date,
    required this.exitTime,
    required this.returnTime,
    required this.hours,
    this.isDeducted = false,
    required this.reason,
    this.status = RequestStatus.pending,
    this.adminNote,
    required this.createdAt,
  });

  Map<String, dynamic> toJson() => {
    'id': id,
    'employeeId': employeeId,
    'date': date.toIso8601String(),
    'exitTime': exitTime,
    'returnTime': returnTime,
    'hours': hours,
    'isDeducted': isDeducted,
    'reason': reason,
    'status': status.name,
    'adminNote': adminNote,
    'createdAt': createdAt.toIso8601String(),
  };

  factory PermissionRequest.fromJson(Map<String, dynamic> json) => PermissionRequest(
    id: json['id'] as String,
    employeeId: json['employeeId'] as String? ?? '',
    date: DateTime.parse(json['date'] as String),
    exitTime: json['exitTime'] as String? ?? '00:00',
    returnTime: json['returnTime'] as String? ?? '00:00',
    hours: (json['hours'] as num?)?.toDouble() ?? 1.0,
    isDeducted: json['isDeducted'] as bool? ?? false,
    reason: json['reason'] as String? ?? '',
    status: RequestStatus.values.firstWhere(
      (e) => e.name == json['status'],
      orElse: () => RequestStatus.pending,
    ),
    adminNote: json['adminNote'] as String?,
    createdAt: DateTime.parse(json['createdAt'] as String),
  );
}

enum LoanType {
  cash,
  medicine;

  String get labelAr => this == LoanType.cash ? 'سلفة نقدية' : 'مشتريات علاج / أدوية آجل';
}

class LoanRequest {
  final String id;
  final String employeeId;
  final double amount;
  final LoanType loanType;
  final int installmentsCount;
  final double monthlyDeduction;
  final String reason;
  final RequestStatus status;
  final String? adminNote;
  final DateTime createdAt;

  const LoanRequest({
    required this.id,
    required this.employeeId,
    required this.amount,
    required this.loanType,
    required this.installmentsCount,
    required this.monthlyDeduction,
    required this.reason,
    this.status = RequestStatus.pending,
    this.adminNote,
    required this.createdAt,
  });

  Map<String, dynamic> toJson() => {
    'id': id,
    'employeeId': employeeId,
    'amount': amount,
    'loanType': loanType.name,
    'installmentsCount': installmentsCount,
    'monthlyDeduction': monthlyDeduction,
    'reason': reason,
    'status': status.name,
    'adminNote': adminNote,
    'createdAt': createdAt.toIso8601String(),
  };

  factory LoanRequest.fromJson(Map<String, dynamic> json) => LoanRequest(
    id: json['id'] as String,
    employeeId: json['employeeId'] as String? ?? '',
    amount: (json['amount'] as num).toDouble(),
    loanType: LoanType.values.firstWhere(
      (e) => e.name == json['loanType'],
      orElse: () => LoanType.cash,
    ),
    installmentsCount: (json['installmentsCount'] as num).toInt(),
    monthlyDeduction: (json['monthlyDeduction'] as num).toDouble(),
    reason: json['reason'] as String? ?? '',
    status: RequestStatus.values.firstWhere(
      (e) => e.name == json['status'],
      orElse: () => RequestStatus.pending,
    ),
    adminNote: json['adminNote'] as String?,
    createdAt: DateTime.parse(json['createdAt'] as String),
  );
}

class ShiftSwapRequest {
  final String id;
  final String employeeId;
  final String employeeName;
  final DateTime shiftDate;
  final String targetEmployeeId;
  final String targetEmployeeName;
  final String branchId;
  final String branchName;
  final String reason;
  final RequestStatus status;
  final String? adminNote;
  final DateTime createdAt;

  const ShiftSwapRequest({
    required this.id,
    required this.employeeId,
    required this.employeeName,
    required this.shiftDate,
    required this.targetEmployeeId,
    required this.targetEmployeeName,
    required this.branchId,
    required this.branchName,
    required this.reason,
    this.status = RequestStatus.pending,
    this.adminNote,
    required this.createdAt,
  });

  Map<String, dynamic> toJson() => {
    'id': id,
    'employeeId': employeeId,
    'employeeName': employeeName,
    'shiftDate': shiftDate.toIso8601String(),
    'targetEmployeeId': targetEmployeeId,
    'targetEmployeeName': targetEmployeeName,
    'branchId': branchId,
    'branchName': branchName,
    'reason': reason,
    'status': status.name,
    'adminNote': adminNote,
    'createdAt': createdAt.toIso8601String(),
  };

  factory ShiftSwapRequest.fromJson(Map<String, dynamic> json) => ShiftSwapRequest(
    id: json['id'] as String,
    employeeId: json['employeeId'] as String? ?? '',
    employeeName: json['employeeName'] as String? ?? '',
    shiftDate: DateTime.parse(json['shiftDate'] as String),
    targetEmployeeId: json['targetEmployeeId'] as String? ?? '',
    targetEmployeeName: json['targetEmployeeName'] as String? ?? '',
    branchId: json['branchId'] as String? ?? '',
    branchName: json['branchName'] as String? ?? '',
    reason: json['reason'] as String? ?? '',
    status: RequestStatus.values.firstWhere(
      (e) => e.name == json['status'],
      orElse: () => RequestStatus.pending,
    ),
    adminNote: json['adminNote'] as String?,
    createdAt: DateTime.parse(json['createdAt'] as String),
  );
}

class MissedPunchRequest {
  final String id;
  final String employeeId;
  final DateTime punchDate;
  final String punchType; // 'in' | 'out' | 'both'
  final String checkIn;
  final String checkOut;
  final String branchId;
  final String? branchName;
  final String reason;
  final RequestStatus status;
  final String? adminNote;
  final DateTime createdAt;

  const MissedPunchRequest({
    required this.id,
    required this.employeeId,
    required this.punchDate,
    this.punchType = 'both',
    required this.checkIn,
    required this.checkOut,
    required this.branchId,
    this.branchName,
    required this.reason,
    this.status = RequestStatus.pending,
    this.adminNote,
    required this.createdAt,
  });

  Map<String, dynamic> toJson() => {
    'id': id,
    'employeeId': employeeId,
    'punchDate': punchDate.toIso8601String(),
    'punchType': punchType,
    'checkIn': checkIn,
    'checkOut': checkOut,
    'branchId': branchId,
    'branchName': branchName,
    'reason': reason,
    'status': status.name,
    'adminNote': adminNote,
    'createdAt': createdAt.toIso8601String(),
  };

  factory MissedPunchRequest.fromJson(Map<String, dynamic> json) => MissedPunchRequest(
    id: json['id'] as String,
    employeeId: json['employeeId'] as String? ?? '',
    punchDate: DateTime.parse(json['punchDate'] as String),
    punchType: json['punchType'] as String? ?? 'both',
    checkIn: json['checkIn'] as String? ?? '',
    checkOut: json['checkOut'] as String? ?? '',
    branchId: json['branchId'] as String? ?? '',
    branchName: json['branchName'] as String?,
    reason: json['reason'] as String? ?? '',
    status: RequestStatus.values.firstWhere(
      (e) => e.name == json['status'],
      orElse: () => RequestStatus.pending,
    ),
    adminNote: json['adminNote'] as String?,
    createdAt: DateTime.parse(json['createdAt'] as String),
  );
}

class ResignationRequest {
  final String id;
  final String employeeId;
  final DateTime submissionDate;
  final DateTime? requestDate;
  final DateTime lastWorkingDay;
  final String reason;
  final String handoverNotes;
  final bool noticePeriodServed;
  final RequestStatus status;
  final String? adminNote;
  final DateTime createdAt;

  const ResignationRequest({
    required this.id,
    required this.employeeId,
    DateTime? submissionDate,
    this.requestDate,
    required this.lastWorkingDay,
    required this.reason,
    this.handoverNotes = '',
    this.noticePeriodServed = true,
    this.status = RequestStatus.pending,
    this.adminNote,
    required this.createdAt,
  }) : submissionDate = submissionDate ?? requestDate ?? createdAt;

  Map<String, dynamic> toJson() => {
    'id': id,
    'employeeId': employeeId,
    'submissionDate': submissionDate.toIso8601String(),
    'lastWorkingDay': lastWorkingDay.toIso8601String(),
    'reason': reason,
    'handoverNotes': handoverNotes,
    'status': status.name,
    'adminNote': adminNote,
    'createdAt': createdAt.toIso8601String(),
  };

  factory ResignationRequest.fromJson(Map<String, dynamic> json) => ResignationRequest(
    id: json['id'] as String,
    employeeId: json['employeeId'] as String? ?? '',
    submissionDate: DateTime.parse(json['submissionDate'] as String),
    lastWorkingDay: DateTime.parse(json['lastWorkingDay'] as String),
    reason: json['reason'] as String? ?? '',
    handoverNotes: json['handoverNotes'] as String? ?? '',
    status: RequestStatus.values.firstWhere(
      (e) => e.name == json['status'],
      orElse: () => RequestStatus.pending,
    ),
    adminNote: json['adminNote'] as String?,
    createdAt: DateTime.parse(json['createdAt'] as String),
  );
}

