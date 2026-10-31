import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/constants/app_colors.dart';
import '../../../data/models/request_models.dart';
import '../../providers/auth_provider.dart';
import '../../providers/employee_data_provider.dart';
import '../../providers/requests_provider.dart';

class LoanRequestFormModal extends ConsumerStatefulWidget {
  final VoidCallback? onSubmitted;

  const LoanRequestFormModal({super.key, this.onSubmitted});

  @override
  ConsumerState<LoanRequestFormModal> createState() => _LoanRequestFormModalState();
}

class _LoanRequestFormModalState extends ConsumerState<LoanRequestFormModal> {
  // نوع السلفة: 'monthly' (شهرية) أو 'installment' (مقسطة) أو 'medicine' (علاج آجل)
  String _loanCategory = 'monthly'; 
  final _amountController = TextEditingController();
  int _installments = 2;
  final _reasonController = TextEditingController();
  String? _error;
  bool _isSubmitting = false;

  // قائمة أصناف الأدوية في حالة طلب علاج آجل
  final List<Map<String, dynamic>> _medItems = [
    {'name': TextEditingController(), 'price': TextEditingController(), 'qty': TextEditingController(text: '1')},
  ];

  double get _amount {
    if (_loanCategory == 'medicine') {
      double total = 0.0;
      for (final item in _medItems) {
        final p = double.tryParse((item['price'] as TextEditingController).text.trim()) ?? 0.0;
        final q = int.tryParse((item['qty'] as TextEditingController).text.trim()) ?? 1;
        total += (p * q);
      }
      return total;
    }
    return double.tryParse(_amountController.text.trim()) ?? 0.0;
  }

  double get _monthlyDeduction {
    final amt = _amount;
    if (_loanCategory == 'monthly') return amt;
    return _installments > 0 ? (amt / _installments) : amt;
  }

  void _addMedRow() {
    setState(() {
      _medItems.add({
        'name': TextEditingController(),
        'price': TextEditingController(),
        'qty': TextEditingController(text: '1'),
      });
    });
  }

  void _removeMedRow(int index) {
    if (_medItems.length <= 1) return;
    setState(() {
      _medItems.removeAt(index);
    });
  }

  @override
  void dispose() {
    _amountController.dispose();
    _reasonController.dispose();
    for (final item in _medItems) {
      (item['name'] as TextEditingController).dispose();
      (item['price'] as TextEditingController).dispose();
      (item['qty'] as TextEditingController).dispose();
    }
    super.dispose();
  }

