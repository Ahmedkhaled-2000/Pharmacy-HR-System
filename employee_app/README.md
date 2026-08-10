# Employee Portal App (Flutter)

هذا هو الكود المصدري لتطبيق الهاتف الخاص ببوابة الموظفين والمبني باستخدام Flutter. التطبيق مصمم ليقوم بالاتصال بقاعدة بيانات Supabase الخاصة بالمشروع لضمان التزامن المباشر للورديات والبصمات والرواتب.

## متطلبات التشغيل
لتتمكن من إنشاء ملف الـ APK، ستحتاج إلى جهاز كمبيوتر يحتوي على:
1. [Flutter SDK](https://docs.flutter.dev/get-started/install) مثبت ومعرف في مسار النظام (PATH).
2. Android Studio (للحصول على Android SDK).

## كيفية بناء ملف الـ APK
نظراً لأننا لم نقم بإنشاء مجلدات الـ Android و iOS الافتراضية عبر الأمر العادي، كل ما عليك فعله هو تشغيل الأوامر التالية من داخل مجلد `employee_app`:

1. توليد ملفات المنصة الافتراضية:
   ```bash
   flutter create .
   ```

2. تثبيت الحزم (Dependencies):
   ```bash
   flutter pub get
   ```

3. بناء ملف الـ APK (النسخة النهائية Release):
   ```bash
   flutter build apk --release
   ```

بعد اكتمال البناء، ستجد ملف الـ `app-release.apk` في المسار التالي:
`employee_app/build/app/outputs/flutter-apk/app-release.apk`

يمكنك نقله إلى هاتفك الأندرويد وتثبيته مباشرة!
