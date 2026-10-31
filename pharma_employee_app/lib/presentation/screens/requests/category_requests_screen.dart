import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../../core/constants/app_colors.dart';
import '../../../data/models/request_models.dart';
import '../../../data/models/user_model.dart';
import '../../providers/auth_provider.dart';
import '../../providers/employee_data_provider.dart';
import '../../providers/requests_provider.dart';
import 'leave_request_form.dart';
import 'permission_form.dart';
import 'loan_request_form.dart';
import 'shift_swap_form.dart';
import 'missed_punch_form.dart';
import 'resignation_form.dart';

enum RequestCategory {
  leaves,
  permissions,
  loans,
  swaps,
  missedPunches,
  resignations;

  String get titleAr {
    switch (this) {
      case RequestCategory.leaves:
        return 'سجل ومتابعة الإجازات';
      case RequestCategory.permissions:
        return 'سجل أذونات الاستئذان وساعات الخروج';
      case RequestCategory.loans:
        return 'سجل السلف ومشتريات الأدوية';
      case RequestCategory.swaps:
        return 'سجل تبديل ونقل الورديات';
      case RequestCategory.missedPunches:
        return 'سجل توثيق الورديات والبصمة المنسية';
      case RequestCategory.resignations:
        return 'طلب استقالة وإخلاء طرف';
    }
  }

  String get newButtonLabel {
    switch (this) {
      case RequestCategory.leaves:
        return 'طلب إجازة جديد +';
      case RequestCategory.permissions:
        return 'طلب إذن خروج جديد +';
      case RequestCategory.loans:
        return 'طلب سلفة / أدوية جديد +';
      case RequestCategory.swaps:
        return 'طلب تبديل وردية جديد +';
      case RequestCategory.missedPunches:
        return 'طلب توثيق وردية جديد +';
      case RequestCategory.resignations:
        return 'تقديم طلب استقالة +';
    }
  }
}

class CategoryRequestsScreen extends ConsumerStatefulWidget {
  final RequestCategory category;

  CategoryRequestsScreen({
    super.key,
    required dynamic category,
  }) : category = category is RequestCategory ? category : _parseCategory(category?.toString());

  static RequestCategory _parseCategory(String? str) {
    switch (str) {
      case 'leaves':
      case 'leave':
        return RequestCategory.leaves;
      case 'permissions':
      case 'permission':
        return RequestCategory.permissions;
      case 'loans':
      case 'loan':
        return RequestCategory.loans;
      case 'swaps':
      case 'swap':
        return RequestCategory.swaps;
      case 'missedPunches':
      case 'missed':
      case 'shift-adjustment':
        return RequestCategory.missedPunches;
      case 'resignations':
      case 'resignation':
        return RequestCategory.resignations;
      default:
        return RequestCategory.leaves;
    }
  }

  @override
  ConsumerState<CategoryRequestsScreen> createState() => _CategoryRequestsScreenState();
}

class _CategoryRequestsScreenState extends ConsumerState<CategoryRequestsScreen> {
  String _statusFilter = 'all'; // 'all' | 'pending' | 'approved' | 'rejected'

  void _openNewRequestModal(UserModel user) {
    Widget modal;
    switch (widget.category) {
      case RequestCategory.leaves:
        modal = LeaveRequestFormModal(
          currentLeaveBalance: user.annualLeaveBalance,
          onSubmitted: () => ref.read(employeeDataProvider.notifier).refresh(),
        );
        break;
      case RequestCategory.permissions:
        modal = PermissionFormModal(
          onSubmitted: () => ref.read(employeeDataProvider.notifier).refresh(),
        );
        break;
      case RequestCategory.loans:
        modal = LoanRequestFormModal(
          onSubmitted: () => ref.read(employeeDataProvider.notifier).refresh(),
        );
        break;
      case RequestCategory.swaps:
        modal = ShiftSwapFormModal(
          onSubmitted: () => ref.read(employeeDataProvider.notifier).refresh(),
        );
        break;
      case RequestCategory.missedPunches:
        modal = MissedPunchFormModal(
          onSubmitted: () => ref.read(employeeDataProvider.notifier).refresh(),
        );
        break;
      case RequestCategory.resignations:
        modal = ResignationFormModal(
          onSubmitted: () => ref.read(employeeDataProvider.notifier).refresh(),
        );
        break;
    }

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => modal,
    );
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final user = ref.watch(authProvider).user;
    final reqState = ref.watch(requestsProvider);
    final empDataState = ref.watch(employeeDataProvider);

