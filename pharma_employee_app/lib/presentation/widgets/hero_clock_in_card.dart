import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';

import '../../core/constants/app_colors.dart';
import '../../data/models/branch_model.dart';
import '../../data/models/permission_model.dart';

class HeroClockInCard extends StatefulWidget {
  final bool isShiftActive;
  final bool isOnBreak;
  final String activeElapsedStr;
  final PermissionModel permissions;
  final bool isMultiBranch;
  final List<BranchModel> activeBranches;
  final String selectedBranchId;
  final ValueChanged<String>? onBranchChanged;
  final VoidCallback? onClockIn;
  final VoidCallback? onClockOut;
  final VoidCallback? onTakeBreak;
  final VoidCallback? onOpenBiometrics;

  const HeroClockInCard({
    super.key,
    required this.isShiftActive,
    this.isOnBreak = false,
    required this.activeElapsedStr,
    required this.permissions,
    required this.isMultiBranch,
    required this.activeBranches,
    required this.selectedBranchId,
    this.onBranchChanged,
    this.onClockIn,
    this.onClockOut,
    this.onTakeBreak,
    this.onOpenBiometrics,
  });

  @override
  State<HeroClockInCard> createState() => _HeroClockInCardState();
}

class _HeroClockInCardState extends State<HeroClockInCard> {
  late String _punchBranchId;

  @override
  void initState() {
    super.initState();
    _punchBranchId = widget.selectedBranchId.isNotEmpty
        ? widget.selectedBranchId
        : (widget.activeBranches.isNotEmpty
              ? widget.activeBranches.first.id
              : '');
  }

