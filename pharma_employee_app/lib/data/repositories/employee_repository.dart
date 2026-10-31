import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/network/api_client.dart';
import '../models/user_model.dart';
import '../models/branch_model.dart';
import '../models/permission_model.dart';
import '../models/request_models.dart';
import '../models/attendance_model.dart';
import '../models/roster_model.dart';
import '../../core/services/period_cycle_service.dart';

class EmployeeDataSnapshot {
  final UserModel user;
  final List<LeaveRequest> leaves;
  final List<PermissionRequest> permissions;
  final List<LoanRequest> loans;
  final List<ShiftSwapRequest> swaps;
  final List<MissedPunchRequest> missedPunches;
  final List<ResignationRequest> resignations;
  final List<AttendanceRecord> attendanceRecords;
  final List<ShiftRosterItem> rosterItems;
  final List<Map<String, dynamic>> penalties;
  final List<Map<String, dynamic>> bylawsSections;
  final String bylawsText;
  final Map<String, dynamic> orgSettings;
  final List<Map<String, dynamic>> salaries;
  final List<Map<String, dynamic>> allEmployees;
  final List<BranchModel> allBranches;
  final Map<String, dynamic> activeRosterSchedule;
  final bool hasFaceDescriptor;
  final String? faceDescriptor;
  final bool isFaceResetApproved;
  final Map<String, dynamic>? pendingBiometricRequest;
  final bool isLiveOnline;
  final bool isShiftActive;
  final bool isOnBreak;
  final Map<String, dynamic>? activeShiftData;
  final String? activeShiftStartEpoch;
  final String? activeShiftTimeIn;
  final String? activeShiftBranchId;
  final String? activeShiftBranchName;
  final Map<String, dynamic> allFaceDescriptors;
  final Map<String, dynamic> ipRestrictions;
  final PayrollCycleRange? activePayrollCycle;

  const EmployeeDataSnapshot({
    required this.user,
    this.leaves = const [],
    this.permissions = const [],
    this.loans = const [],
    this.swaps = const [],
    this.missedPunches = const [],
    this.resignations = const [],
    this.attendanceRecords = const [],
    this.rosterItems = const [],
    this.penalties = const [],
    this.bylawsSections = const [],
    this.bylawsText = '',
    this.orgSettings = const {},
    this.salaries = const [],
    this.allEmployees = const [],
    this.allBranches = const [],
    this.activeRosterSchedule = const {},
    this.hasFaceDescriptor = false,
    this.faceDescriptor,
    this.isFaceResetApproved = false,
    this.pendingBiometricRequest,
    this.isLiveOnline = false,
    this.isShiftActive = false,
    this.isOnBreak = false,
    this.activeShiftData,
    this.activeShiftStartEpoch,
    this.activeShiftTimeIn,
    this.activeShiftBranchId,
    this.activeShiftBranchName,
    this.allFaceDescriptors = const {},
    this.ipRestrictions = const {},
    this.activePayrollCycle,
  });
}

class EmployeeRepository {
  final ApiClient _apiClient;

  EmployeeRepository({ApiClient? apiClient})
    : _apiClient = apiClient ?? ApiClient();

  static const String _storageKey = 'pharmacy-tracker-data';

  /// جلب البيانات الحقيقية الكاملة للموظف من السيرفر المباشر
  Future<EmployeeDataSnapshot> fetchEmployeeData({
    required String employeeCode,
  }) async {
    final cleanCode = employeeCode.trim();
    if (cleanCode.isEmpty) {
      throw Exception('يرجى تحديد كود الموظف');
    }

    try {
      final futures = await Future.wait([
        _apiClient.get(
          '/settings',
          queryParameters: {'key': _storageKey},
        ),
        _apiClient.get('/faces').catchError((err) {
          debugPrint('[Faces] Error loading faces in parallel: $err');
          return Response(requestOptions: RequestOptions(path: '/faces'), statusCode: 500);
        }),
      ]);

      final response = futures[0];
      final facesRes = futures[1];

      final body = response.data;
      if (body != null && body['value'] != null) {
        final dynamic rawVal = body['value'];
        final Map<String, dynamic> val = rawVal is String
            ? json.decode(rawVal)
            : Map<String, dynamic>.from(rawVal as Map);

        // جلب بصمات الوجه الحيوية المسجلة رسمياً من السيرفر
        final Map<String, dynamic> allFaces = {};
        if (facesRes is Response && facesRes.statusCode == 200 && facesRes.data is Map) {
          final fData = facesRes.data['data'];
          if (fData is List) {
            for (final f in fData) {
              if (f is Map && f['employee_id'] != null) {
                final eId = f['employee_id'].toString().trim();
                final desc = f['descriptor'];
                if (desc != null) {
                  final strDesc = desc is String ? desc : jsonEncode(desc);
                  if (strDesc.isNotEmpty && strDesc != 'null' && strDesc != '[]') {
                    allFaces[eId] = strDesc;
                  }
                }
              }
            }
          }
        }

        // تعزيز وفهرسة البصمات بكل من id و code لكل موظف
        final rawEmps = val['employees'] as List<dynamic>? ?? [];
        for (final emp in rawEmps) {
          if (emp is! Map) continue;
          final id = emp['id']?.toString().trim() ?? '';
          final c = emp['code']?.toString().trim() ?? '';
          final directDesc = emp['face_descriptor'];
          if (directDesc != null) {
            final descStr = directDesc is String ? directDesc : jsonEncode(directDesc);
            if (descStr.isNotEmpty && descStr != 'null' && descStr != '[]') {
              if (id.isNotEmpty) allFaces[id] = descStr;
              if (c.isNotEmpty) allFaces[c] = descStr;
            }
          }
          final existingFace = allFaces[id] ?? allFaces[c];
          if (existingFace != null) {
            final faceStr = existingFace is String ? existingFace : jsonEncode(existingFace);
            if (faceStr.isNotEmpty && faceStr != 'null' && faceStr != '[]') {
              if (id.isNotEmpty) allFaces[id] = faceStr;
              if (c.isNotEmpty) allFaces[c] = faceStr;
            }
          }
        }

        return _parseLiveSnapshot(val, cleanCode, allFaces);
      }
    } catch (e) {
      if (e is Exception && e.toString().contains('غير مسجل')) {
        rethrow;
      }
    }

    throw Exception(
      'تعذر الاتصال بالسيرفر أو جلب بيانات الموظف بكود $cleanCode',
    );
  }

  /// استخراج كائن فحص البيانات للأغراض البرمجية والاختبارات
  static EmployeeDataSnapshot parseSnapshotForTest({
    required Map<String, dynamic> val,
    required String employeeCode,
    Map<String, dynamic> allFaces = const {},
  }) {
    return _parseLiveSnapshot(val, employeeCode, Map<String, dynamic>.from(allFaces));
  }

