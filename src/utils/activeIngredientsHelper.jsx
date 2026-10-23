import React from 'react';

/**
 * Parses generic names and active ingredient lists into an array of individual ingredients
 * Splits on +, ;, /, comma, "and", "مع" without breaking inner chemical terms
 */
export function parseActiveIngredients(genericName, activeIngredientsList) {
  if (Array.isArray(activeIngredientsList) && activeIngredientsList.length > 0) {
    const res = activeIngredientsList
      .map((item) => (typeof item === 'string' ? item : item?.name || item?.ingredient || '').trim())
      .filter(Boolean);
    if (res.length > 0) return res;
  }

  if (!genericName || typeof genericName !== 'string') return [];

  // Split by +, ;, /, comma, or 'and'/'مع'
  const rawParts = genericName.split(/\s*(?:\+|\;|\/|\band\b|\bمع\b|\,)\s*/gi);
  return rawParts
    .map((p) => p.trim())
    .filter((p) => p.length > 1);
}

/**
 * Renders active ingredients as independent isolated boxes/badges (مربعات مستقلة)
 * Eliminates text overlapping, RTL/LTR bidirection clashes, and guarantees clean display
 */
export function renderActiveIngredientBadges(genericName, activeIngredientsList, customStyle = {}) {
  const list = parseActiveIngredients(genericName, activeIngredientsList);

  if (list.length === 0) {
    return (
      <span style={{ color: '#64748b', fontSize: '12.5px', fontStyle: 'italic', ...customStyle }}>
        غير محددة
      </span>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '6px',
        alignItems: 'center',
        marginTop: '4px'
      }}
    >
      {list.map((ing, idx) => (
        <span
          key={idx}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            padding: '5px 10px',
            background: '#f0f9ff',
            color: '#0369a1',
            border: '1.5px solid #bae6fd',
            borderRadius: '8px',
            fontSize: '12px',
            fontWeight: '800',
            direction: 'ltr',
            textAlign: 'left',
            unicodeBidi: 'isolate',
            wordBreak: 'break-word',
            boxShadow: '0 1px 2px rgba(2, 132, 199, 0.06)',
            lineHeight: 1.3,
            ...customStyle
          }}
        >
          <span style={{ fontSize: '11px', flexShrink: 0 }}>🧬</span>
          <span style={{ letterSpacing: '0.2px' }}>{ing}</span>
        </span>
      ))}
    </div>
  );
}
