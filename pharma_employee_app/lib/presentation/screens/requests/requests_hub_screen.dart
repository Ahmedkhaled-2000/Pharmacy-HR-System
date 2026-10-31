import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../../core/constants/app_colors.dart';
import '../../../data/models/request_models.dart';
import '../../providers/requests_provider.dart';
import 'leave_request_form.dart';
import 'permission_form.dart';
import 'loan_request_form.dart';
import 'shift_swap_form.dart';
import 'missed_punch_form.dart';
import 'resignation_form.dart';

class RequestsHubScreen extends ConsumerStatefulWidget {
  const RequestsHubScreen({super.key});

  @override
  ConsumerState<RequestsHubScreen> createState() => _RequestsHubScreenState();
}

class _RequestsHubScreenState extends ConsumerState<RequestsHubScreen> with SingleTickerProviderStateMixin {
  late TabController _tabController;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 4, vsync: this);
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  void _showNewRequestPicker() {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    showModalBottomSheet(
      context: context,
      backgroundColor: Theme.of(context).cardTheme.color ?? (isDark ? AppColors.darkSurface : Colors.white),
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      builder: (ctx) {
        return Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'اختر نوع الطلب الجديد',
                style: TextStyle(
                  fontWeight: FontWeight.bold,
                  fontSize: 16,
                  color: isDark ? Colors.white : const Color(0xFF0F172A),
                ),
              ),
              const SizedBox(height: 14),
              ListTile(
                leading: const Icon(Icons.beach_access_rounded, color: AppColors.primary),
                title: Text('طلب إجازة رسمي (سنوية / مرضية / عارضة)', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13, color: isDark ? Colors.white : const Color(0xFF0F172A))),
                onTap: () {
                  Navigator.pop(ctx);
                  _openModal(const LeaveRequestFormModal());
                },
              ),
              ListTile(
                leading: const Icon(Icons.timer_outlined, color: AppColors.warning),
                title: Text('طلب إذن خروج / استئذان مؤقت', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13, color: isDark ? Colors.white : const Color(0xFF0F172A))),
                onTap: () {
                  Navigator.pop(ctx);
                  _openModal(const PermissionFormModal());
                },
              ),
              ListTile(
                leading: const Icon(Icons.payments_rounded, color: AppColors.eveningShift),
                title: Text('طلب سلفة مالية أو شراء أدوية آجل', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13, color: isDark ? Colors.white : const Color(0xFF0F172A))),
                onTap: () {
                  Navigator.pop(ctx);
                  _openModal(const LoanRequestFormModal());
                },
              ),
              ListTile(
                leading: const Icon(Icons.swap_horiz_rounded, color: AppColors.accentCyan),
                title: Text('طلب تبديل ونقل وردية مع زميل', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13, color: isDark ? Colors.white : const Color(0xFF0F172A))),
                onTap: () {
                  Navigator.pop(ctx);
                  _openModal(const ShiftSwapFormModal());
                },
              ),
              ListTile(
                leading: const Icon(Icons.fingerprint_rounded, color: AppColors.primary),
                title: Text('طلب توثيق وردية يدوي / بصمة منسية', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13, color: isDark ? Colors.white : const Color(0xFF0F172A))),
                onTap: () {
                  Navigator.pop(ctx);
                  _openModal(const MissedPunchFormModal());
                },
              ),
              ListTile(
                leading: const Icon(Icons.assignment_return_rounded, color: AppColors.danger),
                title: Text('طلب استقالة وإخلاء طرف رسمي', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13, color: isDark ? Colors.white : const Color(0xFF0F172A))),
                onTap: () {
                  Navigator.pop(ctx);
                  _openModal(const ResignationFormModal());
                },
              ),
            ],
          ),
        );
      },
    );
  }

  void _openModal(Widget modal) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => modal,
    );
  }

  @override
  Widget build(BuildContext context) {
    final reqState = ref.watch(requestsProvider);
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Scaffold(
      appBar: AppBar(
        title: Text(
          'مركز الطلبات والخدمات',
          style: TextStyle(
            fontWeight: FontWeight.bold,
            fontSize: 16,
            color: isDark ? Colors.white : const Color(0xFF0F172A),
          ),
        ),
        bottom: TabBar(
          controller: _tabController,
          indicatorColor: AppColors.primary,
          labelColor: AppColors.primary,
          unselectedLabelColor: isDark ? Colors.grey : const Color(0xFF64748B),
          labelStyle: const TextStyle(fontWeight: FontWeight.bold, fontSize: 12),
          tabs: const [
            Tab(text: 'الكل'),
            Tab(text: 'قيد المراجعة ⏳'),
            Tab(text: 'المعتمدة ✅'),
            Tab(text: 'المرفوضة ❌'),
          ],
        ),
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _showNewRequestPicker,
        backgroundColor: AppColors.primary,
        foregroundColor: Colors.white,
        icon: const Icon(Icons.add_rounded),
        label: const Text('طلب جديد', style: TextStyle(fontWeight: FontWeight.bold)),
      ),
      body: TabBarView(
        controller: _tabController,
        children: [
          _buildRequestsList(reqState, null),
          _buildRequestsList(reqState, RequestStatus.pending),
          _buildRequestsList(reqState, RequestStatus.approved),
          _buildRequestsList(reqState, RequestStatus.rejected),
        ],
      ),
    );
  }

  Widget _buildRequestsList(RequestsState state, RequestStatus? filter) {
    final df = DateFormat('yyyy/MM/dd');
    final allItems = <Widget>[];

    // الإجازات
    for (final l in state.leaves) {
      if (filter == null || l.status == filter) {
        allItems.add(_buildCard(
          title: 'طلب إجازة: ${l.type.labelAr}',
          subtitle: 'الفترة: ${df.format(l.startDate)} إلى ${df.format(l.endDate)} (${l.daysCount} يوم)',
          reason: l.reason,
          status: l.status,
          adminNote: l.adminNote,
          icon: Icons.beach_access_rounded,
          color: AppColors.primary,
        ));
      }
    }

    // السلف
    for (final ln in state.loans) {
      if (filter == null || ln.status == filter) {
        allItems.add(_buildCard(
          title: 'طلب ${ln.loanType.labelAr}: ${ln.amount.toStringAsFixed(0)} ج.م',
          subtitle: 'السداد على ${ln.installmentsCount} شهر • القسط: ${ln.monthlyDeduction.toStringAsFixed(0)} ج.م',
          reason: ln.reason,
          status: ln.status,
          adminNote: ln.adminNote,
          icon: Icons.payments_rounded,
          color: AppColors.eveningShift,
        ));
      }
    }

    // التبديل
    for (final sw in state.swaps) {
      if (filter == null || sw.status == filter) {
        allItems.add(_buildCard(
          title: 'تبديل وردية مع: ${sw.targetEmployeeName}',
          subtitle: 'التاريخ: ${df.format(sw.shiftDate)} • ${sw.branchName}',
          reason: sw.reason,
          status: sw.status,
          adminNote: sw.adminNote,
          icon: Icons.swap_horiz_rounded,
          color: AppColors.accentCyan,
        ));
      }
    }

    // الأذونات
    for (final p in state.permissions) {
      if (filter == null || p.status == filter) {
        allItems.add(_buildCard(
          title: 'إذن خروج مؤقت: ${p.hours.toStringAsFixed(1)} ساعة',
          subtitle: 'التاريخ: ${df.format(p.date)} (${p.exitTime} - ${p.returnTime})',
          reason: p.reason,
          status: p.status,
          adminNote: p.adminNote,
          icon: Icons.timer_outlined,
          color: AppColors.warning,
        ));
      }
    }

    // البصمة المنسية
    for (final mp in state.missedPunches) {
      if (filter == null || mp.status == filter) {
        allItems.add(_buildCard(
          title: 'توثيق وردية يدوية / بصمة منسية',
          subtitle: 'التاريخ: ${df.format(mp.punchDate)} (${mp.checkIn} إلى ${mp.checkOut})',
          reason: mp.reason,
          status: mp.status,
          adminNote: mp.adminNote,
          icon: Icons.fingerprint_rounded,
          color: AppColors.primary,
        ));
      }
    }

    // الاستقالة
    for (final r in state.resignations) {
      if (filter == null || r.status == filter) {
        allItems.add(_buildCard(
          title: 'طلب استقالة وإخلاء طرف',
          subtitle: 'آخر يوم عمل: ${df.format(r.lastWorkingDay)}',
          reason: r.reason,
          status: r.status,
          adminNote: r.adminNote,
          icon: Icons.assignment_return_rounded,
          color: AppColors.danger,
        ));
      }
    }

    if (allItems.isEmpty) {
      final isDark = Theme.of(context).brightness == Brightness.dark;
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.inbox_outlined, size: 54, color: isDark ? Colors.grey.shade600 : const Color(0xFFCBD5E1)),
            const SizedBox(height: 12),
            Text(
              'لا توجد طلبات في هذا القسم حالياً',
              style: TextStyle(
                color: isDark ? Colors.grey : const Color(0xFF64748B),
                fontSize: 13,
              ),
            ),
          ],
        ),
      );
    }

    return ListView.separated(
      padding: const EdgeInsets.all(16),
      itemCount: allItems.length,
      separatorBuilder: (_, __) => const SizedBox(height: 12),
      itemBuilder: (_, index) => allItems[index],
    );
  }

  Widget _buildCard({
    required String title,
    required String subtitle,
    required String reason,
    required RequestStatus status,
    String? adminNote,
    required IconData icon,
    required Color color,
  }) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    Color statusColor;
    switch (status) {
      case RequestStatus.pending:
        statusColor = AppColors.warning;
        break;
      case RequestStatus.approved:
        statusColor = AppColors.primary;
        break;
      case RequestStatus.rejected:
      case RequestStatus.cancelled:
        statusColor = AppColors.danger;
        break;
    }

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
                  offset: const Offset(0, 4),
                ),
              ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: color.withValues(alpha: isDark ? 0.2 : 0.12),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Icon(icon, color: color, size: 18),
                  ),
                  const SizedBox(width: 10),
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
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: statusColor.withValues(alpha: isDark ? 0.18 : 0.12),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  status.labelAr,
                  style: TextStyle(color: statusColor, fontWeight: FontWeight.bold, fontSize: 11),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            subtitle,
            style: TextStyle(
              fontSize: 11.5,
              color: isDark ? Colors.grey.shade400 : const Color(0xFF64748B),
            ),
          ),
          const SizedBox(height: 6),
          Text(
            'البيان: $reason',
            style: TextStyle(
              fontSize: 12,
              color: isDark ? Colors.white70 : const Color(0xFF334155),
            ),
          ),
          if (adminNote != null && adminNote.isNotEmpty) ...[
            const SizedBox(height: 8),
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: isDark ? Colors.black.withValues(alpha: 0.25) : const Color(0xFFF1F5F9),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(
                  color: isDark ? AppColors.darkBorder : const Color(0xFFE2E8F0),
                ),
              ),
              child: Row(
                children: [
                  const Icon(Icons.admin_panel_settings, size: 15, color: AppColors.primary),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'رد الإدارة: $adminNote',
                      style: const TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: AppColors.primary),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}
