import React, { useState } from 'react';
import { parseRequest } from '../lib/assistant.js';

// شريط المساعد بالواجهة الأولى — يكتب البياع طلب الزبون بالعربي والمساعد يرتب العرض
// أو يكتب «عدل سعر ...» فينتقل للمخزون مع تعبئة البحث
export default function AssistantBar({ onQuote, onInventory }) {
  const [text, setText] = useState('');
  const [feedback, setFeedback] = useState(null);

  function run() {
    const result = parseRequest(text);
    if (result.intent === 'empty') return;
    if (result.intent === 'unknown') {
      setFeedback({
        kind: 'warn',
        msg: 'ما فهمت الطلب — جرب مثل: «زبون احمد يريد منظومة 20 امبير نهاري و10 ليلي 6 ساعات بمساحة 40 متر» أو «عدل سعر بطارية ديه»',
      });
      return;
    }
    if (result.intent === 'inventory') {
      setFeedback({ kind: 'ok', msg: result.summary });
      onInventory(result.search);
      return;
    }
    // intent === 'quote'
    let msg = result.summary;
    if (result.missing.length) msg += ` — باقي تنطيني: ${result.missing.join('، ')}`;
    setFeedback({ kind: result.missing.length ? 'warn' : 'ok', msg });
    onQuote(result.fields);
  }

  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <label style={{ fontWeight: 700, color: 'var(--navy)' }}>🤖 المساعد — اكتب طلب الزبون وأنا أرتبلك العرض</label>
      <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && run()}
          placeholder="مثال: زبون احمد يريد منظومة 20 امبير نهاري و10 ليلي 6 ساعات بمساحة 40 متر"
          style={{ flex: 1, minWidth: 220 }}
        />
        <button className="btn btn-primary" onClick={run}>
          رتبلي 🪄
        </button>
      </div>
      {feedback && (
        <div className={`alert ${feedback.kind === 'ok' ? 'alert-info' : 'alert-warning'}`} style={{ marginTop: 8, marginBottom: 0 }}>
          {feedback.msg}
        </div>
      )}
    </div>
  );
}
