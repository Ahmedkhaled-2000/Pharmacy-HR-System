import 'package:flutter_test/flutter_test.dart';
import 'package:pharma_employee_app/core/services/period_cycle_service.dart';
import 'package:pharma_employee_app/core/services/branch_network_auth_service.dart';
import 'package:pharma_employee_app/data/models/branch_model.dart';

void main() {
  group('PeriodCycleService Tests (Management Approved Month Cycle)', () {
    test('extractPayrollSettings correctly parses 21 to 20 cycle', () {
      final settings = PeriodCycleService.extractPayrollSettings({
        'payrollPayoutStartDay': 21,
        'payrollPayoutEndDay': 20,
      });

      expect(settings.startDay, 21);
      expect(settings.endDay, 20);
      expect(settings.periodType, 'cycle');
    });

    test(
      'getCycleDateRange produces 2026-09-21 to 2026-10-20 for 2026-10 cycle',
      () {
        final range = PeriodCycleService.getCycleDateRange('2026-10', {
          'payrollPayoutStartDay': 21,
          'payrollPayoutEndDay': 20,
        });

        expect(range.startDate, '2026-09-21');
        expect(range.endDate, '2026-10-20');
        expect(range.daysCount, 30);
        expect(range.containsDateStr('2026-09-21'), isTrue);
        expect(range.containsDateStr('2026-10-20'), isTrue);
        expect(range.containsDateStr('2026-10-05'), isTrue);
        expect(range.containsDateStr('2026-09-20'), isFalse);
        expect(range.containsDateStr('2026-10-21'), isFalse);
      },
    );

    test('getActivePayrollMonth transitions to next cycle after cutoff date and time', () {
      final orgSettings = {
        'payrollPayoutStartDay': 21,
        'payrollPayoutEndDay': 20,
        'payrollPayoutEndTime': '23:59',
      };

      // On 2026-10-20 before midnight -> still in 2026-10 cycle
      final monthBeforeCutoff = PeriodCycleService.getActivePayrollMonth(
        orgSettings,
        DateTime(2026, 10, 20, 18, 0),
      );
      expect(monthBeforeCutoff, '2026-10');

      // On 2026-10-21 -> advances to 2026-11 cycle
      final monthAfterCutoff = PeriodCycleService.getActivePayrollMonth(
        orgSettings,
        DateTime(2026, 10, 21, 9, 0),
      );
      expect(monthAfterCutoff, '2026-11');
    });
  });

  group('BranchNetworkAuthService Tests (Branch Router IP Restriction)', () {
    final branchSaidBakri = BranchModel(
      id: 'branch_said',
      name: 'صيدلية سعيد بكري',
      ipRestrictionEnabled: true,
      allowedIps: const [
        BranchAllowedIp(
          id: '1',
          ip: '154.180.165.138',
          label: 'راوتر الفرع سعيد',
        ),
      ],
    );

    final branchManar = BranchModel(
      id: 'branch_manar',
      name: 'صيدلية منار الكومي',
      ipRestrictionEnabled: true,
      allowedIps: const [
        BranchAllowedIp(id: '2', ip: '154.180.87.201', label: 'راوتر فرع منار'),
      ],
    );

    test('Grants access when device IP matches branch router IP', () {
      final res = BranchNetworkAuthService.checkBranchAuthorization(
        targetBranch: branchSaidBakri,
        currentIp: '154.180.165.138',
        allBranches: [branchSaidBakri, branchManar],
      );

      expect(res.isAuthorized, isTrue);
      expect(res.reason, 'authorized');
    });

    test('Denies access and detects wrong branch when connected to another branch router', () {
      final res = BranchNetworkAuthService.checkBranchAuthorization(
        targetBranch: branchSaidBakri,
        currentIp: '154.180.87.201', // Connecting from branchManar router!
        allBranches: [branchSaidBakri, branchManar],
      );

      expect(res.isAuthorized, isFalse);
      expect(res.reason, 'wrong_branch_ip');
      expect(res.detectedBranchName, 'صيدلية منار الكومي');
    });

    test('Denies access when IP is completely external / unauthorized', () {
      final res = BranchNetworkAuthService.checkBranchAuthorization(
        targetBranch: branchSaidBakri,
        currentIp: '196.120.55.99',
        allBranches: [branchSaidBakri, branchManar],
      );

      expect(res.isAuthorized, isFalse);
      expect(res.reason, 'unauthorized_branch_ip');
    });

    test('Allows access when branch ipRestrictionEnabled is false', () {
      final unrestrictedBranch = BranchModel(
        id: 'branch_test',
        name: 'فرع تجريبي',
        ipRestrictionEnabled: false,
        allowedIps: const [BranchAllowedIp(id: '3', ip: '41.69.140.255')],
      );

      final res = BranchNetworkAuthService.checkBranchAuthorization(
        targetBranch: unrestrictedBranch,
        currentIp: '196.120.55.99',
      );

      expect(res.isAuthorized, isTrue);
    });
  });
}
