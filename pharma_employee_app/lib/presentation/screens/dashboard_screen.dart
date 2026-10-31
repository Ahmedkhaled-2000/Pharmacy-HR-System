import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:cached_network_image/cached_network_image.dart';

import '../../core/constants/app_colors.dart';
import '../../core/services/period_cycle_service.dart';
import '../../core/services/app_notification_service.dart';
import '../../core/theme/theme_provider.dart';
import '../../data/models/branch_model.dart';
import '../../data/models/notification_model.dart';
import '../../data/models/user_model.dart';
import '../../data/models/request_models.dart';
import '../../data/repositories/employee_repository.dart';
import '../providers/auth_provider.dart';
import '../providers/requests_provider.dart';
import '../providers/employee_data_provider.dart';
import '../widgets/bento_action_grid.dart';
import '../widgets/hero_clock_in_card.dart';
import '../widgets/horizontal_shift_strip.dart';
import '../widgets/radial_activity_rings.dart';
import '../widgets/navigation/enterprise_drawer.dart';
import '../widgets/navigation/modern_bottom_bar.dart';
import '../widgets/navigation/notification_sheet.dart';
import 'requests/requests_hub_screen.dart';
import 'requests/category_requests_screen.dart';
import 'ledger/salary_ledger_screen.dart';
import 'ledger/attendance_history_screen.dart';
import 'ledger/monthly_roster_screen.dart';
import 'governance/bylaws_screen.dart';
import 'governance/employee_penalties_screen.dart';
import 'governance/evaluations_screen.dart';
import 'governance/branch_directory_screen.dart';
import 'governance/electronic_biometrics_screen.dart';
import 'kiosk/biometric_kiosk_screen.dart';
import 'profile/profile_screen.dart';
import 'settings/app_settings_screen.dart';

class DashboardScreen extends ConsumerStatefulWidget {
  final UserModel user;

  const DashboardScreen({super.key, required this.user});