  @override
  Widget build(BuildContext context) {
    final canStartEnd = widget.permissions.canStartEnd;
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color:
            Theme.of(context).cardTheme.color ??
            (isDark ? AppColors.darkSurface : Colors.white),
        borderRadius: BorderRadius.circular(24),
        border: Border.all(
          color: widget.isShiftActive
              ? AppColors.primary.withValues(alpha: 0.5)
              : (isDark ? AppColors.darkBorder : const Color(0xFFE2E8F0)),
          width: 1.3,
        ),
        boxShadow: [
          BoxShadow(
            color: widget.isShiftActive
                ? AppColors.primary.withValues(alpha: 0.12)
                : (isDark
                      ? Colors.black.withValues(alpha: 0.15)
                      : const Color(0xFF0F172A).withValues(alpha: 0.04)),
            blurRadius: 18,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header Status
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Expanded(
                child: Row(
                  children: [
                    Icon(
                      Icons.access_time_filled,
                      size: 19,
                      color: widget.isShiftActive
                          ? AppColors.primary
                          : AppColors.warning,
                    ),
                    const SizedBox(width: 8),
                    Flexible(
                      child: Text(
                        'البصمة الحية للموظف (الحالية)',
                        style: TextStyle(
                          fontWeight: FontWeight.bold,
                          fontSize: 13,
                          color: isDark
                              ? Colors.white
                              : const Color(0xFF0F172A),
                        ),
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ],
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 10,
                  vertical: 4,
                ),
                decoration: BoxDecoration(
                  color: widget.isShiftActive
                      ? AppColors.primary.withValues(alpha: 0.15)
                      : (isDark
                            ? Colors.grey.withValues(alpha: 0.15)
                            : const Color(0xFFF1F5F9)),
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(
                    color: widget.isShiftActive
                        ? AppColors.primary.withValues(alpha: 0.3)
                        : (isDark
                              ? Colors.transparent
                              : const Color(0xFFE2E8F0)),
                  ),
                ),
                child: Text(
                  widget.isShiftActive
                      ? (widget.isOnBreak ? 'استراحة بريك ☕' : 'على رأس العمل 🟢')
                      : 'خارج الشيفت ⚪',
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.bold,
                    color: widget.isShiftActive
                        ? (widget.isOnBreak ? AppColors.warning : AppColors.primary)
                        : (isDark ? Colors.grey : const Color(0xFF64748B)),
                  ),
                ),
              ),
            ],
          ),

          const SizedBox(height: 14),

          // Message / Subtitle
          Text(
            widget.isShiftActive
                ? (widget.isOnBreak
                    ? 'أنت الآن في فترة استراحة (بريك) مؤقتة — الوقت المنقضي: ${widget.activeElapsedStr}'
                    : 'مدة الوردية الحالية: ${widget.activeElapsedStr}')
                : canStartEnd
                ? 'يمكنك بدء وردية عملك وتوثيق الحضور المباشر بنقرة واحدة'
                : '🔒 صلاحية بدء الوردية من هذه الصفحة مقيدة — استخدم صفحة البصمة الإلكترونية',
            style: TextStyle(
              fontSize: 12.5,
              color: canStartEnd
                  ? (isDark ? Colors.grey : const Color(0xFF475569))
                  : (isDark ? Colors.amber.shade300 : const Color(0xFFB45309)),
              fontWeight: canStartEnd ? FontWeight.normal : FontWeight.bold,
            ),
          ),

          const SizedBox(height: 14),

          // Multi-branch selector if employee has multiple branches
          if (widget.isMultiBranch &&
              canStartEnd &&
              !widget.isShiftActive &&
              widget.activeBranches.isNotEmpty) ...[
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
              decoration: BoxDecoration(
                color: isDark
                    ? Colors.black.withValues(alpha: 0.25)
                    : const Color(0xFFF8FAFC),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                  color: isDark
                      ? AppColors.darkBorder
                      : const Color(0xFFE2E8F0),
                ),
              ),
              child: Row(
                children: [
                  const Icon(
                    Icons.location_city,
                    size: 16,
                    color: AppColors.primary,
                  ),
                  const SizedBox(width: 8),
                  Text(
                    'فرع الحضور:',
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.bold,
                      color: isDark ? Colors.white : const Color(0xFF0F172A),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: DropdownButtonHideUnderline(
                      child: DropdownButton<String>(
                        value: _punchBranchId,
                        isExpanded: true,
                        dropdownColor: isDark
                            ? AppColors.darkSurface
                            : Colors.white,
                        icon: const Icon(Icons.keyboard_arrow_down, size: 18),
                        items: widget.activeBranches.map((b) {
                          return DropdownMenuItem(
                            value: b.id,
                            child: Text(
                              b.name,
                              style: TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.bold,
                                color: isDark
                                    ? Colors.white
                                    : const Color(0xFF0F172A),
                              ),
                            ),
                          );
                        }).toList(),
                        onChanged: (val) {
                          if (val != null) {
                            setState(() => _punchBranchId = val);
                            widget.onBranchChanged?.call(val);
                          }
                        },
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 14),
          ],

          // Action Buttons: Only shown if canStartEnd is TRUE!
          if (canStartEnd) ...[
            if (!widget.isShiftActive)
              SizedBox(
                    width: double.infinity,
                    height: 48,
                    child: FilledButton.icon(
                      onPressed: widget.onClockIn,
                      style: FilledButton.styleFrom(
                        backgroundColor: AppColors.primary,
                        foregroundColor: Colors.white,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(14),
                        ),
                      ),
                      icon: const Icon(Icons.play_arrow),
                      label: const Text(
                        'بدء الوردية الآن',
                        style: TextStyle(fontWeight: FontWeight.bold),
                      ),
                    ),
                  )
                  .animate(
                    onPlay: (controller) => controller.repeat(reverse: true),
                  )
                  .shimmer(duration: 2500.ms, color: Colors.white24)
            else
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: widget.onTakeBreak,
                      style: OutlinedButton.styleFrom(
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                        side: BorderSide(
                          color: isDark
                              ? AppColors.darkBorder
                              : const Color(0xFFCBD5E1),
                        ),
                      ),
                      icon: Icon(widget.isOnBreak ? Icons.play_arrow_rounded : Icons.coffee, size: 16),
                      label: Text(
                        widget.isOnBreak ? 'استئناف العمل' : 'استراحة بريك',
                        style: const TextStyle(fontSize: 12),
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: FilledButton.icon(
                      onPressed: widget.onClockOut,
                      style: FilledButton.styleFrom(
                        backgroundColor: AppColors.danger,
                        foregroundColor: Colors.white,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                      ),
                      icon: const Icon(Icons.stop, size: 16),
                      label: const Text(
                        'إنهاء الوردية',
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
          ],
          if (!canStartEnd &&
              !widget.isShiftActive &&
              widget.onOpenBiometrics != null) ...[
            const SizedBox(height: 10),
            SizedBox(
              width: double.infinity,
              height: 46,
              child: OutlinedButton.icon(
                onPressed: widget.onOpenBiometrics,
                icon: const Icon(
                  Icons.face_rounded,
                  size: 20,
                  color: AppColors.primary,
                ),
                label: const Text(
                  'الانتقال إلى البصمة الإلكترونية للوجه',
                  style: TextStyle(
                    fontWeight: FontWeight.bold,
                    fontSize: 13,
                    color: AppColors.primary,
                  ),
                ),
                style: OutlinedButton.styleFrom(
                  side: const BorderSide(color: AppColors.primary, width: 1.5),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                  backgroundColor: AppColors.primary.withValues(alpha: 0.05),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}
