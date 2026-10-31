import 'package:flutter/material.dart';
import '../../core/constants/app_colors.dart';
import '../../data/models/permission_model.dart';
import 'permission_gate.dart';

class BentoActionGrid extends StatelessWidget {
  final PermissionModel permissions;
  final VoidCallback? onApplyLeave;
  final VoidCallback? onApplySwap;
  final VoidCallback? onApplyLoan;
  final VoidCallback? onMissedPunch;
  final VoidCallback? onViewSalary;
  final VoidCallback? onViewBylaws;

  const BentoActionGrid({
    super.key,
    required this.permissions,
    this.onApplyLeave,
    this.onApplySwap,
    this.onApplyLoan,
    this.onMissedPunch,
    this.onViewSalary,
    this.onViewBylaws,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'الخدمات والطلبات السريعة',
          style: TextStyle(
            fontWeight: FontWeight.bold,
            fontSize: 13,
            color: isDark ? Colors.white : const Color(0xFF0F172A),
          ),
        ),
        const SizedBox(height: 12),
        GridView.count(
          crossAxisCount: 2,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          crossAxisSpacing: 12,
          mainAxisSpacing: 12,
          childAspectRatio: 1.5,
          children: [
            // 🏖️ طلب إجازة
            PermissionGate(
              permission: 'canApplyLeave',
              permissions: permissions,
              child: _buildBentoCard(
                context,
                title: 'طلب إجازة',
                subtitle: 'سنوية / مرضية',
                icon: Icons.beach_access,
                color: AppColors.primary,
                onTap: onApplyLeave,
              ),
            ),

            // 🔄 تبديل وردية
            PermissionGate(
              permission: 'canApplySwap',
              permissions: permissions,
              child: _buildBentoCard(
                context,
                title: 'تبديل شيفت',
                subtitle: 'مع زملاء الفرع',
                icon: Icons.swap_horiz,
                color: AppColors.accentCyan,
                onTap: onApplySwap,
              ),
            ),

            // 💳 سلفة ومسحوبات
            PermissionGate(
              permission: 'canApplyLoan',
              permissions: permissions,
              child: _buildBentoCard(
                context,
                title: 'سلفة / علاج',
                subtitle: 'نقدية أو علاج آجل',
                icon: Icons.account_balance_wallet,
                color: AppColors.eveningShift,
                onTap: onApplyLoan,
              ),
            ),

            // 📄 مسير الراتب
            PermissionGate(
              permission: 'canViewSalary',
              permissions: permissions,
              child: _buildBentoCard(
                context,
                title: 'مفردات الراتب',
                subtitle: 'كشف المستحقات',
                icon: Icons.receipt_long,
                color: AppColors.morningShift,
                onTap: onViewSalary,
              ),
            ),

            // ⏰ تصحيح بصمة منسية
            PermissionGate(
              permission: 'canManualShift',
              permissions: permissions,
              child: _buildBentoCard(
                context,
                title: 'بصمة منسية',
                subtitle: 'توثيق يدوي',
                icon: Icons.history_toggle_off,
                color: AppColors.warning,
                onTap: onMissedPunch,
              ),
            ),

            // 📜 لائحة العمل
            PermissionGate(
              permission: 'canViewBylaws',
              permissions: permissions,
              child: _buildBentoCard(
                context,
                title: 'لائحة العمل',
                subtitle: 'الجزاءات والسياسات',
                icon: Icons.gavel,
                color: AppColors.dayOff,
                onTap: onViewBylaws,
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildBentoCard(
    BuildContext context, {
    required String title,
    required String subtitle,
    required IconData icon,
    required Color color,
    VoidCallback? onTap,
  }) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(18),
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: isDark ? color.withValues(alpha: 0.1) : Colors.white,
            borderRadius: BorderRadius.circular(18),
            border: Border.all(
              color: isDark ? color.withValues(alpha: 0.28) : const Color(0xFFE2E8F0),
              width: 1.2,
            ),
            boxShadow: isDark
                ? null
                : [
                    BoxShadow(
                      color: const Color(0xFF0F172A).withValues(alpha: 0.03),
                      blurRadius: 10,
                      offset: const Offset(0, 4),
                    ),
                  ],
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Container(
                    padding: const EdgeInsets.all(6),
                    decoration: BoxDecoration(
                      color: color.withValues(alpha: isDark ? 0.2 : 0.12),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Icon(icon, color: color, size: 18),
                  ),
                  Icon(
                    Icons.arrow_forward_ios,
                    size: 11,
                    color: isDark ? color.withValues(alpha: 0.6) : const Color(0xFF94A3B8),
                  ),
                ],
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: TextStyle(
                      fontWeight: FontWeight.bold,
                      fontSize: 13,
                      color: isDark ? Colors.white : const Color(0xFF0F172A),
                    ),
                  ),
                  Text(
                    subtitle,
                    style: TextStyle(
                      fontSize: 10,
                      color: isDark ? Colors.grey.shade400 : const Color(0xFF64748B),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
