import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../../core/constants/app_colors.dart';
import '../../../data/models/request_models.dart';
import '../../providers/auth_provider.dart';
import '../../providers/requests_provider.dart';

class ResignationFormModal extends ConsumerStatefulWidget {
  final VoidCallback? onSubmitted;

  const ResignationFormModal({super.key, this.onSubmitted});

  @override
  ConsumerState<ResignationFormModal> createState() => _ResignationFormModalState();
}

class _ResignationFormModalState extends ConsumerState<ResignationFormModal> {
  DateTime _lastWorkingDay = DateTime.now().add(const Duration(days: 30));
  final _reasonController = TextEditingController();
  bool _acceptedTerms = false;
  String? _error;
  bool _isSubmitting = false;

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _lastWorkingDay,
      firstDate: DateTime.now().add(const Duration(days: 15)),
      lastDate: DateTime.now().add(const Duration(days: 90)),
    );
    if (picked != null) {
      setState(() => _lastWorkingDay = picked);
    }
  }

  Future<void> _submit() async {
    final reason = _reasonController.text.trim();
    if (reason.isEmpty) {
      setState(() => _error = 'يرجى كتابة أسباب طلب الاستقالة');
      return;
    }
    if (!_acceptedTerms) {
      setState(() => _error = 'يجب الموافقة على الالتزام بفترة الإشعار القانونية');
      return;
    }

    setState(() => _isSubmitting = true);
    final user = ref.read(authProvider).user;
    final empId = user?.id ?? 'emp_1789278305966';

    final newReq = ResignationRequest(
      id: 'req_resig_${DateTime.now().millisecondsSinceEpoch}',
      employeeId: empId,
      requestDate: DateTime.now(),
      lastWorkingDay: _lastWorkingDay,
      reason: reason,
      status: RequestStatus.pending,
      noticePeriodServed: true,
      createdAt: DateTime.now(),
    );

    await ref.read(requestsProvider.notifier).addResignation(newReq, user: user);
    widget.onSubmitted?.call();
    if (mounted) {
      Navigator.pop(context);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('✅ تم تقديم طلب الاستقالة وإخلاء الطرف رسمياً للإدارة العليا'),
          backgroundColor: AppColors.danger,
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
    final dateFormat = DateFormat('yyyy/MM/dd');
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Container(
      padding: EdgeInsets.only(
        top: 20,
        left: 20,
        right: 20,
        bottom: MediaQuery.of(context).viewInsets.bottom + 20,
      ),
      decoration: BoxDecoration(
        color: Theme.of(context).cardTheme.color ?? (isDark ? AppColors.darkSurface : Colors.white),
        borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
      ),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.assignment_return_rounded, color: AppColors.danger, size: 24),
                const SizedBox(width: 8),
                Text(
                  'طلب استقالة وإخلاء طرف رسمي',
                  style: TextStyle(
                    fontWeight: FontWeight.bold,
                    fontSize: 16,
                    color: isDark ? Colors.white : const Color(0xFF0F172A),
                  ),
                ),
              ],
            ),
            Divider(height: 24, color: isDark ? AppColors.darkBorder : const Color(0xFFE2E8F0)),

            if (_error != null) ...[
              Container(
                padding: const EdgeInsets.all(10),
                margin: const EdgeInsets.only(bottom: 14),
                decoration: BoxDecoration(
                  color: AppColors.danger.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Text(_error!, style: const TextStyle(color: AppColors.danger, fontSize: 12)),
              ),
            ],

            Text(
              'تاريخ آخر يوم عمل مقترح (فترة الإشعار 30 يوماً)',
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.bold,
                color: isDark ? Colors.white70 : const Color(0xFF334155),
              ),
            ),
            const SizedBox(height: 6),
            InkWell(
              onTap: _pickDate,
              borderRadius: BorderRadius.circular(12),
              child: Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: isDark ? Colors.black.withValues(alpha: 0.25) : const Color(0xFFF1F5F9),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: isDark ? AppColors.darkBorder : const Color(0xFFE2E8F0)),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      dateFormat.format(_lastWorkingDay),
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.bold,
                        color: isDark ? Colors.white : const Color(0xFF0F172A),
                      ),
                    ),
                    const Icon(Icons.calendar_month, size: 16, color: AppColors.danger),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 14),

            Text(
              'أسباب الاستقالة وملاحظات التسليم',
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.bold,
                color: isDark ? Colors.white70 : const Color(0xFF334155),
              ),
            ),
            const SizedBox(height: 6),
            TextField(
              controller: _reasonController,
              maxLines: 3,
              decoration: InputDecoration(
                hintText: 'اكتب أسباب الاستقالة وتفاصيل تسليم العهدة والأدوية بالفرع...',
                filled: true,
                fillColor: isDark ? Colors.black.withValues(alpha: 0.25) : const Color(0xFFF1F5F9),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide(color: isDark ? AppColors.darkBorder : const Color(0xFFE2E8F0)),
                ),
              ),
            ),
            const SizedBox(height: 12),

            CheckboxListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(
                'أتعهد بالالتزام بفترة الإشعار القانونية وتسليم كافة العهد بالفرع',
                style: TextStyle(
                  fontSize: 11.5,
                  fontWeight: FontWeight.bold,
                  color: isDark ? Colors.white70 : const Color(0xFF334155),
                ),
              ),
              value: _acceptedTerms,
              activeColor: AppColors.danger,
              onChanged: (val) => setState(() => _acceptedTerms = val ?? false),
            ),
            const SizedBox(height: 16),

            SizedBox(
              width: double.infinity,
              height: 48,
              child: ElevatedButton.icon(
                onPressed: _isSubmitting ? null : _submit,
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.danger,
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                ),
                icon: _isSubmitting
                    ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                    : const Icon(Icons.send_rounded, size: 18),
                label: Text(
                  _isSubmitting ? 'جارٍ الإرسال...' : 'تأكيد وإرسال طلب الاستقالة للإدارة',
                  style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.bold),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
