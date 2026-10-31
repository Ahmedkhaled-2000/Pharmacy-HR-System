import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/constants/app_colors.dart';
import '../../../data/models/branch_model.dart';
import '../../providers/auth_provider.dart';
import '../../providers/employee_data_provider.dart';

class BranchDirectoryScreen extends ConsumerStatefulWidget {
  const BranchDirectoryScreen({super.key});

  @override
  ConsumerState<BranchDirectoryScreen> createState() => _BranchDirectoryScreenState();
}

class _BranchDirectoryScreenState extends ConsumerState<BranchDirectoryScreen> {
  final TextEditingController _searchController = TextEditingController();
  String _searchQuery = '';

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final empData = ref.watch(employeeDataProvider);
    final user = ref.watch(authProvider).user;
    final snapshot = empData.snapshot;

    final List<BranchModel> rawBranches = (snapshot?.allBranches != null && snapshot!.allBranches.isNotEmpty)
        ? snapshot.allBranches
        : (user?.branches ?? []);

    final branches = rawBranches.where((b) {
      if (_searchQuery.isEmpty) return true;
      final q = _searchQuery.toLowerCase();
      final name = b.name.toLowerCase();
      final code = (b.code ?? '').toLowerCase();
      final addr = (b.address ?? '').toLowerCase();
      final phone = (b.phone ?? '').toLowerCase();
      return name.contains(q) || code.contains(q) || addr.contains(q) || phone.contains(q);
    }).toList();

