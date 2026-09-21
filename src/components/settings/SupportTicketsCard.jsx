import React, { useState, useEffect } from 'react';
import {
  LifeBuoy,
  Plus,
  MessageSquare,
  Clock,
  CheckCircle2,
  AlertCircle,
  Send,
  RefreshCw,
  ExternalLink,
  ChevronRight,
  Sparkles
} from 'lucide-react';

export default function SupportTicketsCard({ state = {}, showToast }) {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isNewTicketModalOpen, setIsNewTicketModalOpen] = useState(false);
  const [activeTicket, setActiveTicket] = useState(null);
  const [replyMessage, setReplyMessage] = useState('');
  const [submittingReply, setSubmittingReply] = useState(false);

  const [newTicketForm, setNewTicketForm] = useState({
    title: '',
    category: 'technical',
    priority: 'normal',
    message: ''
  });
  const [submittingTicket, setSubmittingTicket] = useState(false);

  const orgSettings = state.orgSettings || {};
  const companyId = orgSettings.companyId || 'comp_primary_default';
  const companyName = orgSettings.orgName || 'الشركة';

  const fetchTickets = async () => {
    try {
      const token = localStorage.getItem('app_auth_token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch(`/api/tenant/tickets?company_id=${encodeURIComponent(companyId)}`, { headers });
      const data = await res.json();
      if (data.success) {
        setTickets(data.tickets || []);
      }
    } catch {
      // Fallback
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTickets();
  }, [companyId]);

  // Socket listener for real-time replies
  useEffect(() => {
    if (!activeTicket) return;
    const interval = setInterval(() => {
      fetchTickets();
    }, 15000);
    return () => clearInterval(interval);
  }, [activeTicket]);

  const handleCreateTicket = async (e) => {
    e.preventDefault();
    if (!newTicketForm.title.trim() || !newTicketForm.message.trim()) return;

    setSubmittingTicket(true);
    try {
      const token = localStorage.getItem('app_auth_token');
      const headers = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      };

      const res = await fetch('/api/tenant/tickets', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          ...newTicketForm,
          company_id: companyId,
          company_name: companyName
        })
      });

      const data = await res.json();
      if (data.success) {
        showToast?.('✅ تم فتح تذكرة الدعم الفني بنجاح! سيقوم المطور بالرد قريباً.');
        setIsNewTicketModalOpen(false);
        setNewTicketForm({ title: '', category: 'technical', priority: 'normal', message: '' });
        fetchTickets();
      } else {
        showToast?.(`⚠️ ${data.error || 'تعذر فتح التذكرة'}`);
      }
    } catch {
      showToast?.('⚠️ حدث خطأ أثناء فتح التذكرة');
    } finally {
      setSubmittingTicket(false);
    }
  };

  const handleSendReply = async (e) => {
    e.preventDefault();
    if (!replyMessage.trim() || !activeTicket) return;

    setSubmittingReply(true);
    try {
      const token = localStorage.getItem('app_auth_token');
      const headers = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      };

      const res = await fetch(`/api/tenant/tickets/${activeTicket.id}/reply`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ message: replyMessage.trim() })
      });

      const data = await res.json();
      if (data.success) {
        setReplyMessage('');
        const updatedMessages = [
          ...(activeTicket.messages || []),
          { sender: 'client', sender_name: 'أنت', message: replyMessage.trim(), timestamp: new Date().toISOString() }
        ];
        setActiveTicket({ ...activeTicket, messages: updatedMessages });
        fetchTickets();
      }
    } catch {
      showToast?.('⚠️ تعذر إرسال الرد حالياً');
    } finally {
      setSubmittingReply(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', direction: 'rtl', fontFamily: 'inherit' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '12px',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: '16px',
        padding: '18px 22px',
        boxShadow: '0 2px 10px rgba(0,0,0,0.02)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '44px',
            height: '44px',
            borderRadius: '12px',
            background: 'rgba(14, 165, 233, 0.15)',
            color: '#0ea5e9',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '22px'
          }}>
            <LifeBuoy size={22} />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800 }}>تذاكر الدعم الفني ومراسلة المطور</h3>
            <p style={{ margin: '3px 0 0', fontSize: '12px', color: 'var(--muted)' }}>
              قناة مباشرة وموثقة مع الفريق التقني لحل المشكلات وطلب الميزات الجديدة والاستفسارات
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            type="button"
            onClick={fetchTickets}
            className="btn btn-outline"
            style={{ padding: '8px 12px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <RefreshCw size={14} />
            <span>تحديث</span>
          </button>
          <button
            type="button"
            onClick={() => setIsNewTicketModalOpen(true)}
            style={{
              padding: '9px 16px',
              borderRadius: '10px',
              background: 'var(--primary)',
              color: '#ffffff',
              border: 'none',
              fontWeight: 800,
              fontSize: '12.5px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <Plus size={15} />
            <span>فتح تذكرة جديدة</span>
          </button>
        </div>
      </div>

      {/* Main View: Split List and Active Chat */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: activeTicket ? '320px 1fr' : '1fr',
        gap: '16px'
      }}>
        {/* Ticket List */}
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: '16px',
          padding: '16px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.02)'
        }}>
          <div style={{ fontSize: '13px', fontWeight: 800, marginBottom: '12px', color: 'var(--muted)' }}>
            سجل التذاكر ({tickets.length})
          </div>

          {tickets.length === 0 ? (
            <div style={{ padding: '30px', textAlign: 'center', color: 'var(--muted)', fontSize: '12.5px' }}>
              لا توجد تذاكر دعم فني مفتوحة حالياً. يمكنك فتح تذكرة جديدة وسيقوم المطور بالرد عليك مباشرة.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {tickets.map((tkt) => {
                const isSelected = activeTicket?.id === tkt.id;
                return (
                  <div
                    key={tkt.id}
                    onClick={() => setActiveTicket(tkt)}
                    style={{
                      padding: '12px 14px',
                      borderRadius: '12px',
                      border: isSelected ? '1.5px solid var(--primary)' : '1px solid var(--border)',
                      background: isSelected ? 'rgba(14, 165, 233, 0.06)' : 'var(--surface-muted)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <span style={{ fontWeight: 800, fontSize: '13px', color: 'var(--text)' }}>{tkt.title}</span>
                      <span style={{
                        fontSize: '10.5px',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        fontWeight: 800,
                        background: tkt.status === 'open' ? '#dcfce7' : tkt.status === 'resolved' ? '#f1f5f9' : '#fef3c7',
                        color: tkt.status === 'open' ? '#166534' : tkt.status === 'resolved' ? '#475569' : '#b45309'
                      }}>
                        {tkt.status === 'open' ? 'مفتوحة 🟢' : tkt.status === 'resolved' ? 'تم الحل ✅' : 'قيد المتابعة ⏳'}
                      </span>
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--muted)', display: 'flex', justifyContent: 'space-between' }}>
                      <span>{tkt.category === 'technical' ? 'عطل تقني' : tkt.category === 'billing' ? 'ماليات واشتراك' : 'اقتراح ميزة'}</span>
                      <span>{new Date(tkt.last_reply_at || tkt.created_at).toLocaleDateString('ar-EG')}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Active Ticket Conversation */}
        {activeTicket && (
          <div style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: '16px',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            minHeight: '440px',
            boxShadow: '0 2px 10px rgba(0,0,0,0.02)'
          }}>
            {/* Conversation Header */}
            <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: '12px', marginBottom: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h4 style={{ margin: 0, fontSize: '15.5px', fontWeight: 800 }}>{activeTicket.title}</h4>
                <div style={{ fontSize: '11.5px', color: 'var(--muted)', marginTop: '3px' }}>
                  تاريخ الفتح: {new Date(activeTicket.created_at).toLocaleDateString('ar-EG')} · الفئة: {activeTicket.category}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveTicket(null)}
                style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '18px' }}
              >
                ✕
              </button>
            </div>

            {/* Messages Thread */}
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px', padding: '10px 0', maxHeight: '350px' }}>
              {(activeTicket.messages || []).map((msg, i) => {
                const isDev = msg.sender === 'developer';
                return (
                  <div
                    key={i}
                    style={{
                      alignSelf: isDev ? 'flex-start' : 'flex-end',
                      maxWidth: '78%',
                      borderRadius: '14px',
                      padding: '12px 16px',
                      background: isDev ? 'linear-gradient(135deg, #1e293b, #0f172a)' : 'var(--primary)',
                      color: '#ffffff',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                    }}
                  >
                    <div style={{ fontSize: '11px', opacity: 0.85, fontWeight: 700, marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {isDev ? <span>👑 مطور المنظومة</span> : <span>👤 {msg.sender_name || 'أنت'}</span>}
                      <span>·</span>
                      <span>{new Date(msg.timestamp).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <div style={{ fontSize: '13px', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                      {msg.message}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Reply Input Box */}
            <form onSubmit={handleSendReply} style={{ display: 'flex', gap: '10px', marginTop: '14px', borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
              <input
                type="text"
                placeholder="اكتب ردك هنا..."
                value={replyMessage}
                onChange={(e) => setReplyMessage(e.target.value)}
                style={{
                  flex: 1,
                  padding: '10px 14px',
                  borderRadius: '10px',
                  border: '1px solid var(--border)',
                  background: 'var(--background)',
                  fontSize: '13px',
                  color: 'var(--text)'
                }}
              />
              <button
                type="submit"
                disabled={submittingReply || !replyMessage.trim()}
                style={{
                  padding: '10px 18px',
                  borderRadius: '10px',
                  border: 'none',
                  background: 'var(--primary)',
                  color: '#ffffff',
                  fontWeight: 800,
                  fontSize: '13px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <Send size={14} />
                <span>إرسال</span>
              </button>
            </form>
          </div>
        )}
      </div>

      {/* New Ticket Modal */}
      {isNewTicketModalOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(5px)',
          zIndex: 99999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px'
        }}>
          <div style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: '20px',
            maxWidth: '500px',
            width: '100%',
            padding: '26px',
            boxShadow: '0 25px 50px rgba(0,0,0,0.3)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 800 }}>فتح تذكرة دعم فني جديدة</h4>
              <button
                type="button"
                onClick={() => setIsNewTicketModalOpen(false)}
                style={{ background: 'none', border: 'none', fontSize: '18px', color: 'var(--muted)', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateTicket} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, marginBottom: '6px' }}>عنوان التذكرة / المشكلة:</label>
                <input
                  type="text"
                  placeholder="مثال: استفسار حول تقفيل الرواتب أو شفتات الفروع..."
                  value={newTicketForm.title}
                  onChange={(e) => setNewTicketForm({ ...newTicketForm, title: e.target.value })}
                  required
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--background)', fontSize: '13px' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, marginBottom: '6px' }}>التصنيف:</label>
                  <select
                    value={newTicketForm.category}
                    onChange={(e) => setNewTicketForm({ ...newTicketForm, category: e.target.value })}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--background)', fontSize: '13px' }}
                  >
                    <option value="technical">عطل تقني / شاشة</option>
                    <option value="billing">اشتراكات ومدفوعات</option>
                    <option value="feature_request">طلب ميزة جديدة</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, marginBottom: '6px' }}>درجة الأهمية:</label>
                  <select
                    value={newTicketForm.priority}
                    onChange={(e) => setNewTicketForm({ ...newTicketForm, priority: e.target.value })}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--background)', fontSize: '13px' }}
                  >
                    <option value="normal">عادي</option>
                    <option value="urgent">عاجل جداً 🚨</option>
                    <option value="low">منخفض</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, marginBottom: '6px' }}>تفاصيل المشكلة أو الرسالة:</label>
                <textarea
                  rows={4}
                  placeholder="اشرح المشكلة بالتفصيل، وسيتابعها المطور فوراً..."
                  value={newTicketForm.message}
                  onChange={(e) => setNewTicketForm({ ...newTicketForm, message: e.target.value })}
                  required
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--background)', fontSize: '13px', resize: 'vertical' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => setIsNewTicketModalOpen(false)}
                  style={{ flex: 1, padding: '10px', borderRadius: '10px', border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', fontWeight: 700 }}
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={submittingTicket}
                  style={{ flex: 2, padding: '10px', borderRadius: '10px', border: 'none', background: 'var(--primary)', color: '#fff', fontWeight: 800, cursor: 'pointer' }}
                >
                  {submittingTicket ? 'جاري الإرسال...' : 'إرسال التذكرة'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
