class BranchSalaryShare {
  final String branchId;
  final String branchName;
  final double workedHours;
  final double shareAmount;

  const BranchSalaryShare({
    required this.branchId,
    required this.branchName,
    required this.workedHours,
    required this.shareAmount,
  });

  Map<String, dynamic> toJson() => {
    'branchId': branchId,
    'branchName': branchName,
    'workedHours': workedHours,
    'shareAmount': shareAmount,
  };

  factory BranchSalaryShare.fromJson(Map<String, dynamic> json) => BranchSalaryShare(
    branchId: json['branchId'] as String? ?? '',
    branchName: json['branchName'] as String? ?? '',
    workedHours: (json['workedHours'] as num?)?.toDouble() ?? 0.0,
    shareAmount: (json['shareAmount'] as num?)?.toDouble() ?? 0.0,
  );
}

class SalarySlipModel {
  final String id;
  final String employeeId;
  final String month; // '2026-11'
  final double baseSalary;
  final double hourlyRate;
  final double workedHours;
  final double targetHours;
  final double allowances;
  final double bonuses;
  final double penalties;
  final double advances;
  final double netSalary;
  final bool isPaid;
  final String? payoutDate;
  final List<BranchSalaryShare> branchShares;

  const SalarySlipModel({
    required this.id,
    required this.employeeId,
    required this.month,
    required this.baseSalary,
    required this.hourlyRate,
    required this.workedHours,
    required this.targetHours,
    this.allowances = 0.0,
    this.bonuses = 0.0,
    this.penalties = 0.0,
    this.advances = 0.0,
    required this.netSalary,
    this.isPaid = false,
    this.payoutDate,
    this.branchShares = const [],
  });

  Map<String, dynamic> toJson() => {
    'id': id,
    'employeeId': employeeId,
    'month': month,
    'baseSalary': baseSalary,
    'hourlyRate': hourlyRate,
    'workedHours': workedHours,
    'targetHours': targetHours,
    'allowances': allowances,
    'bonuses': bonuses,
    'penalties': penalties,
    'advances': advances,
    'netSalary': netSalary,
    'isPaid': isPaid,
    'payoutDate': payoutDate,
    'branchShares': branchShares.map((s) => s.toJson()).toList(),
  };

  factory SalarySlipModel.fromJson(Map<String, dynamic> json) => SalarySlipModel(
    id: json['id'] as String,
    employeeId: json['employeeId'] as String? ?? '',
    month: json['month'] as String? ?? '',
    baseSalary: (json['baseSalary'] as num?)?.toDouble() ?? 0.0,
    hourlyRate: (json['hourlyRate'] as num?)?.toDouble() ?? 0.0,
    workedHours: (json['workedHours'] as num?)?.toDouble() ?? 0.0,
    targetHours: (json['targetHours'] as num?)?.toDouble() ?? 180.0,
    allowances: (json['allowances'] as num?)?.toDouble() ?? 0.0,
    bonuses: (json['bonuses'] as num?)?.toDouble() ?? 0.0,
    penalties: (json['penalties'] as num?)?.toDouble() ?? 0.0,
    advances: (json['advances'] as num?)?.toDouble() ?? 0.0,
    netSalary: (json['netSalary'] as num?)?.toDouble() ?? 0.0,
    isPaid: json['isPaid'] as bool? ?? false,
    payoutDate: json['payoutDate'] as String?,
    branchShares: (json['branchShares'] as List<dynamic>?)
            ?.map((e) => BranchSalaryShare.fromJson(e as Map<String, dynamic>))
            .toList() ??
        const [],
  );
}

