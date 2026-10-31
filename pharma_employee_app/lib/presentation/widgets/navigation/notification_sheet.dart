import 'package:flutter/material.dart';
import '../../../core/constants/app_colors.dart';
import '../../../data/models/notification_model.dart';

class NotificationSheet extends StatelessWidget {
  final List<InAppNotificationModel> notifications;
  final ValueChanged<InAppNotificationModel>? onNotificationTap;
  final VoidCallback? onMarkAllRead;

  const NotificationSheet({
    super.key,
    required this.notifications,
    this.onNotificationTap,
    this.onMarkAllRead,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Container(
      height: MediaQuery.of(context).size.height * 0.75,
      decoration: BoxDecoration(
        color: Theme.of(context).cardTheme.color ?? (isDark ? AppColors.darkSurface : Colors.white),
        borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
      ),
      child: Column(
        children: [
          // رأس الإشعارات
          Padding(
            padding: const EdgeInsets.all(18),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Row(
                  children: [
                    const Icon(Icons.notifications_active_rounded, color: AppColors.primary, size: 22),
                    const SizedBox(width: 8),
                    Text(
                      'مركز الإشعارات والتنبيهات',
                      style: TextStyle(
                        fontWeight: FontWeight.bold,
                        fontSize: 15,
                        color: isDark ? Colors.white : const Color(0xFF0F172A),
                      ),
                    ),
                  ],
                ),
                TextButton(
                  onPressed: onMarkAllRead,
                  child: const Text('تحديد الكل كمقروء', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold)),
                ),
              ],
            ),
          ),
          Divider(height: 1, color: isDark ? AppColors.darkBorder : const Color(0xFFE2E8F0)),

          // قائمة الإشعارات
          Expanded(
            child: notifications.isEmpty
                ? Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(Icons.mark_email_read_outlined, size: 48, color: Colors.grey.shade400),
                        const SizedBox(height: 12),
                        Text(
                          'لا توجد إشعارات جديدة حالياً',
                          style: TextStyle(
                            color: isDark ? Colors.grey : const Color(0xFF64748B),
                            fontSize: 13,
                          ),
                        ),
                      ],
                    ),
                  )
                : ListView.separated(
                    padding: const EdgeInsets.all(12),
                    itemCount: notifications.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 8),
                    itemBuilder: (context, index) {
                      final n = notifications[index];
                      return Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: n.isRead 
                              ? Colors.transparent 
                              : AppColors.primary.withValues(alpha: isDark ? 0.08 : 0.05),
                          borderRadius: BorderRadius.circular(16),
                          border: Border.all(
                            color: n.isRead 
                                ? (isDark ? AppColors.darkBorder : const Color(0xFFE2E8F0))
                                : AppColors.primary.withValues(alpha: 0.3),
                            width: 1.1,
                          ),
                        ),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Container(
                              padding: const EdgeInsets.all(8),
                              decoration: BoxDecoration(
                                color: _getColorForType(n.type).withValues(alpha: 0.15),
                                shape: BoxShape.circle,
                              ),
                              child: Icon(_getIconForType(n.type), color: _getColorForType(n.type), size: 18),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    n.title,
                                    style: TextStyle(
                                      fontWeight: n.isRead ? FontWeight.w600 : FontWeight.bold,
                                      fontSize: 13,
                                      color: isDark ? Colors.white : const Color(0xFF0F172A),
                                    ),
                                  ),
                                  const SizedBox(height: 4),
                                  Text(
                                    n.body,
                                    style: TextStyle(
                                      fontSize: 11.5,
                                      color: isDark ? Colors.grey.shade400 : const Color(0xFF64748B),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }

  Color _getColorForType(NotificationType type) {
    switch (type) {
      case NotificationType.approval:
        return AppColors.primary;
      case NotificationType.shift:
        return AppColors.accentCyan;
      case NotificationType.salary:
        return AppColors.warning;
      case NotificationType.penalty:
        return AppColors.danger;
      case NotificationType.general:
        return AppColors.eveningShift;
    }
  }

  IconData _getIconForType(NotificationType type) {
    switch (type) {
      case NotificationType.approval:
        return Icons.check_circle_rounded;
      case NotificationType.shift:
        return Icons.calendar_month_rounded;
      case NotificationType.salary:
        return Icons.payments_rounded;
      case NotificationType.penalty:
        return Icons.warning_rounded;
      case NotificationType.general:
        return Icons.notifications_rounded;
    }
  }
}
