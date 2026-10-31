import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:cached_network_image/cached_network_image.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/services/branch_network_auth_service.dart';
import '../../../core/services/face_embedding_service.dart';
import '../../../data/models/branch_model.dart';
import '../../../data/models/user_model.dart';
import '../../../data/repositories/employee_repository.dart';
import '../../providers/auth_provider.dart';
import '../../providers/employee_data_provider.dart';
import '../../widgets/biometrics/face_camera_scanner_modal.dart';

class BiometricKioskScreen extends ConsumerStatefulWidget {
  const BiometricKioskScreen({super.key});

  /// فحص صلاحية تبديل الفرع في الكشك (مسموح فقط للموظف متعدد الفروع أو الإدارة العليا)
  static bool canUserSwitchBranch(UserModel? user, {String? userRole}) {
    if (user == null) return false;
    final r = (userRole ?? (user.permissions.canEditShift ? 'admin' : '')).toLowerCase();
    if (r == 'admin' || r == 'owner') {
      return true;
    }
    if (user.isMultiBranch || user.branches.length > 1) {
      return true;
    }
    return false;
  }

  @override
  ConsumerState<BiometricKioskScreen> createState() => _BiometricKioskScreenState();
}

class _BiometricKioskScreenState extends ConsumerState<BiometricKioskScreen> {
  String _inputCode = '';
  Timer? _clockTimer;
  DateTime _currentClock = DateTime.now();
  bool _isPunching = false;
  String _selectedKioskBranchId = '';

  // حالة تقييد وفحص IP راوتر الفرع
  String? _currentDeviceIp;
  bool _isCheckingIp = true;
  IpAuthResult? _ipAuthResult;

