import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../data/models/request_models.dart';
import '../../data/models/user_model.dart';
import '../../data/repositories/employee_repository.dart';
import 'auth_provider.dart';

class RequestsState {
  final List<LeaveRequest> leaves;
  final List<PermissionRequest> permissions;
  final List<LoanRequest> loans;
  final List<ShiftSwapRequest> swaps;
  final List<MissedPunchRequest> missedPunches;
  final List<ResignationRequest> resignations;
  final bool isLoading;
  final String statusFilter; // 'all' | 'pending' | 'approved' | 'rejected'

  const RequestsState({
    this.leaves = const [],
    this.permissions = const [],
    this.loans = const [],
    this.swaps = const [],
    this.missedPunches = const [],
    this.resignations = const [],
    this.isLoading = false,
    this.statusFilter = 'all',
  });

  RequestsState copyWith({
    List<LeaveRequest>? leaves,
    List<PermissionRequest>? permissions,
    List<LoanRequest>? loans,
    List<ShiftSwapRequest>? swaps,
    List<MissedPunchRequest>? missedPunches,
    List<ResignationRequest>? resignations,
    bool? isLoading,
    String? statusFilter,
  }) {
    return RequestsState(
      leaves: leaves ?? this.leaves,
      permissions: permissions ?? this.permissions,
      loans: loans ?? this.loans,
      swaps: swaps ?? this.swaps,
      missedPunches: missedPunches ?? this.missedPunches,
      resignations: resignations ?? this.resignations,
      isLoading: isLoading ?? this.isLoading,
      statusFilter: statusFilter ?? this.statusFilter,
    );
  }
}

class RequestsNotifier extends Notifier<RequestsState> {
  late final EmployeeRepository _employeeRepo;

  @override
  RequestsState build() {
    _employeeRepo = ref.watch(employeeRepositoryProvider);
    return const RequestsState();
  }

  Future<void> loadServerRequests([String? employeeCode]) async {
    final code = (employeeCode != null && employeeCode.trim().isNotEmpty)
        ? employeeCode.trim()
        : (ref.read(authProvider).user?.code ?? '');
    if (code.isEmpty) return;
    state = state.copyWith(isLoading: true);
    try {
      final snapshot = await _employeeRepo.fetchEmployeeData(employeeCode: code);
      state = state.copyWith(
        leaves: snapshot.leaves,
        loans: snapshot.loans,
        swaps: snapshot.swaps,
        permissions: snapshot.permissions,
        missedPunches: snapshot.missedPunches,
        resignations: snapshot.resignations,
        isLoading: false,
      );
    } catch (_) {
      state = state.copyWith(isLoading: false);
    }
  }

  void setFilter(String filter) {
    state = state.copyWith(statusFilter: filter);
  }

  Future<void> addLeave(LeaveRequest req, {UserModel? user}) async {
    state = state.copyWith(leaves: [req, ...state.leaves]);
    if (user != null) {
      await _employeeRepo.submitRequestToServer(
        user: user,
        requestType: 'leave',
        reqId: req.id,
        reason: req.reason,
        details: 'طلب إجازة ${req.type.labelAr} لمدة ${req.daysCount} يوم من ${req.startDate.toString().split(' ')[0]} إلى ${req.endDate.toString().split(' ')[0]}',
        targetBranchId: user.branchId,
        targetBranchName: user.branchName,
        extraPayload: req.toJson(),
      );
    }
  }

  Future<void> addPermission(PermissionRequest req, {UserModel? user}) async {
    state = state.copyWith(permissions: [req, ...state.permissions]);
    if (user != null) {
      await _employeeRepo.submitRequestToServer(
        user: user,
        requestType: 'permission',
        reqId: req.id,
        reason: req.reason,
        details: 'إذن خروج مؤقت لمدة ${req.hours} ساعة من ${req.exitTime} إلى ${req.returnTime}',
        targetBranchId: user.branchId,
        targetBranchName: user.branchName,
        extraPayload: req.toJson(),
      );
    }
  }

  Future<void> addLoan(LoanRequest req, {UserModel? user}) async {
    state = state.copyWith(loans: [req, ...state.loans]);
    if (user != null) {
      await _employeeRepo.submitRequestToServer(
        user: user,
        requestType: 'loan',
        reqId: req.id,
        reason: req.reason,
        details: 'طلب ${req.loanType.labelAr} بمبلغ ${req.amount} ج.م على ${req.installmentsCount} أقساط',
        targetBranchId: user.branchId,
        targetBranchName: user.branchName,
        extraPayload: req.toJson(),
      );
    }
  }

  Future<void> addSwap(ShiftSwapRequest req, {UserModel? user}) async {
    state = state.copyWith(swaps: [req, ...state.swaps]);
    if (user != null) {
      await _employeeRepo.submitRequestToServer(
        user: user,
        requestType: 'shift_swap',
        reqId: req.id,
        reason: req.reason,
        details: 'طلب تبديل وردية مع ${req.targetEmployeeName} بتاريخ ${req.shiftDate.toString().split(' ')[0]}',
        targetBranchId: req.branchId,
        targetBranchName: req.branchName,
        extraPayload: req.toJson(),
      );
    }
  }

  Future<void> addMissedPunch(MissedPunchRequest req, {UserModel? user}) async {
    state = state.copyWith(missedPunches: [req, ...state.missedPunches]);
    if (user != null) {
      await _employeeRepo.submitRequestToServer(
        user: user,
        requestType: 'missed_punch',
        reqId: req.id,
        reason: req.reason,
        details: 'توثيق وردية يدوية بتاريخ ${req.punchDate.toString().split(' ')[0]} (${req.checkIn} - ${req.checkOut})',
        targetBranchId: req.branchId,
        targetBranchName: req.branchName,
        extraPayload: req.toJson(),
      );
    }
  }

  Future<void> addResignation(ResignationRequest req, {UserModel? user}) async {
    state = state.copyWith(resignations: [req, ...state.resignations]);
    if (user != null) {
      await _employeeRepo.submitRequestToServer(
        user: user,
        requestType: 'resignation',
        reqId: req.id,
        reason: req.reason,
        details: 'طلب استقالة وإخلاء طرف - آخر يوم عمل: ${req.lastWorkingDay.toString().split(' ')[0]}',
        targetBranchId: user.branchId,
        targetBranchName: user.branchName,
        extraPayload: req.toJson(),
      );
    }
  }
}

final requestsProvider = NotifierProvider<RequestsNotifier, RequestsState>(RequestsNotifier.new);
