import React from 'react';
import {
  BarChart3,
  Layers,
  Clock,
  Truck,
  FilePlus,
  ClipboardCheck,
  FileText,
  FileSpreadsheet,
  Plus,
  RefreshCw,
  Send,
  Boxes,
  TrendingUp,
  ShieldAlert,
  Trash2,
  Building2,
  Printer
} from 'lucide-react';

export default function StockQuickRibbon({
  activeTab,
  setActiveTab,
  stats = {},
  onNewReceipt,
  onNewTransfer,
  onNewCount,
  onRefresh,
  isLoading = false
}) {
  const tabs = [
    { id: 'dashboard', label: 'لوحة المؤشرات', icon: BarChart3 },
    { id: 'balances', label: 'كشاف الأرصدة', icon: Layers, badge: stats?.totalSkus },
    { id: 'batches', label: 'التشغيلات والصلاحية (FEFO)', icon: Clock, badge: stats?.nearExpiryCount, badgeColor: '#f59e0b' },
    { id: 'transfers', label: 'التحويلات وبضاعة الطريق', icon: Truck, badge: stats?.inTransitCount, badgeColor: '#06b6d4' },
    { id: 'suppliers', label: 'الموردين', icon: Building2 },
    { id: 'label_printer', label: 'طابعات الملصقات', icon: Printer },
    { id: 'reorder', label: 'تخطيط وإعادة الطلب (AI)', icon: TrendingUp, badge: stats?.lowStockCount, badgeColor: '#ef4444' },
    { id: 'recalls', label: 'الاستدعاء الدوائي (EDA)', icon: ShieldAlert },
    { id: 'scrap', label: 'التوالف والمرتجعات', icon: Trash2 },
    { id: 'receipts', label: 'استلام المشتريات', icon: FilePlus },
    { id: 'counts', label: 'جلسات الجرد', icon: ClipboardCheck },
    { id: 'ledger', label: 'دفتر الأستاذ الدائم', icon: FileText },
    { id: 'reports', label: 'مركز التقارير (20)', icon: FileSpreadsheet }
  ];

  return (
    <div className="stock-ribbon-bar">
      {/* تبويبات التنقل الرئيسية */}
      <div className="stock-ribbon-left">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              className={`stock-ribbon-tab-btn ${isActive ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <Icon size={15} />
              <span>{tab.label}</span>
              {Boolean(tab.badge && tab.badge > 0) && (
                <span
                  className="stock-ribbon-badge"
                  style={tab.badgeColor ? { color: tab.badgeColor } : undefined}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* أزرار الإجراءات السريعة في أقصى اليسار */}
      <div className="stock-ribbon-right">
        <button
          type="button"
          className="stock-quick-action-btn primary"
          onClick={onNewReceipt}
          title="تسجيل فاتورة استلام وتوريد من مورد (Ctrl+N)"
        >
          <Plus size={14} />
          <span>استلام مورد</span>
        </button>

        <button
          type="button"
          className="stock-quick-action-btn warning"
          onClick={onNewTransfer}
          title="إنشاء أمر تحويل بضاعة بين المستودعات والفروع (Ctrl+T)"
        >
          <Send size={14} />
          <span>تحويل فروع</span>
        </button>

        <button
          type="button"
          className="stock-quick-action-btn outline"
          onClick={onNewCount}
          title="فتح جلسة جرد فعلي ومطابقة الفروقات (Ctrl+J)"
        >
          <ClipboardCheck size={14} />
          <span>جلسة جرد</span>
        </button>

        <button
          type="button"
          className="stock-quick-action-btn outline"
          onClick={onRefresh}
          title="تحديث فوري لبيانات المستودعات (F5)"
        >
          <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
          <span>مزامنة</span>
        </button>
      </div>
    </div>
  );
}
