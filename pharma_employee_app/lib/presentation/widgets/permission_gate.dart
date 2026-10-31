import 'package:flutter/material.dart';
import '../../data/models/permission_model.dart';

class PermissionGate extends StatelessWidget {
  final String permission;
  final PermissionModel permissions;
  final Widget child;
  final Widget? fallback;
  final bool showLockBadge;

  const PermissionGate({
    super.key,
    required this.permission,
    required this.permissions,
    required this.child,
    this.fallback,
    this.showLockBadge = false,
  });

  @override
  Widget build(BuildContext context) {
    final isAllowed = permissions.isPermActive(permission);

    if (isAllowed) {
      return child;
    }

    if (fallback != null) {
      return fallback!;
    }

    if (showLockBadge) {
      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
          color: Colors.amber.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: Colors.amber.shade700.withValues(alpha: 0.4)),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.lock_outline, size: 16, color: Colors.amber.shade700),
            const SizedBox(width: 8),
            Text(
              'صلاحية مقيدة من الإدارة العليا',
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.bold,
                color: Colors.amber.shade800,
              ),
            ),
          ],
        ),
      );
    }

    return const SizedBox.shrink();
  }
}

