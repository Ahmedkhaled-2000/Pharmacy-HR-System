import 'package:flutter/material.dart';
import 'package:cached_network_image/cached_network_image.dart';

import '../../../core/constants/app_colors.dart';
import '../../../data/models/user_model.dart';
import '../permission_gate.dart';

class EnterpriseDrawer extends StatelessWidget {
  final UserModel user;
  final String activeTab;
  final ValueChanged<String> onTabSelected;
  final VoidCallback onLogout;

  const EnterpriseDrawer({
    super.key,
    required this.user,
    required this.activeTab,
    required this.onTabSelected,
    required this.onLogout,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Drawer(
      backgroundColor:
          Theme.of(context).cardTheme.color ??
          (isDark ? AppColors.darkSurface : Colors.white),
      child: Column(
        children: [
          // رأس القائمة الفخم مع هوية الموظف
          Container(
            padding: const EdgeInsets.only(
              top: 50,
              bottom: 20,
              left: 16,
              right: 16,
            ),
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: [
                  AppColors.primary.withValues(alpha: isDark ? 0.25 : 0.15),
                  AppColors.accentCyan.withValues(alpha: isDark ? 0.08 : 0.05),
                ],
                begin: Alignment.topRight,
                end: Alignment.bottomLeft,
              ),
              border: Border(
                bottom: BorderSide(
                  color: isDark
                      ? AppColors.darkBorder
                      : const Color(0xFFE2E8F0),
                ),
              ),
            ),
            child: Row(
              children: [
                Container(
                  width: 52,
                  height: 52,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    border: Border.all(color: AppColors.primary, width: 2),
                  ),
                  child: ClipOval(
                    child:
                        (user.fullPhotoUrl != null &&
                            user.fullPhotoUrl!.isNotEmpty)
                        ? CachedNetworkImage(
                            imageUrl: user.fullPhotoUrl!,
                            fit: BoxFit.cover,
                            placeholder: (_, __) => CircleAvatar(
                              backgroundColor: AppColors.primary,
                              child: Text(
                                user.name.isNotEmpty ? user.name[0] : 'أ',
                                style: const TextStyle(
                                  color: Colors.white,
                                  fontSize: 20,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                            ),
                            errorWidget: (_, __, ___) => CircleAvatar(
                              backgroundColor: AppColors.primary,
                              child: Text(
                                user.name.isNotEmpty ? user.name[0] : 'أ',
                                style: const TextStyle(
                                  color: Colors.white,
                                  fontSize: 20,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                            ),
                          )
                        : CircleAvatar(
                            backgroundColor: AppColors.primary,
                            child: Text(
                              user.name.isNotEmpty ? user.name[0] : 'أ',
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 20,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                          ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        user.name,
                        style: TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.bold,
                          color: isDark
                              ? Colors.white
                              : const Color(0xFF0F172A),
                        ),
                        overflow: TextOverflow.ellipsis,
                      ),
                      const SizedBox(height: 4),
                      Text(
                        '${user.jobTitle} • كود: ${user.code}',
                        style: TextStyle(
                          fontSize: 11,
                          color: isDark
                              ? Colors.grey.shade400
                              : const Color(0xFF64748B),
                        ),
                      ),
                    ],
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 8,
                    vertical: 4,
                  ),
                  decoration: BoxDecoration(
                    color: AppColors.primaryDark,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Text(
                    '${user.annualLeaveBalance}د',
                    style: const TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.bold,
                      color: Colors.white,
                    ),
                  ),
                ),
              ],
            ),
          ),

          // عناصر القائمة المصنفة
          Expanded(
            child: ListView(
              padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 8),
              children: [
                _buildSectionHeader(context, 'الرئيسية والدوام'),
                _buildDrawerItem(
                  context,
                  'dashboard',
                  'لوحة التحكم والمؤشرات',
                  Icons.dashboard_rounded,
                ),
                PermissionGate(
                  permission: 'canViewShifts',
                  permissions: user.permissions,
                  child: _buildDrawerItem(
                    context,
                    'shifts',
                    'سجل البصمات وتفاصيل الدوام',
                    Icons.access_time_filled,
                  ),
                ),
                PermissionGate(
                  permission: 'canViewRoster',
                  permissions: user.permissions,
                  child: _buildDrawerItem(
                    context,
                    'roster',
                    'الجدول الشهري لورديات الفروع',
                    Icons.calendar_month_rounded,
                  ),
                ),
                PermissionGate(
                  permission: 'canManualShift',
                  permissions: user.permissions,
                  child: _buildDrawerItem(
                    context,
                    'shift-adjustment',
                    'تسجيل وردية يدوية وتوثيق الدوام',
                    Icons.edit_calendar_rounded,
                  ),
                ),
                PermissionGate(
                  permission: 'canLivePunch',
                  permissions: user.permissions,
                  child: _buildDrawerItem(
                    context,
                    'biometric',
                    'البصمة الإلكترونية (بصمة الوجه)',
                    Icons.face_rounded,
                  ),
                ),
                if (user.permissions.canAccessKiosk)
                  _buildDrawerItem(
                    context,
                    'kiosk',
                    'كشك البصمة والدوام الذكي (Kiosk)',
                    Icons.desktop_windows_rounded,
                  ),

                Divider(
                  height: 24,
                  color: isDark
                      ? AppColors.darkBorder
                      : const Color(0xFFE2E8F0),
                ),
                _buildSectionHeader(context, 'الخدمات والطلبات'),
                _buildDrawerItem(
                  context,
                  'requests',
                  'مركز الطلبات الشامل',
                  Icons.inbox_rounded,
                ),
                PermissionGate(
                  permission: 'canApplyLeave',
                  permissions: user.permissions,
                  child: _buildDrawerItem(
                    context,
                    'leaves',
                    'تقديم ومتابعة الإجازات (21 يوم)',
                    Icons.beach_access_rounded,
                  ),
                ),
                PermissionGate(
                  permission: 'canApplyPermission',
                  permissions: user.permissions,
                  child: _buildDrawerItem(
                    context,
                    'permissions',
                    'أذونات الاستئذان وساعات الخروج',
                    Icons.exit_to_app_rounded,
                  ),
                ),
                PermissionGate(
                  permission: 'canApplyLoan',
                  permissions: user.permissions,
                  child: _buildDrawerItem(
                    context,
                    'loans',
                    'سلف مالية ومشتريات علاج آجل',
                    Icons.payments_rounded,
                  ),
                ),
                PermissionGate(
                  permission: 'canApplySwap',
                  permissions: user.permissions,
                  child: _buildDrawerItem(
                    context,
                    'swaps',
                    'طلبات تبديل ونقل الورديات',
                    Icons.swap_horiz_rounded,
                  ),
                ),
                PermissionGate(
                  permission: 'canApplyResignation',
                  permissions: user.permissions,
                  child: _buildDrawerItem(
                    context,
                    'resignations',
                    'طلب استقالة وإخلاء طرف',
                    Icons.assignment_return_rounded,
                  ),
                ),

                Divider(
                  height: 24,
                  color: isDark
                      ? AppColors.darkBorder
                      : const Color(0xFFE2E8F0),
                ),
                _buildSectionHeader(context, 'الرواتب والمالية'),
                PermissionGate(
                  permission: 'canViewSalary',
                  permissions: user.permissions,
                  child: _buildDrawerItem(
                    context,
                    'salary',
                    'كشف الراتب ومسير الأجور',
                    Icons.monetization_on_rounded,
                  ),
                ),
                PermissionGate(
                  permission: 'canViewAdjustments',
                  permissions: user.permissions,
                  child: _buildDrawerItem(
                    context,
                    'adjustments',
                    'سجل المكافآت والخصومات',
                    Icons.receipt_long_rounded,
                  ),
                ),
                _buildDrawerItem(
                  context,
                  'penalties',
                  'سجل الجزاءات والمخالفات',
                  Icons.gavel_rounded,
                ),

                Divider(
                  height: 24,
                  color: isDark
                      ? AppColors.darkBorder
                      : const Color(0xFFE2E8F0),
                ),
                _buildSectionHeader(context, 'اللائحة والتقييمات'),
                PermissionGate(
                  permission: 'canViewBylaws',
                  permissions: user.permissions,
                  child: _buildDrawerItem(
                    context,
                    'bylaws',
                    'لائحة العمل وجدول الجزاءات',
                    Icons.gavel_rounded,
                  ),
                ),
                PermissionGate(
                  permission: 'canViewEvaluations',
                  permissions: user.permissions,
                  child: _buildDrawerItem(
                    context,
                    'evaluations',
                    'تقييمات الأداء الشهرية والشكاوى',
                    Icons.stars_rounded,
                  ),
                ),
                PermissionGate(
                  permission: 'canViewAddresses',
                  permissions: user.permissions,
                  child: _buildDrawerItem(
                    context,
                    'addresses',
                    'دليل الفروع وعناوين GPS',
                    Icons.map_rounded,
                  ),
                ),

                Divider(
                  height: 24,
                  color: isDark
                      ? AppColors.darkBorder
                      : const Color(0xFFE2E8F0),
                ),
                _buildSectionHeader(context, 'التطبيق والمظهر'),
                _buildDrawerItem(
                  context,
                  'profile',
                  'الملف الشخصي وبيانات التعاقد',
                  Icons.person_rounded,
                ),
                _buildDrawerItem(
                  context,
                  'settings',
                  'إعدادات التطبيق والمظهر',
                  Icons.settings_rounded,
                ),
              ],
            ),
          ),

          // زر تسجيل الخروج
          Padding(
            padding: const EdgeInsets.all(12),
            child: ListTile(
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
              ),
              tileColor: AppColors.danger.withValues(alpha: 0.1),
              leading: const Icon(
                Icons.logout,
                color: AppColors.danger,
                size: 20,
              ),
              title: const Text(
                'تسجيل الخروج',
                style: TextStyle(
                  fontWeight: FontWeight.bold,
                  fontSize: 13,
                  color: AppColors.danger,
                ),
              ),
              onTap: onLogout,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSectionHeader(BuildContext context, String title) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Padding(
      padding: const EdgeInsets.only(right: 12, top: 4, bottom: 6),
      child: Text(
        title,
        style: TextStyle(
          fontSize: 10.5,
          fontWeight: FontWeight.w800,
          color: isDark ? Colors.grey.shade400 : const Color(0xFF64748B),
          letterSpacing: 0.5,
        ),
      ),
    );
  }

  Widget _buildDrawerItem(
    BuildContext context,
    String tabId,
    String title,
    IconData icon,
  ) {
    final isSelected = activeTab == tabId;
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return ListTile(
      dense: true,
      visualDensity: const VisualDensity(horizontal: 0, vertical: -1.5),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      selected: isSelected,
      selectedTileColor: AppColors.primary.withValues(
        alpha: isDark ? 0.18 : 0.12,
      ),
      leading: Icon(
        icon,
        size: 19,
        color: isSelected
            ? AppColors.primary
            : (isDark ? Colors.grey.shade400 : const Color(0xFF64748B)),
      ),
      title: Text(
        title,
        style: TextStyle(
          fontSize: 12.5,
          fontWeight: isSelected ? FontWeight.bold : FontWeight.w500,
          color: isSelected
              ? AppColors.primary
              : (isDark ? Colors.white70 : const Color(0xFF334155)),
        ),
      ),
      onTap: () => onTabSelected(tabId),
    );
  }
}
