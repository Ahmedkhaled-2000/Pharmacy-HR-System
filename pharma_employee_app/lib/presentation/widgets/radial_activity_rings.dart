import 'package:flutter/material.dart';
import '../../core/constants/app_colors.dart';

class RadialActivityRings extends StatelessWidget {
  final double workedHours;
  final double targetHours;
  final int leaveBalanceDays;
  final double usedPermissionHours;
  final double loanBalanceUsed;
  final double loanLimit;

  const RadialActivityRings({
    super.key,
    this.workedHours = 142.5,
    this.targetHours = 180.0,
    this.leaveBalanceDays = 21,
    this.usedPermissionHours = 2.0,
    this.loanBalanceUsed = 350.0,
    this.loanLimit = 1000.0,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    final safeTarget = targetHours > 0 ? targetHours : 180.0;
    final safeLoanLimit = loanLimit > 0 ? loanLimit : 1000.0;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Theme.of(context).cardTheme.color ?? (isDark ? AppColors.darkSurface : Colors.white),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
          color: isDark ? AppColors.darkBorder : const Color(0xFFE2E8F0),
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
        children: [
          Text(
            'المؤشرات الشهرية الحيوية',
            style: TextStyle(
              fontWeight: FontWeight.bold,
              fontSize: 13,
              color: isDark ? Colors.white : const Color(0xFF0F172A),
            ),
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              Expanded(
                child: _buildMiniMetric(
                  context,
                  label: 'ساعات العمل',
                  value: '${workedHours.toStringAsFixed(0)}h',
                  sub: 'من ${targetHours.toStringAsFixed(0)}h',
                  progress: (workedHours / safeTarget).clamp(0.0, 1.0),
                  color: AppColors.primary,
                ),
              ),
              Expanded(
                child: _buildMiniMetric(
                  context,
                  label: 'رصيد الإجازات',
                  value: '$leaveBalanceDays',
                  sub: 'يوم متبقي',
                  progress: (leaveBalanceDays / 30.0).clamp(0.0, 1.0),
                  color: AppColors.accentCyan,
                ),
              ),
              Expanded(
                child: _buildMiniMetric(
                  context,
                  label: 'الأذونات',
                  value: '${usedPermissionHours.toStringAsFixed(0)}h',
                  sub: 'مستهلكة',
                  progress: (usedPermissionHours / 4.0).clamp(0.0, 1.0),
                  color: AppColors.warning,
                ),
              ),
              Expanded(
                child: _buildMiniMetric(
                  context,
                  label: 'سلف الأدوية',
                  value: loanBalanceUsed.toStringAsFixed(0),
                  sub: 'من ${safeLoanLimit.toStringAsFixed(0)}ج.م',
                  progress: (loanBalanceUsed / safeLoanLimit).clamp(0.0, 1.0),
                  color: AppColors.eveningShift,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildMiniMetric(
    BuildContext context, {
    required String label,
    required String value,
    required String sub,
    required double progress,
    required Color color,
  }) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Column(
      children: [
        Stack(
          alignment: Alignment.center,
          children: [
            SizedBox(
              width: 52,
              height: 52,
              child: CircularProgressIndicator(
                value: progress,
                strokeWidth: 4.5,
                strokeCap: StrokeCap.round,
                backgroundColor: color.withValues(alpha: isDark ? 0.15 : 0.12),
                valueColor: AlwaysStoppedAnimation<Color>(color),
              ),
            ),
            Text(
              value,
              style: TextStyle(
                fontWeight: FontWeight.bold,
                fontSize: 11.5,
                color: isDark ? Colors.white : const Color(0xFF0F172A),
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        Text(
          label,
          style: TextStyle(
            fontSize: 10.5,
            fontWeight: FontWeight.bold,
            color: isDark ? Colors.white70 : const Color(0xFF334155),
          ),
          overflow: TextOverflow.ellipsis,
        ),
        Text(
          sub,
          style: TextStyle(
            fontSize: 9.5,
            color: isDark ? Colors.grey.shade400 : const Color(0xFF64748B),
          ),
          overflow: TextOverflow.ellipsis,
        ),
      ],
    );
  }
}