  @override
  void initState() {
    super.initState();
    _clockTimer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) {
        setState(() => _currentClock = DateTime.now());
      }
    });

    final user = ref.read(authProvider).user;
    _selectedKioskBranchId = user?.branchId ?? (user?.branches.isNotEmpty == true ? user!.branches.first.id : '');

    WidgetsBinding.instance.addPostFrameCallback((_) {
      _checkBranchIpAuth();
    });
  }

  @override
  void dispose() {
    _clockTimer?.cancel();
    super.dispose();
  }

  /// فحص مطابقة عنوان الـ IP الحالي مع راوتر الفرع المعتمد
  Future<void> _checkBranchIpAuth() async {
    if (!mounted) return;
    setState(() => _isCheckingIp = true);

    final ip = await BranchNetworkAuthService.getCurrentPublicIp(forceRefresh: true);
    final snapshot = ref.read(employeeDataProvider).snapshot;
    final allBranches = snapshot?.allBranches ?? [];

    BranchModel? targetBranch;
    for (final b in allBranches) {
      if (b.id == _selectedKioskBranchId) {
        targetBranch = b;
        break;
      }
    }
    targetBranch ??= allBranches.isNotEmpty
        ? allBranches.first
        : BranchModel(id: _selectedKioskBranchId, name: 'الفرع الميداني');

    final res = BranchNetworkAuthService.checkBranchAuthorization(
      targetBranch: targetBranch,
      currentIp: ip,
      allBranches: allBranches,
      globalIpRestrictions: snapshot?.ipRestrictions,
    );

    if (mounted) {
      setState(() {
        _currentDeviceIp = ip;
        _ipAuthResult = res;
        _isCheckingIp = false;
      });
    }
  }

  void _onKeypadTap(String val) {
    if (_inputCode.length >= 6) return;
    setState(() => _inputCode += val);
  }

  void _onBackspace() {
    if (_inputCode.isEmpty) return;
    setState(() => _inputCode = _inputCode.substring(0, _inputCode.length - 1));
  }

  void _onClear() {
    setState(() => _inputCode = '');
  }

  UserModel? _findMatchedEmployee(String code) {
    if (code.trim().isEmpty) return null;
    final allEmployees = ref.read(employeeDataProvider).snapshot?.allEmployees ?? [];
    final currentTarget = code.trim();

    final foundMap = allEmployees.firstWhere(
      (e) {
        final c = e['code']?.toString().trim();
        final id = e['id']?.toString().trim();
        return (c == currentTarget || id == currentTarget);
      },
      orElse: () => <String, dynamic>{},
    );

    if (foundMap.isNotEmpty) {
      return UserModel.fromMap(foundMap);
    }

    final selfUser = ref.read(authProvider).user;
    if (selfUser != null && (selfUser.code == currentTarget || selfUser.id == currentTarget)) {
      return selfUser;
    }

    return null;
  }

  Future<void> _executeKioskPunch({
    required UserModel targetUser,
    required String actionType,
    required String actionTitle,
    required Color color,
  }) async {
    if (_isPunching) return;
    setState(() => _isPunching = true);

    final snapshot = ref.read(employeeDataProvider).snapshot;
    final branchName = snapshot?.allBranches
        .firstWhere((b) => b.id == _selectedKioskBranchId, orElse: () => BranchModel(id: _selectedKioskBranchId, name: 'فرع الكشك'))
        .name ?? 'فرع الكشك';

    final repo = ref.read(employeeRepositoryProvider);
    final ok = await repo.recordPunch(
      user: targetUser,
      actionType: actionType,
      branchId: _selectedKioskBranchId,
      branchName: branchName,
    );

    setState(() => _isPunching = false);
    await ref.read(employeeDataProvider.notifier).refresh();

    if (mounted) {
      _showKioskConfirmationModal(
        user: targetUser,
        actionTitle: actionTitle,
        color: color,
        success: ok,
        branchName: branchName,
      );
      _onClear();
    }
  }

  void _showKioskConfirmationModal({
    required UserModel user,
    required String actionTitle,
    required Color color,
    required bool success,
    required String branchName,
  }) {
    final timeStr = DateFormat('hh:mm:ss a', 'ar_EG').format(DateTime.now());
    final dateStr = DateFormat('yyyy-MM-dd').format(DateTime.now());

    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (ctx) {
        Future.delayed(const Duration(seconds: 4), () {
          if (ctx.mounted) Navigator.pop(ctx);
        });

        return AlertDialog(
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
          contentPadding: const EdgeInsets.all(24),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 76,
                height: 76,
                decoration: BoxDecoration(
                  color: (success ? color : AppColors.danger).withValues(alpha: 0.15),
                  shape: BoxShape.circle,
                ),
                child: Icon(
                  success ? Icons.check_circle_rounded : Icons.error_rounded,
                  size: 44,
                  color: success ? color : AppColors.danger,
                ),
              ),
              const SizedBox(height: 16),
              Text(
                success ? actionTitle : 'تعذر تسجيل البصمة',
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                  color: success ? const Color(0xFF0F172A) : AppColors.danger,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 6),
              Text(
                user.name,
                style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: AppColors.primary),
                textAlign: TextAlign.center,
              ),
              Text(
                '${user.jobTitle} • كود: ${user.code}',
                style: const TextStyle(fontSize: 12, color: Colors.grey),
              ),
              const SizedBox(height: 16),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                decoration: BoxDecoration(
                  color: const Color(0xFFF8FAFC),
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: const Color(0xFFE2E8F0)),
                ),
                child: Column(
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text('الفرع:', style: TextStyle(fontSize: 12, color: Colors.grey)),
                        Text(branchName, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold)),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text('التوقيت:', style: TextStyle(fontSize: 12, color: Colors.grey)),
                        Text('$dateStr • $timeStr', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold)),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 18),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: () => Navigator.pop(ctx),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.primary,
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                  child: const Text('موافق (إغلاق)', style: TextStyle(fontWeight: FontWeight.bold)),
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  /// 🧬 تسجيل البصمة الذكية بالوجه مع التحقق الصارم من نسبة المطابقة 70%
  Future<void> _handleFaceScanPunch() async {
    final snapshot = ref.read(employeeDataProvider).snapshot;
    final matchedEmp = _findMatchedEmployee(_inputCode);

    if (matchedEmp != null) {
      // 1. الموظف محدد بالفعل عبر لوحة الأرقام (PIN): التحقق المباشر من بصمته المسجلة
      final registeredDescriptor = snapshot?.allFaceDescriptors[matchedEmp.id]?.toString() ??
          snapshot?.allFaceDescriptors[matchedEmp.code]?.toString() ??
          (matchedEmp.id == snapshot?.user.id ? snapshot?.faceDescriptor : null);

      if (registeredDescriptor == null || registeredDescriptor.trim().isEmpty) {
        showDialog(
          context: context,
          builder: (ctx) => AlertDialog(
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
            title: const Row(
              children: [
                Icon(Icons.warning_amber_rounded, color: AppColors.warning),
                SizedBox(width: 8),
                Text('تنبيه البصمة الحيوية', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
              ],
            ),
            content: Text(
              'الموظف [${matchedEmp.name}] ليس لديه بصمة وجه معتمدة مسجلة بالنظام بعد.\nيرجى استخدام لوحة الأرقام لتسجيل الحضور، أو تقديم طلب تسجيل بصمة من تطبيق الموظف.',
              style: const TextStyle(fontSize: 13, height: 1.4),
            ),
            actions: [
              TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('موافق')),
            ],
          ),
        );
        return;
      }

      final result = await Navigator.push<FaceScannerResult>(
        context,
        MaterialPageRoute(
          builder: (_) => FaceCameraScannerModal(
            mode: FaceScannerMode.verify,
            registeredDescriptor: registeredDescriptor,
            employeeName: matchedEmp.name,
          ),
        ),
      );

      if (result != null && result.success) {
        final isShiftActive = (matchedEmp.id == snapshot?.user.id) ? (snapshot?.isShiftActive ?? false) : false;
        final actionType = isShiftActive ? 'stop_shift' : 'start_shift';
        final matchPercent = result.matchPercentage > 0 ? result.matchPercentage : (result.similarity * 100);
        final title = isShiftActive
            ? 'تم تسجيل الانصراف عبر الوجه بنجاح (${matchPercent.toStringAsFixed(1)}%)'
            : 'تم تسجيل الحضور عبر الوجه بنجاح (${matchPercent.toStringAsFixed(1)}%)';
        final color = isShiftActive ? AppColors.danger : AppColors.primary;

        await _executeKioskPunch(
          targetUser: matchedEmp,
          actionType: actionType,
          actionTitle: title,
          color: color,
        );
      }
    } else {
      // 2. التحقق الذكي عبر ملامح الوجه التلقائية لكافة موظفي الفرع (Zero-Touch Scan)
      final allEmps = snapshot?.allEmployees ?? [];
      final enrolledEmps = allEmps.where((e) {
        final id = e['id']?.toString() ?? '';
        final code = e['code']?.toString() ?? '';
        final d = e['face_descriptor']?.toString() ??
            snapshot?.allFaceDescriptors[id]?.toString() ??
            snapshot?.allFaceDescriptors[code]?.toString();
        return d != null && d.isNotEmpty;
      }).toList();

      if (enrolledEmps.isEmpty) {
        showDialog(
          context: context,
          builder: (ctx) => AlertDialog(
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
            title: const Row(
              children: [
                Icon(Icons.face_retouching_off_rounded, color: AppColors.warning),
                SizedBox(width: 8),
                Text('لا توجد بصمات مسجلة', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
              ],
            ),
            content: const Text(
              'لا توجد بصمات وجه معتمدة مسجلة في النظام لموظفي هذا الفرع.\nيرجى استخدام كود الموظف ولوحة الأرقام لتسجيل الحضور.',
              style: TextStyle(fontSize: 13, height: 1.4),
            ),
            actions: [
              TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('إغلاق')),
            ],
          ),
        );
        return;
      }

      // التقاط الوجه حياً للتعرف والمطابقة مع الموظفين المسجلين
      final result = await Navigator.push<FaceScannerResult>(
        context,
        MaterialPageRoute(
          builder: (_) => const FaceCameraScannerModal(
            mode: FaceScannerMode.enroll,
            employeeName: 'التعرف الذكي التلقائي على الوجه',
          ),
        ),
      );

      if (result != null && result.success && result.descriptor != null) {
        final liveDesc = result.descriptor!;
        UserModel? bestMatchUser;
        double bestSim = 0.0;

        for (final empMap in enrolledEmps) {
          final id = empMap['id']?.toString() ?? '';
          final code = empMap['code']?.toString() ?? '';
          final sDesc = empMap['face_descriptor']?.toString() ??
              snapshot?.allFaceDescriptors[id]?.toString() ??
              snapshot?.allFaceDescriptors[code]?.toString() ?? '';
          if (sDesc.isEmpty) continue;

          final matchRes = FaceEmbeddingService.compareFaces(
            savedDescriptor: sDesc,
            liveDescriptor: liveDesc,
            threshold: 70.0,
          );

          if (matchRes.similarity > bestSim) {
            bestSim = matchRes.similarity;
            if (matchRes.isMatch) {
              bestMatchUser = UserModel.fromMap(empMap);
            }
          }
        }

        if (bestMatchUser != null && bestSim >= 0.70) {
          final isShiftActive = (bestMatchUser.id == snapshot?.user.id) ? (snapshot?.isShiftActive ?? false) : false;
          final actionType = isShiftActive ? 'stop_shift' : 'start_shift';
          final title = isShiftActive
              ? 'تم تسجيل الانصراف بنجاح عبر الوجه (${(bestSim * 100).toStringAsFixed(1)}%)'
              : 'تم تسجيل الحضور بنجاح عبر الوجه (${(bestSim * 100).toStringAsFixed(1)}%)';
          final color = isShiftActive ? AppColors.danger : AppColors.primary;

          await _executeKioskPunch(
            targetUser: bestMatchUser,
            actionType: actionType,
            actionTitle: title,
            color: color,
          );
        } else {
          if (mounted) {
            showDialog(
              context: context,
              builder: (ctx) => AlertDialog(
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
                title: const Row(
                  children: [
                    Icon(Icons.face_retouching_off_rounded, color: AppColors.danger),
                    SizedBox(width: 8),
                    Text('تعذر التعرف على الوجه', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                  ],
                ),
                content: Text(
                  'لم تتطابق ملامح الوجه مع أي موظف مسجل بالفرع بنسبة 70% المعتمدة.\n(أعلى نسبة تطابق مسجلة: ${(bestSim * 100).toStringAsFixed(1)}%).\nيرجى استخدام كود الموظف ولوحة الأرقام.',
                  style: const TextStyle(fontSize: 13, height: 1.4),
                ),
                actions: [
                  TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('إغلاق')),
                ],
              ),
            );
          }
        }
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final snapshot = ref.watch(employeeDataProvider).snapshot;
    final allBranches = snapshot?.allBranches ?? [];

    // ── في حال جاري فحص شبكة الـ IP ──
    if (_isCheckingIp) {
      return Scaffold(
        backgroundColor: isDark ? AppColors.darkBackground : const Color(0xFFF1F5F9),
        appBar: AppBar(
          title: const Text('كشك البصمة والدوام الذكي', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
        ),
        body: const Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              CircularProgressIndicator(color: AppColors.primary),
              SizedBox(height: 16),
              Text('جاري فحص الاتصال براوتر وشبكة الفرع المصرح بها...', style: TextStyle(fontSize: 13, color: Colors.grey)),
            ],
          ),
        ),
      );
    }

    // ── حاجز الأمان: غير مصرح بدخول كشك البصمة من خارج راوتر الفرع ──
    if (_ipAuthResult != null && !_ipAuthResult!.isAuthorized) {
      return Scaffold(
        backgroundColor: isDark ? AppColors.darkBackground : const Color(0xFFF8FAFC),
        appBar: AppBar(
          title: const Text('تقييد أمان كشك البصمة', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
          actions: [
            IconButton(
              icon: const Icon(Icons.refresh_rounded),
              tooltip: 'إعادة فحص الاتصال',
              onPressed: _checkBranchIpAuth,
            ),
          ],
        ),
        body: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    width: 88,
                    height: 88,
                    decoration: BoxDecoration(
                      color: AppColors.danger.withValues(alpha: 0.12),
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(Icons.gpp_bad_rounded, size: 52, color: AppColors.danger),
                  ),
                  const SizedBox(height: 20),
                  const Text(
                    'غير مصرح بفتح كشك البصمة',
                    style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: AppColors.danger),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'تم تقييد كشك البصمة الإلكترونية بالاتصال المباشر براوتر وشبكة الفرع المصرح بها حصراً.',
                    style: TextStyle(fontSize: 13, color: isDark ? Colors.white70 : const Color(0xFF64748B), height: 1.4),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 24),

                  // بطاقة تفاصيل التقييد
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: isDark ? const Color(0xFF1E293B) : Colors.white,
                      borderRadius: BorderRadius.circular(18),
                      border: Border.all(color: AppColors.danger.withValues(alpha: 0.3)),
                      boxShadow: [
                        BoxShadow(color: Colors.black.withValues(alpha: 0.04), blurRadius: 10, offset: const Offset(0, 4)),
                      ],
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            const Icon(Icons.location_on_rounded, size: 18, color: AppColors.primary),
                            const SizedBox(width: 8),
                            const Text('الفرع المطلوب:', style: TextStyle(fontSize: 12, color: Colors.grey)),
                            const Spacer(),
                            Text(
                              _ipAuthResult?.targetBranchName ?? 'الفرع',
                              style: const TextStyle(fontSize: 13, fontWeight: FontWeight.bold),
                            ),
                          ],
                        ),
                        const Divider(height: 20),
                        Row(
                          children: [
                            const Icon(Icons.wifi_rounded, size: 18, color: AppColors.warning),
                            const SizedBox(width: 8),
                            const Text('عنوان الـ IP المكتشف:', style: TextStyle(fontSize: 12, color: Colors.grey)),
                            const Spacer(),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                              decoration: BoxDecoration(
                                color: AppColors.danger.withValues(alpha: 0.1),
                                borderRadius: BorderRadius.circular(8),
                              ),
                              child: Text(
                                _ipAuthResult?.currentIp ?? 'غير معروف',
                                style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: AppColors.danger),
                              ),
                            ),
                          ],
                        ),
                        const Divider(height: 20),
                        Text(
                          _ipAuthResult?.message ?? '',
                          style: const TextStyle(fontSize: 12, color: AppColors.danger, height: 1.5),
                        ),
                      ],
                    ),
                  ),

                  const SizedBox(height: 20),

                  // إمكانية تبديل الفرع في حال كان للموظف فرع آخر مصرح به
                  if (allBranches.isNotEmpty) ...[
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
                      decoration: BoxDecoration(
                        color: isDark ? const Color(0xFF1E293B) : const Color(0xFFF1F5F9),
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(color: isDark ? AppColors.darkBorder : const Color(0xFFE2E8F0)),
                      ),
                      child: DropdownButtonHideUnderline(
                        child: DropdownButton<String>(
                          value: _selectedKioskBranchId.isNotEmpty && allBranches.any((b) => b.id == _selectedKioskBranchId)
                              ? _selectedKioskBranchId
                              : allBranches.first.id,
                          isExpanded: true,
                          dropdownColor: isDark ? const Color(0xFF1E293B) : Colors.white,
                          items: allBranches.map((b) {
                            return DropdownMenuItem(
                              value: b.id,
                              child: Text('تبديل الفرع: ${b.name}', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold)),
                            );
                          }).toList(),
                          onChanged: (val) {
                            if (val != null) {
                              setState(() => _selectedKioskBranchId = val);
                              _checkBranchIpAuth();
                            }
                          },
                        ),
                      ),
                    ),
                    const SizedBox(height: 16),
                  ],

                  // أزرار التحكم
                  Row(
                    children: [
                      Expanded(
                        child: OutlinedButton.icon(
                          onPressed: () => Navigator.pop(context),
                          style: OutlinedButton.styleFrom(
                            padding: const EdgeInsets.symmetric(vertical: 13),
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                          ),
                          icon: const Icon(Icons.arrow_back_rounded, size: 18),
                          label: const Text('العودة للرئيسية', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: ElevatedButton.icon(
                          onPressed: _checkBranchIpAuth,
                          style: ElevatedButton.styleFrom(
                            backgroundColor: AppColors.primary,
                            foregroundColor: Colors.white,
                            padding: const EdgeInsets.symmetric(vertical: 13),
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                          ),
                          icon: const Icon(Icons.refresh_rounded, size: 18),
                          label: const Text('إعادة الفحص', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ),
      );
    }

    // ── واجهة الكشك المعتمدة بعد التحقق من راوتر الفرع ──
    final matchedEmp = _findMatchedEmployee(_inputCode);
    final isShiftActive = (matchedEmp?.id == snapshot?.user.id) ? (snapshot?.isShiftActive ?? false) : false;
    final isOnBreak = (matchedEmp?.id == snapshot?.user.id) ? (snapshot?.isOnBreak ?? false) : false;

    final clockTimeStr = DateFormat('hh:mm:ss a', 'ar_EG').format(_currentClock);
    final clockDateStr = DateFormat('EEEE، d MMMM yyyy', 'ar_EG').format(_currentClock);

    return Scaffold(
      backgroundColor: isDark ? AppColors.darkBackground : const Color(0xFFF1F5F9),
      appBar: AppBar(
        title: const Row(
          children: [
            Icon(Icons.desktop_windows_rounded, color: AppColors.primary, size: 22),
            SizedBox(width: 8),
            Text('كشك البصمة والدوام الذكي', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
          ],
        ),
        actions: [
          IconButton(
            tooltip: 'تحديث بيانات الكشك',
            icon: const Icon(Icons.refresh_rounded),
            onPressed: () {
              ref.read(employeeDataProvider.notifier).refresh();
              _checkBranchIpAuth();
            },
          ),
        ],
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          child: Column(
            children: [
              // ⏱️ رأس الكشك مع التوقيت الرقمي الحي والفرع
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    colors: [Color(0xFF0F172A), Color(0xFF1E293B)],
                    begin: Alignment.topRight,
                    end: Alignment.bottomLeft,
                  ),
                  borderRadius: BorderRadius.circular(20),
                  boxShadow: [
                    BoxShadow(color: Colors.black.withValues(alpha: 0.15), blurRadius: 10, offset: const Offset(0, 4)),
                  ],
                ),
                child: Column(
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Row(
                          children: [
                            Container(
                              width: 38,
                              height: 38,
                              decoration: BoxDecoration(
                                color: Colors.white,
                                borderRadius: BorderRadius.circular(10),
                              ),
                              padding: const EdgeInsets.all(2),
                              child: Image.asset('assets/images/app_logo.png', fit: BoxFit.contain),
                            ),
                            const SizedBox(width: 10),
                            const Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text('منظومة إدارة الصيدليات', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 13)),
                                Text('محطة الحضور الميداني (Kiosk Station)', style: TextStyle(color: Colors.white70, fontSize: 10)),
                              ],
                            ),
                          ],
                        ),
                        // قائمة اختيار فرع الكشك
                        if (allBranches.isNotEmpty)
                          DropdownButtonHideUnderline(
                            child: DropdownButton<String>(
                              value: _selectedKioskBranchId.isNotEmpty && allBranches.any((b) => b.id == _selectedKioskBranchId)
                                  ? _selectedKioskBranchId
                                  : allBranches.first.id,
                              dropdownColor: const Color(0xFF1E293B),
                              icon: const Icon(Icons.arrow_drop_down, color: Colors.white70),
                              items: allBranches.map((b) {
                                return DropdownMenuItem(
                                  value: b.id,
                                  child: Text(b.name, style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.bold)),
                                );
                              }).toList(),
                              onChanged: (val) {
                                if (val != null) {
                                  setState(() => _selectedKioskBranchId = val);
                                  _checkBranchIpAuth();
                                }
                              },
                            ),
                          ),
                      ],
                    ),
                    const SizedBox(height: 14),
                    Text(
                      clockTimeStr,
                      style: const TextStyle(
                        color: AppColors.accentCyan,
                        fontSize: 28,
                        fontWeight: FontWeight.bold,
                        fontFamily: 'monospace',
                        letterSpacing: 2,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(clockDateStr, style: const TextStyle(color: Colors.white70, fontSize: 12)),
                    const SizedBox(height: 10),

                    // شارة اعتماد راوتر الفرع النشط
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                      decoration: BoxDecoration(
                        color: AppColors.primary.withValues(alpha: 0.15),
                        borderRadius: BorderRadius.circular(20),
                        border: Border.all(color: AppColors.primary.withValues(alpha: 0.4)),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(Icons.verified_user_rounded, color: AppColors.primary, size: 14),
                          const SizedBox(width: 6),
                          Text(
                            'شبكة راوتر الفرع معتمدة ومطابقة ✅ (${_currentDeviceIp ?? "IP"})',
                            style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.bold),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),

              const SizedBox(height: 14),

              // 🪪 بطاقة الموظف المكتشف (Employee Card Preview)
              if (matchedEmp != null) ...[
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: Theme.of(context).cardTheme.color ?? (isDark ? AppColors.darkSurface : Colors.white),
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(color: AppColors.primary, width: 1.5),
                    boxShadow: [
                      BoxShadow(color: AppColors.primary.withValues(alpha: 0.08), blurRadius: 10, offset: const Offset(0, 4)),
                    ],
                  ),
                  child: Column(
                    children: [
                      Row(
                        children: [
                          Container(
                            width: 52,
                            height: 52,
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              border: Border.all(color: AppColors.primary, width: 2),
                            ),
                            child: ClipOval(
                              child: (matchedEmp.fullPhotoUrl != null && matchedEmp.fullPhotoUrl!.isNotEmpty)
                                  ? CachedNetworkImage(
                                      imageUrl: matchedEmp.fullPhotoUrl!,
                                      fit: BoxFit.cover,
                                      placeholder: (_, __) => CircleAvatar(
                                        backgroundColor: AppColors.primary.withValues(alpha: 0.15),
                                        child: Text(matchedEmp.name.isNotEmpty ? matchedEmp.name[0] : 'U', style: const TextStyle(color: AppColors.primary, fontWeight: FontWeight.bold)),
                                      ),
                                      errorWidget: (_, __, ___) => CircleAvatar(
                                        backgroundColor: AppColors.primary.withValues(alpha: 0.15),
                                        child: Text(matchedEmp.name.isNotEmpty ? matchedEmp.name[0] : 'U', style: const TextStyle(color: AppColors.primary, fontWeight: FontWeight.bold)),
                                      ),
                                    )
                                  : CircleAvatar(
                                      backgroundColor: AppColors.primary.withValues(alpha: 0.15),
                                      child: Text(matchedEmp.name.isNotEmpty ? matchedEmp.name[0] : 'U', style: const TextStyle(color: AppColors.primary, fontWeight: FontWeight.bold)),
                                    ),
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  matchedEmp.name,
                                  style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
                                ),
                                const SizedBox(height: 2),
                                Text(
                                  '${matchedEmp.jobTitle} • كود: ${matchedEmp.code}',
                                  style: const TextStyle(fontSize: 12, color: Colors.grey),
                                ),
                              ],
                            ),
                          ),
                          IconButton(
                            icon: const Icon(Icons.close_rounded, color: Colors.grey),
                            onPressed: _onClear,
                          ),
                        ],
                      ),
                      const SizedBox(height: 14),

                      // أزرار الحضور والانصراف والبريك
                      Row(
                        children: [
                          if (!isShiftActive) ...[
                            Expanded(
                              child: ElevatedButton.icon(
                                onPressed: _isPunching
                                    ? null
                                    : () => _executeKioskPunch(
                                          targetUser: matchedEmp,
                                          actionType: 'start_shift',
                                          actionTitle: 'تم تسجيل الحضور وبدء الوردية 🟢',
                                          color: AppColors.primary,
                                        ),
                                style: ElevatedButton.styleFrom(
                                  backgroundColor: AppColors.primary,
                                  foregroundColor: Colors.white,
                                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                                  padding: const EdgeInsets.symmetric(vertical: 12),
                                ),
                                icon: const Icon(Icons.play_arrow_rounded, size: 20),
                                label: const Text('تسجيل حضور (بدء)', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                              ),
                            ),
                          ] else ...[
                            Expanded(
                              child: OutlinedButton.icon(
                                onPressed: _isPunching
                                    ? null
                                    : () => _executeKioskPunch(
                                          targetUser: matchedEmp,
                                          actionType: isOnBreak ? 'break_end' : 'break_start',
                                          actionTitle: isOnBreak ? 'تم استئناف الوردية وإنهاء الراحة ☕' : 'تم بدء استراحة البريك ⏸️',
                                          color: AppColors.warning,
                                        ),
                                style: OutlinedButton.styleFrom(
                                  side: const BorderSide(color: AppColors.warning, width: 1.5),
                                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                                  padding: const EdgeInsets.symmetric(vertical: 11),
                                ),
                                icon: Icon(isOnBreak ? Icons.play_arrow_rounded : Icons.coffee_rounded, size: 18, color: AppColors.warning),
                                label: Text(
                                  isOnBreak ? 'استئناف الوردية' : 'استراحة بريك',
                                  style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 12, color: AppColors.warning),
                                ),
                              ),
                            ),
                            const SizedBox(width: 8),
                            Expanded(
                              child: ElevatedButton.icon(
                                onPressed: _isPunching
                                    ? null
                                    : () => _executeKioskPunch(
                                          targetUser: matchedEmp,
                                          actionType: 'stop_shift',
                                          actionTitle: 'تم توثيق الانصراف وإنهاء الوردية 🔴',
                                          color: AppColors.danger,
                                        ),
                                style: ElevatedButton.styleFrom(
                                  backgroundColor: AppColors.danger,
                                  foregroundColor: Colors.white,
                                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                                  padding: const EdgeInsets.symmetric(vertical: 11),
                                ),
                                icon: const Icon(Icons.stop_rounded, size: 18),
                                label: const Text('إنهاء الوردية', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
                              ),
                            ),
                          ],
                        ],
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 14),
              ],

              // 🔢 لوحة إدخال كود الموظف السريعة (PIN Keypad)
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: Theme.of(context).cardTheme.color ?? (isDark ? AppColors.darkSurface : Colors.white),
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(color: isDark ? AppColors.darkBorder : const Color(0xFFE2E8F0)),
                ),
                child: Column(
                  children: [
                    // شاشة عرض الكود
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                      decoration: BoxDecoration(
                        color: isDark ? Colors.black26 : const Color(0xFFF8FAFC),
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(color: AppColors.primary.withValues(alpha: 0.3)),
                      ),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          const Icon(Icons.pin_rounded, color: AppColors.primary, size: 22),
                          Text(
                            _inputCode.isEmpty ? 'ادخل كود الموظف...' : _inputCode,
                            style: TextStyle(
                              fontSize: 20,
                              fontWeight: FontWeight.bold,
                              letterSpacing: _inputCode.isEmpty ? 0 : 4,
                              color: _inputCode.isEmpty ? Colors.grey : (isDark ? Colors.white : const Color(0xFF0F172A)),
                            ),
                          ),
                          if (_inputCode.isNotEmpty)
                            IconButton(
                              icon: const Icon(Icons.close_rounded, size: 18, color: Colors.grey),
                              onPressed: _onClear,
                            )
                          else
                            const SizedBox(width: 24),
                        ],
                      ),
                    ),

                    const SizedBox(height: 14),

                    // شبكة الأزرار الرقمية 1-9 و 0
                    GridView.count(
                      shrinkWrap: true,
                      physics: const NeverScrollableScrollPhysics(),
                      crossAxisCount: 3,
                      childAspectRatio: 1.8,
                      mainAxisSpacing: 8,
                      crossAxisSpacing: 8,
                      children: [
                        ...['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(
                          (digit) => _buildKeypadButton(digit, () => _onKeypadTap(digit), isDark),
                        ),
                        _buildKeypadActionButton('مسح', Icons.backspace_rounded, _onBackspace, isDark, color: AppColors.warning),
                        _buildKeypadButton('0', () => _onKeypadTap('0'), isDark),
                        _buildKeypadActionButton('تصفير', Icons.clear_all_rounded, _onClear, isDark, color: AppColors.danger),
                      ],
                    ),

                    const SizedBox(height: 16),

                    // زر البصمة الذكية بالوجه
                    SizedBox(
                      width: double.infinity,
                      height: 50,
                      child: OutlinedButton.icon(
                        onPressed: _handleFaceScanPunch,
                        style: OutlinedButton.styleFrom(
                          side: const BorderSide(color: AppColors.primary, width: 1.5),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                          backgroundColor: AppColors.primary.withValues(alpha: 0.05),
                        ),
                        icon: const Icon(Icons.camera_front_rounded, color: AppColors.primary, size: 22),
                        label: Text(
                          matchedEmp != null
                              ? 'التحقق ببصمة الوجه للموظف ${matchedEmp.name}'
                              : 'بصمة الوجه الذكية بالكاميرا (Zero-Touch)',
                          style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13, color: AppColors.primary),
                        ),
                      ),
                    ),
                  ],
                ),
              ),

              const SizedBox(height: 16),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildKeypadButton(String digit, VoidCallback onTap, bool isDark) {
    return Material(
      color: isDark ? const Color(0xFF1E293B) : const Color(0xFFF1F5F9),
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Center(
          child: Text(
            digit,
            style: TextStyle(
              fontSize: 22,
              fontWeight: FontWeight.bold,
              color: isDark ? Colors.white : const Color(0xFF0F172A),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildKeypadActionButton(String label, IconData icon, VoidCallback onTap, bool isDark, {required Color color}) {
    return Material(
      color: color.withValues(alpha: isDark ? 0.2 : 0.1),
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Center(
          child: Icon(icon, color: color, size: 22),
        ),
      ),
    );
  }
}
