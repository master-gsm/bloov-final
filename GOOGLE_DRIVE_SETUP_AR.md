# دليل إعداد Google Drive للنسخ الاحتياطي التلقائي

## نظرة عامة

تم تصميم نظام النسخ الاحتياطي التلقائي إلى Google Drive بطريقة آمنة تماماً، حيث يتم تخزين بيانات الاعتماد (Client ID & Client Secret) في السيرفر فقط وليس في الواجهة الأمامية.

---

## خطوات الإعداد

### 1. إنشاء مشروع في Google Cloud Console

1. افتح [Google Cloud Console](https://console.cloud.google.com/)
2. اضغط على **"Select a project"** في الأعلى
3. اضغط على **"NEW PROJECT"**
4. أدخل اسم المشروع (مثل: "Bloov Accounting Backups")
5. اضغط **"CREATE"**

### 2. تفعيل Google Drive API

1. في القائمة الجانبية، اذهب إلى **"APIs & Services"** > **"Library"**
2. ابحث عن **"Google Drive API"**
3. اضغط على النتيجة الأولى
4. اضغط **"ENABLE"**

### 3. إنشاء OAuth 2.0 Credentials

#### أ. إنشاء OAuth Consent Screen

1. اذهب إلى **"APIs & Services"** > **"OAuth consent screen"**
2. اختر **"External"** (إذا لم يكن لديك Google Workspace)
3. املأ المعلومات المطلوبة:
   - **App name:** Bloov Accounting System
   - **User support email:** بريدك الإلكتروني
   - **Developer contact information:** بريدك الإلكتروني
4. اضغط **"SAVE AND CONTINUE"**
5. في صفحة **Scopes**:
   - اضغط **"ADD OR REMOVE SCOPES"**
   - ابحث عن `.../auth/drive.file`
   - حدد الصلاحية التي تسمح بإنشاء وتعديل الملفات فقط
   - اضغط **"UPDATE"** ثم **"SAVE AND CONTINUE"**
6. في صفحة **Test users** (اختياري):
   - يمكنك إضافة بريدك الإلكتروني للاختبار
   - اضغط **"SAVE AND CONTINUE"**
7. راجع المعلومات واضغط **"BACK TO DASHBOARD"**

#### ب. إنشاء OAuth Client ID

1. اذهب إلى **"APIs & Services"** > **"Credentials"**
2. اضغط **"+ CREATE CREDENTIALS"** > **"OAuth client ID"**
3. اختر **Application type:** "Web application"
4. أدخل **Name:** "Bloov Backup OAuth Client"
5. في قسم **"Authorized redirect URIs"**:
   - اضغط **"+ ADD URI"**
   - أدخل: `YOUR_SUPABASE_URL/functions/v1/google-drive-auth?action=callback`
   - **مهم جداً:** استبدل `YOUR_SUPABASE_URL` برابط Supabase الخاص بك
   - مثال: `https://abcdefgh.supabase.co/functions/v1/google-drive-auth?action=callback`
6. اضغط **"CREATE"**

#### ج. نسخ البيانات

بعد الإنشاء، ستظهر لك نافذة تحتوي على:
- **Client ID:** انسخه واحفظه
- **Client Secret:** انسخه واحفظه

**ملاحظة مهمة:** هذه البيانات حساسة جداً ويجب حفظها بشكل آمن!

---

### 4. إضافة Environment Variables في Supabase

#### طريقة 1: عبر Supabase Dashboard (الأسهل)

1. افتح [Supabase Dashboard](https://supabase.com/dashboard)
2. اختر مشروعك
3. من القائمة الجانبية، اذهب إلى **"Settings"** > **"Edge Functions"**
4. ابحث عن قسم **"Environment Variables"** أو **"Secrets"**
5. أضف المتغيرات التالية:

```
GOOGLE_DRIVE_CLIENT_ID=YOUR_CLIENT_ID_HERE
GOOGLE_DRIVE_CLIENT_SECRET=YOUR_CLIENT_SECRET_HERE
```

6. استبدل `YOUR_CLIENT_ID_HERE` و `YOUR_CLIENT_SECRET_HERE` بالقيم التي نسختها
7. احفظ التغييرات

#### طريقة 2: عبر Supabase CLI (للمطورين)

إذا كنت تستخدم Supabase CLI:

```bash
supabase secrets set GOOGLE_DRIVE_CLIENT_ID="your_client_id_here"
supabase secrets set GOOGLE_DRIVE_CLIENT_SECRET="your_client_secret_here"
```

---

### 5. إعادة نشر Edge Functions (إذا لزم الأمر)

بعد إضافة Environment Variables، قد تحتاج إلى إعادة نشر Edge Functions:

```bash
# إذا كنت تستخدم CLI
supabase functions deploy google-drive-auth
supabase functions deploy create-backup
```

أو انتظر حتى يتم تحديث Functions تلقائياً (قد يستغرق بضع دقائق).

---

## كيفية الاستخدام

بعد إتمام الإعداد:

1. افتح قسم **"النسخ الاحتياطي"** في النظام
2. اضغط على زر **"إعدادات Google Drive"**
3. اضغط على **"ربط الحساب"**
4. ستفتح نافذة منبثقة من Google
5. سجل الدخول بحساب Google الذي تريد استخدامه
6. امنح الصلاحيات المطلوبة للتطبيق
7. بعد الموافقة، ستُغلق النافذة تلقائياً
8. ستظهر رسالة "تم الربط بنجاح مع Google Drive"
9. فعّل خيار **"تفعيل الرفع التلقائي إلى Google Drive"**
10. (اختياري) أدخل معرّف المجلد إذا كنت تريد الحفظ في مجلد محدد
11. اضغط **"حفظ الإعدادات"**

الآن، كل مرة تنشئ فيها نسخة احتياطية، سيتم رفعها تلقائياً إلى Google Drive!

---

## كيفية الحصول على معرّف المجلد (اختياري)

إذا كنت تريد حفظ النسخ الاحتياطية في مجلد محدد:

1. افتح [Google Drive](https://drive.google.com/)
2. أنشئ مجلد جديد أو افتح مجلد موجود
3. انظر إلى رابط URL في المتصفح
4. سيكون بهذا الشكل:
   ```
   https://drive.google.com/drive/folders/1A2B3C4D5E6F7G8H9I0J
   ```
5. معرّف المجلد هو الجزء الأخير: `1A2B3C4D5E6F7G8H9I0J`
6. انسخه والصقه في حقل "معرّف المجلد" في إعدادات النظام

---

## استكشاف الأخطاء

### خطأ: "Google Drive credentials not configured"

**الحل:**
- تأكد من إضافة `GOOGLE_DRIVE_CLIENT_ID` و `GOOGLE_DRIVE_CLIENT_SECRET` في Environment Variables
- تأكد من إعادة نشر Edge Functions بعد إضافة المتغيرات
- انتظر بضع دقائق حتى يتم تحديث السيرفر

### خطأ: "redirect_uri_mismatch"

**الحل:**
- تأكد من أن رابط Redirect URI المضاف في Google Cloud Console مطابق تماماً للرابط الفعلي
- يجب أن يكون: `https://YOUR-PROJECT.supabase.co/functions/v1/google-drive-auth?action=callback`
- لا تنس `?action=callback` في النهاية

### خطأ: "Token expired"

**الحل:**
- هذا طبيعي، النظام مصمم لتجديد Token تلقائياً
- إذا استمر الخطأ، افصل الاتصال وأعد الربط مرة أخرى

### خطأ: "Failed to upload to Google Drive"

**الحل:**
- تأكد من أن حساب Google المربوط لديه مساحة كافية
- تأكد من منح جميع الصلاحيات المطلوبة أثناء OAuth
- حاول فصل الاتصال وإعادة الربط

---

## الأمان

### لماذا هذه الطريقة آمنة؟

1. **Client ID & Secret مخزنة في السيرفر فقط:** لا يمكن لأي شخص الوصول إليها من الواجهة
2. **OAuth 2.0 Flow:** استخدام معيار الصناعة للمصادقة الآمنة
3. **Refresh Token:** يتم تجديد Access Token تلقائياً عند انتهاء صلاحيته
4. **صلاحيات محدودة:** التطبيق يطلب فقط صلاحية إنشاء وتعديل الملفات التي أنشأها
5. **Admin Only:** فقط المدراء يمكنهم ربط وفصل Google Drive

### حماية بيانات الاعتماد

- **لا تشارك** Client Secret مع أي شخص
- **لا تضعها** في الكود المصدري (Frontend)
- **لا ترفعها** إلى Git أو GitHub
- **استخدم** فقط Environment Variables في السيرفر

---

## ملاحظات إضافية

### حجم النسخ الاحتياطية

- حجم النسخة الاحتياطية يعتمد على كمية البيانات في النظام
- عادة ما تكون بين 1 MB إلى 50 MB
- تأكد من أن لديك مساحة كافية في Google Drive

### عدد النسخ

- يُنصح بحذف النسخ القديمة من Google Drive بشكل دوري
- احتفظ بآخر 7-10 نسخ احتياطية على الأقل

### النسخ الاحتياطي التلقائي المجدول

حالياً، النسخ الاحتياطي يدوي. إذا أردت جدولة نسخ تلقائي:
- يمكنك استخدام Supabase Cron Jobs (Database Functions)
- أو خدمة خارجية تستدعي Edge Function بشكل دوري

---

## الدعم

إذا واجهت أي مشكلة:
1. تحقق من console.log في المتصفح
2. تحقق من Logs في Supabase Edge Functions
3. راجع هذا الدليل مرة أخرى
4. تأكد من اتباع جميع الخطوات بدقة

---

## خلاصة سريعة

**للإعداد:**
1. إنشاء مشروع في Google Cloud
2. تفعيل Google Drive API
3. إنشاء OAuth Client
4. نسخ Client ID & Secret
5. إضافتهم كـ Environment Variables في Supabase
6. إعادة نشر Functions

**للاستخدام:**
1. اضغط "ربط الحساب" في إعدادات النسخ الاحتياطي
2. امنح الصلاحيات
3. فعّل الرفع التلقائي
4. احفظ الإعدادات
5. استمتع بالنسخ الاحتياطي التلقائي!