  static EmployeeDataSnapshot _parseLiveSnapshot(
    Map<String, dynamic> val,
    String employeeCode, [
    Map<String, dynamic> allFaces = const {},
  ]) {
    final List<dynamic> employees = val['employees'] as List<dynamic>? ?? [];
    final List<dynamic> rawBranches = val['branches'] as List<dynamic>? ?? [];
    final Map<String, dynamic> ipRestrictions = val['ipRestrictions'] is Map
        ? Map<String, dynamic>.from(val['ipRestrictions'] as Map)
        : {};

    // تجميع وتوحيد كافة الطلبات من كافة المصفوفات المعتمدة بالسيرفر لمنع اختفاء أي طلب
    final List<dynamic> rawRequests = [];
    final seenReqIds = <String>{};
    void addRequestsFrom(dynamic source) {
      if (source is List) {
        for (final item in source) {
          if (item is Map) {
            final rId = item['id']?.toString() ?? '';
            if (rId.isNotEmpty && seenReqIds.contains(rId)) continue;
            if (rId.isNotEmpty) seenReqIds.add(rId);
            rawRequests.add(item);
          }
        }
      }
    }

    addRequestsFrom(val['requests']);
    addRequestsFrom(val['leaveRequests']);
    addRequestsFrom(val['loans']);
    addRequestsFrom(val['shiftSwaps']);
    addRequestsFrom(val['resignationRequests']);
    addRequestsFrom(val['permissionRequests']);

    final List<dynamic> rawShifts = val['shifts'] as List<dynamic>? ?? [];
    final List<dynamic> rawRoster =
        val['rosters'] as List<dynamic>? ??
        val['roster'] as List<dynamic>? ??
        val['monthlyRoster'] as List<dynamic>? ??
        [];
    final List<dynamic> rawPenalties =
        val['disciplinaryPenalties'] as List<dynamic>? ??
        (val['bylaws']?['penalties'] as List<dynamic>?) ??
        [];
    final List<dynamic> rawSalaries = val['salaries'] as List<dynamic>? ?? [];
    final Map<String, dynamic> orgSettings = val['orgSettings'] is Map
        ? Map<String, dynamic>.from(val['orgSettings'] as Map)
        : {};
    final Map<String, dynamic> rawBylaws = val['bylaws'] is Map
        ? Map<String, dynamic>.from(val['bylaws'] as Map)
        : {};

    // 1. البحث الصارم عن الموظف الفعلي
    dynamic empJson;
    for (final e in employees) {
      if (e == null || e is! Map) continue;
      final c = e['code']?.toString().trim();
      final id = e['id']?.toString().trim();
      final u = e['username']?.toString().trim();
      if (c == employeeCode || id == employeeCode || u == employeeCode) {
        empJson = e;
        break;
      }
    }

    if (empJson == null) {
      throw Exception('كود الموظف ($employeeCode) غير مسجل في قاعدة البيانات');
    }

    final empId = empJson['id']?.toString() ?? '';
    final empCode = empJson['code']?.toString() ?? employeeCode;
    final empName = empJson['name']?.toString() ?? 'موظف';
    final empJob = empJson['jobTitle']?.toString() ?? 'صيدلي';
    final annualLeave =
        int.tryParse(empJson['annualLeaveBalance']?.toString() ?? '21') ?? 21;
    final primaryBranchId = empJson['branchId']?.toString() ?? '';

    // 2. استخراج الفروع المصرح بها للموظف
    final branchList = <BranchModel>[];
    final empBranchesDetails =
        empJson['branchesDetails'] as List<dynamic>? ?? [];

    if (empBranchesDetails.isNotEmpty) {
      for (final bd in empBranchesDetails) {
        final bId = bd['branchId']?.toString() ?? '';
        final bName = bd['branchName']?.toString() ?? '';
        final matchRaw = rawBranches.firstWhere(
          (b) =>
              b is Map &&
              (b['id']?.toString() == bId ||
                  b['branchCode']?.toString() == bd['branchCode']?.toString()),
          orElse: () => null,
        );
        branchList.add(
          BranchModel(
            id: bId,
            name: bName.isNotEmpty
                ? bName
                : (matchRaw?['name']?.toString() ?? 'فرع'),
            code:
                bd['branchCode']?.toString() ??
                matchRaw?['branchCode']?.toString() ??
                'BR',
            address:
                matchRaw?['address']?.toString() ??
                matchRaw?['locationUrl']?.toString(),
            phone: matchRaw?['phone']?.toString(),
            latitude: matchRaw?['latitude'] != null
                ? double.tryParse(matchRaw!['latitude'].toString())
                : (matchRaw?['lat'] != null
                      ? double.tryParse(matchRaw!['lat'].toString())
                      : null),
            longitude: matchRaw?['longitude'] != null
                ? double.tryParse(matchRaw!['longitude'].toString())
                : (matchRaw?['lng'] != null
                      ? double.tryParse(matchRaw!['lng'].toString())
                      : null),
          ),
        );
      }
    } else {
      for (final b in rawBranches) {
        if (b is! Map) continue;
        final bId = b['id']?.toString() ?? '';
        final bName = b['name']?.toString() ?? '';
        if (bId == primaryBranchId || empJson['isMultiBranch'] == true) {
          branchList.add(
            BranchModel(
              id: bId,
              name: bName,
              code: b['branchCode']?.toString() ?? 'BR',
              address: b['address']?.toString() ?? b['locationUrl']?.toString(),
              phone: b['phone']?.toString(),
              latitude: b['latitude'] != null
                  ? double.tryParse(b['latitude'].toString())
                  : (b['lat'] != null
                        ? double.tryParse(b['lat'].toString())
                        : null),
              longitude: b['longitude'] != null
                  ? double.tryParse(b['longitude'].toString())
                  : (b['lng'] != null
                        ? double.tryParse(b['lng'].toString())
                        : null),
            ),
          );
        }
      }
    }

    if (branchList.isEmpty && rawBranches.isNotEmpty) {
      final firstB = rawBranches.first;
      if (firstB is Map) {
        branchList.add(
          BranchModel(
            id: firstB['id']?.toString() ?? '',
            name: firstB['name']?.toString() ?? 'الفرع الرئيسي',
            code: firstB['branchCode']?.toString() ?? 'BR',
            address:
                firstB['address']?.toString() ??
                firstB['locationUrl']?.toString(),
            phone: firstB['phone']?.toString(),
            latitude: firstB['latitude'] != null
                ? double.tryParse(firstB['latitude'].toString())
                : (firstB['lat'] != null
                      ? double.tryParse(firstB['lat'].toString())
                      : null),
            longitude: firstB['longitude'] != null
                ? double.tryParse(firstB['longitude'].toString())
                : (firstB['lng'] != null
                      ? double.tryParse(firstB['lng'].toString())
                      : null),
          ),
        );
      }
    }

    // 3. استخراج الصلاحيات الحقيقية
    final canStartEnd = empJson['canStartEnd'] == true;
    final photoUrl =
        empJson['photoUrl']?.toString() ??
        empJson['photo']?.toString() ??
        empJson['drivePhotoUrl']?.toString() ??
        empJson['avatar']?.toString() ??
        empJson['image']?.toString();
    final user = UserModel(
      id: empId,
      code: empCode,
      name: empName,
      jobTitle: empJob,
      branchId: branchList.isNotEmpty ? branchList.first.id : primaryBranchId,
      branchName: branchList.isNotEmpty ? branchList.first.name : 'الفرع',
      photoUrl: photoUrl,
      isMultiBranch: branchList.length > 1 || empJson['isMultiBranch'] == true,
      annualLeaveBalance: annualLeave,
      branches: branchList,
      permissions: PermissionModel(
        canStartEnd: canStartEnd,
        canLivePunch: empJson['canLivePunch'] != false,
        canAccessKiosk: empJson['canAccessKiosk'] != false,
        canViewSalary: empJson['canViewSalary'] != false,
        canApplyLoan: empJson['canApplyLoan'] != false,
        canApplyLeave: empJson['canApplyLeave'] != false,
        canApplySwap: empJson['canApplySwap'] != false,
        canViewBylaws: empJson['canViewBylaws'] != false,
        canManualShift: empJson['canManualShift'] == true,
        canViewShifts: empJson['canViewShifts'] != false,
        canViewRoster: empJson['canViewRoster'] != false,
        canApplyPermission: empJson['canApplyPermission'] != false,
        canApplyResignation: empJson['canApplyResignation'] != false,
        canViewAdjustments: empJson['canViewAdjustments'] != false,
        canViewEvaluations: empJson['canViewEvaluations'] != false,
        canViewAddresses: empJson['canViewAddresses'] != false,
      ),
    );

    // 4. استخراج طلبات الموظف الفعلية الحقيقية (بدون أي بيانات وهمية)
    final leaves = <LeaveRequest>[];
    final loans = <LoanRequest>[];
    final swaps = <ShiftSwapRequest>[];
    final perms = <PermissionRequest>[];
    final missed = <MissedPunchRequest>[];
    final resigns = <ResignationRequest>[];

    for (final req in rawRequests) {
      if (req == null) continue;
      final rEmpId = req['employeeId']?.toString().trim() ?? '';
      final rEmpCode = req['employeeCode']?.toString().trim() ?? '';
      final isMine =
          (rEmpId.isNotEmpty && rEmpId == empId) ||
          (rEmpCode.isNotEmpty && rEmpCode == empCode);
      if (!isMine) continue;

      final type = req['type']?.toString().toLowerCase() ?? '';
      final statusStr = req['status']?.toString().toLowerCase() ?? 'pending';
      final isApproved =
          statusStr == 'approved' || req['adminApproved'] == true;
      final isRejected =
          statusStr == 'rejected' ||
          statusStr == 'rejected_admin' ||
          statusStr == 'rejected_branch' ||
          statusStr == 'cancelled' ||
          statusStr == 'declined' ||
          req['rejected'] == true ||
          req['isCancelled'] == true;
      final status = isApproved
          ? RequestStatus.approved
          : (isRejected ? RequestStatus.rejected : RequestStatus.pending);
      final id =
          req['id']?.toString() ??
          'req_${DateTime.now().millisecondsSinceEpoch}';
      final reason =
          req['reason']?.toString() ?? req['details']?.toString() ?? 'طلب مسجل';
      final adminNote =
          req['rejectionReason']?.toString() ??
          req['adminNotes']?.toString() ??
          req['adminNote']?.toString() ??
          req['comment']?.toString() ??
          (isApproved
              ? 'معتمد رسمي'
              : (isRejected ? 'تم رفض الطلب من قِبل الإدارة' : null));
      final createdAt =
          DateTime.tryParse(req['createdAt']?.toString() ?? '') ??
          DateTime.now();

      if (type == 'leave' ||
          type.contains('leave') ||
          req['leaveType'] != null) {
        final stDate =
            DateTime.tryParse(req['startDate']?.toString() ?? '') ?? createdAt;
        final enDate =
            DateTime.tryParse(req['endDate']?.toString() ?? '') ?? stDate;
        final days =
            int.tryParse(
              req['daysCount']?.toString() ?? req['days']?.toString() ?? '1',
            ) ??
            1;

        LeaveType lType = LeaveType.annual;
        final rawLType = (req['leaveType']?.toString() ?? type).toLowerCase();
        if (rawLType.contains('sick')) {
          lType = LeaveType.sick;
        } else if (rawLType.contains('casual')) {
          lType = LeaveType.casual;
        } else if (rawLType.contains('unpaid')) {
          lType = LeaveType.unpaid;
        } else if (rawLType.contains('comp')) {
          lType = LeaveType.compOff;
        } else if (rawLType.contains('weekly')) {
          lType = LeaveType.weeklyRest;
        }

        leaves.add(
          LeaveRequest(
            id: id,
            employeeId: empId,
            type: lType,
            startDate: stDate,
            endDate: enDate,
            daysCount: days,
            reason: reason,
            status: status,
            adminNote: adminNote,
            createdAt: createdAt,
          ),
        );
      } else if (type == 'loan' ||
          type == 'credit_medicine' ||
          type == 'advance' ||
          type == 'meds') {
        final amount = double.tryParse(req['amount']?.toString() ?? '0') ?? 0.0;
        final months =
            int.tryParse(
              req['monthsCount']?.toString() ??
                  req['installmentsCount']?.toString() ??
                  '1',
            ) ??
            1;
        final monthlyDed =
            double.tryParse(req['monthlyDeduction']?.toString() ?? '0') ??
            (months > 0 ? (amount / months) : amount);
        final isMed =
            type == 'credit_medicine' ||
            type == 'meds' ||
            req['loanType'] == 'medicine';

        loans.add(
          LoanRequest(
            id: id,
            employeeId: empId,
            amount: amount,
            loanType: isMed ? LoanType.medicine : LoanType.cash,
            installmentsCount: months,
            monthlyDeduction: monthlyDed,
            reason: reason,
            status: status,
            adminNote: adminNote,
            createdAt: createdAt,
          ),
        );
      } else if (type == 'permission' || type.contains('perm')) {
        final pDate =
            DateTime.tryParse(req['date']?.toString() ?? '') ?? createdAt;
        final hrs =
            double.tryParse(
              req['hours']?.toString() ?? req['hoursCount']?.toString() ?? '1',
            ) ??
            1.0;
        perms.add(
          PermissionRequest(
            id: id,
            employeeId: empId,
            date: pDate,
            exitTime:
                req['startTime']?.toString() ??
                req['exitTime']?.toString() ??
                '08:00',
            returnTime:
                req['endTime']?.toString() ??
                req['returnTime']?.toString() ??
                '09:00',
            hours: hrs,
            reason: reason,
            status: status,
            adminNote: adminNote,
            createdAt: createdAt,
          ),
        );
      } else if (type == 'shift_swap' || type.contains('swap')) {
        final sDate =
            DateTime.tryParse(req['shiftDate']?.toString() ?? '') ??
            createdAt.add(const Duration(days: 1));
        swaps.add(
          ShiftSwapRequest(
            id: id,
            employeeId: empId,
            employeeName: empName,
            shiftDate: sDate,
            targetEmployeeId: req['targetEmployeeId']?.toString() ?? '',
            targetEmployeeName:
                req['targetEmployeeName']?.toString() ?? 'الزميل',
            branchId: req['branchId']?.toString() ?? branchList.first.id,
            branchName: req['branchName']?.toString() ?? branchList.first.name,
            reason: reason,
            status: status,
            adminNote: adminNote,
            createdAt: createdAt,
          ),
        );
      } else if (type == 'missed_punch' || type == 'punch_edit') {
        final pDate =
            DateTime.tryParse(req['date']?.toString() ?? '') ?? createdAt;
        missed.add(
          MissedPunchRequest(
            id: id,
            employeeId: empId,
            punchDate: pDate,
            checkIn: req['checkIn']?.toString() ?? '08:00 ص',
            checkOut: req['checkOut']?.toString() ?? '04:00 م',
            branchId:
                req['branchId']?.toString() ??
                (branchList.isNotEmpty ? branchList.first.id : 'BR-1'),
            branchName:
                req['branchName']?.toString() ??
                (branchList.isNotEmpty ? branchList.first.name : 'الفرع'),
            reason: reason,
            status: status,
            adminNote: adminNote,
            createdAt: createdAt,
          ),
        );
      } else if (type == 'resignation') {
        resigns.add(
          ResignationRequest(
            id: id,
            employeeId: empId,
            reason: reason,
            lastWorkingDay:
                DateTime.tryParse(
                  req['lastWorkingDay']?.toString() ??
                      req['lastWorkingDate']?.toString() ??
                      '',
                ) ??
                createdAt.add(const Duration(days: 30)),
            status: status,
            adminNote: adminNote,
            createdAt: createdAt,
          ),
        );
      }
    }

    // 5. استخراج سجلات البصمات والورديات الفعلية من مصفوفة shifts
    final attendanceRecords = <AttendanceRecord>[];
    for (final s in rawShifts) {
      if (s == null) continue;
      final sEmpId = s['employeeId']?.toString().trim() ?? '';
      final sEmpCode = s['employeeCode']?.toString().trim() ?? '';
      if ((sEmpId.isNotEmpty && sEmpId == empId) ||
          (sEmpCode.isNotEmpty && sEmpCode == empCode)) {
        attendanceRecords.add(
          AttendanceRecord.fromJson(Map<String, dynamic>.from(s as Map)),
        );
      }
    }

    // 6. استخراج جدول الورديات الشهري والنمط الأسبوعي للموظف
    Map<String, dynamic> activeRosterSchedule = {};
    for (final r in rawRoster) {
      if (r == null || r is! Map) continue;
      final rEmpId = r['employeeId']?.toString().trim() ?? '';
      final rEmpCode = r['employeeCode']?.toString().trim() ?? '';
      if ((rEmpId.isNotEmpty && rEmpId == empId) ||
          (rEmpCode.isNotEmpty && rEmpCode == empCode)) {
        if (r['schedule'] is Map) {
          activeRosterSchedule = Map<String, dynamic>.from(
            r['schedule'] as Map,
          );
          break;
        }
      }
    }

    if (activeRosterSchedule.isEmpty && empJson['weeklySchedule'] is Map) {
      activeRosterSchedule = Map<String, dynamic>.from(
        empJson['weeklySchedule'] as Map,
      );
    }

    // القالب الأسبوعي الافتراضي في حال لم يعتمد جدول بعد
    if (activeRosterSchedule.isEmpty) {
      activeRosterSchedule = {
        'السبت': {'type': 'shift', 'start': '08:00', 'end': '16:00'},
        'الأحد': {'type': 'shift', 'start': '08:00', 'end': '16:00'},
        'الاثنين': {'type': 'shift', 'start': '08:00', 'end': '16:00'},
        'الثلاثاء': {'type': 'shift', 'start': '08:00', 'end': '16:00'},
        'الأربعاء': {'type': 'shift', 'start': '08:00', 'end': '16:00'},
        'الخميس': {'type': 'shift', 'start': '08:00', 'end': '16:00'},
        'الجمعة': {'type': 'off', 'start': '', 'end': ''},
      };
    }

    // إسقاط القالب الأسبوعي على كامل أيام الدورة الشهرية المعتمدة
    final cycleRange = PeriodCycleService.getCycleDateRange(null, orgSettings);
    final rosterItems = <ShiftRosterItem>[];
    final now = DateTime.now();
    final weekdayNames = [
      'الاثنين',
      'الثلاثاء',
      'الأربعاء',
      'الخميس',
      'الجمعة',
      'السبت',
      'الأحد',
    ];

    for (int dayOffset = 0; dayOffset < cycleRange.daysCount; dayOffset++) {
      final date = cycleRange.startDateTime.add(Duration(days: dayOffset));
      final dateStr =
          '${date.year}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}';
      final arDayName = weekdayNames[date.weekday - 1];

      dynamic dayConf = activeRosterSchedule[arDayName];
      if (dayConf == null) {
        final normTarget = arDayName.replaceAll(RegExp(r'[إأآ]'), 'ا');
        for (final entry in activeRosterSchedule.entries) {
          if (entry.key.replaceAll(RegExp(r'[إأآ]'), 'ا') == normTarget) {
            dayConf = entry.value;
            break;
          }
        }
      }

      final isOff =
          dayConf is Map &&
          (dayConf['type'] == 'off' || dayConf['isOff'] == true);
      final startTime = dayConf is Map
          ? (dayConf['start']?.toString() ?? '08:00')
          : '08:00';
      final endTime = dayConf is Map
          ? (dayConf['end']?.toString() ?? '16:00')
          : '16:00';

      ShiftPeriod period = ShiftPeriod.morning;
      String timeRange = '$startTime - $endTime';

      if (isOff) {
        period = ShiftPeriod.dayOff;
        timeRange = 'راحة أسبوعية';
      } else {
        final startHour = int.tryParse(startTime.split(':')[0]) ?? 8;
        if (startHour >= 19 || startHour < 4) {
          period = ShiftPeriod.night;
        } else if (startHour >= 12) {
          period = ShiftPeriod.evening;
        } else {
          period = ShiftPeriod.morning;
        }
      }

      // مطابقة أيام الإجازات المعتمدة
      final hasLeave = leaves.any(
        (l) =>
            l.status == RequestStatus.approved &&
            !date.isBefore(
              DateTime(l.startDate.year, l.startDate.month, l.startDate.day),
            ) &&
            !date.isAfter(
              DateTime(l.endDate.year, l.endDate.month, l.endDate.day, 23, 59),
            ),
      );
      if (hasLeave) {
        period = ShiftPeriod.dayOff;
        timeRange = 'إجازة معتمدة 🏖️';
      }

      rosterItems.add(
        ShiftRosterItem(
          date: dateStr,
          dayNumber: date.day,
          dayNameAr: arDayName,
          period: period,
          branchId: branchList.isNotEmpty
              ? branchList.first.id
              : primaryBranchId,
          branchName: branchList.isNotEmpty ? branchList.first.name : 'الفرع',
          timeRange: timeRange,
          isToday:
              date.day == now.day &&
              date.month == now.month &&
              date.year == now.year,
        ),
      );
    }

    // 7. استخراج سجل الجزاءات الفعلي الموقعة على الموظف
    final penalties = <Map<String, dynamic>>[];
    for (final p in rawPenalties) {
      if (p == null) continue;
      final pEmpId = p['employeeId']?.toString().trim() ?? '';
      final pEmpCode = p['employeeCode']?.toString().trim() ?? '';
      if ((pEmpId.isNotEmpty && pEmpId == empId) ||
          (pEmpCode.isNotEmpty && pEmpCode == empCode)) {
        penalties.add(Map<String, dynamic>.from(p as Map));
      }
    }

    // 8. استخراج اللائحة ومسيرات الرواتب
    final bylawsSections = (rawBylaws['sections'] as List<dynamic>? ?? [])
        .map((e) => Map<String, dynamic>.from(e as Map))
        .toList();
    final bylawsText = rawBylaws['text']?.toString() ?? '';
    final employeeSalaries = rawSalaries
        .where(
          (sal) =>
              sal != null &&
              (sal['employeeId']?.toString() == empId ||
                  sal['employeeCode']?.toString() == empCode),
        )
        .map((sal) => Map<String, dynamic>.from(sal as Map))
        .toList();

    // دالة تحليل ومحاذاة التواريخ الزمنية للطلبات بدقة
    DateTime? extractRequestTimestamp(dynamic r, {bool preferApproval = false}) {
      if (r is! Map) return null;
      if (preferApproval) {
        for (final key in ['approvedAt', 'decisionDate', 'actionDate', 'updatedAt', 'resolvedAt']) {
          final s = r[key]?.toString();
          if (s != null && s.isNotEmpty) {
            final dt = DateTime.tryParse(s);
            if (dt != null) return dt;
          }
        }
      }
      for (final key in ['createdAt', 'date', 'updatedAt', 'decisionDate', 'actionDate']) {
        final s = r[key]?.toString();
        if (s != null && s.isNotEmpty) {
          final dt = DateTime.tryParse(s);
          if (dt != null) return dt;
        }
      }
      final id = r['id']?.toString() ?? '';
      final match = RegExp(r'(\d{10,13})').firstMatch(id);
      if (match != null) {
        final ms = int.tryParse(match.group(1)!);
        if (ms != null) {
          return DateTime.fromMillisecondsSinceEpoch(
            ms.toString().length == 10 ? ms * 1000 : ms,
          );
        }
      }
      return null;
    }

    // دالة محاذاة الخط الزمني البيومتري لكل موظف وفق قواعد هندسة البيانات
    Map<String, dynamic> evaluateBiometricTimeline({
      required String id,
      required String code,
      DateTime? initialResetTime,
      DateTime? initialAppTime,
    }) {
      DateTime? latestReset = initialResetTime;
      DateTime? latestReg = initialAppTime;
      Map<String, dynamic>? latestRegReq;
      Map<String, dynamic>? pendingReq;
      DateTime? latestPendingTime;

      for (final r in rawRequests) {
        if (r is! Map) continue;
        final t = r['type']?.toString().toLowerCase() ?? '';
        final s = r['status']?.toString().toLowerCase() ?? '';
        final rEmpId = r['employeeId']?.toString().trim() ?? '';
        final rEmpCode = r['employeeCode']?.toString().trim() ?? '';
        final isMine =
            (rEmpId.isNotEmpty && (rEmpId == id || rEmpId == code)) ||
            (rEmpCode.isNotEmpty && (rEmpCode == code || rEmpCode == id));

        if (!isMine) continue;

        final isApproved = (s == 'approved' || s == 'completed' || r['adminApproved'] == true);
        final isPending = (s == 'pending' || s == 'pending_admin' || s == 'pending_branch');

        if (t == 'biometric_reset') {
          if (isApproved) {
            final tReset = extractRequestTimestamp(r, preferApproval: true) ?? DateTime.now();
            if (latestReset == null || tReset.isAfter(latestReset)) {
              latestReset = tReset;
            }
          } else if (isPending) {
            final tPend = extractRequestTimestamp(r) ?? DateTime.now();
            if (latestPendingTime == null || tPend.isAfter(latestPendingTime)) {
              latestPendingTime = tPend;
              pendingReq = Map<String, dynamic>.from(r);
            }
          }
        } else if (t == 'biometric_registration' || t == 'biometric_self_registration' || t == 'تأكيد بصمة الوجه') {
          if (isApproved) {
            final tReg = extractRequestTimestamp(r, preferApproval: true) ?? DateTime.now();
            if (latestReg == null || tReg.isAfter(latestReg)) {
              latestReg = tReg;
              latestRegReq = Map<String, dynamic>.from(r);
            }
          } else if (isPending) {
            final tPend = extractRequestTimestamp(r) ?? DateTime.now();
            if (latestPendingTime == null || tPend.isAfter(latestPendingTime)) {
              latestPendingTime = tPend;
              pendingReq = Map<String, dynamic>.from(r);
            }
          }
        }
      }

      // حساب الحالة الحقيقية: هل إعادة التعيين ما زالت سارية أم جاء بعدها اعتماد تسجيل جديد؟
      final bool isResetActive = latestReset != null &&
          (latestReg == null || latestReset.isAfter(latestReg));

      return {
        'isResetActive': isResetActive,
        'latestResetTime': latestReset,
        'latestRegTime': latestReg,
        'latestRegReq': latestRegReq,
        'pendingReq': pendingReq,
        'latestPendingTime': latestPendingTime,
      };
    }

    // 9. استخراج قائمة الزملاء والفروع الحقيقية والبصمة الإلكترونية
    final allEmployeesList = employees.where((e) => e != null).map((e) {
      final m = Map<String, dynamic>.from(e as Map);
      final id = m['id']?.toString().trim() ?? '';
      final c = m['code']?.toString().trim() ?? '';

      // البحث عن بصمة الموظف في خريطة البصمات الموحدة أو كائن الموظف
      final rawFace = allFaces[id] ??
          allFaces[c] ??
          allFaces['emp_$c'] ??
          allFaces['emp_$id'] ??
          m['face_descriptor'];

      final normFace = (rawFace != null &&
              rawFace.toString().trim().isNotEmpty &&
              rawFace.toString() != 'null' &&
              rawFace.toString() != '[]')
          ? (rawFace is String ? rawFace : jsonEncode(rawFace))
          : null;

      if (normFace != null) {
        m['face_descriptor'] = normFace;
        m['hasFaceDescriptor'] = true;
        m['has_face_descriptor'] = true;
        if (id.isNotEmpty) allFaces[id] = normFace;
        if (c.isNotEmpty) allFaces[c] = normFace;
        if (c.isNotEmpty) allFaces['emp_$c'] = normFace;
        if (id.isNotEmpty) allFaces['emp_$id'] = normFace;
      } else {
        m['face_descriptor'] = null;
        m['hasFaceDescriptor'] = false;
        m['has_face_descriptor'] = false;
      }
      return m;
    }).toList();
    final allBranchesList = rawBranches.where((b) => b != null).map((b) {
      final m = b is Map ? Map<String, dynamic>.from(b) : <String, dynamic>{};
      return BranchModel.fromMap(m);
    }).toList();

    // فحص تاريخ إعادة تعيين البصمة للموظف الحالي (Biometric Reset Check)
    final resetStr = empJson['biometricFaceResetAt']?.toString() ??
        empJson['biometricResetAt']?.toString();
    final approvedStr = empJson['biometricFaceApprovedAt']?.toString() ??
        empJson['biometricApprovedAt']?.toString() ??
        empJson['face_registered_at']?.toString();

    DateTime? resetTime;
    if (resetStr != null && resetStr.isNotEmpty) {
      try { resetTime = DateTime.parse(resetStr); } catch (_) {}
    }
    DateTime? approvedTime;
    if (approvedStr != null && approvedStr.isNotEmpty) {
      try { approvedTime = DateTime.parse(approvedStr); } catch (_) {}
    }

    final currentBioStatus = evaluateBiometricTimeline(
      id: empId,
      code: empCode,
      initialResetTime: resetTime,
      initialAppTime: approvedTime,
    );

    Map<String, dynamic>? pendingBioReq = currentBioStatus['pendingReq'] as Map<String, dynamic>?;

    // استخراج معالم بصمة الوجه المسجلة للموظف من كافة المصادر الحية
    final physicalDesc = allFaces[empId] ??
        allFaces[empCode] ??
        allFaces['emp_$empCode'] ??
        allFaces['emp_$empId'] ??
        empJson['face_descriptor'];

    String? faceDescriptor = (physicalDesc != null &&
            physicalDesc.toString().trim().isNotEmpty &&
            physicalDesc.toString() != 'null' &&
            physicalDesc.toString() != '[]')
        ? (physicalDesc is String ? physicalDesc : jsonEncode(physicalDesc))
        : null;

    // فحص البصمة من الطلب المعتمد الأخير إذا لم تكن موجودة بالفعل
    if (faceDescriptor == null || faceDescriptor.isEmpty) {
      final latestRegReq = currentBioStatus['latestRegReq'] as Map<String, dynamic>?;
      if (latestRegReq != null) {
        final reqDesc = latestRegReq['descriptors'] ??
            latestRegReq['descriptor'] ??
            latestRegReq['face_descriptor'] ??
            latestRegReq['extraPayload']?['face_descriptor'] ??
            latestRegReq['extraPayload']?['descriptors'];
        if (reqDesc != null) {
          faceDescriptor = reqDesc is String ? reqDesc : jsonEncode(reqDesc);
        }
      }
    }

    final bool hasFaceDescriptor = faceDescriptor != null && faceDescriptor.isNotEmpty;
    bool isFaceResetApproved = false;

    if (hasFaceDescriptor) {
      // الموظف لديه بصمة وجه مسجلة بالفعل في قاعدة البيانات ومحفوظة بنجاح
      // يتم تثبيتها وتأكيد تواجدها في خريطة البصمات لكلا المعرفين
      allFaces[empId] = faceDescriptor;
      if (empCode.isNotEmpty) allFaces[empCode] = faceDescriptor;
      if (empCode.isNotEmpty) allFaces['emp_$empCode'] = faceDescriptor;
      if (empId.isNotEmpty) allFaces['emp_$empId'] = faceDescriptor;

      // البصمة مسجلة ونشطة، فلا مجال لاعتبار إعادة التعيين معلقة
      isFaceResetApproved = false;

      // إذا كان هناك طلب تسجيل تمت الموافقة عليه وانتهى، لا يظهر كطلب معلق
      if (pendingBioReq != null &&
          (pendingBioReq['status'] == 'approved' ||
              pendingBioReq['status'] == 'completed')) {
        pendingBioReq = null;
      }
    } else {
      // الموظف ليس لديه بصمة وجه مسجلة في قاعدة البيانات
      final bool isResetActive = currentBioStatus['isResetActive'] as bool ||
          empJson['biometricFaceResetAt'] != null ||
          empJson['biometricResetAt'] != null;

      if (pendingBioReq != null &&
          (pendingBioReq['type'] == 'biometric_registration' ||
              pendingBioReq['type'] == 'biometric_self_registration')) {
        // هناك طلب تسجيل قيد مراجعة الإدارة
        isFaceResetApproved = false;
      } else if (isResetActive) {
        // تمت الموافقة على إعادة التعيين وبانتظار تسجيل بصمة جديدة
        isFaceResetApproved = true;
      } else {
        // البصمة غير مسجلة حالياً لأول مرة
        isFaceResetApproved = false;
      }
    }

    // 5.ب استخراج حالة الوردية الحية النشطة للموظف من السيرفر
    final Map<String, dynamic> rawActiveShifts = val['activeShifts'] is Map
        ? Map<String, dynamic>.from(val['activeShifts'] as Map)
        : {};

    Map<String, dynamic>? activeShiftData;
    if (rawActiveShifts.containsKey(empId) && rawActiveShifts[empId] is Map) {
      activeShiftData = Map<String, dynamic>.from(
        rawActiveShifts[empId] as Map,
      );
    } else if (rawActiveShifts.containsKey(empCode) &&
        rawActiveShifts[empCode] is Map) {
      activeShiftData = Map<String, dynamic>.from(
        rawActiveShifts[empCode] as Map,
      );
    }

    if (activeShiftData == null) {
      final nowTime = DateTime.now();
      final todayStr =
          '${nowTime.year}-${nowTime.month.toString().padLeft(2, '0')}-${nowTime.day.toString().padLeft(2, '0')}';
      for (final s in rawShifts) {
        if (s is Map) {
          final sEmpId = s['employeeId']?.toString().trim() ?? '';
          final sEmpCode = s['employeeCode']?.toString().trim() ?? '';
          final sDate = s['date']?.toString().trim() ?? '';
          final isMine =
              (sEmpId.isNotEmpty && sEmpId == empId) ||
              (sEmpCode.isNotEmpty && sEmpCode == empCode);
          if (isMine && sDate == todayStr) {
            final tOut = s['timeOut'] ?? s['checkOut'] ?? '';
            final tIn = s['timeIn'] ?? s['checkIn'] ?? '';
            if (tIn.toString().isNotEmpty &&
                (tOut == null ||
                    tOut.toString().isEmpty ||
                    tOut.toString() == '--:--' ||
                    tOut.toString() == '—' ||
                    tOut.toString() == 'قيد العمل الآن')) {
              activeShiftData = Map<String, dynamic>.from(s);
              break;
            }
          }
        }
      }
    }

    final bool isShiftActive = activeShiftData != null;
    final bool isOnBreak =
        activeShiftData?['isPaused'] == true ||
        activeShiftData?['isOnBreak'] == true;
    final String? activeShiftStartEpoch = activeShiftData?['startEpoch']
        ?.toString();
    final String? activeShiftTimeIn =
        activeShiftData?['timeIn']?.toString() ??
        activeShiftData?['checkIn']?.toString();
    final String? activeShiftBranchId = activeShiftData?['branchId']
        ?.toString();
    final String? activeShiftBranchName = activeShiftData?['branchName']
        ?.toString();

    return EmployeeDataSnapshot(
      user: user,
      leaves: leaves,
      loans: loans,
      swaps: swaps,
      permissions: perms,
      missedPunches: missed,
      resignations: resigns,
      attendanceRecords: attendanceRecords,
      rosterItems: rosterItems,
      penalties: penalties,
      bylawsSections: bylawsSections,
      bylawsText: bylawsText,
      orgSettings: orgSettings,
      salaries: employeeSalaries,
      allEmployees: allEmployeesList,
      allBranches: allBranchesList,
      activeRosterSchedule: activeRosterSchedule,
      hasFaceDescriptor: hasFaceDescriptor,
      faceDescriptor: faceDescriptor,
      isFaceResetApproved: isFaceResetApproved,
      pendingBiometricRequest: pendingBioReq,
      isLiveOnline: true,
      isShiftActive: isShiftActive,
      isOnBreak: isOnBreak,
      activeShiftData: activeShiftData,
      activeShiftStartEpoch: activeShiftStartEpoch,
      activeShiftTimeIn: activeShiftTimeIn,
      activeShiftBranchId: activeShiftBranchId,
      activeShiftBranchName: activeShiftBranchName,
      allFaceDescriptors: allFaces,
      ipRestrictions: ipRestrictions,
      activePayrollCycle: cycleRange,
    );
  }

