import 'dart:async';
import 'dart:convert';
import 'dart:io';

import '../../data/models/branch_model.dart';

class IpAuthResult {
  final bool isAuthorized;
  final String reason;
  final String message;
  final String? currentIp;
  final String? targetBranchName;
  final String? detectedBranchName;

  const IpAuthResult({
    required this.isAuthorized,
    required this.reason,
    required this.message,
    this.currentIp,
    this.targetBranchName,
    this.detectedBranchName,
  });
}

class BranchNetworkAuthService {
  static String? _cachedIp;
  static int _lastIpFetchMs = 0;
  static const int _cacheTtlMs = 30000; // 30 seconds

  /// جلب الـ IP العام الفعلي للجهاز مع كاش خفيف لمدة 30 ثانية باستخدام دارت المدمج
  static Future<String?> getCurrentPublicIp({bool forceRefresh = false}) async {
    final now = DateTime.now().millisecondsSinceEpoch;
    if (!forceRefresh &&
        _cachedIp != null &&
        (now - _lastIpFetchMs) < _cacheTtlMs) {
      return _cachedIp;
    }

    // 1. المحاولة الأولى: api.ipify.org
    try {
      final client = HttpClient()
        ..connectionTimeout = const Duration(seconds: 4);
      final request = await client.getUrl(
        Uri.parse('https://api.ipify.org?format=json'),
      );
      final response = await request.close();
      if (response.statusCode == 200) {
        final body = await response.transform(utf8.decoder).join();
        final data = jsonDecode(body);
        final ip = data['ip']?.toString().trim();
        if (ip != null && ip.isNotEmpty) {
          _cachedIp = ip;
          _lastIpFetchMs = now;
          client.close();
          return _cachedIp;
        }
      }
      client.close();
    } catch (_) {}

    // 2. المحاولة الاحتياطية الثانية: icanhazip.com
    try {
      final client = HttpClient()
        ..connectionTimeout = const Duration(seconds: 4);
      final request = await client.getUrl(Uri.parse('https://icanhazip.com'));
      final response = await request.close();
      if (response.statusCode == 200) {
        final body = (await response.transform(utf8.decoder).join()).trim();
        if (body.isNotEmpty) {
          _cachedIp = body;
          _lastIpFetchMs = now;
          client.close();
          return _cachedIp;
        }
      }
      client.close();
    } catch (_) {}

    return _cachedIp;
  }

  /// فحص مطابقة شبكة راوتر الفرع وفق الإعدادات الرسمية
  static IpAuthResult checkBranchAuthorization({
    required BranchModel targetBranch,
    required String? currentIp,
    List<BranchModel> allBranches = const [],
    Map<String, dynamic>? globalIpRestrictions,
  }) {
    if (currentIp == null || currentIp.isEmpty) {
      return IpAuthResult(
        isAuthorized: false,
        reason: 'no_ip_detected',
        currentIp: 'غير معروف',
        targetBranchName: targetBranch.name,
        message: 'تعذر تحديد عنوان الـ IP للجهاز. يرجى التأكد من الاتصال بالإنترنت وراوتر الفرع.',
      );
    }

    final cleanIp = currentIp.trim();

    // 1. التحقق الجغرافي الصارم لشبكة الفرع المخصص (Per-Branch IP Geofencing)
    if (targetBranch.ipRestrictionEnabled &&
        targetBranch.allowedIps.isNotEmpty) {
      final isMatch = targetBranch.allowedIps.any((allowed) {
        final aIp = allowed.ip.trim();
        if (aIp == cleanIp) return true;
        if (aIp.endsWith('.*')) {
          final prefix = aIp.substring(0, aIp.length - 2);
          return cleanIp.startsWith(prefix);
        }
        return false;
      });

      if (!isMatch) {
        // فحص ذكي: هل هذا الـ IP يخص فرعاً آخر داخل المنظومة؟
        BranchModel? detectedOtherBranch;
        for (final b in allBranches) {
          if (b.id == targetBranch.id) continue;
          final matched = b.allowedIps.any((allowed) {
            final aIp = allowed.ip.trim();
            if (aIp == cleanIp) return true;
            if (aIp.endsWith('.*')) {
              return cleanIp.startsWith(aIp.substring(0, aIp.length - 2));
            }
            return false;
          });
          if (matched) {
            detectedOtherBranch = b;
            break;
          }
        }

        if (detectedOtherBranch != null) {
          return IpAuthResult(
            isAuthorized: false,
            reason: 'wrong_branch_ip',
            targetBranchName: targetBranch.name,
            detectedBranchName: detectedOtherBranch.name,
            currentIp: cleanIp,
            message:
                '🚫 لا يمكنك فتح كشك [${targetBranch.name}] أثناء التواجد في [${detectedOtherBranch.name}].\n'
                'أنت متصل حالياً من شبكة راوتر فرع: [${detectedOtherBranch.name}].\n'
                'يرجى فتح كشك الفرع المتواجد به حالياً للبصمة.',
          );
        }

        final routerLabels = targetBranch.allowedIps
            .map(
              (e) => (e.label != null && e.label!.isNotEmpty) ? e.label! : e.ip,
            )
            .join(' / ');

        return IpAuthResult(
          isAuthorized: false,
          reason: 'unauthorized_branch_ip',
          targetBranchName: targetBranch.name,
          currentIp: cleanIp,
          message:
              '❌ غير مصرح بفتح كشك [${targetBranch.name}] من هذه الشبكة.\n'
              'عنوان الـ IP الحالي ($cleanIp) غير مسجل في شبكة راوتر هذا الفرع.'
              '${routerLabels.isNotEmpty ? '\nالراوتر المعتمد للفرع: $routerLabels' : ''}',
        );
      }
    }

    // 2. الفحص العام على مستوى المنظومة (Global IP Restrictions)
    if (globalIpRestrictions != null &&
        globalIpRestrictions['enabled'] == true) {
      final rawList =
          globalIpRestrictions['allowedIps'] as List<dynamic>? ?? [];
      final allowedList = rawList
          .map((e) {
            if (e is Map) return e['ip']?.toString().trim() ?? '';
            return e.toString().trim();
          })
          .where((ip) => ip.isNotEmpty)
          .toList();

      if (allowedList.isNotEmpty) {
        final isGlobalMatch = allowedList.any((allowed) {
          if (allowed == cleanIp) return true;
          if (allowed.endsWith('.*')) {
            return cleanIp.startsWith(allowed.substring(0, allowed.length - 2));
          }
          return false;
        });

        if (!isGlobalMatch) {
          return IpAuthResult(
            isAuthorized: false,
            reason: 'invalid_global_ip',
            currentIp: cleanIp,
            message:
                '❌ أنت خارج شبكة الصيدلية المعتمدة للمؤسسة.\nالـ IP الخاص بك: $cleanIp',
          );
        }
      }
    }

    return IpAuthResult(
      isAuthorized: true,
      reason: 'authorized',
      currentIp: cleanIp,
      targetBranchName: targetBranch.name,
      message: 'الشبكة معتمدة ومطابقة لراوتر الفرع المصرح به',
    );
  }
}
