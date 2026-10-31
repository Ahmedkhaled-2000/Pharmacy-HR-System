import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/constants/app_colors.dart';
import '../../providers/employee_data_provider.dart';
import 'employee_penalties_screen.dart';

class BylawsScreen extends ConsumerStatefulWidget {
  const BylawsScreen({super.key});

  @override
  ConsumerState<BylawsScreen> createState() => _BylawsScreenState();
}

class _BylawsScreenState extends ConsumerState<BylawsScreen> {
  String _searchQuery = '';
  String _activeTab = 'structured'; // 'structured' or 'text'

  // اللائحة النموذجية المعتمدة في حالة عدم وجود تعديلات خاصة من الإدارة
  static const List<Map<String, dynamic>> _defaultSections = [
    {
      'title': '📜 مقدمة اللائحة التنظيمية للعمل داخل الفروع',
      'category': 'عام',
      'points': [
        'حرصاً من إدارة الصيدلية على تنظيم العمل، وضمان أعلى درجات الانضباط، وحماية حقوق الصيدلية وكافة العاملين بها، تم اعتماد هذه اللائحة التنظيمية الرسمية.',
        'تُعتبر هذه اللائحة جزءاً لا يتجزأ ومتمماً لعقد العمل الفردي المبرم مع الموظف، وتسري وتُلزم كافة العاملين بجميع فروع الصيدلية.',
      ],
    },
    {
      'title': 'أولاً: الانضباط العام ومواعيد الحضور والورديات',
      'category': 'دوام وبصمة',
      'points': [
        'الالتزام التام بمواعيد الشيفت المحددة والحضور قبل الموعد بـ (10) دقائق لإتمام الاستلام والتسليم المنضبط.',
        'تسجيل الحضور والانصراف بدقة عبر منظومة البصمة الإلكترونية المعتمدة داخل النطاق الجغرافي للفرع.',
        '❌ يمنع منعاً باتاً مغادرة مكان العمل أو ترك الفرع أثناء الشيفت بدون إذن مسبق وموثق من المشرف أو مدير الفرع.',
        'أي تأخير عن الموعد المحدد أو غياب بدون إذن رسمي مسبق يُعد مخالفة إدارية تستوجب تطبيق الجزاء المالي اللائحي.',
      ],
    },
    {
      'title': 'ثانياً: احترام التسلسل الإداري والتنظيمي',
      'category': 'إداري',
      'points': [
        'أي شكوى أو طلب أو اعتراض يتم تقديمه رسمياً لمدير الفرع المباشر أولاً للبت فيه والتوجيه بشأنه.',
        '❌ يمنع تجاوز التسلسل الإداري أو إثارة أي شكاوى أو خلافات أمام الزملاء أو المترددين على الصيدلية.',
        'أي تواصل مباشر مع الإدارة العليا دون المرور على مدير الفرع يُعد إجراءً غير معترف به ومخالفة إدارية.',
      ],
    },
    {
      'title': 'ثالثاً: الالتزام بتعليمات مدير الفرع والمشرفين',
      'category': 'تشغيل',
      'points': [
        'تعليمات مدير الفرع أو مشرف الشيفت واجبة التنفيذ الفوري أثناء العمل بما يخدم مصلحة وانتظام الصيدلية.',
        'أي ملاحظات أو استفسارات مهنية يتم مناقشتها بالأسلوب الإداري اللائق في الأوقات المخصصة وبعد انتهاء خدمة العملاء.',
        '❌ يمنع الجدال أو الاعتراض العلني أثناء أوقات العمل أو أثناء التواجد في منطقة خدمة العملاء.',
      ],
    },
    {
      'title': 'رابعاً: السلوك المهني والمظهر اللائق داخل الفرع',
      'category': 'سلوك مهني',
      'points': [
        'الالتزام بالسلوك المهني الرفيع والأخلاقيات الصيدلانية في جميع الأوقات داخل الصيدلية ومحيطها.',
        'التحدث مع الزملاء والعملاء بأسلوب محترم ولبق ومهذب وهادئ يعكس الصورة المشرفة للمؤسسة.',
        '❌ يمنع العصبية، أو رفع الصوت، أو المزاح غير اللائق، أو التلفظ بما يخالف الآداب العامة وقيم المهنة.',
      ],
    },
    {
      'title': 'خامساً: خدمة العملاء والرعاية الدوائية للمرضى',
      'category': 'خدمة عملاء',
      'points': [
        'العميل والمريض المتواجد بالصيدلية له الأولوية القصوى والمطلقة في الرعاية وحسن الاستقبال وسرعة الخدمة.',
        'تقديم المشورة والنصح الدوائي والتوضيحات العلاجية بدقة وأمانة علمية ومهنية متكاملة.',
        '❌ يمنع الانشغال بالهاتف أو ترك العميل ينتظر لأي سبب شخصي أو غير متعلق بمهام العمل.',
      ],
    },
    {
      'title': 'سادساً: العهدة المالية والخزينة ومبيعات الكاشير',
      'category': 'مالي ونقدية',
      'points': [
        'المحافظة الدقيقة على العهدة النقدية ومطابقة إيراد الوردية وجرد الكاشير عند نهاية كل شيفت بدقة متناهية.',
        'تسليم العهدة وفواتير البيع والأجل لمسؤول الشيفت اللاحق أو مدير الفرع بموجب إيصال إلكتروني معتمد.',
        '❌ أي عجز غير مبرر في الخزينة أو العهدة الدوائية يتحمله المتسبب ويحال للتحقيق الإداري الفوري.',
      ],
    },
    {
      'title': 'سابعاً: ضوابط سلف الأدوية ومشتريات العاملين بالأجل',
      'category': 'سلف وأجل',
      'points': [
        'يحق للموظف التقدم بطلب مشتريات علاجية أو سلفة مالية وفق المحددات والشروط المعتمدة من الإدارة.',
        'يتم استقطاع أقساط السلف دورياً من مسير الرواتب الشهري وبما لا يتجاوز النسب النظامية المسموح بها.',
        'تجاوز الحد الائتماني دون موافقة الإدارة المالية يستوجب إيقاف السلفة لحين التسوية.',
      ],
    },
  ];

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final snapshot = ref.watch(employeeDataProvider).snapshot;

