import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../data/repositories/employee_repository.dart';
import 'auth_provider.dart';

class EmployeeDataState {
  final EmployeeDataSnapshot? snapshot;
  final bool isLoading;
  final String? error;

  const EmployeeDataState({
    this.snapshot,
    this.isLoading = false,
    this.error,
  });

  EmployeeDataState copyWith({
    EmployeeDataSnapshot? snapshot,
    bool? isLoading,
    String? error,
  }) {
    return EmployeeDataState(
      snapshot: snapshot ?? this.snapshot,
      isLoading: isLoading ?? this.isLoading,
      error: error,
    );
  }
}

class EmployeeDataNotifier extends Notifier<EmployeeDataState> {
  late final EmployeeRepository _repo;

  @override
  EmployeeDataState build() {
    _repo = ref.watch(employeeRepositoryProvider);
    final authState = ref.watch(authProvider);

    if (authState.isAuthenticated && authState.user != null) {
      Future.microtask(() => loadData(authState.user!.code));
    }

    return const EmployeeDataState();
  }

  Future<void> loadData(String code) async {
    // استراتيجية Stale-While-Revalidate: الحفاظ على البيانات السابقة وتحديثها بالخلفية بسلاسة
    if (state.snapshot == null) {
      state = state.copyWith(isLoading: true, error: null);
    }
    try {
      final snap = await _repo.fetchEmployeeData(employeeCode: code);
      state = state.copyWith(
        snapshot: snap,
        isLoading: false,
      );
    } catch (e) {
      state = state.copyWith(
        isLoading: false,
        error: e.toString().replaceAll('Exception: ', ''),
      );
    }
  }

  Future<void> refresh() async {
    final user = ref.read(authProvider).user;
    if (user != null) {
      await loadData(user.code);
    }
  }

  Future<void> loadAllData() => refresh();
}

final employeeDataProvider = NotifierProvider<EmployeeDataNotifier, EmployeeDataState>(EmployeeDataNotifier.new);