  Future<void> _submit(double maxAllowedMonthly, double maxAllowedInstallment, bool isWithinWindow, bool isFrozen) async {
    if (isFrozen) {
      setState(() => _error = '⚠️ دورة رواتب هذا الشهر مغلقة ومجمدة رسمياً من الإدارة العليا.');
      return;
    }

    if (!isWithinWindow) {
      setState(() => _error = '⚠️ عذراً! التقديم على السلف متاح فقط خلال الفترة المحددة من الإدارة شهرياً.');
      return;
    }

    final reason = _reasonController.text.trim();
    final amt = _amount;

    if (amt <= 0) {
      setState(() => _error = 'يرجى إدخال مبلغ صحيح للسلفة');
      return;
    }

    if (_loanCategory == 'monthly' && maxAllowedMonthly > 0 && amt > maxAllowedMonthly) {
      setState(() => _error = '⚠️ المبلغ المطلوب ($amt ج.م) يتجاوز الحد الأقصى للسلفة الشهرية (${maxAllowedMonthly.toStringAsFixed(0)} ج.م).');
      return;
    }

    if (_loanCategory == 'installment' && maxAllowedInstallment > 0 && amt > maxAllowedInstallment) {
      setState(() => _error = '⚠️ المبلغ المطلوب ($amt ج.م) يتجاوز الحد الأقصى للسلفة المقسطة (${maxAllowedInstallment.toStringAsFixed(0)} ج.م).');
      return;
    }

    if (reason.isEmpty && _loanCategory != 'medicine') {
      setState(() => _error = 'يرجى كتابة سبب طلب السلفة المالية');
      return;
    }

    setState(() {
      _error = null;
      _isSubmitting = true;
    });

    final user = ref.read(authProvider).user;
    final empId = user?.id ?? '';

    final isMed = _loanCategory == 'medicine';
    final medDetails = isMed
        ? _medItems.map((m) => '${(m['name'] as TextEditingController).text} (${(m['qty'] as TextEditingController).text} علبة)').join(', ')
        : '';

    final newReq = LoanRequest(
      id: 'req_loan_${DateTime.now().millisecondsSinceEpoch}',
      employeeId: empId,
      amount: amt,
      loanType: isMed ? LoanType.medicine : LoanType.cash,
      installmentsCount: _loanCategory == 'monthly' ? 1 : _installments,
      monthlyDeduction: _monthlyDeduction,
      reason: isMed ? (reason.isNotEmpty ? reason : 'مشتريات أدوية علاج: $medDetails') : reason,
      status: RequestStatus.pending,
      createdAt: DateTime.now(),
    );

    await ref.read(requestsProvider.notifier).addLoan(newReq, user: user);
    widget.onSubmitted?.call();

    if (mounted) {
      Navigator.pop(context);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('✅ تم إرسال طلب السلفة/العلاج إلى الإدارة المالية العليا ومطابقة الشروط'),
          backgroundColor: AppColors.primary,
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final user = ref.watch(authProvider).user;
    final empData = ref.watch(employeeDataProvider);
    final orgSettings = empData.snapshot?.orgSettings ?? {};

    // 1. حساب مواعيد نافذة السلف
    final now = DateTime.now();
    final startDay = int.tryParse(orgSettings['loanRequestStartDay']?.toString() ?? '1') ?? 1;
    final endDay = int.tryParse(orgSettings['loanRequestEndDay']?.toString() ?? '10') ?? 10;
    final isWithinWindow = (startDay <= endDay)
        ? (now.day >= startDay && now.day <= endDay)
        : (now.day >= startDay || now.day <= endDay);

    final isFrozen = orgSettings['isPayrollMonthFrozen'] == true;

    // 2. حساب الحدود القصوى المسموح بها بناءً على الراتب
    final baseSalary = (user?.monthlySalary ?? 0.0) > 0 ? user!.monthlySalary : 6000.0;
    final maxMonthlyPercent = double.tryParse(orgSettings['maxMonthlyLoanSalaryPercent']?.toString() ?? '50') ?? 50.0;
    final maxAllowedMonthly = (baseSalary * maxMonthlyPercent) / 100.0;

    final maxInstallmentMultiplier = double.tryParse(orgSettings['maxInstallmentLoanSalaryMultiplier']?.toString() ?? '2') ?? 2.0;
    final maxAllowedInstallment = baseSalary * maxInstallmentMultiplier;

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
                const Icon(Icons.account_balance_wallet_rounded, color: AppColors.eveningShift, size: 22),
                const SizedBox(width: 8),
                Text(
                  'طلب سلفة مالية / مشتريات أدوية',
                  style: TextStyle(
                    fontWeight: FontWeight.bold,
                    fontSize: 16,
                    color: isDark ? Colors.white : const Color(0xFF0F172A),
                  ),
                ),
              ],
            ),
            Divider(height: 20, color: isDark ? AppColors.darkBorder : const Color(0xFFE2E8F0)),

