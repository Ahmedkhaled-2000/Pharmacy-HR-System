import React, { useState, useEffect } from 'react';
import { Warehouse, User, Database, Clock } from 'lucide-react';

export default function StockStatusBar({
  activeLocationName = 'كافة المستودعات والفروع',
  totalSkus = 0,
  isOnline = true,
  currentUserName = 'مدير النظام'
}) {
  const [currentTime, setCurrentTime] = useState(() => new Date().toLocaleTimeString('ar-EG'));

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString('ar-EG'));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="stock-desktop-statusbar">
      <div className="stock-statusbar-segment">
        <span className={`stock-status-indicator ${isOnline ? '' : 'offline'}`} />
        <span>{isOnline ? 'السيرفر متصل • PostgreSQL & Redis' : 'وضع عدم الاتصال أوفلاين'}</span>
      </div>

      <div className="stock-statusbar-segment">
        <Warehouse size={13} color="#38bdf8" />
        <span>المستودع النشط: <strong>{activeLocationName}</strong></span>
      </div>

      <div className="stock-statusbar-segment">
        <Database size={13} color="#10b981" />
        <span>إجمالي الأصناف المسجلة: <strong>{totalSkus.toLocaleString('ar-EG')}</strong></span>
      </div>

      <div className="stock-statusbar-segment">
        <User size={13} color="#a78bfa" />
        <span>المستخدم: <strong>{currentUserName}</strong></span>
      </div>

      <div className="stock-statusbar-segment">
        <Clock size={13} color="#94a3b8" />
        <span>{currentTime}</span>
      </div>
    </div>
  );
}
