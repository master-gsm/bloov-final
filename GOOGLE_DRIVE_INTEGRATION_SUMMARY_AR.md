# ملخص تكامل Google Drive - النسخ الاحتياطي التلقائي

## ما تم إنجازه

تم إعادة تصميم نظام Google Drive بشكل كامل ليصبح آمناً ومطابقاً لأفضل الممارسات:

### 1. Edge Function جديد للمصادقة (`google-drive-auth`)

- **الموقع:** `supabase/functions/google-drive-auth/index.ts`
- **الوظائف:**
  - `?action=get-auth-url` - الحصول على رابط المصادقة من Google
  - `?action=callback` - استقبال الـ callback من Google بعد الموافقة
  - `?action=disconnect` - فصل الاتصال مع Google Drive
- **الأمان:**
  - Client ID & Secret مخزنة في Environment Variables فقط
  - OAuth 2.0 flow كامل مع refresh token
  - فقط المدراء يمكنهم الربط/الفصل

### 2. تحديث Edge Function النسخ الاحتياطي (`create-backup`)

- إضافة دالة `refreshGoogleToken` لتجديد Access Token تلقائياً
- تحديث دالة `uploadToGoogleDrive` لدعم تجديد Token
- معالجة خطأ 401 (token expired) تلقائياً
- استخدام Environment Variables بدلاً من القيم الثابتة

### 3. تحديث واجهة النسخ الاحتياطي (`Backup.tsx`)

- **زر "ربط الحساب":**
  - يستدعي Edge Function للحصول على Auth URL
  - يفتح نافذة منبثقة لـ Google OAuth
  - يستقبل النتيجة عبر postMessage
  - آمن ضد CSRF و XSS
- **زر "فصل الاتصال":**
  - يحذف Credentials من قاعدة البيانات
  - يعطل الرفع التلقائي
- **حالة الاتصال:**
  - يعرض حالة الربط (متصل/غير متصل)
  - أيقونة خضراء عند الاتصال الناجح

### 4. أدلة الإعداد

تم إنشاء دليلين شاملين:

- **`GOOGLE_DRIVE_SETUP_AR.md`** - دليل عربي كامل
- **`GOOGLE_DRIVE_SETUP_EN.md`** - دليل إنجليزي كامل

تشمل الأدلة:
- خطوات إنشاء Google Cloud Project
- تفعيل Google Drive API
- إنشاء OAuth 2.0 Credentials
- إضافة Environment Variables في Supabase
- استكشاف الأخطاء وحلها
- ملاحظات الأمان

---

## الخطوات المطلوبة منك

لإتمام الإعداد، يجب عليك القيام بما يلي:

### الخطوة 1: إنشاء Google Cloud Project