    // دمج طلبات الذاكرة مع طلبات السيرفر المحدثة لمنع اختفاء أي طلب
    List<dynamic> getMerged(List<dynamic> localItems, List<dynamic> serverItems) {
      final map = <String, dynamic>{};
      for (final it in localItems) {
        if (it != null) map[it.id] = it;
      }
      for (final it in serverItems) {
        if (it != null) map[it.id] = it; // تحديث السيرفر يسبق الحالة المحلية
      }
      final list = map.values.toList();
      list.sort((a, b) => (b.createdAt as DateTime).compareTo(a.createdAt as DateTime));
      return list;
    }

    List<dynamic> items = [];
    switch (widget.category) {
      case RequestCategory.leaves:
        items = getMerged(reqState.leaves, empDataState.snapshot?.leaves ?? []);
        break;
      case RequestCategory.permissions:
        items = getMerged(reqState.permissions, empDataState.snapshot?.permissions ?? []);
        break;
      case RequestCategory.loans:
        items = getMerged(reqState.loans, empDataState.snapshot?.loans ?? []);
        break;
      case RequestCategory.swaps:
        items = getMerged(reqState.swaps, empDataState.snapshot?.swaps ?? []);
        break;
      case RequestCategory.missedPunches:
        items = getMerged(reqState.missedPunches, empDataState.snapshot?.missedPunches ?? []);
        break;
      case RequestCategory.resignations:
        items = getMerged(reqState.resignations, empDataState.snapshot?.resignations ?? []);
        break;
    }

    // تطبيق الفلتر
    final filteredItems = items.where((it) {
      if (_statusFilter == 'all') return true;
      RequestStatus st = it.status as RequestStatus;
      if (_statusFilter == 'pending') return st == RequestStatus.pending;
      if (_statusFilter == 'approved') return st == RequestStatus.approved;
      if (_statusFilter == 'rejected') return st == RequestStatus.rejected || st == RequestStatus.cancelled;
      return true;
    }).toList();

