import 'package:flutter_test/flutter_test.dart';
import 'package:pharma_employee_app/data/models/branch_model.dart';
import 'package:pharma_employee_app/data/models/user_model.dart';
import 'package:pharma_employee_app/presentation/screens/kiosk/biometric_kiosk_screen.dart';

void main() {
  group('Kiosk Strict Branch Lock Tests', () {
    test('Single-branch employee cannot switch branches in kiosk', () {
      final singleUser = UserModel(
        id: '1',
        code: '01',
        name: 'صيدلي الفرع',
        branchId: 'branch_1',
        branches: [
          BranchModel(id: 'branch_1', name: 'فرع المعادي'),
        ],
      );

      expect(BiometricKioskScreen.canUserSwitchBranch(singleUser), isFalse);
    });

    test('Multi-branch employee can switch branches between authorized branches', () {
      final multiUser = UserModel(
        id: '2',
        code: '02',
        name: 'طبيب متنقل',
        isMultiBranch: true,
        branchId: 'branch_1',
        branches: [
          BranchModel(id: 'branch_1', name: 'فرع المعادي'),
          BranchModel(id: 'branch_2', name: 'فرع مدينة نصر'),
        ],
      );

      expect(BiometricKioskScreen.canUserSwitchBranch(multiUser), isTrue);
    });

    test('Admin/Owner can switch branches even if branches list is single', () {
      final adminUser = UserModel(
        id: '3',
        code: '03',
        name: 'مدير المنظومة',
        branchId: 'branch_1',
        branches: [
          BranchModel(id: 'branch_1', name: 'فرع المعادي'),
        ],
      );

      // Admin or owner role overrides restriction
      expect(BiometricKioskScreen.canUserSwitchBranch(adminUser, userRole: 'admin'), isTrue);
      expect(BiometricKioskScreen.canUserSwitchBranch(adminUser, userRole: 'owner'), isTrue);
    });
  });
}

