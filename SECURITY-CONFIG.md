# إعدادات الأمان المطلوبة / Required Security Configuration

هذا الملف يوضح الإعدادات الإضافية التي تحتاج إلى تفعيلها يدوياً في Supabase Dashboard لتعزيز أمان المشروع.

This file explains additional settings that need to be manually enabled in the Supabase Dashboard to enhance project security.

---

## ✅ تم إصلاحه / Fixed

### 1. حذف الفهارس غير المستخدمة / Removed Unused Indexes

تم حذف جميع الفهارس (Indexes) غير المستخدمة من قاعدة البيانات لتحسين الأداء وتقليل استهلاك المساحة.

All unused indexes have been removed from the database to improve performance and reduce storage usage.

---

## ⚠️ يحتاج إلى تفعيل يدوي / Requires Manual Configuration

الإعدادات التالية تُدار من Supabase Dashboard ولا يمكن تفعيلها عبر SQL:

The following settings are managed through the Supabase Dashboard and cannot be enabled via SQL:

### 2. استراتيجية اتصال قاعدة بيانات المصادقة / Auth DB Connection Strategy

**المشكلة / Issue:**
خادم المصادقة مُعد لاستخدام 10 اتصالات كحد أقصى (رقم ثابت بدلاً من نسبة مئوية).

Auth server is configured to use a maximum of 10 connections (fixed number instead of percentage).

**الحل / Solution:**

1. افتح [Supabase Dashboard](https://app.supabase.com)
2. اختر مشروعك / Select your project
3. انتقل إلى **Settings** → **Database** → **Connection Pooling**
4. في قسم **Auth Pooler**:
   - غيّر استراتيجية الاتصال من "Fixed number" إلى "Percentage"
   - استخدم نسبة مئوية مناسبة (يُنصح بـ 10-20%)
5. احفظ التغييرات / Save changes

**الفوائد / Benefits:**
- تحسين الأداء عند زيادة حجم قاعدة البيانات
- استخدام أفضل لموارد الاتصال

---

### 3. حماية كلمات المرور المسربة / Leaked Password Protection

**المشكلة / Issue:**
حماية كلمات المرور المسربة معطلة حالياً.

Leaked password protection is currently disabled.

**الحل / Solution:**

1. افتح [Supabase Dashboard](https://app.supabase.com)
2. اختر مشروعك / Select your project
3. انتقل إلى **Authentication** → **Providers** → **Email**
4. في قسم **Password Security**:
   - فعّل خيار **"Enable leaked password protection"**
   - يُنصح أيضاً بتفعيل:
     - Minimum password length: 8 characters (على الأقل)
     - Require lowercase letters
     - Require uppercase letters
     - Require numbers
     - Require special characters
5. احفظ التغييرات / Save changes

**الفوائد / Benefits:**
- منع المستخدمين من استخدام كلمات مرور مسربة ومعروفة
- حماية من هجمات Credential Stuffing
- يستخدم HaveIBeenPwned.org API للتحقق من كلمات المرور

**ملاحظة / Note:**
هذه الميزة متاحة في خطة Pro وما فوق.

This feature is available on Pro Plan and above.

---

## التحقق من التطبيق الصحيح / Verification

بعد تطبيق جميع الإعدادات، تأكد من:

After applying all settings, verify:

- ✅ لا توجد تحذيرات أمنية في Supabase Dashboard
- ✅ No security warnings in Supabase Dashboard
- ✅ جميع الجداول محمية بـ RLS
- ✅ All tables are protected with RLS
- ✅ حماية كلمات المرور المسربة مفعّلة
- ✅ Leaked password protection is enabled
- ✅ استراتيجية اتصال المصادقة محدثة
- ✅ Auth connection strategy is updated

---

## إعدادات الأمان الإضافية الموصى بها / Additional Recommended Security Settings

### متطلبات كلمة المرور / Password Requirements
- الحد الأدنى للطول: 8 أحرف / Minimum length: 8 characters
- يجب أن تحتوي على: أحرف صغيرة وكبيرة وأرقام ورموز
- Must contain: lowercase, uppercase, numbers, and symbols

### المصادقة متعددة العوامل / Multi-Factor Authentication
- فكّر في تفعيل MFA للمسؤولين
- Consider enabling MFA for admin users

### سياسات RLS / RLS Policies
- ✅ تم تطبيق سياسات RLS على جميع الجداول
- ✅ RLS policies applied to all tables
- ✅ التحقق من الصلاحيات قبل كل عملية
- ✅ Permission verification before each operation

---

## المساعدة / Help

للمزيد من المعلومات، راجع:
For more information, refer to:

- [Supabase Auth Configuration](https://supabase.com/docs/guides/auth/general-configuration)
- [Password Security Guide](https://supabase.com/docs/guides/auth/password-security)
- [Database Connection Management](https://supabase.com/docs/guides/database/connection-management)
