class PermissionModel {
  // 💵 الرواتب والماليات
  final bool canViewSalary;
  final bool canViewAdjustments;
  final bool canAddAdjustment;
  final bool canExportExcel;
  final bool canApplyLoan;

  // 📋 الطلبات والخدمات
  final bool canApplyLeave;
  final bool canApplyPermission;
  final bool canApplySwap;
  final bool canApplyResignation;

  // ⏱️ الحضور والانصراف والجدول
  final bool canViewShifts;
  final bool canViewRoster;
  final bool canStartEnd;        // تسجيل الحضور المباشر بلمسة واحدة من الصفحة
  final bool canLivePunch;       // البصمة الحية (الوجه / الكاميرا)
  final bool canEnrollBiometric; // تسجيل وتحديث البصمة الذاتية
  final bool canManualShift;     // تسجيل وردية يدوية
  final bool canEditShift;       // تعديل وتصحيح ساعات الورديات

  // ⚖️ اللائحة والتقييمات
  final bool canViewBylaws;
  final bool canViewEvaluations;
  final bool canSubmitComplaint;

  // 🪪 الملف الشخصي والتوصيل
  final bool canViewProfile;
  final bool canViewBranchAddresses;
  final bool canViewAddresses;
  final bool canAccessKiosk;

  const PermissionModel({
    this.canViewSalary = true,
    this.canViewAdjustments = true,
    this.canAddAdjustment = false,
    this.canExportExcel = true,
    this.canApplyLoan = true,
    this.canApplyLeave = true,
    this.canApplyPermission = true,
    this.canApplySwap = true,
    this.canApplyResignation = true,
    this.canViewShifts = true,
    this.canViewRoster = true,
    this.canStartEnd = true,
    this.canLivePunch = true,
    this.canEnrollBiometric = true,
    this.canManualShift = false,
    this.canEditShift = false,
    this.canViewBylaws = true,
    this.canViewEvaluations = true,
    this.canSubmitComplaint = true,
    this.canViewProfile = true,
    this.canViewBranchAddresses = true,
    this.canViewAddresses = true,
    this.canAccessKiosk = true,
  });

  factory PermissionModel.fromMap(Map<String, dynamic>? map) {
    if (map == null) return const PermissionModel();

    bool resolve(String key, bool defaultVal) {
      if (map.containsKey(key)) return map[key] == true;
      String action = key.startsWith('can') ? key.substring(3) : key;
      if (map.containsKey(action)) return map[action] == true;
      if (map.containsKey('allow$action')) return map['allow$action'] == true;
      return defaultVal;
    }

    return PermissionModel(
      canViewSalary: resolve('canViewSalary', true),
      canViewAdjustments: resolve('canViewAdjustments', true),
      canAddAdjustment: resolve('canAddAdjustment', false),
      canExportExcel: resolve('canExportExcel', true),
      canApplyLoan: resolve('canApplyLoan', true),
      canApplyLeave: resolve('canApplyLeave', true),
      canApplyPermission: resolve('canApplyPermission', true),
      canApplySwap: resolve('canApplySwap', true),
      canApplyResignation: resolve('canApplyResignation', true),
      canViewShifts: resolve('canViewShifts', true),
      canViewRoster: resolve('canViewRoster', true),
      canStartEnd: resolve('canStartEnd', true),
      canLivePunch: resolve('canLivePunch', true),
      canEnrollBiometric: resolve('canEnrollBiometric', true),
      canManualShift: resolve('canManualShift', false),
      canEditShift: resolve('canEditShift', false),
      canViewBylaws: resolve('canViewBylaws', true),
      canViewEvaluations: resolve('canViewEvaluations', true),
      canSubmitComplaint: resolve('canSubmitComplaint', true),
      canViewProfile: resolve('canViewProfile', true),
      canViewBranchAddresses: resolve('canViewBranchAddresses', true),
      canViewAddresses: resolve('canViewAddresses', true),
      canAccessKiosk: resolve('canAccessKiosk', true),
    );
  }

  bool isPermActive(String key, {bool defaultVal = true}) {
    switch (key) {
      case 'canAccessKiosk': return canAccessKiosk;
      case 'canViewSalary': return canViewSalary;
      case 'canViewAdjustments': return canViewAdjustments;
      case 'canAddAdjustment': return canAddAdjustment;
      case 'canExportExcel': return canExportExcel;
      case 'canApplyLoan': return canApplyLoan;
      case 'canApplyLeave': return canApplyLeave;
      case 'canApplyPermission': return canApplyPermission;
      case 'canApplySwap': return canApplySwap;
      case 'canApplyResignation': return canApplyResignation;
      case 'canViewShifts': return canViewShifts;
      case 'canViewRoster': return canViewRoster;
      case 'canStartEnd': return canStartEnd;
      case 'canLivePunch': return canLivePunch;
      case 'canEnrollBiometric': return canEnrollBiometric;
      case 'canManualShift': return canManualShift;
      case 'canEditShift': return canEditShift;
      case 'canViewBylaws': return canViewBylaws;
      case 'canViewEvaluations': return canViewEvaluations;
      case 'canSubmitComplaint': return canSubmitComplaint;
      case 'canViewProfile': return canViewProfile;
      case 'canViewBranchAddresses': return canViewBranchAddresses;
      case 'canViewAddresses': return canViewAddresses;
      default: return defaultVal;
    }
  }
}
