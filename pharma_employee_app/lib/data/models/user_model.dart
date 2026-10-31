import '../../core/network/api_client.dart';
import 'branch_model.dart';
import 'permission_model.dart';

class UserModel {
  final String id;
  final String code;
  final String name;
  final String jobTitle;
  final String? branchId;
  final String? branchName;
  final String? photoUrl;
  final bool isMultiBranch;
  final List<BranchModel> branches;
  final int annualLeaveBalance;
  final double hourlyRate;
  final double dayRate;
  final double monthlySalary;
  final PermissionModel permissions;

  const UserModel({
    required this.id,
    required this.code,
    required this.name,
    this.jobTitle = 'صيدلي',
    this.branchId,
    this.branchName,
    this.photoUrl,
    this.isMultiBranch = false,
    this.branches = const [],
    this.annualLeaveBalance = 21,
    this.hourlyRate = 25.0,
    this.dayRate = 200.0,
    this.monthlySalary = 5200.0,
    this.permissions = const PermissionModel(),
  });

  factory UserModel.fromMap(Map<String, dynamic> map) {
    final rawBranches = map['branches'] ?? map['branchesDetails'] ?? [];
    List<BranchModel> parsedBranches = [];
    if (rawBranches is List) {
      parsedBranches = rawBranches
          .whereType<Map<String, dynamic>>()
          .map((b) => BranchModel.fromMap(b))
          .toList();
    }

    return UserModel(
      id: map['id']?.toString() ?? '',
      code: map['code']?.toString() ?? '00',
      name: map['name'] ?? map['fullName'] ?? 'موظف',
      jobTitle: map['jobTitle'] ?? map['job'] ?? 'صيدلي أول',
      branchId: map['branchId']?.toString(),
      branchName: map['branchName'] ?? 'الفرع الرئيسي',
      photoUrl: map['photoUrl']?.toString() ?? map['photo']?.toString() ?? map['avatar']?.toString() ?? map['image']?.toString(),
      isMultiBranch: map['isMultiBranch'] == true || parsedBranches.length > 1,
      branches: parsedBranches,
      annualLeaveBalance: map['annualLeaveBalance'] != null 
          ? int.tryParse(map['annualLeaveBalance'].toString()) ?? 21 
          : 21,
      hourlyRate: map['hourlyRate'] != null ? double.tryParse(map['hourlyRate'].toString()) ?? 25.0 : 25.0,
      dayRate: map['dayRate'] != null ? double.tryParse(map['dayRate'].toString()) ?? 200.0 : 200.0,
      monthlySalary: map['monthlySalary'] != null ? double.tryParse(map['monthlySalary'].toString()) ?? 5200.0 : 5200.0,
      permissions: PermissionModel.fromMap(map['permissions'] as Map<String, dynamic>?),
    );
  }

  /// رابط الصورة الكامل والمباشر (مع دعم الروابط النسبية للسيرفر وروابط Base64)
  String? get fullPhotoUrl {
    if (photoUrl == null || photoUrl!.trim().isEmpty) return null;
    final trimmed = photoUrl!.trim();
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('data:image')) {
      return trimmed;
    }
    if (trimmed.startsWith('/')) {
      return '${ApiClient.origin}$trimmed';
    }
    return '${ApiClient.origin}/$trimmed';
  }

  UserModel copyWith({
    String? id,
    String? code,
    String? name,
    String? jobTitle,
    String? branchId,
    String? branchName,
    String? photoUrl,
    bool? isMultiBranch,
    List<BranchModel>? branches,
    int? annualLeaveBalance,
    double? hourlyRate,
    double? dayRate,
    double? monthlySalary,
    PermissionModel? permissions,
  }) {
    return UserModel(
      id: id ?? this.id,
      code: code ?? this.code,
      name: name ?? this.name,
      jobTitle: jobTitle ?? this.jobTitle,
      branchId: branchId ?? this.branchId,
      branchName: branchName ?? this.branchName,
      photoUrl: photoUrl ?? this.photoUrl,
      isMultiBranch: isMultiBranch ?? this.isMultiBranch,
      branches: branches ?? this.branches,
      annualLeaveBalance: annualLeaveBalance ?? this.annualLeaveBalance,
      hourlyRate: hourlyRate ?? this.hourlyRate,
      dayRate: dayRate ?? this.dayRate,
      monthlySalary: monthlySalary ?? this.monthlySalary,
      permissions: permissions ?? this.permissions,
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'code': code,
      'name': name,
      'jobTitle': jobTitle,
      'branchId': branchId,
      'branchName': branchName,
      'photoUrl': photoUrl,
      'isMultiBranch': isMultiBranch,
      'branches': branches.map((b) => {
        'id': b.id,
        'name': b.name,
        'code': b.code,
        'address': b.address,
        'phone': b.phone,
        'latitude': b.latitude,
        'longitude': b.longitude,
      }).toList(),
      'annualLeaveBalance': annualLeaveBalance,
      'hourlyRate': hourlyRate,
      'dayRate': dayRate,
      'monthlySalary': monthlySalary,
    };
  }
}