1. افتح [Google Cloud Console](https://console.cloud.google.com/)
2. أنشئ مشروع جديد
3. فعّل Google Drive API
4. أنشئ OAuth 2.0 Client (Web application)
5. أضف Redirect URI:
   ```
   https://YOUR_SUPABASE_URL/functions/v1/google-drive-auth?action=callback
   ```
6. انسخ **Client ID** و **Client Secret**

### الخطوة 2: إضافة Environment Variables في Supabase

عبر Supabase Dashboard:
1. افتح Settings > Edge Functions
2. ابحث عن قسم "Secrets" أو "Environment Variables"
3. أضف:
   ```
   GOOGLE_DRIVE_CLIENT_ID=your_client_id_here
   GOOGLE_DRIVE_CLIENT_SECRET=your_client_secret_here
   ```

أو عبر CLI:
```bash
supabase secrets set GOOGLE_DRIVE_CLIENT_ID="your_client_id_here"
supabase secrets set GOOGLE_DRIVE_CLIENT_SECRET="your_client_secret_here"
```

### الخطوة 3: إعادة نشر Edge Functions (إذا لزم)

```bash
supabase functions deploy google-drive-auth
supabase functions deploy create-backup
```

### الخطوة 4: الاختبار

1. افتح النظام
2. اذهب إلى قسم "النسخ الاحتياطي"
3. اضغط "إعدادات Google Drive"
4. اضغط "ربط الحساب"
5. امنح الصلاحيات في نافذة Google
6. فعّل "الرفع التلقائي"
7. احفظ الإعدادات
8. أنشئ نسخة احتياطية تجريبية
9. تحقق من رفعها إلى Google Drive

---

## الملفات المضافة/المعدلة

### ملفات جديدة:
- `supabase/functions/google-drive-auth/index.ts` ✨
- `GOOGLE_DRIVE_SETUP_AR.md` 📚
- `GOOGLE_DRIVE_SETUP_EN.md` 📚
- `GOOGLE_DRIVE_INTEGRATION_SUMMARY_AR.md` 📄

### ملفات معدلة:
- `supabase/functions/create-backup/index.ts` 🔄
- `src/components/Backup.tsx` 🔄

### Migrations:
- لا توجد migrations جديدة (الحقول موجودة بالفعل في `settings` table)

---

## الأمان

### ما يتم تخزينه في السيرفر (آمن):
- `GOOGLE_DRIVE_CLIENT_ID` (Environment Variable)
- `GOOGLE_DRIVE_CLIENT_SECRET` (Environment Variable)
- `google_drive_credentials` (في جدول settings - يحتوي على access_token و refresh_token)

### ما لا يظهر في الواجهة:
- Client Secret (غير مرئي أبداً في Frontend)
- Access Token (يُحفظ في قاعدة البيانات فقط)
- Refresh Token (يُحفظ في قاعدة البيانات فقط)

### الحماية:
- OAuth 2.0 standard flow
- HTTPS فقط
- postMessage مع origin validation
- Admin-only access
- Token refresh تلقائي

---

## الفرق بين الطريقة القديمة والجديدة

| المقارنة | الطريقة القديمة ❌ | الطريقة الجديدة ✅ |
|---------|------------------|-------------------|
| Client ID | في الكود Frontend | في Environment Variables |
| Client Secret | غير موجود | في Environment Variables |
| OAuth Flow | Client-side (Implicit) | Server-side (Authorization Code) |
| Refresh Token | لا يوجد | موجود وتلقائي |
| الأمان | ضعيف | قوي جداً |
| Token Expiry | تحتاج إعادة ربط يدوي | تجديد تلقائي |

---

## الأسئلة الشائعة

### س: هل يحتاج المستخدم لإعادة الربط كل فترة؟
**ج:** لا، النظام يُجدد Access Token تلقائياً باستخدام Refresh Token.

### س: ماذا لو انتهت صلاحية Refresh Token؟
**ج:** في هذه الحالة النادرة، سيحتاج المستخدم لإعادة الربط مرة واحدة. Refresh Tokens عادةً صالحة لفترة طويلة (أشهر/سنوات).

### س: هل يمكن لموظف غير admin ربط Google Drive؟
**ج:** لا، فقط الـ admin يمكنه ربط/فصل Google Drive.

### س: هل البيانات المرفوعة آمنة؟
**ج:** نعم، التطبيق يطلب فقط صلاحية إنشاء وتعديل الملفات التي أنشأها هو. لا يمكنه الوصول لملفات أخرى في Drive.

### س: ماذا لو أردت تغيير حساب Google المربوط؟
**ج:** اضغط "فصل الاتصال" ثم اضغط "ربط الحساب" مرة أخرى واختر حساب مختلف.

---

## الدعم الفني

إذا واجهت أي مشكلة، راجع:
1. `GOOGLE_DRIVE_SETUP_AR.md` - دليل الإعداد الكامل
2. قسم "استكشاف الأخطاء" في الدليل
3. Supabase Edge Function Logs
4. Browser Console (F12)

---

## الخلاصة

تم تحويل نظام Google Drive من تكامل غير آمن إلى نظام احترافي يطبق:
- OAuth 2.0 Server-Side Flow
- Environment Variables للمعلومات الحساسة
- Token Refresh تلقائي
- Admin-only access control
- Error handling شامل

النظام جاهز للاستخدام بعد إضافة Client ID & Secret في Supabase Environment Variables! 🚀
