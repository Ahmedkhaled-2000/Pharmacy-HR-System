import 'package:flutter_test/flutter_test.dart';
import 'package:pharma_employee_app/data/models/request_models.dart';
import 'package:pharma_employee_app/data/models/attendance_model.dart';
import 'package:pharma_employee_app/data/models/salary_slip_model.dart';
import 'package:pharma_employee_app/data/models/notification_model.dart';

void main() {
  group('Comprehensive Domain Models Tests', () {
    test('LeaveRequest serialization and duration calculation', () {
      final leave = LeaveRequest(
        id: 'req-leave-1',
        employeeId: 'emp-00',
        type: LeaveType.annual,
        startDate: DateTime(2026, 11, 1),
        endDate: DateTime(2026, 11, 3),
        daysCount: 3,
        reason: 'ظرف عائلي طارئ',
        status: RequestStatus.pending,
        createdAt: DateTime(2026, 10, 29),
      );

      final json = leave.toJson();
      expect(json['id'], 'req-leave-1');
      expect(json['daysCount'], 3);
      expect(json['type'], 'annual');
      expect(json['status'], 'pending');

      final fromJson = LeaveRequest.fromJson(json);
      expect(fromJson.id, leave.id);
      expect(fromJson.daysCount, 3);
      expect(fromJson.type, LeaveType.annual);
    });

    test('LoanRequest installments and monthly deduction', () {
      final loan = LoanRequest(
        id: 'req-loan-1',
        employeeId: 'emp-00',
        amount: 3000.0,
        loanType: LoanType.cash,
        installmentsCount: 6,
        monthlyDeduction: 500.0,
        reason: 'مصاريف دراسية',
        status: RequestStatus.approved,
        createdAt: DateTime(2026, 10, 20),
      );

      expect(loan.monthlyDeduction, 500.0);
      expect(loan.amount / loan.installmentsCount, 500.0);
      expect(loan.status, RequestStatus.approved);
    });

    test('AttendanceRecord status evaluation', () {
      final record = AttendanceRecord(
        id: 'att-1',
        employeeId: 'emp-00',
        date: '2026-10-28',
        checkIn: '08:15',
        checkOut: '16:30',
        workedHours: 8.25,
        requiredHours: 8.0,
        delayMinutes: 15,
        overtimeMinutes: 15,
        status: AttendanceStatus.late,
        branchId: 'b-1',
        branchName: 'فرع اختبار',
      );

      expect(record.delayMinutes, 15);
      expect(record.status, AttendanceStatus.late);
      expect(record.workedHours, greaterThan(record.requiredHours));
    });

    test('SalarySlipModel net calculation matches portal specifications', () {
      final slip = SalarySlipModel(
        id: 'sal-2026-11',
        employeeId: 'emp-00',
        month: '2026-11',
        baseSalary: 6200.0,
        hourlyRate: 25.0,
        workedHours: 180.0,
        targetHours: 208.0,
        allowances: 0.0,
        bonuses: 0.0,
        penalties: 2500.0,
        advances: 0.0,
        netSalary: -2500.0,
        isPaid: false,
      );

      expect(slip.penalties, 2500.0);
      expect(slip.netSalary, -2500.0);
      expect(slip.hourlyRate, 25.0);
    });

    test('InAppNotificationModel serialization and deep link', () {
      final notif = InAppNotificationModel(
        id: 'notif-1',
        title: 'تم اعتماد الإجازة السنوية',
        body: 'وافقت الإدارة على إجازتك لمدة 3 أيام',
        type: NotificationType.approval,
        timestamp: DateTime(2026, 10, 29, 10, 0),
        isRead: false,
        targetTab: 'leaves',
      );

      expect(notif.isRead, false);
      expect(notif.targetTab, 'leaves');
      expect(notif.type, NotificationType.approval);
    });
  });
}

