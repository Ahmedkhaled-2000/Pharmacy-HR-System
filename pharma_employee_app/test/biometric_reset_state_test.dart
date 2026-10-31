import 'package:flutter_test/flutter_test.dart';
import 'package:pharma_employee_app/data/repositories/employee_repository.dart';

void main() {
  group('Biometric Reset State Tests', () {
    test('Employee with biometricFaceResetAt newer than approvedAt must have hasFaceDescriptor == false and descriptor == null', () {
      final empJson = {
        'id': 'emp_100',
        'code': '00',
        'name': 'احمد خالد',
        'biometricFaceResetAt': '2026-10-31T01:00:00Z',
        'biometricFaceApprovedAt': '2026-10-20T00:00:00Z',
        'has_face_descriptor': false,
        'face_descriptor': null,
      };

      final allFaces = {
        'emp_100': '[0.1, 0.2, 0.3]',
        '00': '[0.1, 0.2, 0.3]',
      };

      final snapshot = EmployeeRepository.parseSnapshotForTest(
        val: {
          'employees': [empJson],
          'activeShifts': {},
          'requests': [
            {
              'id': 'req_reset_1',
              'type': 'biometric_reset',
              'status': 'approved',
              'employeeId': 'emp_100',
              'employeeCode': '00',
            }
          ]
        },
        employeeCode: '00',
        allFaces: allFaces,
      );

      expect(snapshot.hasFaceDescriptor, isFalse);
      expect(snapshot.faceDescriptor, isNull);
      expect(snapshot.isFaceResetApproved, isTrue);
    });

    test('Employee with new registration after reset has hasFaceDescriptor == true', () {
      final empJson = {
        'id': 'emp_101',
        'code': '01',
        'name': 'طبيب صيدلي',
        'biometricFaceResetAt': '2026-10-20T00:00:00Z',
        'biometricFaceApprovedAt': '2026-10-25T12:00:00Z',
        'has_face_descriptor': true,
        'face_descriptor': '[0.5, 0.5, 0.5]',
      };

      final allFaces = {
        'emp_101': '[0.5, 0.5, 0.5]',
      };

      final snapshot = EmployeeRepository.parseSnapshotForTest(
        val: {
          'employees': [empJson],
          'activeShifts': {},
          'requests': []
        },
        employeeCode: '01',
        allFaces: allFaces,
      );

      expect(snapshot.hasFaceDescriptor, isTrue);
      expect(snapshot.faceDescriptor, isNotNull);
      expect(snapshot.isFaceResetApproved, isFalse);
    });

    test('Employee with older approved biometric_reset AND newer approved biometric_registration in requests must be active', () {
      final empJson = {
        'id': 'emp_100',
        'code': '00',
        'name': 'احمد خالد',
        'biometricFaceResetAt': '2026-10-31T01:36:03Z',
        'has_face_descriptor': false,
        'face_descriptor': null,
      };

      final allFaces = {
        'emp_100': '[0.1, 0.2, 0.3]',
        '00': '[0.1, 0.2, 0.3]',
      };

      final snapshot = EmployeeRepository.parseSnapshotForTest(
        val: {
          'employees': [empJson],
          'activeShifts': {},
          'requests': [
            {
              'id': 'bio_reset_1793403363816',
              'type': 'biometric_reset',
              'status': 'approved',
              'employeeId': 'emp_100',
              'employeeCode': '00',
              'createdAt': '2026-10-31T01:36:03Z',
              'decisionDate': '2026-10-31T01:36:03Z',
            },
            {
              'id': 'bio_reg_1793444496888',
              'type': 'biometric_registration',
              'status': 'approved',
              'employeeId': 'emp_100',
              'employeeCode': '00',
              'createdAt': '2026-10-31T13:01:36Z',
              'decisionDate': '2026-10-31T13:01:36Z',
              'extraPayload': {
                'face_descriptor': '[0.1, 0.2, 0.3]',
              }
            }
          ]
        },
        employeeCode: '00',
        allFaces: allFaces,
      );

      // Newer registration is approved, so reset state must be inactive and descriptor preserved!
      expect(snapshot.isFaceResetApproved, isFalse);
      expect(snapshot.hasFaceDescriptor, isTrue);
      expect(snapshot.faceDescriptor, isNotNull);
      expect(snapshot.allFaceDescriptors['00'], isNotNull);
      expect(snapshot.allFaceDescriptors['emp_100'], isNotNull);
    });
  });
}

