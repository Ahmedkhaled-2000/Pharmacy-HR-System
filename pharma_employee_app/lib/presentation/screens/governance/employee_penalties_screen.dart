import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/constants/app_colors.dart';
import '../../providers/employee_data_provider.dart';
import 'bylaws_screen.dart';

class EmployeePenaltiesScreen extends ConsumerStatefulWidget {
  const EmployeePenaltiesScreen({super.key});

  @override
  ConsumerState<EmployeePenaltiesScreen> createState() => _EmployeePenaltiesScreenState();
}

class _EmployeePenaltiesScreenState extends ConsumerState<EmployeePenaltiesScreen> {
  String _selectedFilter = 'all'; // 'all', 'financial', 'warning'

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final snapshot = ref.watch(employeeDataProvider).snapshot;
    final penalties = snapshot?.penalties ?? [];

    // تصفية السجلات حسب التبويب
    final filteredPenalties = penalties.where((p) {
      final amount = double.tryParse(p['financialAmount']?.toString() ?? p['amount']?.toString() ?? '0') ?? 0.0;
      final days = double.tryParse(p['deductionDays']?.toString() ?? p['days']?.toString() ?? '0') ?? 0.0;
      final isFinancial = amount > 0 || days > 0;

      if (_selectedFilter == 'financial') return isFinancial;
      if (_selectedFilter == 'warning') return !isFinancial;
      return true;
    }).toList();

    // حساب الإحصائيات
    double totalDeductionAmount = 0.0;
    int warningCount = 0;
    for (final p in penalties) {
      final amount = double.tryParse(p['financialAmount']?.toString() ?? p['amount']?.toString() ?? '0') ?? 0.0;
      final days = double.tryParse(p['deductionDays']?.toString() ?? p['days']?.toString() ?? '0') ?? 0.0;
      if (amount > 0 || days > 0) {
        totalDeductionAmount += amount;
      } else {
        warningCount++;
      }
    }

