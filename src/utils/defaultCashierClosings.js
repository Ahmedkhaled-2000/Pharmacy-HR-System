/**
 * defaultCashierClosings.js
 * بيانات أولية لتقفيل ورديات خزائن الكاشير والعجز والزيادة وتسويات الجرد
 */

export const DEFAULT_CASHIER_CLOSINGS = [
  {
    id: 'close-1',
    closure_number: 'TR-CSH-260907-001',
    branch_id: 'b-1', // سموحة
    shift_type: 'morning', // morning | evening | night
    closing_date: '2026-09-07',
    closing_time: '15:30',
    cashier_id: 'emp-1',
    cashier_name: 'د. أحمد محمود (كاشير رئيسي)',
    opening_float: 500,
    gross_sales: 14250,
    cash_sales: 9800,
    visa_sales: 3100,
    wallet_sales: 900,
    credit_sales: 450,
    drawer_expenses: 120, // فواتير نثرية
    cash_returns: 80, // مرتجعات كاش للعملاء
    expected_cash: 10100, // 500 + 9800 - 120 - 80 = 10100
    actual_cash: 10100,
    difference: 0,
    status: 'balanced', // balanced | shortage | surplus
    notes: 'وردية صباحية مطابقة 100% بدون أي فروقات نقدية',
    allocated_employees: [],
  },
  {
    id: 'close-2',
    closure_number: 'TR-CSH-260906-002',
    branch_id: 'b-1', // سموحة
    shift_type: 'evening',
    closing_date: '2026-09-06',
    closing_time: '23:45',
    cashier_id: 'emp-2',
    cashier_name: 'د. سارة إبراهيم',
    opening_float: 500,
    gross_sales: 18600,
    cash_sales: 12400,
    visa_sales: 4500,
    wallet_sales: 1200,
    credit_sales: 500,
    drawer_expenses: 150,
    cash_returns: 100,
    expected_cash: 12650, // 500 + 12400 - 150 - 100 = 12650
    actual_cash: 12450,
    difference: -200, // عجز 200 ج.م
    status: 'shortage',
    notes: 'تم اكتشاف عجز 200 جنيه وتم توزيعه بالتساوي على موظفي وردية الصيدلية',
    allocated_employees: [
      { employee_id: 'emp-2', employee_name: 'د. سارة إبراهيم', amount: 100 },
      { employee_id: 'emp-3', employee_name: 'د. مصطفى كمال', amount: 100 },
    ],
  },
  {
    id: 'close-3',
    closure_number: 'TR-CSH-260906-003',
    branch_id: 'b-2', // العجمي
    shift_type: 'morning',
    closing_date: '2026-09-06',
    closing_time: '15:15',
    cashier_id: 'emp-4',
    cashier_name: 'د. هاني عادل',
    opening_float: 400,
    gross_sales: 11200,
    cash_sales: 7600,
    visa_sales: 2400,
    wallet_sales: 800,
    credit_sales: 400,
    drawer_expenses: 60,
    cash_returns: 0,
    expected_cash: 7940, // 400 + 7600 - 60 = 7940
    actual_cash: 8140,
    difference: 200, // زيادة 200 ج.م
    status: 'surplus',
    notes: 'زيادة نقدية معلقة في حساب الأمانات (21804) لمقاصتها مع الجرد الشهري للأصناف',
    allocated_employees: [],
  },
  {
    id: 'close-4',
    closure_number: 'TR-CSH-260905-004',
    branch_id: 'b-3', // محطة الرمل
    shift_type: 'night',
    closing_date: '2026-09-05',
    closing_time: '08:00',
    cashier_id: 'emp-5',
    cashier_name: 'د. ياسمين طارق',
    opening_float: 600,
    gross_sales: 9500,
    cash_sales: 6200,
    visa_sales: 2300,
    wallet_sales: 700,
    credit_sales: 300,
    drawer_expenses: 80,
    cash_returns: 50,
    expected_cash: 6670, // 600 + 6200 - 80 - 50 = 6670
    actual_cash: 6520,
    difference: -150, // عجز 150 ج.م
    status: 'shortage',
    notes: 'تحميل العجز بالكامل على الكاشير المسؤول لخصمه من راتب الشهر',
    allocated_employees: [
      { employee_id: 'emp-5', employee_name: 'د. ياسمين طارق', amount: 150 },
    ],
  },
];
