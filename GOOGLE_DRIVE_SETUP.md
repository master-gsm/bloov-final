# دليل إعداد Google Drive للتخزين

## نظرة عامة
تم تفعيل نظام التخزين على Google Drive في تطبيق Bloov Accounting. يمكنك الآن تخزين جميع الملفات والمرفقات (الفواتير، الإيصالات، المستندات) على Google Drive بدلاً من Supabase Storage.

## المميزات
- ✅ تخزين غير محدود (حسب مساحة Google Drive)
- ✅ نسخ احتياطي تلقائي عبر Google
- ✅ الوصول للملفات من أي مكان
- ✅ أمان عالي من Google
- ✅ التبديل السهل بين Supabase و Google Drive

---

## خطوات الإعداد

### 1️⃣ إنشاء مشروع في Google Cloud Console

1. اذهب إلى [Google Cloud Console](https://console.cloud.google.com)
2. قم بتسجيل الدخول بحساب Google الخاص بك
3. اضغط على "Select a Project" ثم "NEW PROJECT"
4. أدخل اسم المشروع (مثلاً: "Bloov Accounting")
5. اضغط "CREATE"

### 2️⃣ تفعيل Google Drive API

1. في القائمة الجانبية، اذهب إلى **APIs & Services** > **Library**
2. ابحث عن "Google Drive API"
3. اضغط على "Google Drive API"
4. اضغط على زر "ENABLE"

### 3️⃣ إنشاء OAuth 2.0 Client ID

1. في القائمة الجانبية، اذهب إلى **APIs & Services** > **Credentials**
2. اضغط على "CREATE CREDENTIALS" ثم اختر "OAuth client ID"
3. إذا ظهرت رسالة "Configure consent screen"، اضغط عليها واتبع الخطوات:
   - اختر "External"
   - أدخل اسم التطبيق (Bloov Accounting)
   - أدخل بريدك الإلكتروني
   - احفظ وأكمل
4. عد إلى Credentials واختر "OAuth client ID"
5. اختر Application type: **Web application**
6. أدخل اسم (مثلاً: Bloov Web Client)
7. في "Authorized JavaScript origins"، أضف:
   ```
   http://localhost:5173
   https://yourdomain.com
   ```
8. اضغط "CREATE"
9. **احفظ Client ID** - ستحتاجه لاحقاً

### 4️⃣ إنشاء API Key

1. في نفس صفحة Credentials
2. اضغط على "CREATE CREDENTIALS" ثم اختر "API key"
3. سيتم إنشاء API Key
4. **احفظ API Key** - ستحتاجه لاحقاً
5. (اختياري) اضغط على "RESTRICT KEY" لتحديد الاستخدام على Drive API فقط

### 5️⃣ إضافة المفاتيح في التطبيق

1. افتح تطبيق Bloov Accounting
2. اذهب إلى **الإعدادات** > **التخزين**
3. اختر **Google Drive**
4. الصق:
   - **Client ID** الذي حصلت عليه في الخطوة 3
   - **API Key** الذي حصلت عليه في الخطوة 4
5. (اختياري) أدخل **معرف المجلد** إذا كنت تريد التخزين في مجلد محدد
6. اضغط **ربط**
7. سيُطلب منك تسجيل الدخول إلى Google وإعطاء الصلاحيات

---

## الحصول على معرف المجلد (اختياري)

إذا كنت تريد تخزين الملفات في مجلد معين على Google Drive:

1. افتح [Google Drive](https://drive.google.com)
2. أنشئ مجلد جديد (مثلاً: "Bloov Files")
3. افتح المجلد
4. انظر إلى عنوان URL في المتصفح:
   ```
   https://drive.google.com/drive/folders/1ABC2DEF3GHI4JKL5MNO
   ```
5. معرف المجلد هو الجزء الأخير: `1ABC2DEF3GHI4JKL5MNO`
6. الصق هذا المعرف في حقل "معرف المجلد" في إعدادات التطبيق

---

## استكشاف الأخطاء

### ❌ "No access token available"
- تأكد من أنك قمت بتسجيل الدخول إلى Google
- جرب الضغط على "ربط" مرة أخرى

### ❌ "Origin not allowed"
- تأكد من إضافة رابط التطبيق في "Authorized JavaScript origins"
- إذا كنت تستخدم localhost، تأكد من إضافة `http://localhost:5173`

### ❌ "API key not valid"
- تأكد من نسخ API Key بشكل صحيح
- تأكد من تفعيل Google Drive API

### ❌ "Upload failed"
- تحقق من اتصالك بالإنترنت
- تأكد من أن لديك مساحة كافية على Google Drive
- جرب تسجيل الدخول مرة أخرى

---

## الأمان

- ⚠️ **لا تشارك Client ID أو API Key** مع أي شخص
- ⚠️ Client ID و API Key يتم تخزينهما محلياً في المتصفح فقط
- ⚠️ Google Drive يطلب صلاحية الوصول للملفات التي أنشأها التطبيق فقط

---

## التبديل بين مزودي التخزين

يمكنك التبديل بين Supabase و Google Drive في أي وقت:

1. اذهب إلى **الإعدادات** > **التخزين**
2. اختر المزود المطلوب
3. الملفات القديمة ستبقى في المكان القديم
4. الملفات الجديدة ستُحفظ في المكان الجديد

---

## الدعم

إذا واجهت أي مشاكل:
- راجع التعليمات أعلاه
- تحقق من إعدادات Google Cloud Console
- تأكد من تفعيل Google Drive API
