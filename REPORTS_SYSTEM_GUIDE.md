# نظام التقارير المتكامل - دليل الاستخدام
## Comprehensive Reports System - User Guide

## 🎯 نظرة عامة | Overview

تم تطوير نظام التقارير ليكون شاملاً ودقيقاً مع ربط لحظي بجميع جداول النظام وإمكانيات تحليل متقدمة.

The reports system has been completely rebuilt to provide comprehensive and accurate analytics with real-time integration to all system tables and advanced analysis capabilities.

---

## ✨ الميزات الرئيسية | Key Features

### 1️⃣ فلتر الفترة الزمنية المخصص
**Custom Date Range Filter**

- **اختيار مخصص**: حدد التاريخ (من - إلى) بشكل يدوي دقيق
- **اختصارات سريعة**: أزرار جاهزة للفترات الشائعة:
  - اليوم (Today)
  - أسبوع (Week)
  - شهر (Month)
  - 3 أشهر (Quarter)
  - سنة (Year)
- **تحديث لحظي**: جميع البيانات والرسوم البيانية تتغير فوراً عند تغيير الفترة

**Custom Selection**: Manually set precise date ranges (from - to)
**Quick Shortcuts**: Ready buttons for common periods
**Real-time Updates**: All data and charts update instantly when period changes

---

### 2️⃣ الربط البرمجي المتكامل
**Complete Data Integration**

التقارير مرتبطة لحظياً مع:
- ✅ جدول المبيعات (Sales)
- ✅ جدول المشتريات (Purchases)
- ✅ المصاريف التشغيلية (Operating Expenses)
- ✅ مصاريف التأسيس (Setup Expenses)
- ✅ المخزون (Inventory)
- ✅ الهالك (Wastage)
- ✅ الفروع (Branches)

Reports are connected in real-time to all system tables.

---

### 3️⃣ تقرير الضريبة (VAT) الدقيق
**Accurate VAT Report**

#### الحسابات التلقائية:
- **ضريبة المبيعات المحصلة**: مجموع الضريبة من جميع المبيعات المؤكدة
- **ضريبة المشتريات المدفوعة**: مجموع الضريبة من جميع المشتريات المستلمة
- **صافي الضريبة المستحقة**: الفرق الدقيق بين المحصلة والمدفوعة

#### عرض مرئي واضح:
- 🟢 **محصلة** (Collected): ضريبة المبيعات بخلفية خضراء
- 🔴 **مدفوعة** (Paid): ضريبة المشتريات بخلفية حمراء
- 🟠 **الصافي** (Net): المبلغ المستحق للدفع أو الاسترداد

**Automatic Calculations**:
- Sales VAT Collected
- Purchases VAT Paid
- Net VAT Payable/Refundable

---

### 4️⃣ تحليل المخزون المتقدم
**Advanced Inventory Analysis**

#### معلومات شاملة:
- **قيمة المخزون الإجمالية**: القيمة الحالية لجميع المنتجات
- **الكمية الإجمالية**: مجموع الكميات في المخزون
- **مخزون منخفض**: عدد المنتجات التي وصلت لحد إعادة الطلب
- **نفذ المخزون**: عدد المنتجات التي نفذت تماماً

#### تقرير الهالك:
- **القيمة الإجمالية للهالك** في الفترة المختارة
- **الكمية الإجمالية للهالك**
- قائمة تفصيلية بالمنتجات الهالكة

#### المنتجات الراكدة:
- كشف بالمنتجات التي لم تُباع خلال الفترة المختارة
- الكمية المتبقية في المخزون
- مرتبة حسب الأهمية

**Comprehensive Information**:
- Total Inventory Value
- Total Quantity
- Low Stock Items
- Out of Stock Items
- Wastage Report
- Slow-Moving Products

---

### 5️⃣ مقارنة الفروع
**Branch Comparison**

#### تقرير معزول لكل فرع:
- **المبيعات**: إجمالي مبيعات الفرع في الفترة
- **المصاريف**: المصاريف التشغيلية الخاصة بالفرع
- **صافي الربح**: (المبيعات - المصاريف) لكل فرع منفصل

#### الفوائد:
- معرفة أداء كل فرع بدقة
- مقارنة الفروع ببعضها
- اتخاذ قرارات استراتيجية حسب أداء كل فرع

**Isolated Report per Branch**:
- Sales per branch
- Expenses per branch
- Net profit per branch

---

### 6️⃣ تقرير المنتجات الأكثر مبيعاً
**Top Selling Products**

- قائمة بأفضل 10 منتجات مبيعاً
- الكمية المباعة من كل منتج
- إجمالي مبلغ المبيعات لكل منتج
- مرتبة حسب الأهمية

**Top 10 best-selling products**
- Quantity sold
- Total sales amount
- Sorted by importance

---

### 7️⃣ تصدير التقارير
**Export Reports**

#### تصدير Excel شامل:
يتضمن الملف المصدّر:
1. **ورقة الملخص** (Summary):
   - المبيعات وضريبتها
   - المشتريات وضريبتها
   - المصاريف بأنواعها
   - صافي الربح
   - صافي الضريبة

2. **ورقة المنتجات** (Products):
   - قائمة المنتجات الأكثر مبيعاً
   - الكميات والمبالغ

3. **ورقة الفروع** (Branches):
   - مقارنة أداء الفروع
   - المبيعات والمصاريف والأرباح

#### مميزات التصدير:
- ✅ يشمل البيانات المفلترة فقط (حسب التاريخ المختار)
- ✅ تنسيق احترافي مع عناوين واضحة
- ✅ جاهز للطباعة والمشاركة
- ✅ متوافق مع Excel وجميع برامج الجداول

