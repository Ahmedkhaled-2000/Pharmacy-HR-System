import 'dart:convert';
import 'package:http/http.dart' as http;

class SupabaseService {
  // الرابط الأساسي للـ PHP API على استضافة Apex Thunder
  static const String baseUrl = 'https://nodejs-test.apexthunder.com/api';
  static const String storageKey = 'pharmacy-tracker-data';

  static Future<void> initialize() async {
    // تم تحويل النظام إلى REST API عبر MariaDB و PHP
  }

  static Future<Map<String, dynamic>> fetchAppSettings() async {
    try {
      final uri = Uri.parse('$baseUrl/settings?key=$storageKey');
      final response = await http.get(
        uri,
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
      ).timeout(const Duration(seconds: 15));

      if (response.statusCode == 200) {
        final decoded = jsonDecode(utf8.decode(response.bodyBytes));
        if (decoded is Map<String, dynamic> && decoded.containsKey('value')) {
          final value = decoded['value'];
          if (value is String) {
            return jsonDecode(value);
          } else if (value is Map<String, dynamic>) {
            return value;
          }
        }
      }
    } catch (e) {
      // ignore: avoid_print
      print('Error fetching app settings from MariaDB API: $e');
    }
    return {};
  }

  static Future<void> updateAppSettings(Map<String, dynamic> data) async {
    try {
      final uri = Uri.parse('$baseUrl/settings');
      final response = await http.post(
        uri,
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: jsonEncode({
          'key': storageKey,
          'value': data,
        }),
      ).timeout(const Duration(seconds: 15));

      if (response.statusCode != 200) {
        // ignore: avoid_print
        print('Failed to update app settings: ${response.body}');
      }
    } catch (e) {
      // ignore: avoid_print
      print('Error updating app settings to MariaDB API: $e');
    }
  }
}
