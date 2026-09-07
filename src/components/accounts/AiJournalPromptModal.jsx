import React, { useState } from 'react';
import { parseNaturalLanguageJournalPrompt } from '../../utils/aiAccountingEngine';

/**
 * AiJournalPromptModal.jsx
 * نافذة توليد القيود المحاسبية الذكية من الأوامر والنصوص العامية والطبيعية
 */
export default function AiJournalPromptModal({
  isOpen,
  onClose,
  accounts = [],
  branches = [],
  treasuries = [],
  costCenters = [],
  onSaveGeneratedEntry,
}) {
  const [promptText, setPromptText] = useState('');
  const [parsingResult, setParsingResult] = useState(null);

  if (!isOpen) return null;

  const SAMPLE_PROMPTS = [
    'دفعنا 1850 جنيه كهرباء لصيدلية سموحة نقداً من الخزينة',
    'سداد 35000 جنيه لشركة المتحدة للأدوية بشيك من البنك الأهلي',
    'تحويل 40000 من فودافون كاش لحساب بنك مصر وعمولة 200',
    'صرف سلفة مستعجلة 2000 جنيه للدكتور أحمد من خزينة الإدارة',
    'صيانة تكييفات وثلاجة الأدوية بصيدلية العجمي 950 كاش',
    'شراء أدوات نظافة وأكياس وضيافة للصيدلية 450 نقداً',
  ];

  const handleRunAi = () => {
    if (!promptText.trim()) return;
    const result = parseNaturalLanguageJournalPrompt(
      promptText.trim(),
      accounts,
      branches,
      treasuries,
      costCenters
    );
    setParsingResult(result);
  };

  const handleApplySample = (sample) => {
    setPromptText(sample);
    const result = parseNaturalLanguageJournalPrompt(
      sample,
      accounts,
      branches,
      treasuries,
      costCenters
    );
    setParsingResult(result);
  };

  const handleConfirmAndSave = () => {
    if (!parsingResult?.suggestedEntry) return;
    onSaveGeneratedEntry(parsingResult.suggestedEntry);
    onClose();
  };

  return (
    <div className="acc-modal-overlay" onClick={onClose}>
      <div className="acc-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '660px' }}>
        {/* Header */}
        <div className="acc-modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '26px' }}>🤖</span>
            <div>
              <h2>المساعد المحاسبي الذكي: توليد القيود من الأوامر الطبيعية</h2>
              <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--muted, #64748b)' }}>
                اكتب أي عملية مالية باللغة العامية أو الفصحى، وسيقوم الذكاء الاصطناعي بتحديد الحسابات والفرع وتوليد القيد المتزن
              </p>
            </div>
          </div>
          <button type="button" className="acc-action-icon-btn" onClick={onClose} style={{ fontSize: '18px' }}>
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="acc-modal-body">
          {/* Prompt Input */}
          <div className="acc-form-group">
            <label style={{ fontSize: '13px', fontWeight: '800' }}>
              ✍️ صف المعاملة المالية باللغة اليومية:
            </label>
            <textarea
              className="acc-form-textarea"
              rows="3"
              placeholder="مثال: دفعنا 1500 جنيه فاتورة كهرباء صيدلية سموحة كاش من الخزينة..."
              value={promptText}
              onChange={(e) => {
                setPromptText(e.target.value);
                if (parsingResult) setParsingResult(null);
              }}
              style={{ fontSize: '14px', lineHeight: '1.6' }}
            ></textarea>
          </div>

          {/* Sample Chips */}
          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontSize: '11.5px', color: 'var(--muted, #64748b)', marginBottom: '6px' }}>
              💡 جرب أحد النماذج الصيدلانية الجاهزة بنقرة واحدة:
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {SAMPLE_PROMPTS.map((sample, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => handleApplySample(sample)}
                  style={{
                    background: 'var(--surface-subtle, #f8fafc)',
                    border: '1px solid var(--border, #e2e8f0)',
                    padding: '4px 10px',
                    borderRadius: '8px',
                    fontSize: '11.5px',
                    cursor: 'pointer',
                    color: '#0284c7',
                    fontWeight: '600',
                    transition: 'all 0.15s',
                  }}
                >
                  ⚡ {sample}
                </button>
              ))}
            </div>
          </div>

          {/* Run Button */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
            <button
              type="button"
              className="acc-btn acc-btn-primary"
              onClick={handleRunAi}
              disabled={!promptText.trim()}
              style={{ padding: '8px 20px', fontSize: '13.5px' }}
            >
              🤖 تحليل وتوليد القيد ذكياً
            </button>
          </div>

          {/* AI Output / Result Preview */}
          {parsingResult && parsingResult.success && (
            <div style={{
              background: '#f0fdf4',
              border: '1px solid #bbf7d0',
              borderRadius: '12px',
              padding: '16px',
              animation: 'fadeIn 0.2s ease',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '18px' }}>✨</span>
                  <strong style={{ color: '#166534', fontSize: '14.5px' }}>
                    تم استنتاج وتوليد القيد بنجاح (دقة {Math.round((parsingResult.confidence || 0.95) * 100)}%)
                  </strong>
                </div>
                <span style={{ fontSize: '11px', background: '#dcfce7', color: '#15803d', padding: '2px 8px', borderRadius: '6px', fontWeight: '800' }}>
                  {parsingResult.recognizedRule}
                </span>
              </div>

              <div style={{ fontSize: '13px', color: '#166534', marginBottom: '10px' }}>
                البيان المستنتج: <strong>{parsingResult.suggestedEntry.narration}</strong>
              </div>

              {/* Entry Preview Table */}
              <table className="acc-table" style={{ background: '#fff', fontSize: '12px', borderRadius: '8px', overflow: 'hidden' }}>
                <thead>
                  <tr>
                    <th>طرف القيد المحاسبي</th>
                    <th style={{ width: '110px', color: '#059669' }}>مدين (+)</th>
                    <th style={{ width: '110px', color: '#dc2626' }}>دائن (-)</th>
                    <th>شرح السطر</th>
                  </tr>
                </thead>
                <tbody>
                  {parsingResult.suggestedEntry.lines.map((line, idx) => {
                    const acc = accounts.find((a) => a.id === line.account_id);
                    return (
                      <tr key={idx}>
                        <td>
                          <strong>{acc ? `${acc.code} - ${acc.name_ar}` : line.account_id}</strong>
                        </td>
                        <td style={{ fontWeight: '800', color: line.debit > 0 ? '#059669' : '#94a3b8', fontFamily: 'monospace' }}>
                          {line.debit > 0 ? Number(line.debit).toLocaleString(undefined, { minimumFractionDigits: 2 }) : '—'}
                        </td>
                        <td style={{ fontWeight: '800', color: line.credit > 0 ? '#dc2626' : '#94a3b8', fontFamily: 'monospace' }}>
                          {line.credit > 0 ? Number(line.credit).toLocaleString(undefined, { minimumFractionDigits: 2 }) : '—'}
                        </td>
                        <td style={{ fontSize: '11px', color: '#64748b' }}>{line.line_desc}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', color: '#15803d' }}>
                  ✓ القيد متزن محاسبياً (إجمالي الطرفين: {parsingResult.parsedAmount.toLocaleString()} ج.م)
                </span>
                <button
                  type="button"
                  className="acc-btn acc-btn-primary"
                  onClick={handleConfirmAndSave}
                  style={{ background: '#166534', borderColor: '#166534' }}
                >
                  💾 اعتماد وترحيل القيد لليومية العامة
                </button>
              </div>
            </div>
          )}

          {parsingResult && parsingResult.error && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', padding: '12px 16px', borderRadius: '10px', fontSize: '13px' }}>
              ⚠️ {parsingResult.error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="acc-modal-footer">
          <button type="button" className="acc-btn acc-btn-outline" onClick={onClose}>
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
}