  /// 🧬 حفظ أو تسجيل بصمة وجه الموظف الحقيقية في قاعدة البيانات السحابية (MariaDB / PostgreSQL)
  Future<bool> saveFaceDescriptorToServer({
    required String employeeId,
    required dynamic descriptor,
  }) async {
    try {
      dynamic parsedDescriptor = descriptor;
      if (descriptor is String &&
          (descriptor.trim().startsWith('[') ||
              descriptor.trim().startsWith('{'))) {
        try {
          parsedDescriptor = jsonDecode(descriptor);
        } catch (_) {}
      }

      final res = await _apiClient.post(
        '/faces',
        data: {
          'employee_id': employeeId,
          'descriptor': parsedDescriptor,
          'biometric_type': 'face',
        },
      );

      // مزامنة فورية مع شريحة الموظفين في settings بقاعدة البيانات
      try {
        final existingSettings = await _apiClient.get(
          '/settings',
          queryParameters: {'key': _storageKey},
        );
        if (existingSettings.statusCode == 200 && existingSettings.data is Map) {
          final stateData =
              existingSettings.data['data'] ?? existingSettings.data['value'];
          final Map<String, dynamic> valMap = stateData is String
              ? jsonDecode(stateData)
              : (stateData is Map ? Map<String, dynamic>.from(stateData) : {});
          if (valMap['employees'] is List) {
            final employeesList = List<Map<String, dynamic>>.from(
              (valMap['employees'] as List)
                  .whereType<Map<String, dynamic>>(),
            );
            bool found = false;
            final nowStr = DateTime.now().toIso8601String();
            for (int i = 0; i < employeesList.length; i++) {
              final emp = employeesList[i];
              if (emp['id']?.toString() == employeeId ||
                  emp['code']?.toString() == employeeId) {
                employeesList[i] = Map<String, dynamic>.from(emp)
                  ..['has_face_descriptor'] = true
                  ..['hasFaceDescriptor'] = true
                  ..['face_descriptor'] = parsedDescriptor
                  ..['biometricFaceApprovedAt'] = nowStr
                  ..['biometricApprovedAt'] = nowStr
                  ..remove('biometricFaceResetAt')
                  ..remove('biometricResetAt');
                found = true;
                break;
              }
            }
            if (found) {
              await _apiClient.post(
                '/settings/slice',
                data: {
                  'key': _storageKey,
                  'sliceKey': 'employees',
                  'sliceValue': employeesList,
                },
              );
            }
          }
        }
      } catch (e) {
        debugPrint('[SaveFace] Note: settings slice sync error: $e');
      }

      return res.statusCode == 200;
    } catch (_) {
      return false;
    }
  }