    return Scaffold(
      appBar: AppBar(
        title: Text(
          widget.category.titleAr,
          style: TextStyle(
            fontWeight: FontWeight.bold,
            fontSize: 15,
            color: isDark ? Colors.white : const Color(0xFF0F172A),
          ),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh_rounded),
            onPressed: () {
              if (user != null) {
                ref.read(requestsProvider.notifier).loadServerRequests(user.code);
                ref.read(employeeDataProvider.notifier).refresh();
              }
            },
          ),
        ],
      ),
      floatingActionButton: user != null
          ? FloatingActionButton.extended(
              backgroundColor: AppColors.primary,
              foregroundColor: Colors.white,
              elevation: 4,
              icon: const Icon(Icons.add_rounded, size: 22),
              label: Text(
                widget.category.newButtonLabel,
                style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
              ),
              onPressed: () => _openNewRequestModal(user),
            )
          : null,
      body: Column(
        children: [
          // شريط الفلاتر السريعة
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
            color: Theme.of(context).cardTheme.color ?? (isDark ? AppColors.darkSurface : Colors.white),
            child: Row(
              children: [
                _buildFilterChip('الكل', 'all', isDark),
                const SizedBox(width: 8),
                _buildFilterChip('قيد المراجعة', 'pending', isDark),
                const SizedBox(width: 8),
                _buildFilterChip('المعتمدة', 'approved', isDark),
                const SizedBox(width: 8),
                _buildFilterChip('المرفوضة', 'rejected', isDark),
              ],
            ),
          ),
          Divider(height: 1, color: isDark ? AppColors.darkBorder : const Color(0xFFE2E8F0)),

          // قائمة الطلبات السابقة
          Expanded(
            child: reqState.isLoading || empDataState.isLoading
                ? const Center(child: CircularProgressIndicator(color: AppColors.primary))
                : filteredItems.isEmpty
                    ? Center(
                        child: Padding(
                          padding: const EdgeInsets.all(24),
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(Icons.inbox_outlined, size: 64, color: isDark ? Colors.grey.shade700 : const Color(0xFFCBD5E1)),
                              const SizedBox(height: 16),
                              Text(
                                'لا توجد طلبات مسجلة في هذا القسم',
                                style: TextStyle(
                                  fontSize: 15,
                                  fontWeight: FontWeight.bold,
                                  color: isDark ? Colors.white70 : const Color(0xFF64748B),
                                ),
                              ),
                              const SizedBox(height: 8),
                              Text(
                                'اضغط على زر "${widget.category.newButtonLabel}" بالأسفل لإنشاء طلبك الأول',
                                textAlign: TextAlign.center,
                                style: TextStyle(
                                  fontSize: 12,
                                  color: isDark ? Colors.grey.shade500 : const Color(0xFF94A3B8),
                                ),
                              ),
                            ],
                          ),
                        ),
                      )
                    : ListView.separated(
                        padding: const EdgeInsets.fromLTRB(16, 16, 16, 80),
                        itemCount: filteredItems.length,
                        separatorBuilder: (_, __) => const SizedBox(height: 12),
                        itemBuilder: (context, index) {
                          final item = filteredItems[index];
                          return _buildRequestCard(context, item, isDark);
                        },
                      ),
          ),
        ],
      ),
    );
  }

  Widget _buildFilterChip(String label, String filterKey, bool isDark) {
    final isSelected = _statusFilter == filterKey;
    return GestureDetector(
      onTap: () => setState(() => _statusFilter = filterKey),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: isSelected
              ? AppColors.primary
              : (isDark ? Colors.black.withValues(alpha: 0.3) : const Color(0xFFF1F5F9)),
          borderRadius: BorderRadius.circular(10),
          border: Border.all(
            color: isSelected ? AppColors.primary : (isDark ? AppColors.darkBorder : const Color(0xFFE2E8F0)),
          ),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 11.5,
            fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
            color: isSelected ? Colors.white : (isDark ? Colors.white70 : const Color(0xFF475569)),
          ),
        ),
      ),
    );
  }

  Widget _buildRequestCard(BuildContext context, dynamic item, bool isDark) {
    String title = '';
    String subTitle = '';
    String dateStr = '';
    String? adminNote;
    RequestStatus status = RequestStatus.pending;

    if (item is LeaveRequest) {
      title = 'طلب إجازة: ${item.type.labelAr}';
      subTitle = 'الفترة: ${DateFormat('yyyy/MM/dd').format(item.startDate)} إلى ${DateFormat('yyyy/MM/dd').format(item.endDate)} (${item.daysCount} يوم)\nالسبب: ${item.reason}';
      dateStr = DateFormat('yyyy/MM/dd HH:mm').format(item.createdAt);
      adminNote = item.adminNote;
      status = item.status;
    } else if (item is PermissionRequest) {
      title = 'طلب إذن خروج / استئذان مؤقت';
      subTitle = 'التاريخ: ${DateFormat('yyyy/MM/dd').format(item.date)} • الساعات: ${item.hours} س (${item.exitTime} - ${item.returnTime})\nالسبب: ${item.reason}';
      dateStr = DateFormat('yyyy/MM/dd HH:mm').format(item.createdAt);
      adminNote = item.adminNote;
      status = item.status;
    } else if (item is LoanRequest) {
      title = 'طلب ${item.loanType.labelAr}: ${item.amount.toStringAsFixed(0)} ج.م';
      subTitle = 'السداد على ${item.installmentsCount} شهر • القسط: ${item.monthlyDeduction.toStringAsFixed(0)} ج.م\nالسبب: ${item.reason}';
      dateStr = DateFormat('yyyy/MM/dd HH:mm').format(item.createdAt);
      adminNote = item.adminNote;
      status = item.status;
    } else if (item is ShiftSwapRequest) {
      title = 'تبديل وردية مع: ${item.targetEmployeeName}';
      subTitle = 'تاريخ الوردية: ${DateFormat('yyyy/MM/dd').format(item.shiftDate)} • الفرع: ${item.branchName}\nالسبب: ${item.reason}';
      dateStr = DateFormat('yyyy/MM/dd HH:mm').format(item.createdAt);
      adminNote = item.adminNote;
      status = item.status;
    } else if (item is MissedPunchRequest) {
      title = 'توثيق وردية يدوي / بصمة منسية';
      subTitle = 'تاريخ الوردية: ${DateFormat('yyyy/MM/dd').format(item.punchDate)} (${item.checkIn} - ${item.checkOut})\nالسبب: ${item.reason}';
      dateStr = DateFormat('yyyy/MM/dd HH:mm').format(item.createdAt);
      adminNote = item.adminNote;
      status = item.status;
    } else if (item is ResignationRequest) {
      title = 'طلب استقالة وإخلاء طرف';
      subTitle = 'آخر يوم عمل: ${DateFormat('yyyy/MM/dd').format(item.lastWorkingDay)}\nالسبب: ${item.reason}';
      dateStr = DateFormat('yyyy/MM/dd HH:mm').format(item.createdAt);
      adminNote = item.adminNote;
      status = item.status;
    }

    Color statusColor;
    switch (status) {
      case RequestStatus.approved:
        statusColor = AppColors.primary;
        break;
      case RequestStatus.rejected:
      case RequestStatus.cancelled:
        statusColor = AppColors.danger;
        break;
      case RequestStatus.pending:
        statusColor = AppColors.warning;
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
                  blurRadius: 8,
                  offset: const Offset(0, 3),
                ),
              ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Expanded(
                child: Text(
                  title,
                  style: TextStyle(
                    fontWeight: FontWeight.bold,
                    fontSize: 13.5,
                    color: isDark ? Colors.white : const Color(0xFF0F172A),
                  ),
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: statusColor.withValues(alpha: isDark ? 0.2 : 0.1),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: statusColor.withValues(alpha: 0.4)),
                ),
                child: Text(
                  status.labelAr,
                  style: TextStyle(
                    fontSize: 10.5,
                    fontWeight: FontWeight.bold,
                    color: statusColor,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            subTitle,
            style: TextStyle(
              fontSize: 11.5,
              height: 1.4,
              color: isDark ? Colors.grey.shade300 : const Color(0xFF475569),
            ),
          ),
          if (adminNote != null && adminNote.isNotEmpty) ...[
            const SizedBox(height: 8),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: isDark ? Colors.black.withValues(alpha: 0.25) : const Color(0xFFF8FAFC),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: isDark ? AppColors.darkBorder : const Color(0xFFE2E8F0)),
              ),
              child: Text(
                'ملاحظة الإدارة: $adminNote',
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.bold,
                  color: statusColor,
                ),
              ),
            ),
          ],
          const SizedBox(height: 8),
          Align(
            alignment: Alignment.centerLeft,
            child: Text(
              dateStr,
              style: TextStyle(
                fontSize: 10,
                color: isDark ? Colors.grey.shade500 : const Color(0xFF94A3B8),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
