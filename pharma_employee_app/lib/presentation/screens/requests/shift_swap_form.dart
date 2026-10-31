import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../../core/constants/app_colors.dart';
import '../../../data/models/branch_model.dart';
import '../../../data/models/request_models.dart';
import '../../providers/auth_provider.dart';
import '../../providers/employee_data_provider.dart';
import '../../providers/requests_provider.dart';

class ShiftSwapFormModal extends ConsumerStatefulWidget {
  final VoidCallback? onSubmitted;

  const ShiftSwapFormModal({super.key, this.onSubmitted});

  @override
  ConsumerState<ShiftSwapFormModal> createState() => _ShiftSwapFormModalState();
}

class _ShiftSwapFormModalState extends ConsumerState<ShiftSwapFormModal> {
  DateTime _myShiftDate = DateTime.now().add(const Duration(days: 1));
  DateTime _colleagueShiftDate = DateTime.now().add(const Duration(days: 2));
  String _selectedBranchFilter = 'all'; // 'all' or branchId
  String? _selectedColleagueId;
  final _reasonController = TextEditingController();
  String? _error;
  bool _isSubmitting = false;

  Future<void> _pickMyDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _myShiftDate,
      firstDate: DateTime.now(),
      lastDate: DateTime.now().add(const Duration(days: 60)),
    );
    if (picked != null) {
      setState(() => _myShiftDate = picked);
    }
  }

  Future<void> _pickColleagueDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _colleagueShiftDate,
      firstDate: DateTime.now(),
      lastDate: DateTime.now().add(const Duration(days: 60)),
    );
    if (picked != null) {
      setState(() => _colleagueShiftDate = picked);
    }
  }

  Future<void> _submit(List<Map<String, dynamic>> colleagues, List<BranchModel> branches) async {
    if (_selectedColleagueId == null || _selectedColleagueId!.isEmpty) {
      setState(() => _error = 'يرجى اختيار الزميل البديل من القائمة المنسدلة');
      return;
    }

    final reason = _reasonController.text.trim();
    if (reason.isEmpty) {
      setState(() => _error = 'يرجى كتابة سبب طلب تبديل الوردية');
      return;
    }

    final selectedColleague = colleagues.firstWhere(
      (c) => c['id']?.toString() == _selectedColleagueId,
      orElse: () => {},
    );

    if (selectedColleague.isEmpty) {
      setState(() => _error = 'الزميل المحدد غير موجود بقائمة الموظفين');
      return;
    }

    setState(() {
      _error = null;
      _isSubmitting = true;
    });

    final user = ref.read(authProvider).user;
    final empId = user?.id ?? '';
    final empName = user?.name ?? 'موظف';
    final colleagueName = selectedColleague['name']?.toString() ?? 'الزميل البديل';
    final targetBranchId = selectedColleague['branchId']?.toString() ?? user?.branchId ?? '';
    final targetBranch = branches.firstWhere(
      (b) => b.id == targetBranchId,
      orElse: () => BranchModel(id: targetBranchId, name: 'الفرع'),
    );

    final newReq = ShiftSwapRequest(
      id: 'req_swap_${DateTime.now().millisecondsSinceEpoch}',
      employeeId: empId,
      employeeName: empName,
      shiftDate: _myShiftDate,
      targetEmployeeId: _selectedColleagueId!,
      targetEmployeeName: colleagueName,
      branchId: targetBranch.id,
      branchName: targetBranch.name,
      reason: reason,
      status: RequestStatus.pending,
      createdAt: DateTime.now(),
    );

    // إضافة ومزامنة الطلب مع الخادم بنفس خط سير الويب (الموافقة المشتركة)
    await ref.read(requestsProvider.notifier).addSwap(
      newReq,
      user: user,
    );
    widget.onSubmitted?.call();

    if (mounted) {
      Navigator.pop(context);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            '✅ تم إرسال طلب تبديل الوردية مع $colleagueName إلى مدير الفرع والإدارة',
          ),
          backgroundColor: AppColors.accentCyan,
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
    final user = ref.watch(authProvider).user;
    final allEmps = empData.snapshot?.allEmployees ?? [];
    final allBranches = empData.snapshot?.allBranches ?? (user?.branches ?? []);

    // استبعاد الموظف الحالي من قائمة الزملاء المتاحين للتبديل
    final myId = user?.id ?? '';
    final myCode = user?.code ?? '';
    final colleagues = allEmps.where((e) {
      final eId = e['id']?.toString() ?? '';
      final eCode = e['code']?.toString() ?? '';
      if (eId == myId || (myCode.isNotEmpty && eCode == myCode)) return false;
      if (e['isActive'] == false) return false;
      return true;
    }).toList();

    // فلترة الزملاء حسب الفرع المحدد إذا رغب المستخدم
    final filteredColleagues = colleagues.where((c) {
      if (_selectedBranchFilter == 'all') return true;
      final cBranchId = c['branchId']?.toString() ?? '';
      return cBranchId == _selectedBranchFilter;
    }).toList();

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
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Row(
                  children: [
                    const Icon(Icons.swap_horiz_rounded, color: AppColors.accentCyan, size: 24),
                    const SizedBox(width: 8),
                    Text(
                      'طلب تبديل ونقل وردية',
                      style: TextStyle(
                        fontWeight: FontWeight.bold,
                        fontSize: 16,
                        color: isDark ? Colors.white : const Color(0xFF0F172A),
                      ),
                    ),
                  ],
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: AppColors.accentCyan.withValues(alpha: isDark ? 0.2 : 0.1),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: AppColors.accentCyan.withValues(alpha: 0.3)),
                  ),
                  child: const Text(
                    'مطابق لنظام الويب',
                    style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.bold, color: AppColors.accentCyan),
                  ),
                ),
              ],
            ),
            Divider(height: 20, color: isDark ? AppColors.darkBorder : const Color(0xFFE2E8F0)),

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
                  style: const TextStyle(color: AppColors.danger, fontSize: 12, fontWeight: FontWeight.bold),
                ),
              ),
            ],

            // 1. فلتر فرع الزميل (مثل صفحة الويب تماماً)
            Text(
              'تصفية الزملاء حسب الفرع',
              style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: isDark ? Colors.white70 : const Color(0xFF334155)),
            ),
            const SizedBox(height: 6),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 14),
              decoration: BoxDecoration(
                color: isDark ? Colors.black.withValues(alpha: 0.25) : const Color(0xFFF8FAFC),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: isDark ? AppColors.darkBorder : const Color(0xFFE2E8F0)),
              ),
              child: DropdownButtonHideUnderline(
                child: DropdownButton<String>(
                  value: _selectedBranchFilter,
                  isExpanded: true,
                  dropdownColor: isDark ? AppColors.darkSurface : Colors.white,
                  items: [
                    const DropdownMenuItem(value: 'all', child: Text('جميع الفروع (كافة الزملاء)')),
                    ...allBranches.map((b) => DropdownMenuItem(value: b.id, child: Text(b.name))),
                  ],
                  onChanged: (val) {
                    if (val != null) {
                      setState(() {
                        _selectedBranchFilter = val;
                        _selectedColleagueId = null;
                      });
                    }
                  },
                ),
              ),
            ),
            const SizedBox(height: 14),

            // 2. قائمة الزملاء المنسدلة الحقيقية
            Text(
              'الزميل البديل (المستلم)',
              style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: isDark ? Colors.white70 : const Color(0xFF334155)),
            ),
            const SizedBox(height: 6),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 14),
              decoration: BoxDecoration(
                color: isDark ? Colors.black.withValues(alpha: 0.25) : const Color(0xFFF8FAFC),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: isDark ? AppColors.darkBorder : const Color(0xFFE2E8F0)),
              ),
              child: DropdownButtonHideUnderline(
                child: DropdownButton<String>(
                  value: _selectedColleagueId,
                  hint: const Text('اختر الزميل البديل من القائمة...'),
                  isExpanded: true,
                  dropdownColor: isDark ? AppColors.darkSurface : Colors.white,
                  items: filteredColleagues.map((c) {
                    final cId = c['id']?.toString() ?? '';
                    final cName = c['name']?.toString() ?? 'موظف';
                    final cTitle = c['jobTitle']?.toString() ?? 'صيدلي';
                    final cBranchName = c['branchName']?.toString() ?? (allBranches.firstWhere((b) => b.id == c['branchId']?.toString(), orElse: () => BranchModel(id: '', name: 'الفرع')).name);
                    return DropdownMenuItem(
                      value: cId,
                      child: Text(
                        '$cName ($cTitle - $cBranchName)',
                        style: const TextStyle(fontSize: 12.5),
                        overflow: TextOverflow.ellipsis,
                      ),
                    );
                  }).toList(),
                  onChanged: (val) => setState(() => _selectedColleagueId = val),
                ),
              ),
            ),
            const SizedBox(height: 14),

            // 3. تاريخ ورديتي المطلوب تبديلها
            ListTile(
              tileColor: isDark ? Colors.black.withValues(alpha: 0.25) : const Color(0xFFF1F5F9),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
                side: BorderSide(color: isDark ? AppColors.darkBorder : const Color(0xFFE2E8F0)),
              ),
              leading: const Icon(Icons.event, color: AppColors.primary, size: 20),
              title: Text('تاريخ ورديتي المطلوب تبديلها', style: TextStyle(fontSize: 11, color: isDark ? Colors.grey : const Color(0xFF64748B))),
              subtitle: Text(DateFormat('yyyy/MM/dd').format(_myShiftDate), style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13.5)),
              trailing: const Icon(Icons.arrow_forward_ios, size: 14),
              onTap: _pickMyDate,
            ),
            const SizedBox(height: 10),

            // 4. تاريخ وردية الزميل البديل
            ListTile(
              tileColor: isDark ? Colors.black.withValues(alpha: 0.25) : const Color(0xFFF1F5F9),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
                side: BorderSide(color: isDark ? AppColors.darkBorder : const Color(0xFFE2E8F0)),
              ),
              leading: const Icon(Icons.event_repeat, color: AppColors.accentCyan, size: 20),
              title: Text('تاريخ وردية الزميل البديل المقابلة', style: TextStyle(fontSize: 11, color: isDark ? Colors.grey : const Color(0xFF64748B))),
              subtitle: Text(DateFormat('yyyy/MM/dd').format(_colleagueShiftDate), style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13.5)),
              trailing: const Icon(Icons.arrow_forward_ios, size: 14),
              onTap: _pickColleagueDate,
            ),
            const SizedBox(height: 14),

            // 5. سبب التبديل
            Text('سبب التبديل', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: isDark ? Colors.white70 : const Color(0xFF334155))),
            const SizedBox(height: 6),
            TextField(
              controller: _reasonController,
              maxLines: 2,
              decoration: InputDecoration(
                hintText: 'مثال: تضارب مع موعد دراسي أو سفر عائلي...',
                filled: true,
                fillColor: isDark ? Colors.black.withValues(alpha: 0.25) : const Color(0xFFF8FAFC),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide(color: isDark ? AppColors.darkBorder : const Color(0xFFE2E8F0)),
                ),
              ),
            ),
            const SizedBox(height: 20),

            // زر الإرسال
            SizedBox(
              width: double.infinity,
              height: 48,
              child: ElevatedButton.icon(
                onPressed: _isSubmitting ? null : () => _submit(colleagues, allBranches),
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.accentCyan,
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                ),
                icon: _isSubmitting
                    ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                    : const Icon(Icons.send_rounded, size: 18),
                label: const Text('إرسال طلب التبديل للزميل والمدير', style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold)),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
