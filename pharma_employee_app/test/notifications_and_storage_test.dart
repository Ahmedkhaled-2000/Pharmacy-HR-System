import 'package:flutter_test/flutter_test.dart';
import 'package:pharma_employee_app/core/services/app_notification_service.dart';
import 'package:pharma_employee_app/core/services/attendance_pdf_service.dart';
import 'package:pharma_employee_app/data/models/attendance_model.dart';
import 'package:pharma_employee_app/data/models/branch_model.dart';
import 'package:pharma_employee_app/data/models/salary_slip_model.dart';
import 'package:pharma_employee_app/data/models/user_model.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('AppNotificationService Configuration Tests', () {
    test('Channel configuration matches system requirements', () {
      expect(AppNotificationService.channelId, equals('pharma_employee_channel'));
      expect(AppNotificationService.channelName, contains('إشعارات بوابة الموظف'));
      expect(AppNotificationService.channelDescription, contains('مسيرات الرواتب'));
    });
  });

  group('AttendancePdfService Storage & PDF Generation Tests', () {
    const mockUser = UserModel(
      id: 'emp-101',
      code: '101',
      name: 'أحمد محمود علي',
      jobTitle: 'صيدلي أول',
      branchId: 'b-1',
      branchName: 'فرع الهرم الرئيسي',
      branches: [BranchModel(id: 'b-1', name: 'فرع الهرم الرئيسي')],
      monthlySalary: 6000.0,
      hourlyRate: 35.0,
    );

    const mockSalarySlip = SalarySlipModel(
      id: 'slip-101',
      employeeId: 'emp-101',
      month: '2026-10',
      baseSalary: 6000.0,
      hourlyRate: 35.0,
      workedHours: 180.0,
      targetHours: 208.0,
      bonuses: 350.0,
      penalties: 0.0,
      advances: 500.0,
      netSalary: 5850.0,
      isPaid: false,
    );

    final mockRecords = [
      const AttendanceRecord(
        id: 'att-1',
        employeeId: 'emp-101',
        date: '2026-10-01',
        checkIn: '08:00',
        checkOut: '16:00',
        workedHours: 8.0,
        requiredHours: 8.0,
        delayMinutes: 0,
        overtimeMinutes: 0,
        branchId: 'b-1',
        branchName: 'فرع الهرم الرئيسي',
        status: AttendanceStatus.present,
      ),
    ];

    test('generateAttendancePdf returns valid PDF binary structure with %PDF- header', () async {
      final pdfBytes = await AttendancePdfService.generateAttendancePdf(
        user: mockUser,
        records: mockRecords,
        salarySlip: mockSalarySlip,
        month: '2026-10',
      );

      expect(pdfBytes, isNotNull);
      expect(pdfBytes.length, greaterThan(1000));
      // PDF standard magic header %PDF-
      final header = String.fromCharCodes(pdfBytes.take(5));
      expect(header, equals('%PDF-'));
    });
  });
}
