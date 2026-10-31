import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:image/image.dart' as img;
import 'package:cached_network_image/cached_network_image.dart';

import '../../../core/constants/app_colors.dart';
import '../../../data/models/user_model.dart';
import '../../../data/repositories/employee_repository.dart';
import '../../providers/auth_provider.dart';
import '../../providers/employee_data_provider.dart';

class ProfileScreen extends ConsumerStatefulWidget {
  final UserModel user;

  const ProfileScreen({super.key, required this.user});

  @override
  ConsumerState<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends ConsumerState<ProfileScreen> {
  bool _isUploadingPhoto = false;

  Future<void> _pickAndUploadPhoto(ImageSource source) async {
    Navigator.pop(context); // Close bottom sheet
    try {
      final picker = ImagePicker();
      final pickedFile = await picker.pickImage(
        source: source,
        maxWidth: 800,
        maxHeight: 800,
        imageQuality: 85,
      );

      if (pickedFile == null) return;

      setState(() => _isUploadingPhoto = true);

      final rawBytes = await pickedFile.readAsBytes();

      // تجهيز الصورة كصورة مربعة بحجم 400x400 مضغوطة JPEG عالية الجودة
      Uint8List finalBytes = rawBytes;
      try {
        final decoded = img.decodeImage(rawBytes);
        if (decoded != null) {
          final resized = img.copyResize(decoded, width: 400, height: 400, interpolation: img.Interpolation.linear);
          finalBytes = Uint8List.fromList(img.encodeJpg(resized, quality: 85));
        }
      } catch (err) {
        debugPrint('[ProfilePhoto] Image processing error: $err');
      }

      final repo = ref.read(employeeRepositoryProvider);
      final currentUser = ref.read(authProvider).user ?? widget.user;

      final newUrl = await repo.uploadProfilePhoto(
        user: currentUser,
        imageBytes: finalBytes,
        mimeType: 'image/jpeg',
      );

      if (!mounted) return;
      setState(() => _isUploadingPhoto = false);

      if (newUrl != null) {
        // تحديث المستخدم في الجلسة المحلية الفورية
        final updatedUser = currentUser.copyWith(photoUrl: newUrl);
        ref.read(authProvider.notifier).updateUser(updatedUser);
        ref.read(employeeDataProvider.notifier).refresh();

        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('✅ تم حفظ وتحديث صورتك الشخصية بنجاح في قاعدة البيانات'),
            backgroundColor: AppColors.primary,
          ),
        );
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('⚠️ تعذر حفظ الصورة بقاعدة البيانات، يرجى المحاولة لاحقاً'),
            backgroundColor: AppColors.danger,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        setState(() => _isUploadingPhoto = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('خطأ أثناء اختيار الصورة: $e'),
            backgroundColor: AppColors.danger,
          ),
        );
      }
    }
  }

  void _showPhotoOptions() {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    showModalBottomSheet(
      context: context,
      backgroundColor: isDark ? AppColors.darkSurface : Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (ctx) {
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 20),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(
                    color: Colors.grey.withValues(alpha: 0.3),
                    borderRadius: BorderRadius.circular(4),
                  ),
                ),
                const SizedBox(height: 16),
                const Text(
                  'تغيير الصورة الشخصية',
                  style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
                ),
                const SizedBox(height: 6),
                const Text(
                  'سيتم تحديث صورتك في ملفك الشخصي وقاعدة بيانات الصيدلية مباشرة',
                  style: TextStyle(fontSize: 12, color: Colors.grey),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 20),
                Row(
                  children: [
                    Expanded(
                      child: InkWell(
                        onTap: () => _pickAndUploadPhoto(ImageSource.camera),
                        borderRadius: BorderRadius.circular(16),
                        child: Container(
                          padding: const EdgeInsets.symmetric(vertical: 18),
                          decoration: BoxDecoration(
                            color: AppColors.primary.withValues(alpha: 0.1),
                            borderRadius: BorderRadius.circular(16),
                            border: Border.all(color: AppColors.primary.withValues(alpha: 0.3)),
                          ),
                          child: const Column(
                            children: [
                              Icon(Icons.camera_alt_rounded, color: AppColors.primary, size: 30),
                              SizedBox(height: 8),
                              Text('التقاط بالكاميرا', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13, color: AppColors.primary)),
                            ],
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 14),
                    Expanded(
                      child: InkWell(
                        onTap: () => _pickAndUploadPhoto(ImageSource.gallery),
                        borderRadius: BorderRadius.circular(16),
                        child: Container(
                          padding: const EdgeInsets.symmetric(vertical: 18),
                          decoration: BoxDecoration(
                            color: AppColors.accentCyan.withValues(alpha: 0.1),
                            borderRadius: BorderRadius.circular(16),
                            border: Border.all(color: AppColors.accentCyan.withValues(alpha: 0.3)),
                          ),
                          child: const Column(
                            children: [
                              Icon(Icons.photo_library_rounded, color: AppColors.accentCyan, size: 30),
                              SizedBox(height: 8),
                              Text('اختيار من المعرض', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13, color: AppColors.accentCyan)),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
              ],
            ),
          ),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final currentUser = ref.watch(authProvider).user ?? widget.user;
    final photoUrl = currentUser.fullPhotoUrl;

    return Scaffold(
      appBar: AppBar(
        title: Text(
          'الملف الشخصي وبيانات التعاقد',
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
          children: [
            // بطاقة الهوية الكبرى
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: [
                    AppColors.primary.withValues(alpha: isDark ? 0.2 : 0.12),
                    isDark ? AppColors.darkSurface : Colors.white,
                  ],
                  begin: Alignment.topRight,
                  end: Alignment.bottomLeft,
                ),
                borderRadius: BorderRadius.circular(22),
                border: Border.all(
                  color: isDark ? AppColors.primary.withValues(alpha: 0.3) : const Color(0xFFE2E8F0),
                  width: 1.2,
                ),
                boxShadow: isDark
                    ? null
                    : [
                        BoxShadow(
                          color: const Color(0xFF0F172A).withValues(alpha: 0.04),
                          blurRadius: 12,
                          offset: const Offset(0, 4),
                        ),
                      ],
              ),
              child: Column(
                children: [
                  Stack(
                    children: [
                      Container(
                        width: 86,
                        height: 86,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          border: Border.all(color: AppColors.primary, width: 2.5),
                          boxShadow: [
                            BoxShadow(
                              color: AppColors.primary.withValues(alpha: 0.25),
                              blurRadius: 10,
                              offset: const Offset(0, 3),
                            ),
                          ],
                        ),
                        child: ClipOval(
                          child: _isUploadingPhoto
                              ? const Center(child: CircularProgressIndicator(strokeWidth: 2.5))
                              : (photoUrl != null && photoUrl.isNotEmpty)
                                  ? CachedNetworkImage(
                                      imageUrl: photoUrl,
                                      fit: BoxFit.cover,
                                      placeholder: (_, __) => CircleAvatar(
                                        backgroundColor: AppColors.primary,
                                        child: Text(
                                          currentUser.name.isNotEmpty ? currentUser.name[0] : 'أ',
                                          style: const TextStyle(fontSize: 28, fontWeight: FontWeight.bold, color: Colors.white),
                                        ),
                                      ),
                                      errorWidget: (_, __, ___) => CircleAvatar(
                                        backgroundColor: AppColors.primary,
                                        child: Text(
                                          currentUser.name.isNotEmpty ? currentUser.name[0] : 'أ',
                                          style: const TextStyle(fontSize: 28, fontWeight: FontWeight.bold, color: Colors.white),
                                        ),
                                      ),
                                    )
                                  : CircleAvatar(
                                      backgroundColor: AppColors.primary,
                                      child: Text(
                                        currentUser.name.isNotEmpty ? currentUser.name[0] : 'أ',
                                        style: const TextStyle(fontSize: 28, fontWeight: FontWeight.bold, color: Colors.white),
                                      ),
                                    ),
                        ),
                      ),
                      Positioned(
                        bottom: 0,
                        right: 0,
                        child: GestureDetector(
                          onTap: _isUploadingPhoto ? null : _showPhotoOptions,
                          child: Container(
                            width: 30,
                            height: 30,
                            decoration: BoxDecoration(
                              color: AppColors.primary,
                              shape: BoxShape.circle,
                              border: Border.all(color: Colors.white, width: 2),
                              boxShadow: [
                                BoxShadow(
                                  color: Colors.black.withValues(alpha: 0.2),
                                  blurRadius: 4,
                                ),
                              ],
                            ),
                            child: const Icon(
                              Icons.camera_alt_rounded,
                              size: 16,
                              color: Colors.white,
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  Text(
                    currentUser.name,
                    style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                      color: isDark ? Colors.white : const Color(0xFF0F172A),
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    '${currentUser.jobTitle} • كود: ${currentUser.code}',
                    style: TextStyle(
                      fontSize: 12.5,
                      color: isDark ? Colors.grey.shade400 : const Color(0xFF64748B),
                    ),
                  ),
                  const SizedBox(height: 16),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      _buildMiniBadge(context, 'الرصيد السنوي', '${currentUser.annualLeaveBalance} يوم', AppColors.primary),
                      const SizedBox(width: 12),
                      _buildMiniBadge(context, 'حالة الحساب', 'نشط ومفعل ✅', AppColors.accentCyan),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 20),

            // تفاصيل التعاقد
            _buildSection(
              context,
              title: 'تفاصيل التعاقد والوظيفة',
              icon: Icons.work_outline_rounded,
              items: [
                {'label': 'المسمى الوظيفي', 'value': currentUser.jobTitle},
                {'label': 'كود الموظف الرسمي', 'value': currentUser.code},
                {'label': 'الفرع الأساسي', 'value': currentUser.branchName ?? 'الفرع الرئيسي'},
                {'label': 'الموظفون متعددو الفروع', 'value': currentUser.isMultiBranch ? 'مفعل (يعمل بأكثر من فرع)' : 'فرع واحد'},
                {'label': 'نوع احتساب الأجر', 'value': 'دوام مرن بالساعات الفعلية'},
              ],
            ),
            const SizedBox(height: 16),

            // الفروع المصرح بالعمل بها
            _buildSection(
              context,
              title: 'الفروع المصرح بالعمل بها',
              icon: Icons.storefront_outlined,
              items: currentUser.branches.map((b) => {'label': b.code ?? 'BR', 'value': b.name}).toList(),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSection(BuildContext context, {required String title, required IconData icon, required List<Map<String, String>> items}) {
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
                  blurRadius: 8,
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
          ...items.map((item) {
            return Padding(
              padding: const EdgeInsets.symmetric(vertical: 6),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    item['label']!,
                    style: TextStyle(
                      fontSize: 12,
                      color: isDark ? Colors.grey : const Color(0xFF64748B),
                    ),
                  ),
                  Text(
                    item['value']!,
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.bold,
                      color: isDark ? Colors.white : const Color(0xFF0F172A),
                    ),
                  ),
                ],
              ),
            );
          }),
        ],
      ),
    );
  }

  Widget _buildMiniBadge(BuildContext context, String title, String val, Color color) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: color.withValues(alpha: isDark ? 0.15 : 0.1),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: color.withValues(alpha: 0.3)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            '$title: ',
            style: TextStyle(
              fontSize: 11,
              color: isDark ? Colors.grey.shade400 : const Color(0xFF64748B),
            ),
          ),
          Text(val, style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.bold, color: color)),
        ],
      ),
    );
  }
}
