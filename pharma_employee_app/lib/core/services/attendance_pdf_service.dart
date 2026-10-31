import 'dart:io';
import 'dart:typed_data';

import 'package:intl/intl.dart';
import 'package:path_provider/path_provider.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';

import '../../data/models/attendance_model.dart';
import '../../data/models/salary_slip_model.dart';
import '../../data/models/user_model.dart';
import 'app_notification_service.dart';

class AttendancePdfService {
  /// توليد مستند PDF رسمي لكشف البصمة ومسير الراتب مع دعم كامل للغة العربية (RTL)
  static Future<Uint8List> generateAttendancePdf({
    required UserModel user,
    required List<AttendanceRecord> records,
    required SalarySlipModel salarySlip,
    required String month,
  }) async {
    final pdf = pw.Document();

    // تحميل خط القاهرة العربي المعتمد رسمياً للطباعة الاحترافية
    final cairoRegular = await PdfGoogleFonts.cairoRegular();
    final cairoBold = await PdfGoogleFonts.cairoBold();

    final nowStr = DateFormat('yyyy-MM-dd HH:mm').format(DateTime.now());

    pdf.addPage(
      pw.MultiPage(
        pageFormat: PdfPageFormat.a4,
        margin: const pw.EdgeInsets.all(28),
        theme: pw.ThemeData.withFont(base: cairoRegular, bold: cairoBold),
        build: (pw.Context context) {
          return [
            pw.Directionality(
              textDirection: pw.TextDirection.rtl,
              child: pw.Column(
                crossAxisAlignment: pw.CrossAxisAlignment.start,
                children: [
                  // 1. ترويسة الصيدلية الرسمية
                  pw.Container(
                    padding: const pw.EdgeInsets.only(bottom: 12),
                    decoration: const pw.BoxDecoration(
                      border: pw.Border(
                        bottom: pw.BorderSide(color: PdfColors.teal, width: 2),
                      ),
                    ),
                    child: pw.Row(
                      mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
                      crossAxisAlignment: pw.CrossAxisAlignment.center,
                      children: [
                        pw.Column(
                          crossAxisAlignment: pw.CrossAxisAlignment.start,
                          children: [
                            pw.Text(
                              'مجموعة إدارة الصيدليات الموحدة',
                              style: pw.TextStyle(
                                fontSize: 16,
                                fontWeight: pw.FontWeight.bold,
                                color: PdfColors.teal900,
                              ),
                            ),
                            pw.SizedBox(height: 3),
                            pw.Text(
                              'نظام الموارد البشرية والرقابة البيومترية الذكية',
                              style: const pw.TextStyle(
                                fontSize: 10,
                                color: PdfColors.grey700,
                              ),
                            ),
                          ],
                        ),
                        pw.Column(
                          crossAxisAlignment: pw.CrossAxisAlignment.end,
                          children: [
                            pw.Container(
                              padding: const pw.EdgeInsets.symmetric(
                                horizontal: 10,
                                vertical: 4,
                              ),
                              decoration: pw.BoxDecoration(
                                color: PdfColors.teal50,
                                borderRadius: const pw.BorderRadius.all(
                                  pw.Radius.circular(6),
                                ),
                                border: pw.Border.all(color: PdfColors.teal300),
                              ),
                              child: pw.Text(
                                'كشف بصمة وراتب معتمد',
                                style: pw.TextStyle(
                                  fontSize: 10,
                                  fontWeight: pw.FontWeight.bold,
                                  color: PdfColors.teal900,
                                ),
                              ),
                            ),
                            pw.SizedBox(height: 4),
                            pw.Text(
                              'تاريخ الإصدار: $nowStr',
                              style: const pw.TextStyle(
                                fontSize: 8,
                                color: PdfColors.grey600,
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),

                  pw.SizedBox(height: 14),

                  // 2. بطاقة معلومات الموظف وفترة الكشف
                  pw.Container(
                    padding: const pw.EdgeInsets.all(10),
                    decoration: pw.BoxDecoration(
                      color: PdfColors.grey100,
                      borderRadius: const pw.BorderRadius.all(
                        pw.Radius.circular(8),
                      ),
                      border: pw.Border.all(color: PdfColors.grey300),
                    ),
                    child: pw.Row(
                      mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
                      children: [
                        pw.Column(
                          crossAxisAlignment: pw.CrossAxisAlignment.start,
                          children: [
                            pw.Text(
                              'اسم الموظف: ${user.name}',
                              style: pw.TextStyle(
                                fontSize: 12,
                                fontWeight: pw.FontWeight.bold,
                              ),
                            ),
                            pw.SizedBox(height: 3),
                            pw.Text(
                              'الوظيفة: ${user.jobTitle}  |  كود الموظف: ${user.code}',
                              style: const pw.TextStyle(
                                fontSize: 10,
                                color: PdfColors.grey800,
                              ),
                            ),
                          ],
                        ),
                        pw.Column(
                          crossAxisAlignment: pw.CrossAxisAlignment.end,
                          children: [
                            pw.Text(
                              month.contains('دورة')
                                  ? month
                                  : 'دورة كشف الراتب: شهر $month',
                              style: pw.TextStyle(
                                fontSize: 10,
                                fontWeight: pw.FontWeight.bold,
                                color: PdfColors.teal800,
                              ),
                            ),
                            pw.SizedBox(height: 3),
                            pw.Text(
                              'الفرع الأساسي: ${user.branchName ?? "الفرع الرئيسي"}',
                              style: const pw.TextStyle(
                                fontSize: 10,
                                color: PdfColors.grey800,
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),

                  pw.SizedBox(height: 14),

                  // 3. ملخص الإحصائيات والأرقام المعتمدة
                  pw.Row(
                    children: [
                      _buildPdfMetricTile(
                        'إجمالي ساعات العمل',
                        '${salarySlip.workedHours.toStringAsFixed(1)} س',
                        PdfColors.teal700,
                      ),
                      pw.SizedBox(width: 8),
                      _buildPdfMetricTile(
                        'الورديات المسجلة',
                        '${records.length} وردية',
                        PdfColors.blue700,
                      ),
                      pw.SizedBox(width: 8),
                      _buildPdfMetricTile(
                        'سعر الساعة الفعلي',
                        '${salarySlip.hourlyRate.toStringAsFixed(2)} ج.م',
                        PdfColors.indigo700,
                      ),
                      pw.SizedBox(width: 8),
                      _buildPdfMetricTile(
                        'صافي الصرف المستحق',
                        '${salarySlip.netSalary.toStringAsFixed(2)} ج.م',
                        PdfColors.teal900,
                      ),
                    ],
                  ),

                  pw.SizedBox(height: 16),

                  // 4. جدول سجلات البصمات الشهرية الفعلية
                  pw.Text(
                    'سجل البصمات وحركات الحضور والانصراف التفصيلية (شهر $month):',
                    style: pw.TextStyle(
                      fontSize: 11,
                      fontWeight: pw.FontWeight.bold,
                      color: PdfColors.grey900,
                    ),
                  ),
                  pw.SizedBox(height: 6),

                  records.isEmpty
                      ? pw.Container(
                          padding: const pw.EdgeInsets.all(12),
                          decoration: pw.BoxDecoration(
                            border: pw.Border.all(color: PdfColors.grey300),
                            borderRadius: const pw.BorderRadius.all(
                              pw.Radius.circular(6),
                            ),
                          ),
                          child: pw.Center(
                            child: pw.Text(
                              'لا توجد سجلات بصمات مدخلة خلال هذا الشهر',
                              style: const pw.TextStyle(
                                fontSize: 10,
                                color: PdfColors.grey600,
                              ),
                            ),
                          ),
                        )
                      : pw.Table(
                          border: pw.TableBorder.all(
                            color: PdfColors.grey300,
                            width: 0.8,
                          ),
                          columnWidths: const {
                            0: pw.FlexColumnWidth(2.0), // تاريخ
                            1: pw.FlexColumnWidth(1.6), // حضور
                            2: pw.FlexColumnWidth(1.6), // انصراف
                            3: pw.FlexColumnWidth(1.5), // ساعات
                            4: pw.FlexColumnWidth(2.5), // الفرع
                            5: pw.FlexColumnWidth(1.6), // الحالة
                          },
                          children: [
                            pw.TableRow(
                              decoration: const pw.BoxDecoration(
                                color: PdfColors.grey200,
                              ),
                              children: [
                                _tableHeaderCell('التاريخ'),
                                _tableHeaderCell('وقت الحضور'),
                                _tableHeaderCell('وقت الانصراف'),
                                _tableHeaderCell('ساعات العمل'),
                                _tableHeaderCell('الفرع'),
                                _tableHeaderCell('الحالة'),
                              ],
                            ),
                            ...records.map((r) {
                              return pw.TableRow(
                                children: [
                                  _tableBodyCell(r.date),
                                  _tableBodyCell(r.checkIn),
                                  _tableBodyCell(
                                    r.checkOut.isNotEmpty ? r.checkOut : '—',
                                  ),
                                  _tableBodyCell(
                                    '${r.workedHours.toStringAsFixed(1)} س',
                                  ),
                                  _tableBodyCell(r.branchName),
                                  _tableBodyCell(
                                    r.status == AttendanceStatus.present
                                        ? 'منتظم'
                                        : (r.status == AttendanceStatus.late
                                              ? 'تأخير'
                                              : 'مكتمل'),
                                  ),
                                ],
                              );
                            }),
                          ],
                        ),

                  pw.SizedBox(height: 16),

                  // 5. جدول الحسابات المالية والرواتب
                  pw.Text(
                    'مسير الحسابات المالية والاستقطاعات المعتمد:',
                    style: pw.TextStyle(
                      fontSize: 11,
                      fontWeight: pw.FontWeight.bold,
                      color: PdfColors.grey900,
                    ),
                  ),
                  pw.SizedBox(height: 6),

                  pw.Table(
                    border: pw.TableBorder.all(
                      color: PdfColors.grey300,
                      width: 0.8,
                    ),
                    children: [
                      pw.TableRow(
                        decoration: const pw.BoxDecoration(
                          color: PdfColors.grey200,
                        ),
                        children: [
                          _tableHeaderCell('بند الاستحقاق المالي'),
                          _tableHeaderCell('القيمة بالجنيه المصري (EGP)'),
                        ],
                      ),
                      pw.TableRow(
                        children: [
                          _tableBodyCell(
                            'أجر ساعات العمل الفعلية (${salarySlip.workedHours.toStringAsFixed(1)} ساعة × ${salarySlip.hourlyRate.toStringAsFixed(2)} ج.م)',
                          ),
                          _tableBodyCell(
                            '+${(salarySlip.workedHours * salarySlip.hourlyRate).toStringAsFixed(2)} ج.م',
                            isBold: true,
                            color: PdfColors.teal800,
                          ),
                        ],
                      ),
                      if (salarySlip.bonuses > 0)
                        pw.TableRow(
                          children: [
                            _tableBodyCell('مكافآت وحوافز التميز الإداري'),
                            _tableBodyCell(
                              '+${salarySlip.bonuses.toStringAsFixed(2)} ج.م',
                              isBold: true,
                              color: PdfColors.teal800,
                            ),
                          ],
                        ),
                      if (salarySlip.advances > 0)
                        pw.TableRow(
                          children: [
                            _tableBodyCell(
                              'استقطاعات أقساط السلف ومشتريات الأدوية',
                            ),
                            _tableBodyCell(
                              '-${salarySlip.advances.toStringAsFixed(2)} ج.م',
                              isBold: true,
                              color: PdfColors.red800,
                            ),
                          ],
                        ),
                      if (salarySlip.penalties > 0)
                        pw.TableRow(
                          children: [
                            _tableBodyCell(
                              'جزاءات وخصومات التأخير والمخالفات المعتمدة',
                            ),
                            _tableBodyCell(
                              '-${salarySlip.penalties.toStringAsFixed(2)} ج.م',
                              isBold: true,
                              color: PdfColors.red800,
                            ),
                          ],
                        ),
                      pw.TableRow(
                        decoration: const pw.BoxDecoration(
                          color: PdfColors.teal50,
                        ),
                        children: [
                          pw.Padding(
                            padding: const pw.EdgeInsets.all(6),
                            child: pw.Text(
                              'صافي الأجر النهائي المستحق للصرف:',
                              style: pw.TextStyle(
                                fontSize: 10,
                                fontWeight: pw.FontWeight.bold,
                                color: PdfColors.teal900,
                              ),
                            ),
                          ),
                          pw.Padding(
                            padding: const pw.EdgeInsets.all(6),
                            child: pw.Text(
                              '${salarySlip.netSalary.toStringAsFixed(2)} ج.م',
                              style: pw.TextStyle(
                                fontSize: 11,
                                fontWeight: pw.FontWeight.bold,
                                color: PdfColors.teal900,
                              ),
                              textAlign: pw.TextAlign.center,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),

                  pw.SizedBox(height: 24),

                  // 6. صندوق التوقيعات والاعتماد الرسمي
                  pw.Row(
                    mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
                    children: [
                      pw.Column(
                        children: [
                          pw.Text(
                            'توقيع الموظف بالاستلام',
                            style: pw.TextStyle(
                              fontSize: 9,
                              fontWeight: pw.FontWeight.bold,
                            ),
                          ),
                          pw.SizedBox(height: 25),
                          pw.Text(
                            '....................................',
                            style: const pw.TextStyle(
                              fontSize: 8,
                              color: PdfColors.grey500,
                            ),
                          ),
                        ],
                      ),
                      pw.Column(
                        children: [
                          pw.Text(
                            'المراجعة المالية والتدقيق',
                            style: pw.TextStyle(
                              fontSize: 9,
                              fontWeight: pw.FontWeight.bold,
                            ),
                          ),
                          pw.SizedBox(height: 25),
                          pw.Text(
                            '....................................',
                            style: const pw.TextStyle(
                              fontSize: 8,
                              color: PdfColors.grey500,
                            ),
                          ),
                        ],
                      ),
                      pw.Column(
                        children: [
                          pw.Text(
                            'اعتماد الشؤون الإدارية والموارد البشرية',
                            style: pw.TextStyle(
                              fontSize: 9,
                              fontWeight: pw.FontWeight.bold,
                            ),
                          ),
                          pw.SizedBox(height: 25),
                          pw.Text(
                            'معتمد إلكترونياً بالنظام ✅',
                            style: pw.TextStyle(
                              fontSize: 8,
                              fontWeight: pw.FontWeight.bold,
                              color: PdfColors.teal700,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ];
        },
      ),
    );

    return pdf.save();
  }

  /// فتح شاشة المعاينة والطباعة المباشرة عبر معالج أندرويد للطباعة وحفظ PDF
  static Future<void> printOrExportPdf({
    required UserModel user,
    required List<AttendanceRecord> records,
    required SalarySlipModel salarySlip,
    required String month,
  }) async {
    final pdfBytes = await generateAttendancePdf(
      user: user,
      records: records,
      salarySlip: salarySlip,
      month: month,
    );

    await Printing.layoutPdf(
      onLayout: (PdfPageFormat format) async => pdfBytes,
      name: 'كشف_بصمة_${user.code}_$month.pdf',
    );
  }

  /// مشاركة ملف الـ PDF كملف مستند عبر الواتساب أو التطبيقات الأخرى
  static Future<void> sharePdf({
    required UserModel user,
    required List<AttendanceRecord> records,
    required SalarySlipModel salarySlip,
    required String month,
  }) async {
    final pdfBytes = await generateAttendancePdf(
      user: user,
      records: records,
      salarySlip: salarySlip,
      month: month,
    );

    await Printing.sharePdf(
      bytes: pdfBytes,
      filename: 'كشف_بصمة_${user.code}_$month.pdf',
    );
  }

  /// حفظ مستند الـ PDF مباشرة في وحدة تخزين الجهاز (مجلد التنزيلات Downloads)
  /// مع طلب إذن التخزين وإطلاق إشعار فوري في شريط إشعارات الهاتف
  static Future<String?> savePdfToStorage({
    required UserModel user,
    required List<AttendanceRecord> records,
    required SalarySlipModel salarySlip,
    required String month,
  }) async {
    // 1. طلب والتحقق من إذن التخزين بالجهاز
    await AppNotificationService.requestStoragePermission();

    // 2. توليد بيانات الـ PDF
    final pdfBytes = await generateAttendancePdf(
      user: user,
      records: records,
      salarySlip: salarySlip,
      month: month,
    );

    // 3. تحديد مجلد التنزيلات
    Directory? targetDir;

    if (Platform.isAndroid) {
      final downloadDir = Directory('/storage/emulated/0/Download');
      if (await downloadDir.exists()) {
        targetDir = downloadDir;
      } else {
        try {
          targetDir = await getDownloadsDirectory();
        } catch (_) {}
      }
    }

    if (targetDir == null) {
      try {
        targetDir = await getExternalStorageDirectory();
      } catch (_) {}
    }

    targetDir ??= await getApplicationDocumentsDirectory();

    final safeMonth = month.replaceAll('/', '-').replaceAll(' ', '_');
    final fileName = 'كشف_بصمة_${user.code}_$safeMonth.pdf';
    final filePath = '${targetDir.path}/$fileName';

    final file = File(filePath);
    await file.writeAsBytes(pdfBytes, flush: true);

    // 4. إظهار إشعار نظام فوري في الهاتف
    await AppNotificationService.showPdfSavedNotification(
      fileName: fileName,
      filePath: filePath,
    );

    return filePath;
  }

  static pw.Widget _buildPdfMetricTile(
    String title,
    String val,
    PdfColor color,
  ) {
    return pw.Expanded(
      child: pw.Container(
        padding: const pw.EdgeInsets.symmetric(vertical: 8, horizontal: 6),
        decoration: pw.BoxDecoration(
          borderRadius: const pw.BorderRadius.all(pw.Radius.circular(6)),
          border: pw.Border.all(color: color, width: 0.8),
          color: PdfColors.white,
        ),
        child: pw.Column(
          crossAxisAlignment: pw.CrossAxisAlignment.center,
          children: [
            pw.Text(
              title,
              style: const pw.TextStyle(
                fontSize: 7.5,
                color: PdfColors.grey700,
              ),
              textAlign: pw.TextAlign.center,
            ),
            pw.SizedBox(height: 2),
            pw.Text(
              val,
              style: pw.TextStyle(
                fontSize: 10,
                fontWeight: pw.FontWeight.bold,
                color: color,
              ),
              textAlign: pw.TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }

  static pw.Widget _tableHeaderCell(String text) {
    return pw.Padding(
      padding: const pw.EdgeInsets.symmetric(vertical: 5, horizontal: 4),
      child: pw.Text(
        text,
        style: pw.TextStyle(
          fontSize: 8.5,
          fontWeight: pw.FontWeight.bold,
          color: PdfColors.grey900,
        ),
        textAlign: pw.TextAlign.center,
      ),
    );
  }

  static pw.Widget _tableBodyCell(
    String text, {
    bool isBold = false,
    PdfColor color = PdfColors.grey800,
  }) {
    return pw.Padding(
      padding: const pw.EdgeInsets.symmetric(vertical: 4, horizontal: 4),
      child: pw.Text(
        text,
        style: pw.TextStyle(
          fontSize: 8,
          fontWeight: isBold ? pw.FontWeight.bold : pw.FontWeight.normal,
          color: color,
        ),
        textAlign: pw.TextAlign.center,
      ),
    );
  }
}