  /// 📸 رفع وتحديث الصورة الشخصية للموظف في قاعدة البيانات السحابية
  Future<String?> uploadProfilePhoto({
    required UserModel user,
    required Uint8List imageBytes,
    String mimeType = 'image/jpeg',
  }) async {
    try {
      final base64Image = base64Encode(imageBytes);
      final attId =
          'att_emp_${user.id}_photo_${DateTime.now().millisecondsSinceEpoch}';

      // 1. إرسال الصورة إلى جدول المرفقات بقاعدة البيانات السحابية
      final attRes = await _apiClient.post(
        '/attachments',
        data: {
          'id': attId,
          'entity_type': 'employees',
          'entity_id': user.id,
          'field_name': 'photoUrl',
          'file_data': 'data:$mimeType;base64,$base64Image',
          'mime_type': mimeType,
        },
      );

      final returnedUrl =
          (attRes.statusCode == 200 &&
              attRes.data is Map &&
              attRes.data['url'] != null)
          ? attRes.data['url'].toString()
          : '/api/attachments?id=$attId&raw=1';

      // 2. تحديث رابط الصورة في كائن الموظفين بقاعدة البيانات العامة (pharmacy-tracker-data)
      try {
        final existingSettings = await _apiClient.get(
          '/settings',
          queryParameters: {'key': 'pharmacy-tracker-data'},
        );
        if (existingSettings.statusCode == 200 &&
            existingSettings.data is Map) {
          final stateData =
              existingSettings.data['data'] ?? existingSettings.data['value'];
          if (stateData is Map && stateData['employees'] is List) {
            final employeesList = List<Map<String, dynamic>>.from(
              (stateData['employees'] as List)
                  .whereType<Map<String, dynamic>>(),
            );

            bool found = false;
            for (int i = 0; i < employeesList.length; i++) {
              final emp = employeesList[i];
              if (emp['id']?.toString() == user.id ||
                  emp['code']?.toString() == user.code) {
                employeesList[i] = Map<String, dynamic>.from(emp)
                  ..['photoUrl'] = returnedUrl;
                found = true;
                break;
              }
            }

            if (found) {
              await _apiClient.post(
                '/settings/slice',
                data: {
                  'key': 'pharmacy-tracker-data',
                  'sliceKey': 'employees',
                  'sliceValue': employeesList,
                },
              );
            }
          }
        }
      } catch (err) {
        debugPrint('[ProfilePhoto] Error slicing settings: $err');
      }

      return returnedUrl;
    } catch (e) {
      debugPrint('[ProfilePhoto] Error uploading profile photo: $e');
      return null;
    }
  }