            // ⚠️ شريط حالة شروط الإدارة وفترة التقديم
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              margin: const EdgeInsets.only(bottom: 14),
              decoration: BoxDecoration(
                color: isWithinWindow
                    ? AppColors.primary.withValues(alpha: isDark ? 0.2 : 0.1)
                    : AppColors.warning.withValues(alpha: isDark ? 0.2 : 0.1),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(
                  color: isWithinWindow ? AppColors.primary.withValues(alpha: 0.3) : AppColors.warning.withValues(alpha: 0.4),
                ),
              ),
              child: Row(
                children: [
                  Icon(
                    isWithinWindow ? Icons.check_circle_outline : Icons.info_outline,
                    size: 18,
                    color: isWithinWindow ? AppColors.primary : AppColors.warning,
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      isWithinWindow
                          ? 'فترة تقديم السلف مفتوحة حالياً (من يوم $startDay إلى يوم $endDay من كل شهر)'
                          : 'تنبيه: فترة التقديم على السلف المسموحة من يوم $startDay إلى $endDay من الشهر',
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.bold,
                        color: isWithinWindow ? AppColors.primary : AppColors.warning,
                      ),
                    ),
                  ),
                ],
              ),
            ),

            if (_error != null) ...[
              Container(
                padding: const EdgeInsets.all(10),
                margin: const EdgeInsets.only(bottom: 14),
                decoration: BoxDecoration(
                  color: AppColors.danger.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Text(_error!, style: const TextStyle(color: AppColors.danger, fontSize: 12, fontWeight: FontWeight.bold)),
              ),
            ],

            Text(
              'نوع الطلب المالي',
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
                  child: _buildCategoryOption('سلفة شهرية (دفعة واحدة)', 'monthly', isDark),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: _buildCategoryOption('سلفة مقسطة', 'installment', isDark),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: _buildCategoryOption('أدوية علاج آجل', 'medicine', isDark),
                ),
              ],
            ),
            const SizedBox(height: 14),

            // شريط إرشادي بالحد الأقصى المسموح
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              decoration: BoxDecoration(
                color: isDark ? Colors.black.withValues(alpha: 0.25) : const Color(0xFFF8FAFC),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(
                _loanCategory == 'monthly'
                    ? 'الحد الأقصى للسلفة الشهرية (${maxMonthlyPercent.toStringAsFixed(0)}% من الراتب): ${maxAllowedMonthly.toStringAsFixed(0)} ج.م'
                    : _loanCategory == 'installment'
                        ? 'الحد الأقصى للسلفة المقسطة (${maxInstallmentMultiplier.toStringAsFixed(0)} أضعاف الراتب): ${maxAllowedInstallment.toStringAsFixed(0)} ج.م'
                        : 'طلب مشتريات أدوية علاج للعاملين بالأجل مع السداد من الراتب',
                style: TextStyle(fontSize: 11, color: isDark ? Colors.grey.shade400 : const Color(0xFF64748B), fontWeight: FontWeight.bold),
              ),
            ),
            const SizedBox(height: 14),

            // في حالة السلفة النقدية (شهرية أو مقسطة)
            if (_loanCategory != 'medicine') ...[
              Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'المبلغ المطلوب (ج.م)',
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.bold,
                            color: isDark ? Colors.white70 : const Color(0xFF334155),
                          ),
                        ),
                        const SizedBox(height: 6),
                        TextField(
                          controller: _amountController,
                          keyboardType: TextInputType.number,
                          onChanged: (_) => setState(() {}),
                          decoration: InputDecoration(
                            hintText: 'مثال: 1000',
                            filled: true,
                            fillColor: isDark ? Colors.black.withValues(alpha: 0.25) : const Color(0xFFF1F5F9),
                            border: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(12),
                              borderSide: BorderSide(color: isDark ? AppColors.darkBorder : const Color(0xFFE2E8F0)),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                  if (_loanCategory == 'installment') ...[
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'عدد أشهر السداد',
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.bold,
                              color: isDark ? Colors.white70 : const Color(0xFF334155),
                            ),
                          ),
                          const SizedBox(height: 6),
                          DropdownButtonFormField<int>(
                            value: _installments,
                            dropdownColor: isDark ? AppColors.darkSurface : Colors.white,
                            items: [2, 3, 4, 6, 10].map((m) {
                              return DropdownMenuItem(
                                value: m,
                                child: Text('$m شهر', style: const TextStyle(fontSize: 13)),
                              );
                            }).toList(),
                            onChanged: (val) {
                              if (val != null) setState(() => _installments = val);
                            },
                            decoration: InputDecoration(
                              filled: true,
                              fillColor: isDark ? Colors.black.withValues(alpha: 0.25) : const Color(0xFFF1F5F9),
                              border: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(12),
                                borderSide: BorderSide(color: isDark ? AppColors.darkBorder : const Color(0xFFE2E8F0)),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ],
              ),
            ] else ...[
              // جدول إضافة أصناف الأدوية
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text('أصناف الأدوية المطلوبة بالأجل:', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
                  TextButton.icon(
                    onPressed: _addMedRow,
                    icon: const Icon(Icons.add, size: 16),
                    label: const Text('إضافة صنف +', style: TextStyle(fontSize: 11)),
                  ),
                ],
              ),
              ...List.generate(_medItems.length, (i) {
                final item = _medItems[i];
                return Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Row(
                    children: [
                      Expanded(
                        flex: 4,
                        child: TextField(
                          controller: item['name'] as TextEditingController,
                          decoration: InputDecoration(
                            hintText: 'اسم الدواء',
                            contentPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                            filled: true,
                            fillColor: isDark ? Colors.black.withValues(alpha: 0.25) : const Color(0xFFF1F5F9),
                            border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                          ),
                        ),
                      ),
                      const SizedBox(width: 6),
                      Expanded(
                        flex: 2,
                        child: TextField(
                          controller: item['price'] as TextEditingController,
                          keyboardType: TextInputType.number,
                          onChanged: (_) => setState(() {}),
                          decoration: InputDecoration(
                            hintText: 'السعر',
                            contentPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                            filled: true,
                            fillColor: isDark ? Colors.black.withValues(alpha: 0.25) : const Color(0xFFF1F5F9),
                            border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                          ),
                        ),
                      ),
                      const SizedBox(width: 6),
                      Expanded(
                        flex: 2,
                        child: TextField(
                          controller: item['qty'] as TextEditingController,
                          keyboardType: TextInputType.number,
                          onChanged: (_) => setState(() {}),
                          decoration: InputDecoration(
                            hintText: 'العدد',
                            contentPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                            filled: true,
                            fillColor: isDark ? Colors.black.withValues(alpha: 0.25) : const Color(0xFFF1F5F9),
                            border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                          ),
                        ),
                      ),
                      if (_medItems.length > 1)
                        IconButton(
                          icon: const Icon(Icons.close, color: AppColors.danger, size: 18),
                          onPressed: () => _removeMedRow(i),
                        ),
                    ],
                  ),
                );
              }),
            ],

            const SizedBox(height: 14),

            // شارة القسط الشهري المحسوب تلقائياً
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              decoration: BoxDecoration(
                color: AppColors.eveningShift.withValues(alpha: isDark ? 0.18 : 0.1),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    _loanCategory == 'monthly' ? 'الخصم من مسير الراتب القادم:' : 'الخصم الشهري المقترح من الراتب:',
                    style: const TextStyle(fontSize: 11.5, color: AppColors.eveningShift, fontWeight: FontWeight.bold),
                  ),
                  Text('${_monthlyDeduction.toStringAsFixed(2)} ج.م / شهر', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13.5, color: AppColors.eveningShift)),
                ],
              ),
            ),
            const SizedBox(height: 14),

            Text(
              'السبب والملاحظات',
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
                hintText: 'اكتب تفاصيل طلب السلفة أو سبب الاحتياج...',
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
                onPressed: _isSubmitting ? null : () => _submit(maxAllowedMonthly, maxAllowedInstallment, isWithinWindow, isFrozen),
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.eveningShift,
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                ),
                icon: _isSubmitting
                    ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                    : const Icon(Icons.send_rounded, size: 18),
                label: Text(
                  _isSubmitting ? 'جارٍ فحص الشروط والإرسال...' : 'إرسال طلب السلفة للإدارة المالية',
                  style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.bold),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildCategoryOption(String title, String val, bool isDark) {
    final isSelected = _loanCategory == val;
    return GestureDetector(
      onTap: () => setState(() => _loanCategory = val),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 4),
        decoration: BoxDecoration(
          color: isSelected ? AppColors.eveningShift : (isDark ? Colors.black.withValues(alpha: 0.25) : const Color(0xFFF1F5F9)),
          borderRadius: BorderRadius.circular(10),
          border: Border.all(
            color: isSelected ? AppColors.eveningShift : (isDark ? AppColors.darkBorder : const Color(0xFFE2E8F0)),
          ),
        ),
        child: Center(
          child: Text(
            title,
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 10.5,
              fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
              color: isSelected ? Colors.white : (isDark ? Colors.white70 : const Color(0xFF334155)),
            ),
          ),
        ),
      ),
    );
  }
}
