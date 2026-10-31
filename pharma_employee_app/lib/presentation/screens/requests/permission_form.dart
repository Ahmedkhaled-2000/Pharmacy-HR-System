import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../../core/constants/app_colors.dart';
import '../../../data/models/request_models.dart';
import '../../providers/auth_provider.dart';
import '../../providers/employee_data_provider.dart';
import '../../providers/requests_provider.dart';

class PermissionFormModal extends ConsumerStatefulWidget {
  final VoidCallback? onSubmitted;

  const PermissionFormModal({super.key, this.onSubmitted});

  @override
  ConsumerState<PermissionFormModal> createState() =>
      _PermissionFormModalState();
}

class _PermissionFormModalState extends ConsumerState<PermissionFormModal> {
  DateTime _date = DateTime.now();
  String _permType = 'early'; // 'late' (تأخير صباحي) | 'early' (انصراف مبكر)
  final _reasonController = TextEditingController();
  String? _error;
  bool _isSubmitting = false;

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _date,
      firstDate: DateTime.now().subtract(const Duration(days: 30)),
      lastDate: DateTime.now().add(const Duration(days: 30)),
    );
    if (picked != null) {
      setState(() => _date = picked);
    }
  }

  Future<void> _submit(
    double policyAllowedHours,
    int maxAllowedCount,
    int usedCount,
  ) async {
    final reason = _reasonController.text.trim();
    if (reason.isEmpty) {
      setState(() => _error = 'يرجى كتابة سبب الإذن وتفاصيل الخروج');
      return;
    }

    if (usedCount >= maxAllowedCount) {
      setState(
        () => _error =
            '⚠️ لقد استنفدت الحد الأقصى المسموح به للأذونات هذا الشهر ($maxAllowedCount إذن).',
      );
      return;
    }

    setState(() {
      _error = null;
      _isSubmitting = true;
    });

    final user = ref.read(authProvider).user;
    final empId = user?.id ?? '';

    // حساب توقيت تقريبي متطابق مع سياسة الساعات المعتمدة
    final exitHour = _permType == 'late' ? 8 : 14;
    final returnHour = exitHour + policyAllowedHours.toInt();
    final exitTimeStr = '${exitHour.toString().padLeft(2, '0')}:00';
    final returnTimeStr = '${returnHour.toString().padLeft(2, '0')}:00';

    final newReq = PermissionRequest(
      id: 'req_perm_${DateTime.now().millisecondsSinceEpoch}',
      employeeId: empId,
      date: _date,
      exitTime: exitTimeStr,
      returnTime: returnTimeStr,
      hours: policyAllowedHours,
      isDeducted: false,
      reason: reason,
      status: RequestStatus.pending,
      createdAt: DateTime.now(),
    );

    await ref.read(requestsProvider.notifier).addPermission(newReq, user: user);
    widget.onSubmitted?.call();

    if (mounted) {
      Navigator.pop(context);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            '✅ تم إرسال طلب إذن الخروج إلى مدير الفرع والإدارة بنجاح وفق شروط اللائحة',
          ),
          backgroundColor: AppColors.primary,
        ),
      );
    }
  }

  @override
  void dispose() {
    _reasonController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final empData = ref.watch(employeeDataProvider);
    final orgSettings = empData.snapshot?.orgSettings ?? {};
    final permPolicy = orgSettings['permissionPolicy'] is Map
        ? Map<String, dynamic>.from(orgSettings['permissionPolicy'] as Map)
        : {};

    // قراءة الشروط الموضوعة من قبل الإدارة ديناميكياً
    final policyAllowedHours =
        double.tryParse(
          permPolicy['maxHoursPerPermission']?.toString() ?? '2',
        ) ??
        2.0;
    final maxAllowedCount =
        int.tryParse(permPolicy['maxPermissionsPerMonth']?.toString() ?? '2') ??
        2;

    // حساب عدد الأذونات المعتمدة المستهلكة في الشهر الحالي
    final existingPerms = empData.snapshot?.permissions ?? [];
    final now = DateTime.now();
    final usedCount = existingPerms
        .where(
          (p) =>
              p.status == RequestStatus.approved &&
              p.date.month == now.month &&
              p.date.year == now.year,
        )
        .length;
    final remainingCount = (maxAllowedCount - usedCount).clamp(0, maxAllowedCount);

    return Container(
      padding: EdgeInsets.only(
        top: 20,
        left: 20,
        right: 20,
        bottom: MediaQuery.of(context).viewInsets.bottom + 20,
      ),
      decoration: BoxDecoration(
        color:
            Theme.of(context).cardTheme.color ??
            (isDark ? AppColors.darkSurface : Colors.white),
        borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
      ),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Row(
                  children: [
                    const Icon(
                      Icons.timer_outlined,
                      color: AppColors.warning,
                      size: 22,
                    ),
                    const SizedBox(width: 8),
                    Text(
                      'طلب إذن خروج / استئذان مؤقت',
                      style: TextStyle(
                        fontWeight: FontWeight.bold,
                        fontSize: 16,
                        color: isDark ? Colors.white : const Color(0xFF0F172A),
                      ),
                    ),
                  ],
                ),
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 8,
                    vertical: 3,
                  ),
                  decoration: BoxDecoration(
                    color: AppColors.warning.withValues(
                      alpha: isDark ? 0.2 : 0.1,
                    ),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(
                      color: AppColors.warning.withValues(alpha: 0.3),
                    ),
                  ),
                  child: Text(
                    'المستهلك: $usedCount من $maxAllowedCount إذن',
                    style: const TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.bold,
                      color: AppColors.warning,
                    ),
                  ),
                ),
              ],
            ),
            Divider(
              height: 20,
              color: isDark ? AppColors.darkBorder : const Color(0xFFE2E8F0),
            ),

            if (_error != null) ...[
              Container(
                padding: const EdgeInsets.all(10),
                margin: const EdgeInsets.only(bottom: 14),
                decoration: BoxDecoration(
                  color: AppColors.danger.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Text(
                  _error!,
                  style: const TextStyle(
                    color: AppColors.danger,
                    fontSize: 12,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
            ],

            // 🔒 بطاقة سياسة الإدارة الديناميكية المعتمدة (تمنع التعديل اليدوي على الساعات وتتغير بتغير إعدادات السيرفر)
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: isDark
                    ? AppColors.primary.withValues(alpha: 0.15)
                    : const Color(0xFFEFF6FF),
                borderRadius: BorderRadius.circular(14),
                border: Border.all(
                  color: isDark
                      ? AppColors.primary.withValues(alpha: 0.3)
                      : const Color(0xFFBFDBFE),
                ),
              ),
              child: Row(
                children: [
                  const Icon(
                    Icons.verified_user_rounded,
                    color: AppColors.primary,
                    size: 20,
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'مدة الإذن محددة نظامياً وفق لائحة الإدارة',
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.bold,
                            color: isDark ? Colors.white : const Color(0xFF1E3A8A),
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          'المدة المعتمدة: ${policyAllowedHours.toStringAsFixed(1)} ساعة • المتبقي لك: $remainingCount إذن هذا الشهر',
                          style: TextStyle(
                            fontSize: 11,
                            color: isDark ? Colors.grey.shade300 : const Color(0xFF3B82F6),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),

            // نوع الإذن
            Text(
              'نوع الإذن المطلوب',
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.bold,
                color: isDark ? Colors.white70 : const Color(0xFF334155),
              ),
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: InkWell(
                    onTap: () => setState(() => _permType = 'early'),
                    borderRadius: BorderRadius.circular(12),
                    child: Container(
                      padding: const EdgeInsets.symmetric(vertical: 10),
                      decoration: BoxDecoration(
                        color: _permType == 'early'
                            ? AppColors.warning.withValues(alpha: isDark ? 0.3 : 0.15)
                            : (isDark ? Colors.black.withValues(alpha: 0.25) : const Color(0xFFF1F5F9)),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(
                          color: _permType == 'early'
                              ? AppColors.warning
                              : (isDark ? AppColors.darkBorder : const Color(0xFFE2E8F0)),
                          width: _permType == 'early' ? 1.5 : 1.0,
                        ),
                      ),
                      child: Center(
                        child: Text(
                          '🚪 خروج وانصراف مبكر',
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.bold,
                            color: _permType == 'early'
                                ? AppColors.warning
                                : (isDark ? Colors.white70 : const Color(0xFF475569)),
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: InkWell(
                    onTap: () => setState(() => _permType = 'late'),
                    borderRadius: BorderRadius.circular(12),
                    child: Container(
                      padding: const EdgeInsets.symmetric(vertical: 10),
                      decoration: BoxDecoration(
                        color: _permType == 'late'
                            ? AppColors.warning.withValues(alpha: isDark ? 0.3 : 0.15)
                            : (isDark ? Colors.black.withValues(alpha: 0.25) : const Color(0xFFF1F5F9)),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(
                          color: _permType == 'late'
                              ? AppColors.warning
                              : (isDark ? AppColors.darkBorder : const Color(0xFFE2E8F0)),
                          width: _permType == 'late' ? 1.5 : 1.0,
                        ),
                      ),
                      child: Center(
                        child: Text(
                          '⏳ تأخير حضور صباحي',
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.bold,
                            color: _permType == 'late'
                                ? AppColors.warning
                                : (isDark ? Colors.white70 : const Color(0xFF475569)),
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),

            // تاريخ الإذن
            ListTile(
              tileColor: isDark
                  ? Colors.black.withValues(alpha: 0.25)
                  : const Color(0xFFF1F5F9),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
                side: BorderSide(
                  color: isDark ? AppColors.darkBorder : const Color(0xFFE2E8F0),
                ),
              ),
              leading: const Icon(Icons.calendar_today, size: 20, color: AppColors.warning),
              title: Text(
                'تاريخ الإذن المطلوب',
                style: TextStyle(
                  fontSize: 11,
                  color: isDark ? Colors.grey : const Color(0xFF64748B),
                ),
              ),
              subtitle: Text(
                DateFormat('yyyy/MM/dd').format(_date),
                style: TextStyle(
                  fontWeight: FontWeight.bold,
                  fontSize: 13.5,
                  color: isDark ? Colors.white : const Color(0xFF0F172A),
                ),
              ),
              trailing: const Icon(Icons.arrow_forward_ios, size: 14),
              onTap: _pickDate,
            ),
            const SizedBox(height: 16),

            // سبب الاستئذان
            Text(
              'سبب الاستئذان',
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.bold,
                color: isDark ? Colors.white70 : const Color(0xFF334155),
              ),
            ),
            const SizedBox(height: 8),
            TextField(
              controller: _reasonController,
              maxLines: 2,
              decoration: InputDecoration(
                hintText: 'مثال: ظرف عائلي طارئ أو مراجعة بنكية أو طبية...',
                filled: true,
                fillColor: isDark
                    ? Colors.black.withValues(alpha: 0.25)
                    : const Color(0xFFF8FAFC),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide(
                    color: isDark ? AppColors.darkBorder : const Color(0xFFE2E8F0),
                  ),
                ),
              ),
            ),
            const SizedBox(height: 20),

            // زر الإرسال
            SizedBox(
              width: double.infinity,
              height: 48,
              child: ElevatedButton.icon(
                onPressed: _isSubmitting
                    ? null
                    : () => _submit(
                          policyAllowedHours,
                          maxAllowedCount,
                          usedCount,
                        ),
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.warning,
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
                icon: _isSubmitting
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.white,
                        ),
                      )
                    : const Icon(Icons.send_rounded, size: 18),
                label: const Text(
                  'إرسال طلب الإذن لمدير الفرع',
                  style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