  @override
  ConsumerState<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends ConsumerState<DashboardScreen> {
  late String _selectedBranchId;
  int _bottomNavIndex = 0;
  String _activeTab = 'dashboard';
  final GlobalKey<ScaffoldState> _scaffoldKey = GlobalKey<ScaffoldState>();

  final List<InAppNotificationModel> _mockNotifications = [
    InAppNotificationModel(
      id: 'n-1',
      title: 'تم اعتماد طلب الإجازة السنوية',
      body: 'وافقت الإدارة على إجازتك لمدة 3 أيام تبدأ من 2 نوفمبر',
      type: NotificationType.approval,
      timestamp: DateTime.now().subtract(const Duration(hours: 2)),
      isRead: false,
      targetTab: 'leaves',
    ),
    InAppNotificationModel(
      id: 'n-2',
      title: 'تنبيه موعد الوردية القادمة',
      body: 'وردية صباحية تبدأ غداً الساعة 08:00 ص في فرع اختبار',
      type: NotificationType.shift,
      timestamp: DateTime.now().subtract(const Duration(hours: 5)),
      isRead: false,
      targetTab: 'roster',
    ),
    InAppNotificationModel(
      id: 'n-3',
      title: 'اعتماد مسير رواتب نوفمبر 2026',
      body: 'تم إصدار كشف الراتب ومسير الأجر الشهري بنجاح',
      type: NotificationType.salary,
      timestamp: DateTime.now().subtract(const Duration(days: 1)),
      isRead: true,
      targetTab: 'salary',
    ),
  ];

  Timer? _elapsedTicker;
  bool _isPunching = false;

  @override
  void initState() {
    super.initState();
    _selectedBranchId = widget.user.isMultiBranch
        ? ''
        : (widget.user.branchId ?? '');
    // عداد زمني حي يتجدد كل ثانية لحساب مدة الوردية الحية بدقة تامة
    _elapsedTicker = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() {});
    });
    // 🔔 طلب إذن إشعارات النظام تلقائياً للموظف (POST_NOTIFICATIONS)
    WidgetsBinding.instance.addPostFrameCallback((_) {
      AppNotificationService.requestNotificationPermission();
    });
  }

  @override
  void dispose() {
    _elapsedTicker?.cancel();
    super.dispose();
  }

  /// حساب الوقت المنقضي للوردية الحية بدقة تامة ومناعة من فروق التوقيت
  String _calculateElapsed(EmployeeDataSnapshot? snapshot) {
    if (snapshot == null || !snapshot.isShiftActive) return '00:00:00';
    final now = DateTime.now();
    int startEpochMs = 0;

    if (snapshot.activeShiftStartEpoch != null) {
      startEpochMs = int.tryParse(snapshot.activeShiftStartEpoch!) ?? 0;
    }

    if (startEpochMs <= 0 && snapshot.activeShiftTimeIn != null) {
      final parts = snapshot.activeShiftTimeIn!.split(':');
      if (parts.length >= 2) {
        final h = int.tryParse(parts[0]) ?? 0;
        final m = int.tryParse(parts[1]) ?? 0;
        final shiftStart = DateTime(now.year, now.month, now.day, h, m);
        startEpochMs = shiftStart.millisecondsSinceEpoch;
      }
    }

    if (startEpochMs <= 0) return '00:00:00';

    final diffSeconds = ((now.millisecondsSinceEpoch - startEpochMs) / 1000)
        .clamp(0, 86400 * 2)
        .toInt();
    final hours = (diffSeconds ~/ 3600).toString().padLeft(2, '0');
    final minutes = ((diffSeconds % 3600) ~/ 60).toString().padLeft(2, '0');
    final seconds = (diffSeconds % 60).toString().padLeft(2, '0');
    return '$hours:$minutes:$seconds';
  }

  Future<void> _handleClockIn() async {
    if (_isPunching) return;
    setState(() => _isPunching = true);

    final branchId = _selectedBranchId.isNotEmpty
        ? _selectedBranchId
        : (widget.user.branchId ??
              (widget.user.branches.isNotEmpty
                  ? widget.user.branches.first.id
                  : 'BR-1'));
    final branchName = widget.user.branches
        .firstWhere(
          (b) => b.id == branchId,
          orElse: () => BranchModel(
            id: branchId,
            name: widget.user.branchName ?? 'الفرع',
          ),
        )
        .name;

    final repo = ref.read(employeeRepositoryProvider);
    final ok = await repo.recordPunch(
      user: widget.user,
      actionType: 'start_shift',
      branchId: branchId,
      branchName: branchName,
    );

    setState(() => _isPunching = false);
    await ref.read(employeeDataProvider.notifier).refresh();

    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            ok
                ? '✅ تم بدء الوردية وتوثيق الحضور بالفرع بنجاح'
                : '⚠️ تم تسجيل الحضور للمزامنة مع الخادم',
          ),
          backgroundColor: AppColors.primary,
        ),
      );
    }
  }

  Future<void> _handleClockOut() async {
    if (_isPunching) return;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text(
          'تأكيد إنهاء الوردية',
          style: TextStyle(fontWeight: FontWeight.bold),
        ),
        content: const Text(
          'هل أنت متأكد من رغبتك في توثيق بصمة الانصراف وإنهاء الوردية الحالية؟',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('إلغاء'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.danger,
              foregroundColor: Colors.white,
            ),
            child: const Text('إنهاء الوردية الآن'),
          ),
        ],
      ),
    );

    if (confirmed != true) return;

    setState(() => _isPunching = true);
    final repo = ref.read(employeeRepositoryProvider);
    final ok = await repo.recordPunch(
      user: widget.user,
      actionType: 'stop_shift',
      branchId: _selectedBranchId.isNotEmpty
          ? _selectedBranchId
          : (widget.user.branchId ?? ''),
    );

    setState(() => _isPunching = false);
    await ref.read(employeeDataProvider.notifier).refresh();

    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            ok
                ? '✅ تم توثيق الانصراف وإنهاء الوردية بنجاح'
                : '⚠️ تم تسجيل الانصراف',
          ),
          backgroundColor: AppColors.danger,
        ),
      );
    }
  }

  Future<void> _handleTakeBreak() async {
    if (_isPunching) return;
    final snap = ref.read(employeeDataProvider).snapshot;
    final isOnBreak = snap?.isOnBreak ?? false;
    final action = isOnBreak ? 'break_end' : 'break_start';

    setState(() => _isPunching = true);
    final repo = ref.read(employeeRepositoryProvider);
    final ok = await repo.recordPunch(
      user: widget.user,
      actionType: action,
      branchId: _selectedBranchId.isNotEmpty
          ? _selectedBranchId
          : (widget.user.branchId ?? ''),
    );

    setState(() => _isPunching = false);
    await ref.read(employeeDataProvider.notifier).refresh();

    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            ok
                ? (isOnBreak
                      ? '☕ تم إنهاء البريك واستئناف العمل'
                      : '☕ تم بدء فترة الاستراحة (البريك)')
                : '⚠️ تم تسجيل طلب الاستراحة',
          ),
          backgroundColor: AppColors.warning,
        ),
      );
    }
  }

  void _showBranchSelector() {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    showModalBottomSheet(
      context: context,
      backgroundColor:
          Theme.of(context).cardTheme.color ??
          (isDark ? AppColors.darkSurface : Colors.white),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (ctx) {
        return Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'تبديل فرع العمل',
                style: TextStyle(
                  fontWeight: FontWeight.bold,
                  fontSize: 16,
                  color: isDark ? Colors.white : const Color(0xFF0F172A),
                ),
              ),
              const SizedBox(height: 12),
              ListTile(
                leading: const Icon(Icons.hub, color: AppColors.primary),
                title: Text(
                  'جميع الفروع (ملخص شامل)',
                  style: TextStyle(
                    fontWeight: FontWeight.bold,
                    fontSize: 13,
                    color: isDark ? Colors.white : const Color(0xFF0F172A),
                  ),
                ),
                trailing: _selectedBranchId == ''
                    ? const Icon(Icons.check_circle, color: AppColors.primary)
                    : null,
                onTap: () {
                  setState(() => _selectedBranchId = '');
                  Navigator.pop(ctx);
                },
              ),
              ...widget.user.branches.map((b) {
                final isSel = _selectedBranchId == b.id;
                return ListTile(
                  leading: const Icon(
                    Icons.storefront,
                    color: AppColors.morningShift,
                  ),
                  title: Text(
                    b.name,
                    style: TextStyle(
                      fontWeight: FontWeight.bold,
                      fontSize: 13,
                      color: isDark ? Colors.white : const Color(0xFF0F172A),
                    ),
                  ),
                  trailing: isSel
                      ? const Icon(Icons.check_circle, color: AppColors.primary)
                      : null,
                  onTap: () {
                    setState(() => _selectedBranchId = b.id);
                    Navigator.pop(ctx);
                  },
                );
              }),
            ],
          ),
        );
      },
    );
  }

  void _showNotificationsSheet() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => NotificationSheet(
        notifications: _mockNotifications,
        onMarkAllRead: () {
          Navigator.pop(context);
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('✅ تم تحديد جميع الإشعارات كمقروءة')),
          );
        },
      ),
    );
  }

  void _handleDrawerTabSelected(String tabId) {
    Navigator.pop(context); // إغلاق الدرج
    setState(() => _activeTab = tabId);

    switch (tabId) {
      case 'dashboard':
        setState(() => _bottomNavIndex = 0);
        break;
      case 'shifts':
        _navigate(const AttendanceHistoryScreen());
        break;
      case 'roster':
        setState(() => _bottomNavIndex = 1);
        break;
      case 'requests':
        setState(() => _bottomNavIndex = 2);
        break;
      case 'leaves':
        _navigate(CategoryRequestsScreen(category: 'leaves'));
        break;
      case 'permissions':
        _navigate(CategoryRequestsScreen(category: 'permissions'));
        break;
      case 'loans':
        _navigate(CategoryRequestsScreen(category: 'loans'));
        break;
      case 'swaps':
        _navigate(CategoryRequestsScreen(category: 'swaps'));
        break;
      case 'shift-adjustment':
        _navigate(CategoryRequestsScreen(category: 'missedPunches'));
        break;
      case 'resignations':
        _navigate(CategoryRequestsScreen(category: 'resignations'));
        break;
      case 'biometric':
        _navigate(const ElectronicBiometricsScreen());
        break;
      case 'kiosk':
        _navigate(const BiometricKioskScreen());
        break;
      case 'salary':
        setState(() => _bottomNavIndex = 3);
        break;
      case 'adjustments':
        _navigate(const SalaryLedgerScreen());
        break;
      case 'penalties':
        _navigate(const EmployeePenaltiesScreen());
        break;
      case 'bylaws':
        _navigate(const BylawsScreen());
        break;
      case 'evaluations':
        _navigate(const EvaluationsScreen());
        break;
      case 'addresses':
        _navigate(const BranchDirectoryScreen());
        break;
      case 'profile':
        setState(() => _bottomNavIndex = 4);
        break;
      case 'settings':
        _navigate(const AppSettingsScreen());
        break;
    }
  }

  void _navigate(Widget screen) {
    Navigator.push(context, MaterialPageRoute(builder: (_) => screen));
  }

  void _handleLogout() async {
    // إغلاق أي شاشات أو نوافذ فرعية والعودة للواجهة الرئيسية، ثم مسح الجلسة بيقين
    Navigator.of(context).popUntil((route) => route.isFirst);
    await ref.read(authProvider.notifier).logout();
  }

  @override
  Widget build(BuildContext context) {
    final themeSettings = ref.watch(themeSettingsProvider);
    final isDark = Theme.of(context).brightness == Brightness.dark;

    // 🔔 المزامنة اللحظية للإشعار الدائم للوردية النشطة بالهاتف
    ref.listen<EmployeeDataState>(employeeDataProvider, (prev, next) {
      final snap = next.snapshot;
      if (snap != null) {
        if (snap.isShiftActive) {
          int startEpochMs = 0;
          if (snap.activeShiftStartEpoch != null) {
            startEpochMs = int.tryParse(snap.activeShiftStartEpoch!) ?? 0;
          }
          final startTime = startEpochMs > 0
              ? DateTime.fromMillisecondsSinceEpoch(startEpochMs)
              : DateTime.now();

          AppNotificationService.showOngoingShiftNotification(
            branchName: snap.activeShiftBranchName ?? widget.user.branchName ?? 'الفرع المعتمد',
            startTime: startTime,
            isOnBreak: snap.isOnBreak,
          );
        } else {
          AppNotificationService.cancelOngoingShiftNotification();
        }
      }
    });

    final activeBranchName = _selectedBranchId.isEmpty
        ? 'جميع الفروع (شامل)'
        : (widget.user.branches
              .firstWhere(
                (b) => b.id == _selectedBranchId,
                orElse: () => BranchModel(id: '', name: 'الفرع'),
              )
              .name);

    return Scaffold(
      key: _scaffoldKey,
      drawer: EnterpriseDrawer(
        user: widget.user,
        activeTab: _activeTab,
        onTabSelected: _handleDrawerTabSelected,
        onLogout: _handleLogout,
      ),
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.menu_rounded, size: 24),
          onPressed: () => _scaffoldKey.currentState?.openDrawer(),
        ),
        title: Row(
          children: [
            Container(
              width: 34,
              height: 34,
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(
                  color: isDark
                      ? AppColors.darkBorder
                      : const Color(0xFFE2E8F0),
                ),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: 0.06),
                    blurRadius: 4,
                  ),
                ],
              ),
              padding: const EdgeInsets.all(2),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(8),
                child: Image.asset(
                  'assets/images/app_logo.png',
                  fit: BoxFit.contain,
                ),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    'نظام إدارة الصيدليات',
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.bold,
                      color: isDark ? Colors.white : const Color(0xFF0F172A),
                    ),
                    overflow: TextOverflow.ellipsis,
                  ),
                  Text(
                    'بوابة الموظف الذكية',
                    style: TextStyle(
                      fontSize: 10,
                      color: isDark
                          ? Colors.grey.shade400
                          : const Color(0xFF64748B),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
        actions: [
          // زر جرس الإشعارات مع نقطة تنبيه حية
          IconButton(
            icon: Stack(
              clipBehavior: Clip.none,
              children: [
                const Icon(Icons.notifications_outlined, size: 22),
                Positioned(
                  top: -2,
                  right: -2,
                  child: Container(
                    width: 8,
                    height: 8,
                    decoration: const BoxDecoration(
                      color: AppColors.danger,
                      shape: BoxShape.circle,
                    ),
                  ),
                ),
              ],
            ),
            onPressed: _showNotificationsSheet,
          ),

          // زر اختيار الفروع للموظفين متعددي الفروع
          if (widget.user.isMultiBranch)
            TextButton.icon(
              onPressed: _showBranchSelector,
              style: TextButton.styleFrom(
                backgroundColor: themeSettings.primaryColor.withValues(
                  alpha: isDark ? 0.15 : 0.1,
                ),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(20),
                ),
              ),
              icon: Icon(
                Icons.location_on,
                size: 13,
                color: themeSettings.primaryColor,
              ),
              label: Text(
                activeBranchName,
                style: TextStyle(
                  fontSize: 10.5,
                  fontWeight: FontWeight.bold,
                  color: themeSettings.primaryColor,
                ),
              ),
            ),
          const SizedBox(width: 8),
        ],
      ),
      bottomNavigationBar: ModernBottomBar(
        currentIndex: _bottomNavIndex,
        onIndexChanged: (idx) => setState(() => _bottomNavIndex = idx),
      ),
      body: _buildCurrentView(),
    );
  }

  Widget _buildCurrentView() {
    switch (_bottomNavIndex) {
      case 0:
        return _buildHomeDashboard();
      case 1:
        return const MonthlyRosterScreen();
      case 2:
        return const RequestsHubScreen();
      case 3:
        return const SalaryLedgerScreen();
      case 4:
        return ProfileScreen(user: widget.user);
      default:
        return _buildHomeDashboard();
    }
  }

  Widget _buildHomeDashboard() {
    final themeSettings = ref.watch(themeSettingsProvider);
    final isDark = Theme.of(context).brightness == Brightness.dark;

    final empState = ref.watch(employeeDataProvider);
    final snapshot = empState.snapshot;

    // 1. حساب ساعات العمل الفعلية المسجلة في الدورة المحاسبية المعتمدة بدقة تامة وبدون تراكم عشوائي
    final activeCycle =
        snapshot?.activePayrollCycle ??
        PeriodCycleService.getCycleDateRange(null, snapshot?.orgSettings);
    double workedHours = 0.0;

    if (snapshot != null) {
      for (final rec in snapshot.attendanceRecords) {
        if (activeCycle.containsDateStr(rec.date)) {
          workedHours += rec.workedHours;
        }
      }
    }

    // 2. رصيد الإجازات الفعلي
    final leaveBalanceDays =
        snapshot?.user.annualLeaveBalance ?? widget.user.annualLeaveBalance;

    // 3. ساعات الأذونات المستهلكة في الدورة المحاسبية الحالية
    double usedPermissionHours = 0.0;
    if (snapshot != null) {
      for (final p in snapshot.permissions) {
        if (activeCycle.containsDate(p.date) &&
            p.status == RequestStatus.approved) {
          usedPermissionHours += p.hours;
        }
      }
    }

    // 4. سلف الأدوية المستهلكة في الشهر الحالي
    double loanBalanceUsed = 0.0;
    if (snapshot != null) {
      for (final l in snapshot.loans) {
        if (l.loanType == LoanType.medicine &&
            (l.status == RequestStatus.approved ||
                l.status == RequestStatus.pending)) {
          loanBalanceUsed += l.amount;
        }
      }
    }

    // 5. الحد الأقصى لسلفة الأدوية
    final loanLimit =
        double.tryParse(
          snapshot?.orgSettings['maxMedicineLoanLimit']?.toString() ?? '1000',
        ) ??
        1000.0;

    return RefreshIndicator(
      color: themeSettings.primaryColor,
      onRefresh: () async {
        await Future.wait([
          ref.read(employeeDataProvider.notifier).loadAllData(),
          ref.read(requestsProvider.notifier).loadServerRequests(),
        ]);
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text(
                '🔄 تم تحديث ومزامنة بيانات الموظف والطلبات من السيرفر بنجاح',
              ),
            ),
          );
        }
      },
      child: SingleChildScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // 🪪 بطاقة هوية الموظف (مطابقة تماماً للصورة 2)
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: [
                    themeSettings.primaryColor.withValues(
                      alpha: isDark ? 0.2 : 0.12,
                    ),
                    AppColors.accentCyan.withValues(
                      alpha: isDark ? 0.08 : 0.05,
                    ),
                  ],
                  begin: Alignment.topRight,
                  end: Alignment.bottomLeft,
                ),
                borderRadius: BorderRadius.circular(20),
                border: Border.all(
                  color: isDark
                      ? themeSettings.primaryColor.withValues(alpha: 0.3)
                      : const Color(0xFFE2E8F0),
                  width: 1.2,
                ),
                boxShadow: isDark
                    ? null
                    : [
                        BoxShadow(
                          color: const Color(0xFF0F172A)
                              .withValues(alpha: 0.03),
                          blurRadius: 10,
                          offset: const Offset(0, 4),
                        ),
                      ],
              ),
              child: Row(
                children: [
                  Container(
                    width: 54,
                    height: 54,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      border: Border.all(
                        color: themeSettings.primaryColor,
                        width: 2,
                      ),
                      boxShadow: [
                        BoxShadow(
                          color: themeSettings.primaryColor.withValues(
                            alpha: 0.25,
                          ),
                          blurRadius: 8,
                          offset: const Offset(0, 3),
                        ),
                      ],
                    ),
                    child: ClipOval(
                      child:
                          ((snapshot?.user.fullPhotoUrl ?? widget.user.fullPhotoUrl) !=
                                  null &&
                              (snapshot?.user.fullPhotoUrl ?? widget.user.fullPhotoUrl)!
                                  .isNotEmpty)
                          ? CachedNetworkImage(
                              imageUrl:
                                  (snapshot?.user.fullPhotoUrl ??
                                  widget.user.fullPhotoUrl)!,
                              fit: BoxFit.cover,
                              placeholder: (_, __) => CircleAvatar(
                                backgroundColor: themeSettings.primaryColor,
                                child: Text(
                                  (snapshot?.user.name ?? widget.user.name)
                                          .isNotEmpty
                                      ? (snapshot?.user.name ??
                                            widget.user.name)[0]
                                      : 'أ',
                                  style: const TextStyle(
                                    color: Colors.white,
                                    fontSize: 18,
                                    fontWeight: FontWeight.bold,
                                  ),
                                ),
                              ),
                              errorWidget: (_, __, ___) => CircleAvatar(
                                backgroundColor: themeSettings.primaryColor,
                                child: Text(
                                  (snapshot?.user.name ?? widget.user.name)
                                          .isNotEmpty
                                      ? (snapshot?.user.name ??
                                            widget.user.name)[0]
                                      : 'أ',
                                  style: const TextStyle(
                                    color: Colors.white,
                                    fontSize: 18,
                                    fontWeight: FontWeight.bold,
                                  ),
                                ),
                              ),
                            )
                          : CircleAvatar(
                              backgroundColor: themeSettings.primaryColor,
                              child: Text(
                                (snapshot?.user.name ?? widget.user.name)
                                        .isNotEmpty
                                    ? (snapshot?.user.name ??
                                          widget.user.name)[0]
                                    : 'أ',
                                style: const TextStyle(
                                  color: Colors.white,
                                  fontSize: 18,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                            ),
                    ),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          snapshot?.user.name ?? widget.user.name,
                          style: TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.bold,
                            color: isDark
                                ? Colors.white
                                : const Color(0xFF0F172A),
                          ),
                        ),
                        const SizedBox(height: 4),
                        Row(
                          children: [
                            Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 8,
                                vertical: 3,
                              ),
                              decoration: BoxDecoration(
                                color: isDark
                                    ? Colors.black.withValues(alpha: 0.25)
                                    : const Color(0xFFF1F5F9),
                                borderRadius: BorderRadius.circular(6),
                                border: Border.all(
                                  color: isDark
                                      ? Colors.transparent
                                      : const Color(0xFFE2E8F0),
                                ),
                              ),
                              child: Text(
                                '${widget.user.jobTitle} | كود: ${widget.user.code}',
                                style: TextStyle(
                                  fontSize: 11,
                                  fontWeight: FontWeight.bold,
                                  color: isDark
                                      ? Colors.white70
                                      : const Color(0xFF334155),
                                ),
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                  // شارة رصيد الإجازات من الصورة 2
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 6,
                    ),
                    decoration: BoxDecoration(
                      color: AppColors.primaryDark,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Column(
                      children: [
                        const Text(
                          'رصيد الإجازات',
                          style: TextStyle(fontSize: 9, color: Colors.white70),
                        ),
                        Text(
                          '$leaveBalanceDays يوم',
                          style: const TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.bold,
                            color: Colors.white,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),

            const SizedBox(height: 16),

            // ⏱️ بطاقة البصمة الحية للموظف وحاجز تقييد البصمة
            HeroClockInCard(
              isShiftActive: snapshot?.isShiftActive ?? false,
              isOnBreak: snapshot?.isOnBreak ?? false,
              activeElapsedStr: _calculateElapsed(snapshot),
              permissions: widget.user.permissions,
              isMultiBranch: widget.user.isMultiBranch,
              activeBranches: widget.user.branches,
              selectedBranchId: _selectedBranchId,
              onBranchChanged: (bId) => setState(() => _selectedBranchId = bId),
              onClockIn: _handleClockIn,
              onClockOut: _handleClockOut,
              onTakeBreak: _handleTakeBreak,
              onOpenBiometrics: () =>
                  _navigate(const ElectronicBiometricsScreen()),
            ),

            const SizedBox(height: 16),

            // 🏛️ شارة الدورة الشهرية المعتمدة رسمياً من الإدارة العليا
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
              decoration: BoxDecoration(
                color: isDark
                    ? const Color(0xFF1E293B)
                    : const Color(0xFFF1F5F9),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                  color: AppColors.primary.withValues(alpha: 0.25),
                ),
              ),
              child: Row(
                children: [
                  const Icon(
                    Icons.verified_rounded,
                    size: 16,
                    color: AppColors.primary,
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'الدورة المعتمدة من الإدارة: ${activeCycle.label}',
                      style: const TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.bold,
                        color: AppColors.primary,
                      ),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ],
              ),
            ),

            const SizedBox(height: 12),

            // 🎯 حلقات الأنشطة والمؤشرات الحيوية الشهرية الحقيقية
            RadialActivityRings(
              workedHours: workedHours,
              targetHours: 180.0,
              leaveBalanceDays: leaveBalanceDays,
              usedPermissionHours: usedPermissionHours,
              loanBalanceUsed: loanBalanceUsed,
              loanLimit: loanLimit,
            ),

            const SizedBox(height: 16),

            // 📅 شريط الورديات الأسبوعي التفاعلي
            const HorizontalShiftStrip(),

            const SizedBox(height: 16),

            // ⚡ شبكة الخدمات والطلبات السريعة (Bento Grid)
            BentoActionGrid(
              permissions: widget.user.permissions,
              onApplyLeave: () =>
                  _navigate(CategoryRequestsScreen(category: 'leaves')),
              onApplySwap: () =>
                  _navigate(CategoryRequestsScreen(category: 'swaps')),
              onApplyLoan: () =>
                  _navigate(CategoryRequestsScreen(category: 'loans')),
              onMissedPunch: () =>
                  _navigate(CategoryRequestsScreen(category: 'missedPunches')),
              onViewSalary: () => setState(() => _bottomNavIndex = 3),
              onViewBylaws: () => _navigate(const BylawsScreen()),
            ),

            const SizedBox(height: 30),
          ],
        ),
      ),
    );
  }
}