    return Scaffold(
      backgroundColor: isDark ? AppColors.darkBackground : const Color(0xFFF8FAFC),
      appBar: AppBar(
        title: Text(
          'سجل الجزاءات والمخالفات',
          style: TextStyle(
            fontWeight: FontWeight.bold,
            fontSize: 16,
            color: isDark ? Colors.white : const Color(0xFF0F172A),
          ),
        ),
        actions: [
          IconButton(
            tooltip: 'لائحة الجزاءات والعمل',
            icon: const Icon(Icons.menu_book_rounded, color: AppColors.primary),
            onPressed: () {
              Navigator.push(context, MaterialPageRoute(builder: (_) => const BylawsScreen()));
            },
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          await ref.read(employeeDataProvider.notifier).loadAllData();
        },
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            // بطاقة الملخص الإحصائي
            _buildStatsHeader(
              context,
              totalPenalties: penalties.length,
              totalFinancial: totalDeductionAmount,
              warningCount: warningCount,
            ),
            const SizedBox(height: 16),

            // أزرار الفلترة والتصنيف
            Row(
              children: [
                _buildFilterChip('all', 'الكل (${penalties.length})'),
                const SizedBox(width: 8),
                _buildFilterChip('financial', 'جزاءات مالية'),
                const SizedBox(width: 8),
                _buildFilterChip('warning', 'إنذارات وتنبيهات ($warningCount)'),
              ],
            ),
            const SizedBox(height: 16),

            // قائمة الجزاءات أو الحالة الفارغة
            if (filteredPenalties.isEmpty)
              _buildEmptyState(context, isDark)
            else
              ...filteredPenalties.map((pen) => _buildPenaltyCard(context, pen, isDark)),

            const SizedBox(height: 24),
          ],
        ),
      ),
    );
  }

  Widget _buildFilterChip(String key, String label) {
    final isSelected = _selectedFilter == key;
    return ChoiceChip(
      label: Text(
        label,
        style: TextStyle(
          fontSize: 12,
          fontWeight: isSelected ? FontWeight.bold : FontWeight.w500,
          color: isSelected ? Colors.white : const Color(0xFF475569),
        ),
      ),
      selected: isSelected,
      selectedColor: AppColors.primary,
      backgroundColor: Colors.white,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(20),
        side: BorderSide(
          color: isSelected ? AppColors.primary : const Color(0xFFE2E8F0),
        ),
      ),
      onSelected: (_) {
        setState(() => _selectedFilter = key);
      },
    );
  }

  Widget _buildStatsHeader(
    BuildContext context, {
    required int totalPenalties,
    required double totalFinancial,
    required int warningCount,
  }) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: isDark ? AppColors.darkSurface : Colors.white,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
          color: isDark ? AppColors.darkBorder : const Color(0xFFE2E8F0),
          width: 1.2,
        ),
        boxShadow: isDark
            ? null
            : [
                BoxShadow(
                  color: const Color(0xFF0F172A).withValues(alpha: 0.04),
                  blurRadius: 10,
                  offset: const Offset(0, 3),
                ),
              ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: AppColors.danger.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: const Icon(Icons.gavel_rounded, color: AppColors.danger, size: 22),
              ),
              const SizedBox(width: 10),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'سجل الانضباط والقرارات الإدارية',
                    style: TextStyle(
                      fontWeight: FontWeight.bold,
                      fontSize: 14,
                      color: isDark ? Colors.white : const Color(0xFF0F172A),
                    ),
                  ),
                  Text(
                    'مسجل رسمياً في قاعدة بيانات شؤون العاملين',
                    style: TextStyle(
                      fontSize: 11,
                      color: isDark ? Colors.grey : const Color(0xFF64748B),
                    ),
                  ),
                ],
              ),
            ],
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: _buildMiniStat(
                  'إجمالي القرارات',
                  '$totalPenalties',
                  AppColors.primary,
                  isDark,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _buildMiniStat(
                  'إجمالي الخصم المالي',
                  '${totalFinancial.toStringAsFixed(0)} ج.م',
                  AppColors.danger,
                  isDark,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _buildMiniStat(
                  'الإنذارات الكتابية',
                  '$warningCount',
                  AppColors.warning,
                  isDark,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildMiniStat(String label, String value, Color color, bool isDark) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 8),
      decoration: BoxDecoration(
        color: color.withValues(alpha: isDark ? 0.15 : 0.08),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withValues(alpha: 0.2)),
      ),
      child: Column(
        children: [
          Text(
            value,
            style: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.bold,
              color: color,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            label,
            style: TextStyle(
              fontSize: 9.5,
              fontWeight: FontWeight.w600,
              color: isDark ? Colors.grey.shade400 : const Color(0xFF64748B),
            ),
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }

  Widget _buildEmptyState(BuildContext context, bool isDark) {
    return Container(
      margin: const EdgeInsets.only(top: 24),
      padding: const EdgeInsets.symmetric(vertical: 40, horizontal: 20),
      decoration: BoxDecoration(
        color: isDark ? AppColors.darkSurface : Colors.white,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
          color: isDark ? AppColors.darkBorder : const Color(0xFFE2E8F0),
        ),
      ),
      child: Column(
        children: [
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: AppColors.morningShift.withValues(alpha: 0.12),
              shape: BoxShape.circle,
            ),
            child: const Icon(Icons.verified_user_rounded, color: AppColors.morningShift, size: 48),
          ),
          const SizedBox(height: 16),
          Text(
            'سجل وظيفي ناصع ومنضبط! 🌟',
            style: TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.bold,
              color: isDark ? Colors.white : const Color(0xFF0F172A),
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'لا توجد أي مخالفات أو جزاءات مسجلة بحقك في هذا القسم.\nاستمر في أدائك المتميز والالتزام بلائحة العمل.',
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 12,
              height: 1.5,
              color: isDark ? Colors.grey : const Color(0xFF64748B),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildPenaltyCard(BuildContext context, Map<String, dynamic> pen, bool isDark) {
    final title = pen['ruleTitle']?.toString() ??
        pen['title']?.toString() ??
        pen['violationName']?.toString() ??
        pen['reason']?.toString() ??
        'مخالفة إدارية';
    final action = pen['actionTitle']?.toString() ?? pen['penaltyAction']?.toString() ?? pen['action']?.toString() ?? 'إجراء تأديبي';
    final date = pen['date']?.toString().split('T').first ?? pen['createdAt']?.toString().split('T').first ?? '—';
    final amount = double.tryParse(pen['financialAmount']?.toString() ?? pen['amount']?.toString() ?? '0') ?? 0.0;
    final days = double.tryParse(pen['deductionDays']?.toString() ?? pen['days']?.toString() ?? '0') ?? 0.0;
    final occurrence = pen['occurrence']?.toString() ?? '1';
    final status = pen['status']?.toString() ?? 'approved';
    final notes = pen['notes']?.toString() ?? pen['adminNotes']?.toString() ?? pen['details']?.toString() ?? '';
    final category = pen['categoryCode']?.toString() ?? pen['categoryName']?.toString() ?? '';

    final isFinancial = amount > 0 || days > 0;

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: isDark ? AppColors.darkSurface : Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: isFinancial
              ? AppColors.danger.withValues(alpha: isDark ? 0.3 : 0.2)
              : (isDark ? AppColors.darkBorder : const Color(0xFFE2E8F0)),
          width: 1.2,
        ),
        boxShadow: isDark
            ? null
            : [
                BoxShadow(
                  color: const Color(0xFF0F172A).withValues(alpha: 0.03),
                  blurRadius: 8,
                  offset: const Offset(0, 2),
                ),
              ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: (isFinancial ? AppColors.danger : AppColors.warning).withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      isFinancial ? Icons.monetization_on_outlined : Icons.report_problem_rounded,
                      size: 13,
                      color: isFinancial ? AppColors.danger : AppColors.warning,
                    ),
                    const SizedBox(width: 4),
                    Text(
                      isFinancial ? 'جزاء مالي' : 'تنبيه إداري',
                      style: TextStyle(
                        fontSize: 10.5,
                        fontWeight: FontWeight.bold,
                        color: isFinancial ? AppColors.danger : AppColors.warning,
                      ),
                    ),
                  ],
                ),
              ),
              if (category.isNotEmpty) ...[
                const SizedBox(width: 6),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
                  decoration: BoxDecoration(
                    color: AppColors.primary.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Text(
                    'فئة $category',
                    style: const TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: AppColors.primary),
                  ),
                ),
              ],
              const Spacer(),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: const Color(0xFFF1F5F9),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Text(
                  'التكرار: المرة $occurrence',
                  style: const TextStyle(fontSize: 10, color: Color(0xFF475569), fontWeight: FontWeight.w600),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Text(
            title,
            style: TextStyle(
              fontSize: 13.5,
              fontWeight: FontWeight.bold,
              color: isDark ? Colors.white : const Color(0xFF0F172A),
            ),
          ),
          const SizedBox(height: 6),
          Row(
            children: [
              const Icon(Icons.calendar_today_rounded, size: 12, color: Color(0xFF94A3B8)),
              const SizedBox(width: 4),
              Text(
                'تاريخ الواقعة: $date',
                style: const TextStyle(fontSize: 11, color: Color(0xFF64748B)),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: isDark ? Colors.black.withValues(alpha: 0.2) : const Color(0xFFF8FAFC),
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: const Color(0xFFE2E8F0)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      'الإجراء الصادر: $action',
                      style: TextStyle(
                        fontSize: 11.5,
                        fontWeight: FontWeight.bold,
                        color: isFinancial ? AppColors.danger : const Color(0xFF334155),
                      ),
                    ),
                    if (isFinancial)
                      Text(
                        amount > 0 ? '-${amount.toStringAsFixed(2)} ج.م' : '-$days يوم',
                        style: const TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w900,
                          color: AppColors.danger,
                        ),
                      ),
                  ],
                ),
                if (notes.isNotEmpty) ...[
                  const SizedBox(height: 6),
                  Text(
                    'ملاحظات الإدارة: $notes',
                    style: TextStyle(
                      fontSize: 11,
                      height: 1.4,
                      color: isDark ? Colors.grey.shade400 : const Color(0xFF64748B),
                    ),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(height: 8),
          Row(
            mainAxisAlignment: MainAxisAlignment.end,
            children: [
              Icon(
                status == 'approved' ? Icons.check_circle_rounded : Icons.pending_rounded,
                size: 13,
                color: status == 'approved' ? AppColors.morningShift : AppColors.warning,
              ),
              const SizedBox(width: 4),
              Text(
                status == 'approved' ? 'معتمد رسمياً' : 'قيد المراجعة',
                style: TextStyle(
                  fontSize: 10.5,
                  fontWeight: FontWeight.bold,
                  color: status == 'approved' ? AppColors.morningShift : AppColors.warning,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