  /// 📸 رفع صورة توثيق الحضور البديل إلى جدول المرفقات بالسيرفر
  Future<String?> uploadAttendancePhoto({
    required UserModel user,
    required Uint8List imageBytes,
    String mimeType = 'image/jpeg',
  }) async {
    try {
      final nowEpoch = DateTime.now().millisecondsSinceEpoch;
      final attId = 'att_punch_${user.id}_$nowEpoch';
      final base64Data = base64Encode(imageBytes);

      final attRes = await _apiClient.post(
        '/attachments',
        data: {
          'id': attId,
          'entity_type': 'attendance_punch',
          'entity_id': user.id,
          'field_name': 'photo_punch',
          'file_name': 'punch_${user.code}_$nowEpoch.jpg',
          'mime_type': mimeType,
          'file_size': imageBytes.length,
          'file_data': 'data:$mimeType;base64,$base64Data',
          'key': _storageKey,
        },
      );

      return (attRes.statusCode == 200 &&
              attRes.data is Map &&
              attRes.data['url'] != null)
          ? attRes.data['url'].toString()
          : '/api/attachments?id=$attId&raw=1';
    } catch (e) {
      debugPrint('[AttendancePhoto] Error uploading photo: $e');
      return null;
    }
  }

  /// ⏱️ تسجيل بصمة حية ذكية موثقة بالسيرفر (حضور، انصراف، بريك)
  Future<bool> recordPunch({
    required UserModel user,
    required String
    actionType, // 'start_shift', 'stop_shift', 'break_start', 'break_end'
    required String branchId,
    String? branchName,
    String? punchType,
    String? photoUrl,
    String? requestId,
  }) async {
    final now = DateTime.now();
    final dateStr =
        '${now.year}-${now.month.toString().padLeft(2, '0')}-${now.day.toString().padLeft(2, '0')}';
    final timeStr =
        '${now.hour.toString().padLeft(2, '0')}:${now.minute.toString().padLeft(2, '0')}';

    try {
      final res = await _apiClient.post(
        '/punches/record',
        data: {
          'employeeId': user.id,
          'employeeCode': user.code,
          'branchId': branchId,
          'branchName': branchName ?? user.branchName,
          'actionType': actionType,
          'time': timeStr,
          'date': dateStr,
          'key': _storageKey,
          if (punchType != null) 'punchType': punchType,
          if (photoUrl != null) 'photoUrl': photoUrl,
          if (requestId != null) 'requestId': requestId,
        },
      );

      return res.statusCode == 200 && res.data?['success'] == true;
    } catch (_) {
      return false;
    }
  }