**Comprehensive Excel Export**:
- Includes filtered data only
- Professional formatting
- Ready to print and share
- Compatible with Excel

---

## 📊 البطاقات الإحصائية الرئيسية
**Key Metric Cards**

### 1. إجمالي المبيعات
- المبلغ الإجمالي
- عدد العمليات
- لون: 🟢 تيل (Teal)

### 2. صافي الربح
- الربح بعد خصم المصاريف
- نسبة هامش الربح
- لون: 🟢 أخضر زمردي (Emerald)

### 3. صافي الضريبة
- الفرق بين ضريبة المبيعات والمشتريات
- مستحقة للدفع أو الاسترداد
- لون: 🔵 أزرق (Blue)

### 4. إجمالي المصاريف
- المصاريف التشغيلية + التأسيسية
- عدد المصاريف
- لون: 🟠 برتقالي (Orange)

---

## 🔄 التحديث اللحظي
**Real-time Updates**

### متى تتحدث التقارير؟
1. **عند تغيير الفترة الزمنية**: تحديث فوري
2. **عند إدخال بيانات جديدة**: انتقل لصفحة التقارير وسيتم تحميل البيانات الجديدة
3. **عند تعديل بيانات موجودة**: سيظهر التعديل فوراً

### آلية التحديث:
- استخدام `useEffect` مع `dateFrom` و `dateTo`
- جلب جميع البيانات بشكل متوازي (Parallel)
- معالجة البيانات وعرضها بسرعة

**When do reports update?**
1. When changing date range: immediate update
2. When entering new data: navigate to reports page to load new data
3. When modifying existing data: changes appear immediately

---

## 📈 المؤشرات والتحليلات
**Indicators & Analytics**

### المبيعات حسب المصدر:
- 🏪 **المتجر** (Store)
- 🛒 **سلة** (Salla)

### المصاريف حسب النوع:
- ⚙️ **تشغيلية** (Operating)
- 🏗️ **تأسيس** (Setup)

### حالة المخزون:
- 💰 **قيمة المخزون**
- 📦 **الكمية الإجمالية**
- ⚠️ **مخزون منخفض**
- 🔴 **نفذ المخزون**

---

## 🎨 التصميم والألوان
**Design & Colors**

### الألوان المستخدمة:
- **تيل** (Teal): المبيعات والإيرادات
- **أخضر** (Green): الأرباح والإيجابيات
- **أزرق** (Blue): الضرائب والمالية
- **برتقالي** (Orange): المصاريف والتكاليف
- **أحمر** (Red): الهالك والتنبيهات
- **أصفر** (Yellow): التحذيرات والمخزون المنخفض
- **بنفسجي** (Purple): المصادر الثانوية

### التدرجات:
- استخدام تدرجات ناعمة (Gradients)
- خلفيات فاتحة للبطاقات
- حدود ملونة خفيفة

---

## 🔐 الصلاحيات
**Permissions**

- ✅ **المدير فقط**: التقارير متاحة للمدير فقط
- ❌ **المستخدمون الآخرون**: يظهر لهم رسالة "وصول محظور"

---

## 💡 نصائح الاستخدام
**Usage Tips**

1. **للحصول على أفضل نتائج**: استخدم فترة زمنية محددة بدقة
2. **لمقارنة الأداء**: جرّب فترات مختلفة (شهر، ربع، سنة)
3. **للتصدير**: اختر الفترة المطلوبة ثم اضغط "تصدير Excel"
4. **لمتابعة الضريبة**: راجع قسم "تفصيل الضريبة" بشكل دوري
5. **للمخزون**: راقب المنتجات الراكدة والهالك للتحكم بالتكاليف
6. **للفروع**: استخدم تقرير مقارنة الفروع لتحسين الأداء

---

## 🚀 الميزات المستقبلية المحتملة
**Potential Future Features**

- 📊 رسوم بيانية تفاعلية (Interactive Charts)
- 📅 تقارير مجدولة تلقائياً (Scheduled Reports)
- 📧 إرسال التقارير بالبريد (Email Reports)
- 📱 تطبيق موبايل للتقارير (Mobile App)
- 🤖 تحليل ذكي بالذكاء الاصطناعي (AI Analysis)

---

## 📞 الدعم والمساعدة
**Support & Help**

إذا واجهت أي مشكلة أو لديك اقتراح:
1. تحقق من صحة البيانات المدخلة
2. تأكد من اختيار الفترة الزمنية الصحيحة
3. جرّب تحديث الصفحة (F5)
4. تواصل مع فريق الدعم الفني

If you face any issues or have suggestions:
1. Verify input data accuracy
2. Ensure correct date range selection
3. Try refreshing the page (F5)
4. Contact technical support

---

## ✅ الخلاصة
**Summary**

نظام التقارير الآن:
- ✅ مرتبط لحظياً مع جميع الجداول
- ✅ يوفر فلتر زمني دقيق ومرن
- ✅ يحسب الضريبة (VAT) بدقة محاسبية
- ✅ يحلل المخزون والهالك والراكد
- ✅ يقارن أداء الفروع بشكل معزول
- ✅ يصدّر تقارير Excel شاملة

**Reports system now:**
- ✅ Real-time integration with all tables
- ✅ Accurate and flexible date filter
- ✅ Precise VAT calculations
- ✅ Inventory, wastage, and slow-moving analysis
- ✅ Isolated branch performance comparison
- ✅ Comprehensive Excel export

---

**تم التطوير بواسطة**: نظام بلوف المحاسبي
**Developed by**: BLOOV Accounting System

**التاريخ**: 2026-02-15
**Version**: 2.0
