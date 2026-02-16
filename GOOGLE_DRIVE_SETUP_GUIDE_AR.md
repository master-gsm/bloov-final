# دليل إعداد Google Drive للنسخ الاحتياطي التلقائي

## نظرة عامة
هذا الدليل يشرح كيفية ربط نظام المحاسبة مع Google Drive لحفظ النسخ الاحتياطية تلقائياً.

## خطوات الإعداد

### 1. إنشاء مشروع في Google Cloud Console

1. اذهب إلى [Google Cloud Console](https://console.cloud.google.com)
2. قم بتسجيل الدخول بحساب Google الخاص بك
3. اضغط على "Select a project" في الأعلى
4. اضغط على "NEW PROJECT"
5. أدخل اسم المشروع (مثال: "Bloov Accounting Backup")
6. اضغط على "CREATE"

### 2. تفعيل Google Drive API

1. في القائمة الجانبية، اذهب إلى "APIs & Services" > "Library"
2. ابحث عن "Google Drive API"
3. اضغط على "Google Drive API"
4. اضغط على "ENABLE"

### 3. إنشاء OAuth 2.0 Client Credentials

1. في القائمة الجانبية، اذهب إلى "APIs & Services" > "Credentials"
2. اضغط على "CREATE CREDENTIALS" في الأعلى
3. اختر "OAuth client ID"
4. إذا طلب منك إنشاء OAuth consent screen:
   - اختر "External"
   - أدخل اسم التطبيق: "Bloov Accounting"
   - أدخل بريدك الإلكتروني
   - اضغط "Save and Continue"
   - في صفحة "Scopes"، اضغط "Save and Continue"
   - في صفحة "Test users"، أضف بريدك الإلكتروني
   - اضغط "Save and Continue"

5. ارجع إلى "Credentials" واضغط "CREATE CREDENTIALS" > "OAuth client ID"
6. اختر "Application type": **Web application**
7. أدخل اسم: "Bloov Accounting Web Client"
8. في قسم "Authorized redirect URIs"، اضغط "ADD URI"
9. أدخل الرابط التالي (استبدل YOUR_SUPABASE_URL برابط السوبابيس الخاص بك):
   ```
   YOUR_SUPABASE_URL/functions/v1/google-drive-auth?action=callback
   ```
   مثال:
   ```
   https://your-project.supabase.co/functions/v1/google-drive-auth?action=callback
   ```

10. اضغط "CREATE"
11. ستظهر لك نافذة تحتوي على:
    - **Client ID**: شيء مثل `123456789.apps.googleusercontent.com`
    - **Client Secret**: شيء مثل `GOCSPX-xxxxxxxxxxxxxxxxxxxxx`
12. انسخ هاتين القيمتين (ستحتاجهما في الخطوة التالية)

### 4. إدخال المعلومات في النظام

1. افتح نظام المحاسبة
2. اذهب إلى صفحة "النسخ الاحتياطي"
3. اضغط على زر "إعدادات Google Drive"
4. أدخل **Client ID** في الحقل الأول
5. أدخل **Client Secret** في الحقل الثاني
6. اضغط "حفظ معلومات OAuth"

### 5. ربط الحساب

1. بعد حفظ المعلومات، اضغط على زر "ربط الحساب"
2. ستفتح نافذة جديدة لتسجيل الدخول بحساب Google
3. اختر الحساب الذي تريد استخدامه
4. اضغط "Allow" للسماح للتطبيق بالوصول إلى Google Drive
5. ستُغلق النافذة تلقائياً
6. ستظهر رسالة "متصل" في النظام

### 6. اختياري: تحديد مجلد محدد

1. افتح Google Drive في المتصفح
2. أنشئ مجلد جديد أو افتح مجلد موجود
3. انسخ معرف المجلد من الرابط في شريط العناوين:
   - الرابط يكون مثل: `https://drive.google.com/drive/folders/FOLDER_ID_HERE`
   - انسخ `FOLDER_ID_HERE`
4. في نظام المحاسبة، أدخل معرف المجلد في حقل "معرّف المجلد"
5. اضغط "حفظ إعدادات النسخ الاحتياطي"

### 7. تفعيل النسخ التلقائي

1. ضع علامة على "تفعيل الرفع التلقائي إلى Google Drive"
2. اضغط "حفظ إعدادات النسخ الاحتياطي"

## اختبار النظام

1. في صفحة النسخ الاحتياطي، اضغط على "رفع نسخة احتياطية إلى Google Drive"
2. انتظر حتى تكتمل العملية
3. افتح Google Drive وتحقق من وجود النسخة الاحتياطية

## حل المشاكل الشائعة

### خطأ: "رمز التوصيل غير موجود"
**الحل:** اضغط على زر "إعادة الربط" لتجديد الاتصال بحساب Google Drive

### خطأ: "Google Drive credentials not configured"
**الحل:** تأكد من إدخال Client ID و Client Secret بشكل صحيح، ثم اضغط "حفظ معلومات OAuth"

### خطأ: "redirect_uri_mismatch"
**الحل:** تأكد من أن الرابط المدخل في Google Cloud Console مطابق تماماً للرابط الموجود في النظام

### خطأ: "Access blocked: This app's request is invalid"
**الحل:**
1. ارجع إلى Google Cloud Console
2. اذهب إلى "APIs & Services" > "OAuth consent screen"
3. تأكد من إضافة بريدك الإلكتروني في قائمة "Test users"

## الأمان

- معلومات OAuth (Client ID و Client Secret) محفوظة بشكل آمن في قاعدة البيانات
- فقط المستخدمون الذين لديهم صلاحية "Admin" يمكنهم الوصول إلى هذه الإعدادات
- رمز الوصول (Access Token) محفوظ ومشفر في قاعدة البيانات
- النظام يجدد رمز الوصول تلقائياً عند انتهاء صلاحيته

## ملاحظات مهمة

1. تأكد من استخدام حساب Google الذي تريد حفظ النسخ الاحتياطية فيه
2. تأكد من أن لديك مساحة كافية في Google Drive
3. النسخ الاحتياطية يتم حفظها بتنسيق JSON
4. إذا لم تحدد مجلد، سيتم حفظ النسخ في المجلد الرئيسي لـ Google Drive