  /// ⚡ استعلام فوري ذري عن حالة وردية الموظف بالسيرفر
  Future<Map<String, dynamic>?> probeShiftStatus(String employeeId) async {
    try {
      final res = await _apiClient.get(
        '/punches/probe-status/$employeeId',
        queryParameters: {'key': _storageKey},
      );
      if (res.statusCode == 200 && res.data is Map) {
        return Map<String, dynamic>.from(res.data as Map);
      }
    } catch (_) {}
    return null;
  }

  /// إرسال ومزامنة أي طلب مباشرة مع السيرفر المركزي وإشعار مدير الفرع والإدارة العليا
  Future<bool> submitRequestToServer({
    required UserModel user,
    required String requestType,
    required String reqId,
    required String reason,
    required String details,
    String? targetBranchId,
    String? targetBranchName,
    Map<String, dynamic>? extraPayload,
  }) async {
    final bId = targetBranchId ?? user.branchId ?? '';
    final bName = targetBranchName ?? user.branchName ?? '';

    final requestBody = {
      'key': _storageKey,
      'request': {
        'id': reqId,
        'type': requestType,
        'employeeId': user.id,
        'employeeName': user.name,
        'employeeCode': user.code,
        'jobTitle': user.jobTitle,
        'branchId': bId,
        'branchName': bName,
        'targetRole': 'both',
        'targetApproval': 'both',
        'isDirectToAdmin': false,
        'status': 'pending',
        'reason': reason,
        'details': details,
        'createdAt': DateTime.now().toIso8601String(),
        'source': 'flutter_mobile_portal',
        ...?extraPayload,
      },
      'notification': {
        'targetBranchId': bId,
        'notifyAdmin': true,
        'notifyBranchManager': true,
        'title': 'طلب جديد: $requestType من ${user.name}',
        'body': '$reason - فرع $bName',
        'createdAt': DateTime.now().toIso8601String(),
      },
    };

    try {
      final res = await _apiClient.post('/requests/submit', data: requestBody);
      return res.statusCode == 200 && res.data?['success'] == true;
    } catch (_) {
      return true;
    }
  }
}

final employeeRepositoryProvider = Provider<EmployeeRepository>(
  (ref) => EmployeeRepository(),
);
