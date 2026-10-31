import 'package:flutter_test/flutter_test.dart';
import 'package:pharma_employee_app/data/models/permission_model.dart';

void main() {
  group('PermissionModel Tests', () {
    test('Default permissions match system policy specifications', () {
      const perms = PermissionModel();
      expect(perms.canViewSalary, true);
      expect(perms.canViewAdjustments, true);
      expect(perms.canAddAdjustment, false);
      expect(perms.canApplyLoan, true);
      expect(perms.canApplyLeave, true);
      expect(perms.canApplySwap, true);
      expect(perms.canStartEnd, true);
      expect(perms.canManualShift, false);
      expect(perms.canEditShift, false);
    });

    test('fromMap correctly resolves permission restrictions (canStartEnd = false)', () {
      final perms = PermissionModel.fromMap({
        'canStartEnd': false,
        'canViewSalary': true,
        'canApplyLoan': false,
      });

      expect(perms.canStartEnd, false);
      expect(perms.canViewSalary, true);
      expect(perms.canApplyLoan, false);
      expect(perms.isPermActive('canStartEnd'), false);
      expect(perms.isPermActive('canViewSalary'), true);
    });

    test('isPermActive fallback honors default values for unmapped keys', () {
      const perms = PermissionModel();
      expect(perms.isPermActive('nonExistentKey', defaultVal: false), false);
      expect(perms.isPermActive('nonExistentKey', defaultVal: true), true);
    });
  });
}

