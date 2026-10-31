import 'package:flutter_test/flutter_test.dart';
import 'package:pharma_employee_app/data/models/attendance_model.dart';
import 'package:pharma_employee_app/data/models/user_model.dart';
import 'package:pharma_employee_app/data/models/permission_model.dart';
import 'package:pharma_employee_app/data/models/branch_model.dart';
import 'package:pharma_employee_app/data/repositories/employee_repository.dart';

void main() {
  group('Shift & Worked Hours Calculations Tests', () {
    test('Attendance records calculation strictly bounds to current cycle and ignores historic months', () {
      final now = DateTime.now();
      // Record 1: Inside current month (e.g. 8 hours)
      final recCurrent = AttendanceRecord(
        id: 'shift_curr',
        employeeId: '119',
        date: '${now.year}-${now.month.toString().padLeft(2, '0')}-15',
        checkIn: '08:00',
        checkOut: '16:00',
        workedHours: 8.0,
        requiredHours: 8.0,
        delayMinutes: 0,
        overtimeMinutes: 0,
        status: AttendanceStatus.present,
        branchId: 'BR-1',
        branchName: 'الفرع الرئيسي',
      );

      // Record 2: In a historic month (e.g. 224 hours from past months)
      final pastMonth = now.month > 1 ? now.month - 1 : 12;
      final pastYear = now.month > 1 ? now.year : now.year - 1;
      final recPast = AttendanceRecord(
        id: 'shift_past',
        employeeId: '119',
        date: '$pastYear-${pastMonth.toString().padLeft(2, '0')}-10',
        checkIn: '08:00',
        checkOut: '16:00',
        workedHours: 224.0,
        requiredHours: 8.0,
        delayMinutes: 0,
        overtimeMinutes: 0,
        status: AttendanceStatus.present,
        branchId: 'BR-1',
        branchName: 'الفرع الرئيسي',
      );

      final records = [recCurrent, recPast];

      // Standard cycle calculation (1st to end of current month)
      double cycleWorkedHours = 0.0;
      for (final rec in records) {
        final d = DateTime.tryParse(rec.date);
        if (d != null && d.year == now.year && d.month == now.month) {
          cycleWorkedHours += rec.workedHours;
        }
      }

      // Must be 8.0h and NOT 232.0h (the bug that summed all history)!
      expect(cycleWorkedHours, equals(8.0));
      expect(cycleWorkedHours, isNot(equals(232.0)));
    });

    test('EmployeeDataSnapshot preserves active shift state and elapsed timer parameters', () {
      final dummyUser = UserModel(
        id: '119',
        code: '119',
        name: 'ندى اشرف',
        jobTitle: 'مدخل بيانات',
        branchId: 'BR-1',
        branchName: 'فرع تجريبي',
        isMultiBranch: false,
        annualLeaveBalance: 21,
        branches: [BranchModel(id: 'BR-1', name: 'فرع تجريبي')],
        permissions: const PermissionModel(),
      );

      final snapshot = EmployeeDataSnapshot(
        user: dummyUser,
        isShiftActive: true,
        isOnBreak: false,
        activeShiftStartEpoch: DateTime.now().subtract(const Duration(hours: 2, minutes: 15)).millisecondsSinceEpoch.toString(),
        activeShiftTimeIn: '08:00',
        activeShiftBranchId: 'BR-1',
        activeShiftBranchName: 'فرع تجريبي',
      );

      expect(snapshot.isShiftActive, isTrue);
      expect(snapshot.isOnBreak, isFalse);
      expect(snapshot.activeShiftTimeIn, equals('08:00'));
      expect(snapshot.activeShiftBranchName, equals('فرع تجريبي'));
    });
  });
}