    // استخراج الأقسام من السيرفر أو استخدام اللائحة الافتراضية
    List<Map<String, dynamic>> rawSections = [];
    if (snapshot != null && snapshot.bylawsSections.isNotEmpty) {
      rawSections = snapshot.bylawsSections;
    } else {
      rawSections = _defaultSections;
    }

    final bylawsText = snapshot?.bylawsText ?? '';

    // تصفية الأقسام حسب البحث
    final filteredSections = rawSections.where((sec) {
      if (_searchQuery.trim().isEmpty) return true;
      final title = sec['title']?.toString() ?? '';
      final points = (sec['points'] as List<dynamic>? ?? []).map((e) => e.toString()).join(' ');
      return title.contains(_searchQuery) || points.contains(_searchQuery);
    }).toList();

    return Scaffold(
      backgroundColor: isDark ? AppColors.darkBackground : const Color(0xFFF8FAFC),
      appBar: AppBar(
        title: Text(
          'لائحة العمل وجدول الجزاءات',
          style: TextStyle(
            fontWeight: FontWeight.bold,
            fontSize: 16,
            color: isDark ? Colors.white : const Color(0xFF0F172A),
          ),
        ),
        actions: [
          IconButton(
            tooltip: 'سجل جزاءاتي',
            icon: const Icon(Icons.gavel_rounded, color: AppColors.primary),
            onPressed: () {
              Navigator.push(context, MaterialPageRoute(builder: (_) => const EmployeePenaltiesScreen()));
            },
          ),
        ],
      ),
      body: Column(
        children: [
          // شريط البحث والتبديل
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
            color: isDark ? AppColors.darkSurface : Colors.white,
            child: Column(
              children: [
                TextField(
                  onChanged: (val) => setState(() => _searchQuery = val),
                  decoration: InputDecoration(
                    hintText: 'ابحث في مواد وبنود اللائحة...',
                    hintStyle: const TextStyle(fontSize: 12),
                    prefixIcon: const Icon(Icons.search, size: 18),
                    filled: true,
                    fillColor: isDark ? Colors.black.withValues(alpha: 0.25) : const Color(0xFFF1F5F9),
                    contentPadding: const EdgeInsets.symmetric(vertical: 8, horizontal: 12),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: BorderSide.none,
                    ),
                  ),
                ),
                if (bylawsText.trim().isNotEmpty) ...[
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      Expanded(
                        child: SegmentedButton<String>(
                          segments: const [
                            ButtonSegment(value: 'structured', label: Text('البنود الهيكلية', style: TextStyle(fontSize: 11))),
                            ButtonSegment(value: 'text', label: Text('النص الكامل للائحة', style: TextStyle(fontSize: 11))),
                          ],
                          selected: {_activeTab},
                          onSelectionChanged: (val) {
                            setState(() => _activeTab = val.first);
                          },
                        ),
                      ),
                    ],
                  ),
                ],
              ],
            ),
          ),

          Expanded(
            child: _activeTab == 'text' && bylawsText.trim().isNotEmpty
                ? SingleChildScrollView(
                    padding: const EdgeInsets.all(16),
                    child: Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: isDark ? AppColors.darkSurface : Colors.white,
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(color: isDark ? AppColors.darkBorder : const Color(0xFFE2E8F0)),
                      ),
                      child: SelectableText(
                        bylawsText,
                        style: TextStyle(
                          fontSize: 13,
                          height: 1.6,
                          color: isDark ? Colors.white70 : const Color(0xFF1E293B),
                        ),
                      ),
                    ),
                  )
                : ListView.separated(
                    padding: const EdgeInsets.all(16),
                    itemCount: filteredSections.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 14),
                    itemBuilder: (context, index) {
                      final sec = filteredSections[index];
                      final title = sec['title']?.toString() ?? 'مادة';
                      final category = sec['category']?.toString() ?? 'تنظيمي';
                      final points = (sec['points'] as List<dynamic>? ?? []).map((e) => e.toString()).toList();
                      final penaltyTiers = (sec['penaltyTiers'] as List<dynamic>? ?? []).map((e) => e.toString()).toList();

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
                                Row(
                                  children: [
                                    const Icon(Icons.menu_book_rounded, color: AppColors.primary, size: 20),
                                    const SizedBox(width: 8),
                                    Container(
                                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                      decoration: BoxDecoration(
                                        color: AppColors.primary.withValues(alpha: 0.1),
                                        borderRadius: BorderRadius.circular(6),
                                      ),
                                      child: Text(
                                        category,
                                        style: const TextStyle(
                                          color: AppColors.primary,
                                          fontWeight: FontWeight.bold,
                                          fontSize: 11,
                                        ),
                                      ),
                                    ),
                                  ],
                                ),
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                  decoration: BoxDecoration(
                                    color: const Color(0xFFF1F5F9),
                                    borderRadius: BorderRadius.circular(4),
                                  ),
                                  child: Text(
                                    'بند #${index + 1}',
                                    style: const TextStyle(fontSize: 10, color: Color(0xFF64748B)),
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 10),
                            Text(
                              title,
                              style: TextStyle(
                                fontWeight: FontWeight.bold,
                                fontSize: 13.5,
                                color: isDark ? Colors.white : const Color(0xFF0F172A),
                              ),
                            ),
                            const SizedBox(height: 8),
                            ...points.map((p) => Padding(
                                  padding: const EdgeInsets.only(bottom: 6),
                                  child: Row(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      const Padding(
                                        padding: EdgeInsets.only(top: 4, left: 6),
                                        child: Icon(Icons.fiber_manual_record, size: 7, color: AppColors.primary),
                                      ),
                                      Expanded(
                                        child: Text(
                                          p,
                                          style: TextStyle(
                                            fontSize: 12,
                                            height: 1.45,
                                            color: isDark ? Colors.grey.shade300 : const Color(0xFF334155),
                                          ),
                                        ),
                                      ),
                                    ],
                                  ),
                                )),
                            if (penaltyTiers.isNotEmpty) ...[
                              const SizedBox(height: 10),
                              Container(
                                padding: const EdgeInsets.all(10),
                                decoration: BoxDecoration(
                                  color: isDark ? Colors.black.withValues(alpha: 0.25) : const Color(0xFFFFFBEB),
                                  borderRadius: BorderRadius.circular(10),
                                  border: Border.all(
                                    color: const Color(0xFFFDE68A),
                                  ),
                                ),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    const Text(
                                      'تدرج الجزاءات المعتمد:',
                                      style: TextStyle(fontWeight: FontWeight.bold, fontSize: 11, color: AppColors.warning),
                                    ),
                                    const SizedBox(height: 4),
                                    ...penaltyTiers.map((p) => Text(
                                          '• $p',
                                          style: TextStyle(
                                            fontSize: 10.5,
                                            color: isDark ? Colors.grey : const Color(0xFF475569),
                                          ),
                                        )),
                                  ],
                                ),
                              ),
                            ],
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
}
