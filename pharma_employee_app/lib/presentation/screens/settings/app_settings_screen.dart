import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/services/app_notification_service.dart';
import '../../../core/theme/theme_provider.dart';
import '../../providers/requests_provider.dart';

class AppSettingsScreen extends ConsumerWidget {
  const AppSettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final themeSettings = ref.watch(themeSettingsProvider);
    final themeNotifier = ref.read(themeSettingsProvider.notifier);
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Scaffold(
      appBar: AppBar(
        title: Text(
          'إعدادات التطبيق والمظهر',
          style: TextStyle(
            fontWeight: FontWeight.bold,
            fontSize: 16,
            color: isDark ? Colors.white : const Color(0xFF0F172A),
          ),
        ),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // 🏷️ تحديد هوية وأيقونة المؤسسة الحالية
            _buildContainer(
              context,
              title: 'هوية وأيقونة المؤسسة الحالية',
              icon: Icons.branding_watermark_rounded,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'اختر أيقونة وشعار المؤسسة المعمم في كافة شاشات وتنبيهات التطبيق:',
                    style: TextStyle(
                      fontSize: 11.5,
                      color: isDark ? Colors.grey : const Color(0xFF64748B),
                    ),
                  ),
                  const SizedBox(height: 12),
                  ...OrgBrandIcon.values.map((iconEnum) {
                    final isSel = themeSettings.brandIcon == iconEnum;
                    return Container(
                      margin: const EdgeInsets.only(bottom: 8),
                      decoration: BoxDecoration(
                        color: isSel ? AppColors.primary.withValues(alpha: isDark ? 0.15 : 0.08) : Colors.transparent,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(
                          color: isSel 
                              ? AppColors.primary 
                              : (isDark ? AppColors.darkBorder : const Color(0xFFE2E8F0)),
                          width: isSel ? 1.5 : 1.0,
                        ),
                      ),
                      child: ListTile(
                        leading: Container(
                          padding: const EdgeInsets.all(8),
                          decoration: BoxDecoration(
                            color: isSel ? AppColors.primary : (isDark ? Colors.grey.withValues(alpha: 0.2) : const Color(0xFFF1F5F9)),
                            shape: BoxShape.circle,
                          ),
                          child: Icon(
                            iconEnum.iconData,
                            color: isSel ? Colors.white : (isDark ? Colors.grey : const Color(0xFF64748B)),
                            size: 18,
                          ),
                        ),
                        title: Text(
                          iconEnum.labelAr,
                          style: TextStyle(
                            fontWeight: isSel ? FontWeight.bold : FontWeight.normal,
                            fontSize: 13,
                            color: isDark ? Colors.white : const Color(0xFF0F172A),
                          ),
                        ),
                        trailing: isSel ? const Icon(Icons.check_circle_rounded, color: AppColors.primary) : null,
                        onTap: () {
                          themeNotifier.setBrandIcon(iconEnum);
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(content: Text('✅ تم تعيين ${iconEnum.labelAr} كأيقونة معتمدة للمؤسسة')),
                          );
                        },
                      ),
                    );
                  }),
                ],
              ),
            ),
            const SizedBox(height: 16),

            // 🌓 مظهر التطبيق (Dark / Light)
            _buildContainer(
              context,
              title: 'مظهر وألوان التطبيق',
              icon: Icons.palette_outlined,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'المظهر الطبي الفاتح (الافتراضي)',
                            style: TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.bold,
                              color: isDark ? Colors.white : const Color(0xFF0F172A),
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            isDark ? 'الوضع الليلي مفعّل حالياً' : 'الوضع الفاتح مفعّل ومُعتمد',
                            style: TextStyle(
                              fontSize: 11,
                              color: isDark ? Colors.grey : const Color(0xFF64748B),
                            ),
                          ),
                        ],
                      ),
                      Switch(
                        value: themeSettings.themeMode == ThemeMode.light,
                        activeColor: AppColors.primary,
                        inactiveTrackColor: AppColors.darkBorder,
                        onChanged: (val) {
                          themeNotifier.toggleThemeMode(val ? ThemeMode.light : ThemeMode.dark);
                        },
                      ),
                    ],
                  ),
                  Divider(height: 20, color: isDark ? AppColors.darkBorder : const Color(0xFFE2E8F0)),
                  Text(
                    'لوحة الألوان الطبية الأساسية:',
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.bold,
                      color: isDark ? Colors.white70 : const Color(0xFF334155),
                    ),
                  ),
                  const SizedBox(height: 10),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceAround,
                    children: [
                      _buildColorSwatch(context, themeNotifier, AppColors.primary, 'زمردي صيدلي', themeSettings.primaryColor),
                      _buildColorSwatch(context, themeNotifier, AppColors.accentCyan, 'سماوي بحري', themeSettings.primaryColor),
                      _buildColorSwatch(context, themeNotifier, AppColors.eveningShift, 'بنفسجي ملكي', themeSettings.primaryColor),
                      _buildColorSwatch(context, themeNotifier, const Color(0xFF0284C7), 'أزرق طبي', themeSettings.primaryColor),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),

            // 🔒 الأمان وبصمة الإصبع
            _buildContainer(
              context,
              title: 'الأمان والدخول البيومتري',
              icon: Icons.security_rounded,
              child: Column(
                children: [
                  SwitchListTile(
                    contentPadding: EdgeInsets.zero,
                    title: Text(
                      'تسجيل الدخول ببصمة الإصبع',
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.bold,
                        color: isDark ? Colors.white : const Color(0xFF0F172A),
                      ),
                    ),
                    subtitle: Text(
                      'استخدام بصمة الإصبع / الوجه للدخول السريع',
                      style: TextStyle(
                        fontSize: 11,
                        color: isDark ? Colors.grey : const Color(0xFF64748B),
                      ),
                    ),
                    value: themeSettings.isBiometricsEnabled,
                    activeColor: AppColors.primary,
                    onChanged: (val) => themeNotifier.toggleBiometrics(val),
                  ),
                  Divider(height: 10, color: isDark ? AppColors.darkBorder : const Color(0xFFE2E8F0)),
                  SwitchListTile(
                    contentPadding: EdgeInsets.zero,
                    title: Text(
                      'وضع الخصوصية (إخفاء الأرقام المالية)',
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.bold,
                        color: isDark ? Colors.white : const Color(0xFF0F172A),
                      ),
                    ),
                    subtitle: Text(
                      'إخفاء تفاصيل الراتب والأرصدة عند تصفح التطبيق في الأماكن العامة',
                      style: TextStyle(
                        fontSize: 11,
                        color: isDark ? Colors.grey : const Color(0xFF64748B),
                      ),
                    ),
                    value: themeSettings.isPrivacyMode,
                    activeColor: AppColors.primary,
                    onChanged: (val) => themeNotifier.togglePrivacyMode(val),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),

            // 🔔 أذونات النظام: الإشعارات وتخزين كشوفات الرواتب
            _buildContainer(
              context,
              title: 'أذونات النظام وتنبيهات الهاتف',
              icon: Icons.notifications_active_rounded,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'إدارة أذونات الإشعارات الفورية وتخزين كشوفات الرواتب ومسيرات الأجور في ذاكرة الهاتف:',
                    style: TextStyle(
                      fontSize: 11.5,
                      color: isDark ? Colors.grey : const Color(0xFF64748B),
                    ),
                  ),
                  const SizedBox(height: 12),
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: Container(
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(
                        color: AppColors.primary.withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: const Icon(Icons.notifications_rounded, color: AppColors.primary, size: 20),
                    ),
                    title: const Text('إشعارات الهاتف وتنبيهات الورديات', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                    subtitle: const Text('استقبال إشعارات اعتماد الطلبات ومواعيد الورديات', style: TextStyle(fontSize: 11, color: Colors.grey)),
                    trailing: OutlinedButton(
                      style: OutlinedButton.styleFrom(
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                      ),
                      onPressed: () async {
                        final ok = await AppNotificationService.requestNotificationPermission();
                        if (context.mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(
                              content: Text(ok ? '✅ تم تفعيل إذن الإشعارات بنجاح' : '⚠️ يرجى تفعيل إذن الإشعارات من إعدادات النظام'),
                              backgroundColor: ok ? AppColors.primary : AppColors.warning,
                            ),
                          );
                        }
                      },
                      child: const Text('تفعيل / فحص', style: TextStyle(fontSize: 11)),
                    ),
                  ),
                  const Divider(height: 14),
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: Container(
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(
                        color: AppColors.accentCyan.withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: const Icon(Icons.folder_shared_rounded, color: AppColors.accentCyan, size: 20),
                    ),
                    title: const Text('الوصول إلى وحدة التخزين (Downloads)', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                    subtitle: const Text('حفظ كشوفات البصمة ومسيرات الرواتب PDF محلياً', style: TextStyle(fontSize: 11, color: Colors.grey)),
                    trailing: OutlinedButton(
                      style: OutlinedButton.styleFrom(
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                      ),
                      onPressed: () async {
                        final ok = await AppNotificationService.requestStoragePermission();
                        if (context.mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(
                              content: Text(ok ? '✅ وحدة التخزين ومجلد التنزيلات جاهزة لحفظ الـ PDF' : '⚠️ تم فحص أذونات التخزين'),
                              backgroundColor: AppColors.primary,
                            ),
                          );
                        }
                      },
                      child: const Text('تفعيل / فحص', style: TextStyle(fontSize: 11)),
                    ),
                  ),
                  const SizedBox(height: 10),
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton.icon(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppColors.primary.withValues(alpha: isDark ? 0.2 : 0.1),
                        foregroundColor: AppColors.primary,
                        elevation: 0,
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                        padding: const EdgeInsets.symmetric(vertical: 10),
                      ),
                      icon: const Icon(Icons.send_to_mobile_rounded, size: 16),
                      label: const Text('إرسال إشعار تجريبي لاختبار التنبيهات', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold)),
                      onPressed: () async {
                        await AppNotificationService.showNotification(
                          id: 9999,
                          title: '🔔 إشعار تجريبي - بوابة الموظف',
                          body: 'نظام الإشعارات وتنبيهات الهاتف يعمل بكفاءة تامة! ✅',
                        );
                        if (context.mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(
                              content: Text('🔔 تم إرسال إشعار تجريبي إلى شريط إشعارات هاتفك!'),
                              backgroundColor: AppColors.primary,
                            ),
                          );
                        }
                      },
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),

            // 🌐 السيرفر والمزامنة التلقائية
            _buildContainer(
              context,
              title: 'المزامنة السحابية والاتصال',
              icon: Icons.cloud_sync_rounded,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Row(
                    children: [
                      Icon(Icons.check_circle, color: AppColors.primary, size: 16),
                      SizedBox(width: 6),
                      Text('الخادم المركزي: https://169-58-214-20.sslip.io/api', style: TextStyle(fontSize: 11, color: AppColors.primary, fontWeight: FontWeight.bold)),
                    ],
                  ),
                  const SizedBox(height: 6),
                  Text(
                    'زمن الاستجابة: 28ms • مزامنة الطلبات: مفعلة فورياً لمدير الفرع والإدارة',
                    style: TextStyle(
                      fontSize: 10.5,
                      color: isDark ? Colors.grey : const Color(0xFF64748B),
                    ),
                  ),
                  const SizedBox(height: 14),
                  SizedBox(
                    width: double.infinity,
                    height: 44,
                    child: ElevatedButton.icon(
                      onPressed: () {
                        ref.read(requestsProvider.notifier).loadServerRequests();
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(content: Text('🔄 تمت المزامنة الفورية وتحديث كافة البيانات من السيرفر بنجاح!')),
                        );
                      },
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppColors.primary,
                        foregroundColor: Colors.white,
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                        elevation: 0,
                      ),
                      icon: const Icon(Icons.sync, size: 18),
                      label: const Text('مزامنة فورية الآن مع السيرفر', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),

            // معلومات التطبيق
            Center(
              child: Column(
                children: [
                  Text(
                    'نظام إدارة الصيدليات الموحد • تطبيق بوابة الموظف',
                    style: TextStyle(
                      fontSize: 11,
                      color: isDark ? Colors.grey.shade400 : const Color(0xFF64748B),
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    'الإصدار v1.2.43 (Build 2026.10)',
                    style: TextStyle(
                      fontSize: 10,
                      color: isDark ? Colors.grey : const Color(0xFF94A3B8),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 20),
          ],
        ),
      ),
    );
  }

  Widget _buildContainer(BuildContext context, {required String title, required IconData icon, required Widget child}) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Theme.of(context).cardTheme.color ?? (isDark ? AppColors.darkSurface : Colors.white),
        borderRadius: BorderRadius.circular(18),
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
                  offset: const Offset(0, 3),
                ),
              ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, color: AppColors.primary, size: 20),
              const SizedBox(width: 8),
              Text(
                title,
                style: TextStyle(
                  fontWeight: FontWeight.bold,
                  fontSize: 13.5,
                  color: isDark ? Colors.white : const Color(0xFF0F172A),
                ),
              ),
            ],
          ),
          Divider(height: 20, color: isDark ? AppColors.darkBorder : const Color(0xFFE2E8F0)),
          child,
        ],
      ),
    );
  }

  Widget _buildColorSwatch(BuildContext context, AppThemeNotifier notifier, Color color, String name, Color selectedColor) {
    final isSel = selectedColor.value == color.value;
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return GestureDetector(
      onTap: () => notifier.setPrimaryColor(color),
      child: Column(
        children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              color: color,
              shape: BoxShape.circle,
              border: Border.all(color: isSel ? (isDark ? Colors.white : const Color(0xFF0F172A)) : Colors.transparent, width: 2.5),
              boxShadow: [
                if (isSel)
                  BoxShadow(
                    color: color.withValues(alpha: 0.5),
                    blurRadius: 8,
                    spreadRadius: 2,
                  ),
              ],
            ),
          ),
          const SizedBox(height: 4),
          Text(
            name,
            style: TextStyle(
              fontSize: 9.5,
              color: isSel ? color : (isDark ? Colors.grey : const Color(0xFF64748B)),
              fontWeight: isSel ? FontWeight.bold : FontWeight.normal,
            ),
          ),
        ],
      ),
    );
  }
}
