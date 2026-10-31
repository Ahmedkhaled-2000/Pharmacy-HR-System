import 'package:flutter/material.dart';

class GeofenceStatusChip extends StatelessWidget {
  final bool isInside;
  final double distanceMeters;
  final String branchName;

  const GeofenceStatusChip({
    super.key,
    required this.isInside,
    required this.distanceMeters,
    required this.branchName,
  });

  @override
  Widget build(BuildContext context) {
    final color = isInside ? const Color(0xFF10B981) : const Color(0xFFEF4444);
    final bgColor = isInside ? const Color(0x1A10B981) : const Color(0x1AEF4444);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: bgColor,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: color.withValues(alpha: 0.3)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            isInside ? Icons.location_on : Icons.location_off,
            size: 14,
            color: color,
          ),
          const SizedBox(width: 5),
          Text(
            isInside
                ? 'داخل نطاق $branchName (${distanceMeters.toStringAsFixed(0)}م)'
                : 'خارج نطاق $branchName (${distanceMeters.toStringAsFixed(0)}م)',
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.bold,
              color: color,
            ),
          ),
        ],
      ),
    );
  }
}

