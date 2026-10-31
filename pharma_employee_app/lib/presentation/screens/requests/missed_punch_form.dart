import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../../core/constants/app_colors.dart';
import '../../../data/models/request_models.dart';
import '../../providers/auth_provider.dart';
import '../../providers/requests_provider.dart';

class MissedPunchFormModal extends ConsumerStatefulWidget {
  final VoidCallback? onSubmitted;

  const MissedPunchFormModal({super.key, this.onSubmitted});

  @override
  ConsumerState<MissedPunchFormModal> createState() => _MissedPunchFormModalState();
}

class _MissedPunchFormModalState extends ConsumerState<MissedPunchFormModal> {
  DateTime _date = DateTime.now().subtract(const Duration(days: 1));
  TimeOfDay _inTime = const TimeOfDay(hour: 8, minute: 0);
  TimeOfDay _outTime = const TimeOfDay(hour: 16, minute: 0);
  final _reasonController = TextEditingController();
  String? _error;
  bool _isSubmitting = false;

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _date,
      firstDate: DateTime.now().subtract(const Duration(days: 30)),
      lastDate: DateTime.now(),
    );
    if (picked != null) {
      setState(() => _date = picked);
    }
  }

  Future<void> _submit() async {
    final reason = _reasonController.text.trim();
    if (reason.isEmpty) {
      setState(() => _error = 'يرجى كتابة سبب عدم تسجيل البصمة');
      return;
    }

    setState(() => _isSubmitting = true);
    final user = ref.read(authProvider).user;
    final empId = user?.id ?? 'emp_1789278305966';

    final newReq = MissedPunchRequest(
      id: 'req_punch_${DateTime.now().millisecondsSinceEpoch}',
      employeeId: empId,
      punchDate: _date,
      checkIn: '${_inTime.hour.toString().padLeft(2, '0')}:${_inTime.minute.toString().padLeft(2, '0')}',
      checkOut: '${_outTime.hour.toString().padLeft(2, '0')}:${_outTime.minute.toString().padLeft(2, '0')}',
      branchId: user?.branchId ?? 'branch_1789278073821',
      branchName: user?.branchName ?? 'فرع اختبار',
      reason: reason,
      status: RequestStatus.pending,
      createdAt: DateTime.now(),
    );

    await ref.read(requestsProvider.notifier).addMissedPunch(newReq, user: user);
    widget.onSubmitted?.call();
    if (mounted) {
      Navigator.pop(context);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('✅ تم إرسال طلب توثيق البصمة المنسية للإدارة'),
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
                const Icon(Icons.history_toggle_off_rounded, color: AppColors.warning, size: 24),
                const SizedBox(width: 8),
                Text(
                  'توثيق وردية يدوية / بصمة منسية',
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
              'تاريخ الوردية الفعلية',
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
                      dateFormat.format(_date),
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.bold,
                        color: isDark ? Colors.white : const Color(0xFF0F172A),
                      ),
                    ),
                    const Icon(Icons.calendar_today, size: 16, color: AppColors.warning),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 14),

            Row(
              children: [
                Expanded(
                  child: ListTile(
                    tileColor: isDark ? Colors.black.withValues(alpha: 0.25) : const Color(0xFFF1F5F9),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                      side: BorderSide(color: isDark ? AppColors.darkBorder : const Color(0xFFE2E8F0)),
                    ),
                    title: Text('وقت الحضور', style: TextStyle(fontSize: 11, color: isDark ? Colors.grey : const Color(0xFF64748B))),
                    subtitle: Text(
                      '${_inTime.hour}:${_inTime.minute.toString().padLeft(2, '0')}',
                      style: TextStyle(fontWeight: FontWeight.bold, color: isDark ? Colors.white : const Color(0xFF0F172A)),
                    ),
                    onTap: () async {
                      final t = await showTimePicker(context: context, initialTime: _inTime);
                      if (t != null) setState(() => _inTime = t);
                    },
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: ListTile(
                    tileColor: isDark ? Colors.black.withValues(alpha: 0.25) : const Color(0xFFF1F5F9),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                      side: BorderSide(color: isDark ? AppColors.darkBorder : const Color(0xFFE2E8F0)),
                    ),
                    title: Text('وقت الانصراف', style: TextStyle(fontSize: 11, color: isDark ? Colors.grey : const Color(0xFF64748B))),
                    subtitle: Text(
                      '${_outTime.hour}:${_outTime.minute.toString().padLeft(2, '0')}',
                      style: TextStyle(fontWeight: FontWeight.bold, color: isDark ? Colors.white : const Color(0xFF0F172A)),
                    ),
                    onTap: () async {
                      final t = await showTimePicker(context: context, initialTime: _outTime);
                      if (t != null) setState(() => _outTime = t);
                    },
                  ),
                ),
              ],
            ),
            const SizedBox(height: 14),

            Text(
              'السبب (عطل بالجهاز / نسيان / انقطاع إنترنت)',
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.bold,
                color: isDark ? Colors.white70 : const Color(0xFF334155),
              ),
            ),
            const SizedBox(height: 6),
            TextField(
              controller: _reasonController,
              decoration: InputDecoration(
                hintText: 'اكتب سبب عدم التقاط البصمة بالفرع...',
                filled: true,
                fillColor: isDark ? Colors.black.withValues(alpha: 0.25) : const Color(0xFFF1F5F9),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide(color: isDark ? AppColors.darkBorder : const Color(0xFFE2E8F0)),
                ),
              ),
            ),
            const SizedBox(height: 22),

            SizedBox(
              width: double.infinity,
              height: 48,
              child: ElevatedButton.icon(
                onPressed: _isSubmitting ? null : _submit,
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.warning,
                  foregroundColor: Colors.black87,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                ),
                icon: _isSubmitting
                    ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.black87))
                    : const Icon(Icons.send_rounded, size: 18),
                label: Text(
                  _isSubmitting ? 'جارٍ الإرسال...' : 'إرسال طلب التوثيق للإدارة',
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
