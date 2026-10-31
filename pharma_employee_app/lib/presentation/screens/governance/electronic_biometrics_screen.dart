import 'dart:io';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/constants/app_colors.dart';
import '../../providers/auth_provider.dart';
import '../../providers/employee_data_provider.dart';
import '../../../data/repositories/employee_repository.dart';
import '../../widgets/biometrics/face_camera_scanner_modal.dart';

class ElectronicBiometricsScreen extends ConsumerStatefulWidget {
  const ElectronicBiometricsScreen({super.key});

  @override
  ConsumerState<ElectronicBiometricsScreen> createState() =>
      _ElectronicBiometricsScreenState();
}

class _ElectronicBiometricsScreenState
    extends ConsumerState<ElectronicBiometricsScreen> {
  bool _isSubmitting = false;

  Future<void> _showRegisterFaceDialog() async {
    final user = ref.read(authProvider).user;
    if (user == null) return;

    // 🚀 فتح الكاميرا الذكية الحية لالتقاط واستخراج معالم الوجه بيومترياً عبر ML Kit
    final result = await Navigator.push<FaceScannerResult>(
      context,
      MaterialPageRoute(
        builder: (_) => FaceCameraScannerModal(
          mode: FaceScannerMode.enroll,
          employeeName: user.name,
        ),
      ),
    );

    if (result != null && result.success && result.descriptor != null) {
      await _sendRegistrationRequest(
        descriptor: result.descriptor!,
        imageBytes: result.capturedImageBytes,
        photoPath: result.capturedPhotoPath,
      );
    }
  }

  Future<void> _sendRegistrationRequest({
    required String descriptor,
    Uint8List? imageBytes,
    String? photoPath,
  }) async {
    setState(() => _isSubmitting = true);
    final user = ref.read(authProvider).user;
    if (user == null) return;

    final repo = ref.read(employeeRepositoryProvider);

    // رفع لقطة صورة الوجه الحقيقية إلى السيرفر لتظهر في طلب الاعتماد للإدارة العليا
    String? uploadedPhotoUrl;
    try {
      Uint8List? finalBytes = imageBytes;
      if (finalBytes == null && photoPath != null && photoPath.isNotEmpty) {
        final f = File(photoPath);
        if (await f.exists()) {
          finalBytes = await f.readAsBytes();
        }
      }
      if (finalBytes != null && finalBytes.isNotEmpty) {
        uploadedPhotoUrl = await repo.uploadAttendancePhoto(
          user: user,
          imageBytes: finalBytes,
        );
      }
    } catch (e) {
      debugPrint('Error uploading registration face photo: $e');
    }

    // حفظ بصمة الوجه فورياً في قاعدة البيانات السحابية (employee_faces)
    await repo.saveFaceDescriptorToServer(
      employeeId: user.id,
      descriptor: descriptor,
    );
    if (user.code.isNotEmpty && user.code != user.id) {
      await repo.saveFaceDescriptorToServer(
        employeeId: user.code,
        descriptor: descriptor,
      );
    }

    final success = await repo.submitRequestToServer(
      user: user,
      requestType: 'biometric_registration',
      reqId: 'bio_reg_${DateTime.now().millisecondsSinceEpoch}',
      reason: 'طلب تسجيل واعتماد بصمة الوجه الإلكترونية (ML Kit Biometric)',
      details: 'تم التقاط معالم بصمة الوجه البيومترية بنجاح عبر كاميرا الذكاء الاصطناعي وجاهزة للاعتماد الإداري',
      targetBranchId: user.branchId,
      targetBranchName: user.branchName,
      extraPayload: {
        'biometricType': 'face',
        'has_face_descriptor': true,
        'face_descriptor': descriptor,
        'descriptors': descriptor,
        'requestType': 'biometric_registration',
        'status': 'pending_admin',
        if (uploadedPhotoUrl != null) ...{
          'photoUrl': uploadedPhotoUrl,
          'capturedPhotoUrl': uploadedPhotoUrl,
          'photo': uploadedPhotoUrl,
        },
      },
    );

    setState(() => _isSubmitting = false);
    ref.read(employeeDataProvider.notifier).refresh();

    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            success
                ? '✅ تم إرسال معالم بصمة الوجه الحقيقية إلى الإدارة العليا للاعتماد'
                : '⚠️ تم حفظ طلب تسجيل البصمة للمزامنة مع الخادم',
          ),
          backgroundColor: AppColors.primary,
        ),
      );
    }
  }

  void _showResetBiometricDialog() {
    final reasonController = TextEditingController();
    final isDark = Theme.of(context).brightness == Brightness.dark;

    showDialog(
      context: context,
      builder: (ctx) {
        return AlertDialog(
          backgroundColor:
              Theme.of(context).cardTheme.color ??
              (isDark ? AppColors.darkSurface : Colors.white),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(20),
          ),
          title: const Row(
            children: [
              Icon(
                Icons.restart_alt_rounded,
                color: AppColors.warning,
                size: 22,
              ),
              SizedBox(width: 8),
              Text(
                'طلب إعادة تعيين البصمة',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
              ),
            ],
          ),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'يرجى توضيح سبب طلب إعادة تسجيل بصمة الوجه للإدارة العليا (مثال: تغيير الهاتف، تعذر التحقق، أو تغير الملامح):',
                style: TextStyle(fontSize: 12, color: Colors.grey),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: reasonController,
                maxLines: 3,
                decoration: InputDecoration(
                  hintText: 'اكتب السبب بالتفصيل هنا...',
                  filled: true,
                  fillColor: isDark ? Colors.black26 : const Color(0xFFF8FAFC),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('إلغاء'),
            ),
            ElevatedButton(
              onPressed: () async {
                final text = reasonController.text.trim();
                if (text.length < 5) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text('يرجى كتابة سبب مفصل (5 أحرف على الأقل)'),
                    ),
                  );
                  return;
                }
                Navigator.pop(ctx);
                _sendResetRequest(text);
              },
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.warning,
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
              child: const Text('إرسال الطلب'),
            ),
          ],
        );
      },
    );
  }

  Future<void> _sendResetRequest(String reason) async {
    setState(() => _isSubmitting = true);
    final user = ref.read(authProvider).user;
    if (user == null) return;

    final repo = ref.read(employeeRepositoryProvider);

    final success = await repo.submitRequestToServer(
      user: user,
      requestType: 'biometric_reset',
      reqId: 'bio_reset_${DateTime.now().millisecondsSinceEpoch}',
      reason: reason,
      details: 'طلب إعادة تعيين وإعادة تسجيل بصمة الوجه الإلكترونية',
      targetBranchId: user.branchId,
      targetBranchName: user.branchName,
      extraPayload: {
        'biometricType': 'face',
        'requestType': 'biometric_reset',
        'status': 'pending_admin',
      },
    );

    setState(() => _isSubmitting = false);
    ref.read(employeeDataProvider.notifier).refresh();

    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            success
                ? '✅ تم إرسال طلب إعادة تعيين البصمة إلى الإدارة العليا بنجاح'
                : '⚠️ تم إرسال الطلب للمزامنة',
          ),
          backgroundColor: AppColors.warning,
        ),
      );
    }
  }

  Future<void> _testFaceMatch() async {
    final user = ref.read(authProvider).user;
    if (user == null) return;

    final snapshot = ref.read(employeeDataProvider).snapshot;
    final registeredDescriptor = snapshot?.faceDescriptor;

    if (registeredDescriptor == null || registeredDescriptor.trim().isEmpty) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              '⚠️ لم يتم العثور على بصمة وجه معتمدة مسجلة لك بالنظام! يرجى النقر على [تسجيل بصمة الوجه] أولاً.',
            ),
            backgroundColor: AppColors.warning,
          ),
        );
      }
      return;
    }

    // 🚀 فتح كاميرا الذكاء الاصطناعي الحية لفحص ومطابقة ملامح الوجه وحيوية الموظف
    final result = await Navigator.push<FaceScannerResult>(
      context,
      MaterialPageRoute(
        builder: (_) => FaceCameraScannerModal(
          mode: FaceScannerMode.verify,
          registeredDescriptor: registeredDescriptor,
          employeeName: user.name,
        ),
      ),
    );

    if (result == null || !mounted) return;

    final isSuccess = result.success;
    final percentageStr = result.matchPercentage > 0
        ? result.matchPercentage.toStringAsFixed(1)
        : (result.similarity * 100).toStringAsFixed(1);

    showDialog(
      context: context,
      builder: (ctx) {
        return AlertDialog(
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(20),
          ),
          title: Row(
            children: [
              Icon(
                isSuccess
                    ? Icons.check_circle_rounded
                    : Icons.warning_amber_rounded,
                color: isSuccess ? AppColors.primary : AppColors.warning,
                size: 24,
              ),
              const SizedBox(width: 8),
              const Text(
                'نتيجة مطابقة البصمة الحيوية',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
              ),
            ],
          ),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                isSuccess
                    ? Icons.verified_user_rounded
                    : Icons.face_retouching_off_rounded,
                size: 64,
                color: isSuccess ? AppColors.primary : AppColors.warning,
              ),
              const SizedBox(height: 14),
              Text(
                isSuccess
                    ? 'تم فحص ومطابقة بصمة الوجه بنجاح بنسبة دقة $percentageStr%!\n(تجاوزت الحد المعتمد 70% ومطابقة للمواصفات الحيوية).'
                    : 'درجة التطابق الحالية ($percentageStr%) أقل من الحد المعتمد (70%).\nيرجى استخدام كشاف الإضاءة والتأكد من وضوح الوجه.',
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 13, height: 1.4),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('إغلاق'),
            ),
            if (isSuccess && !(snapshot?.isShiftActive ?? false))
              ElevatedButton.icon(
                onPressed: () async {
                  Navigator.pop(ctx);
                  // تسجيل الحضور الفوري بعد نجاح المطابقة
                  final repo = ref.read(employeeRepositoryProvider);
                  await repo.recordPunch(
                    user: user,
                    actionType: 'start_shift',
                    branchId: user.branchId ?? '',
                  );
                  await ref.read(employeeDataProvider.notifier).refresh();
                  if (mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(
                        content: Text(
                          '🟢 تم توثيق الحضور البيومتري بنجاح وأنت الآن على رأس العمل',
                        ),
                        backgroundColor: AppColors.primary,
                      ),
                    );
                  }
                },
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.primary,
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
                icon: const Icon(Icons.fingerprint_rounded, size: 18),
                label: const Text(
                  'توثيق الحضور بالفرع الآن',
                  style: TextStyle(fontWeight: FontWeight.bold),
                ),
              ),
          ],
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final empData = ref.watch(employeeDataProvider);
    final snapshot = empData.snapshot;

    final hasBiometric = snapshot?.hasFaceDescriptor ?? false;
    final isApprovedReset = snapshot?.isFaceResetApproved ?? false;
    final pendingReq = snapshot?.pendingBiometricRequest;
    final isPendingRegistration =
        pendingReq != null && pendingReq['type'] == 'biometric_registration';
    final isPendingReset =
        pendingReq != null && pendingReq['type'] == 'biometric_reset';

    return Scaffold(
      appBar: AppBar(
        title: Text(
          'البصمة الإلكترونية',
          style: TextStyle(
            fontWeight: FontWeight.bold,
            fontSize: 16,
            color: isDark ? Colors.white : const Color(0xFF0F172A),
          ),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh_rounded),
            onPressed: () => ref.read(employeeDataProvider.notifier).refresh(),
          ),
        ],
      ),
      body: empData.isLoading
          ? const Center(
              child: CircularProgressIndicator(color: AppColors.primary),
            )
          : SingleChildScrollView(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // 1. بطاقة الحالة الرئيسية (Hero Status Banner)
                  if (hasBiometric) ...[
                    // حالة معتمدة ونشطة
                    _buildStatusCard(
                      context,
                      isDark: isDark,
                      title: 'البصمة الإلكترونية معتمدة ونشطة ✅',
                      subtitle: 'تم توثيق بصمة الوجه رسمياً ومطابقتها بالنظام. يمكنك تسجيل الحضور والانصراف بالفرع بكل سلاسة.',
                      icon: Icons.verified_rounded,
                      color: AppColors.primary,
                      badgeText: 'معتمدة رسميًا',
                    ),
                  ] else if (isApprovedReset) ...[
                    // حالة الموافقة على إعادة التعيين
                    _buildStatusCard(
                      context,
                      isDark: isDark,
                      title: 'تمت الموافقة على إعادة تعيين بصمتك 🔄',
                      subtitle: 'وافقت الإدارة العليا على طلبك وتم مسح البصمة السابقة بنجاح. يرجى الضغط على زر تسجيل بصمة جديدة بالأسفل لتوثيق ملامحك الحالية.',
                      icon: Icons.restart_alt_rounded,
                      color: AppColors.accentCyan,
                      badgeText: 'معتمد لإعادة التسجيل',
                    ),
                  ] else if (isPendingRegistration) ...[
                    // حالة قيد المراجعة
                    _buildStatusCard(
                      context,
                      isDark: isDark,
                      title: 'طلب البصمة قيد مراجعة الإدارة العليا ⏳',
                      subtitle: 'تم استلام لقطة بصمة الوجه بنجاح وهي قيد الاعتماد من قِبل إدارة الموارد البشرية لتفعيل الحضور المباشر.',
                      icon: Icons.hourglass_top_rounded,
                      color: AppColors.warning,
                      badgeText: 'قيد الاعتماد الإداري',
                    ),
                  ] else ...[
                    // حالة غير مسجل
                    _buildStatusCard(
                      context,
                      isDark: isDark,
                      title: 'بصمة الوجه غير مسجلة حالياً 📸',
                      subtitle: 'يرجى التقاط بصمة الوجه وإرسالها للإدارة العليا لتوثيق حضورك الذكي بنقرة واحدة.',
                      icon: Icons.face_rounded,
                      color: AppColors.accentCyan,
                      badgeText: 'مطلوب التسجيل',
                    ),
                  ],

                  if (isPendingReset) ...[
                    const SizedBox(height: 12),
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: AppColors.warning.withValues(alpha: 0.15),
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(
                          color: AppColors.warning.withValues(alpha: 0.4),
                        ),
                      ),
                      child: const Row(
                        children: [
                          Icon(
                            Icons.info_outline,
                            color: AppColors.warning,
                            size: 20,
                          ),
                          SizedBox(width: 10),
                          Expanded(
                            child: Text(
                              'لديك طلب إعادة تعيين بصمة قيد المراجعة والاعتماد لدى الإدارة العليا.',
                              style: TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.bold,
                                color: AppColors.warning,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],

                  const SizedBox(height: 24),

                  // 2. بطاقة تفاصيل البصمة والتعليمات
                  Text(
                    'إجراءات البصمة الإلكترونية المعتمدة',
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.bold,
                      color: isDark ? Colors.white : const Color(0xFF0F172A),
                    ),
                  ),
                  const SizedBox(height: 12),

                  if (isApprovedReset || (!hasBiometric && !isPendingRegistration)) ...[
                    // زر تسجيل البصمة الأول أو بعد الموافقة على إعادة التعيين
                    SizedBox(
                      width: double.infinity,
                      height: 52,
                      child: ElevatedButton.icon(
                        onPressed: _isSubmitting
                            ? null
                            : _showRegisterFaceDialog,
                        style: ElevatedButton.styleFrom(
                          backgroundColor: AppColors.primary,
                          foregroundColor: Colors.white,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(14),
                          ),
                          elevation: 2,
                        ),
                        icon: const Icon(Icons.camera_alt_rounded, size: 22),
                        label: Text(
                          isApprovedReset
                              ? 'تسجيل بصمة الوجه الجديدة الآن 📸'
                              : 'التقاط وتسجيل بصمة الوجه الآن',
                          style: const TextStyle(
                            fontSize: 15,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ),
                    ),
                  ],

                  if (hasBiometric) ...[
                    Row(
                      children: [
                        Expanded(
                          child: ElevatedButton.icon(
                            onPressed: _testFaceMatch,
                            style: ElevatedButton.styleFrom(
                              backgroundColor: AppColors.primary,
                              foregroundColor: Colors.white,
                              padding: const EdgeInsets.symmetric(vertical: 14),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(14),
                              ),
                            ),
                            icon: const Icon(Icons.security_rounded, size: 18),
                            label: const Text(
                              'اختبار المطابقة',
                              style: TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: OutlinedButton.icon(
                            onPressed: isPendingReset
                                ? null
                                : _showResetBiometricDialog,
                            style: OutlinedButton.styleFrom(
                              padding: const EdgeInsets.symmetric(vertical: 14),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(14),
                              ),
                              side: BorderSide(
                                color: isDark
                                    ? AppColors.darkBorder
                                    : const Color(0xFFCBD5E1),
                              ),
                            ),
                            icon: const Icon(
                              Icons.restart_alt_rounded,
                              size: 18,
                              color: AppColors.warning,
                            ),
                            label: const Text(
                              'إعادة تعيين',
                              style: TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ],

                  const SizedBox(height: 24),

                  // 3. إرشادات الاستخدام الآمن
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: isDark
                          ? Colors.black.withValues(alpha: 0.25)
                          : const Color(0xFFF8FAFC),
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(
                        color: isDark
                            ? AppColors.darkBorder
                            : const Color(0xFFE2E8F0),
                      ),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            const Icon(
                              Icons.privacy_tip_outlined,
                              size: 18,
                              color: AppColors.primary,
                            ),
                            const SizedBox(width: 8),
                            Text(
                              'سياسة حماية البيانات البيومترية',
                              style: TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.bold,
                                color: isDark
                                    ? Colors.white
                                    : const Color(0xFF0F172A),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 8),
                        Text(
                          '• يتم تشفير بصمة الوجه بتقنية التجزئة المشفرة أحادية الاتجاه (SHA-256 One-Way Hash).\n'
                          '• لا يتم حفظ الصورة الأصلية كملف خام على أي خادم خارجي حمايةً للخصوصية التامة.\n'
                          '• الاعتماد الرسمي من الإدارة العليا شرط إلزامي لتفعيل تسجيل الحضور الذكي بالفرع.',
                          style: TextStyle(
                            fontSize: 11.5,
                            height: 1.6,
                            color: isDark
                                ? Colors.grey.shade400
                                : const Color(0xFF64748B),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
    );
  }

  Widget _buildStatusCard(
    BuildContext context, {
    required bool isDark,
    required String title,
    required String subtitle,
    required IconData icon,
    required Color color,
    required String badgeText,
  }) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: color.withValues(alpha: isDark ? 0.15 : 0.08),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: color.withValues(alpha: 0.3), width: 1.5),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              CircleAvatar(
                radius: 24,
                backgroundColor: color.withValues(alpha: 0.2),
                child: Icon(icon, color: color, size: 28),
              ),
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 10,
                  vertical: 4,
                ),
                decoration: BoxDecoration(
                  color: color,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text(
                  badgeText,
                  style: const TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.bold,
                    color: Colors.white,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          Text(
            title,
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.bold,
              color: isDark ? Colors.white : const Color(0xFF0F172A),
            ),
          ),
          const SizedBox(height: 6),
          Text(
            subtitle,
            style: TextStyle(
              fontSize: 12.5,
              height: 1.5,
              color: isDark ? Colors.grey.shade300 : const Color(0xFF475569),
            ),
          ),
        ],
      ),
    );
  }
}