    return Scaffold(
      appBar: AppBar(
        title: Text(
          'دليل الفروع وعناوين GPS',
          style: TextStyle(
            fontWeight: FontWeight.bold,
            fontSize: 16,
            color: isDark ? Colors.white : const Color(0xFF0F172A),
          ),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh_rounded),
            tooltip: 'تحديث قائمة الفروع',
            onPressed: () => ref.read(employeeDataProvider.notifier).refresh(),
          ),
        ],
      ),
      body: empData.isLoading && rawBranches.isEmpty
          ? const Center(child: CircularProgressIndicator(color: AppColors.primary))
          : Column(
              children: [
                // شريط البحث السريع
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
                  child: TextField(
                    controller: _searchController,
                    onChanged: (val) => setState(() => _searchQuery = val.trim()),
                    decoration: InputDecoration(
                      hintText: 'ابحث عن فرع بالاسم، الكود، أو العنوان...',
                      hintStyle: TextStyle(fontSize: 12.5, color: isDark ? Colors.grey : const Color(0xFF94A3B8)),
                      prefixIcon: const Icon(Icons.search_rounded, size: 20, color: AppColors.primary),
                      suffixIcon: _searchQuery.isNotEmpty
                          ? IconButton(
                              icon: const Icon(Icons.clear_rounded, size: 18),
                              onPressed: () {
                                _searchController.clear();
                                setState(() => _searchQuery = '');
                              },
                            )
                          : null,
                      filled: true,
                      fillColor: isDark ? AppColors.darkSurface : Colors.white,
                      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(16),
                        borderSide: BorderSide(color: isDark ? AppColors.darkBorder : const Color(0xFFE2E8F0)),
                      ),
                      enabledBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(16),
                        borderSide: BorderSide(color: isDark ? AppColors.darkBorder : const Color(0xFFE2E8F0)),
                      ),
                    ),
                  ),
                ),

                // إحصائية الفروع المتاحة
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 4),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        'الفروع المعتمدة (${branches.length})',
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.bold,
                          color: isDark ? Colors.grey.shade400 : const Color(0xFF64748B),
                        ),
                      ),
                      if (user?.branchName != null)
                        Text(
                          'فرعك الحالي: ${user!.branchName}',
                          style: const TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: AppColors.primary),
                        ),
                    ],
                  ),
                ),

                const SizedBox(height: 6),

                // قائمة الفروع الحقيقية
                Expanded(
                  child: branches.isEmpty
                      ? Center(
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Icon(Icons.storefront_outlined, size: 54, color: Colors.grey.shade400),
                              const SizedBox(height: 12),
                              Text(
                                _searchQuery.isNotEmpty
                                    ? 'لا توجد فروع تطابق بحثك "$_searchQuery"'
                                    : 'لا توجد فروع مسجلة بالنظام حالياً',
                                style: const TextStyle(fontSize: 13, color: Colors.grey),
                              ),
                            ],
                          ),
                        )
                      : RefreshIndicator(
                          onRefresh: () async => ref.read(employeeDataProvider.notifier).refresh(),
                          color: AppColors.primary,
                          child: ListView.separated(
                            padding: const EdgeInsets.all(16),
                            itemCount: branches.length,
                            separatorBuilder: (_, __) => const SizedBox(height: 12),
                            itemBuilder: (context, index) {
                              final b = branches[index];
                              final isMain = (b.id == user?.branchId) ||
                                  (user?.branches.isNotEmpty == true && user!.branches.first.id == b.id);
                              final hasGps = b.latitude != null && b.longitude != null && b.latitude != 0.0;

                              return Container(
                                padding: const EdgeInsets.all(16),
                                decoration: BoxDecoration(
                                  color: Theme.of(context).cardTheme.color ?? (isDark ? AppColors.darkSurface : Colors.white),
                                  borderRadius: BorderRadius.circular(18),
                                  border: Border.all(
                                    color: isMain
                                        ? AppColors.primary.withValues(alpha: 0.5)
                                        : (isDark ? AppColors.darkBorder : const Color(0xFFE2E8F0)),
                                    width: isMain ? 1.5 : 1.1,
                                  ),
                                  boxShadow: isDark
                                      ? null
                                      : [
                                          BoxShadow(
                                            color: const Color(0xFF0F172A).withValues(alpha: 0.03),
                                            blurRadius: 8,
                                            offset: const Offset(0, 3),
                                          ),
                                        ],
                                ),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    // رأس بطاقة الفرع
                                    Row(
                                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                      children: [
                                        Expanded(
                                          child: Row(
                                            children: [
                                              Container(
                                                padding: const EdgeInsets.all(8),
                                                decoration: BoxDecoration(
                                                  color: AppColors.primary.withValues(alpha: isDark ? 0.2 : 0.1),
                                                  borderRadius: BorderRadius.circular(10),
                                                ),
                                                child: const Icon(Icons.storefront_rounded, color: AppColors.primary, size: 20),
                                              ),
                                              const SizedBox(width: 10),
                                              Expanded(
                                                child: Column(
                                                  crossAxisAlignment: CrossAxisAlignment.start,
                                                  children: [
                                                    Text(
                                                      b.name,
                                                      style: TextStyle(
                                                        fontWeight: FontWeight.bold,
                                                        fontSize: 14.5,
                                                        color: isDark ? Colors.white : const Color(0xFF0F172A),
                                                      ),
                                                      maxLines: 1,
                                                      overflow: TextOverflow.ellipsis,
                                                    ),
                                                    if (b.code != null && b.code!.isNotEmpty)
                                                      Text(
                                                        'كود الفرع: ${b.code}',
                                                        style: const TextStyle(fontSize: 11, color: Colors.grey),
                                                      ),
                                                  ],
                                                ),
                                              ),
                                            ],
                                          ),
                                        ),
                                        if (isMain)
                                          Container(
                                            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                                            decoration: BoxDecoration(
                                              color: AppColors.primary.withValues(alpha: isDark ? 0.25 : 0.15),
                                              borderRadius: BorderRadius.circular(10),
                                              border: Border.all(color: AppColors.primary.withValues(alpha: 0.4)),
                                            ),
                                            child: const Row(
                                              mainAxisSize: MainAxisSize.min,
                                              children: [
                                                Icon(Icons.star_rounded, size: 14, color: AppColors.primary),
                                                SizedBox(width: 4),
                                                Text(
                                                  'فرعك الأساسي',
                                                  style: TextStyle(fontSize: 10.5, color: AppColors.primary, fontWeight: FontWeight.bold),
                                                ),
                                              ],
                                            ),
                                          ),
                                      ],
                                    ),

                                    const SizedBox(height: 12),

                                    // العنوان الحقيقي
                                    Row(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        const Icon(Icons.location_on_rounded, size: 16, color: AppColors.primary),
                                        const SizedBox(width: 8),
                                        Expanded(
                                          child: Text(
                                            (b.address != null && b.address!.trim().isNotEmpty)
                                                ? b.address!
                                                : 'العنوان مسجل بالنظام لدى إدارة العمليات',
                                            style: TextStyle(
                                              fontSize: 12,
                                              height: 1.4,
                                              color: isDark ? Colors.grey.shade300 : const Color(0xFF334155),
                                            ),
                                          ),
                                        ),
                                        if (b.address != null && b.address!.trim().isNotEmpty)
                                          InkWell(
                                            onTap: () {
                                              Clipboard.setData(ClipboardData(text: b.address!));
                                              ScaffoldMessenger.of(context).showSnackBar(
                                                const SnackBar(content: Text('📋 تم نسخ عنوان الفرع')),
                                              );
                                            },
                                            child: const Padding(
                                              padding: EdgeInsets.symmetric(horizontal: 4),
                                              child: Icon(Icons.copy_rounded, size: 15, color: Colors.grey),
                                            ),
                                          ),
                                      ],
                                    ),

                                    // رقم الهاتف الفعلي
                                    if (b.phone != null && b.phone!.trim().isNotEmpty) ...[
                                      const SizedBox(height: 8),
                                      Row(
                                        children: [
                                          const Icon(Icons.phone_rounded, size: 16, color: AppColors.accentCyan),
                                          const SizedBox(width: 8),
                                          Text(
                                            b.phone!,
                                            style: TextStyle(
                                              fontSize: 12.5,
                                              fontWeight: FontWeight.bold,
                                              color: isDark ? Colors.white : const Color(0xFF0F172A),
                                            ),
                                          ),
                                          const Spacer(),
                                          InkWell(
                                            onTap: () {
                                              Clipboard.setData(ClipboardData(text: b.phone!));
                                              ScaffoldMessenger.of(context).showSnackBar(
                                                const SnackBar(content: Text('📋 تم نسخ رقم هاتف الفرع')),
                                              );
                                            },
                                            child: const Icon(Icons.copy_rounded, size: 15, color: Colors.grey),
                                          ),
                                        ],
                                      ),
                                    ],

                                    // إحداثيات GPS الحقيقية
                                    if (hasGps) ...[
                                      const SizedBox(height: 8),
                                      Container(
                                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                                        decoration: BoxDecoration(
                                          color: isDark ? Colors.black26 : const Color(0xFFF8FAFC),
                                          borderRadius: BorderRadius.circular(8),
                                          border: Border.all(color: isDark ? AppColors.darkBorder : const Color(0xFFE2E8F0)),
                                        ),
                                        child: Row(
                                          mainAxisSize: MainAxisSize.min,
                                          children: [
                                            const Icon(Icons.my_location_rounded, size: 12, color: AppColors.primary),
                                            const SizedBox(width: 6),
                                            Text(
                                              'GPS: ${b.latitude!.toStringAsFixed(4)}, ${b.longitude!.toStringAsFixed(4)} (نطاق ${b.geofenceRadiusMeters.toInt()}م)',
                                              style: TextStyle(fontSize: 10.5, color: isDark ? Colors.grey.shade400 : const Color(0xFF64748B)),
                                            ),
                                          ],
                                        ),
                                      ),
                                    ],

                                    const SizedBox(height: 12),

                                    // أزرار العمليات
                                    Row(
                                      children: [
                                        Expanded(
                                          child: OutlinedButton.icon(
                                            onPressed: () {
                                              final query = hasGps
                                                  ? '${b.latitude},${b.longitude}'
                                                  : Uri.encodeComponent('${b.name} ${b.address ?? ""}');
                                              ScaffoldMessenger.of(context).showSnackBar(
                                                SnackBar(
                                                  content: Text('🗺️ الموقع الجغرافي لـ "${b.name}": $query'),
                                                  backgroundColor: AppColors.primary,
                                                ),
                                              );
                                            },
                                            style: OutlinedButton.styleFrom(
                                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                                              side: BorderSide(color: isDark ? AppColors.darkBorder : const Color(0xFFCBD5E1)),
                                              padding: const EdgeInsets.symmetric(vertical: 10),
                                            ),
                                            icon: const Icon(Icons.directions_rounded, size: 16, color: AppColors.primary),
                                            label: const Text('الاتجاهات عبر الخريطة', style: TextStyle(fontSize: 11.5, color: AppColors.primary, fontWeight: FontWeight.bold)),
                                          ),
                                        ),
                                      ],
                                    ),
                                  ],
                                ),
                              );
                            },
                          ),
                        ),
                ),
              ],
            ),
    );
  }
}
