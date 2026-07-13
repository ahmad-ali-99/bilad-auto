import React, { useEffect, useRef, useState } from 'react';
import { parseRequest } from '../lib/assistant.js';
import { getAgentKey, runAgent, getIsAdmin, getCurrentUsername, loadChat, saveChat, clearChat } from '../lib/agent.js';

// المساعد بالواجهة الأولى:
// - إذا مفتاح Gemini المجاني مفعّل (الإعدادات) → ايجنت حقيقي بمحادثة كاملة وأدوات
//   (يعبي العرض، يقرأ الأسعار، يعدل سعر بموافقتك، يفتح المخزون)
// - بدون مفتاح → المحلل السريع المحلي (أوفلاين)
// fill: وضع النافذة العائمة — يملأ ارتفاع الحاوية والمحادثة تاخذ المساحة المتبقية
export default function AssistantBar({ onQuote, onInventory, getDraft, fill = false }) {
  const [text, setText] = useState('');
  const [apiKey, setApiKey] = useState(null); // null = جاري الفحص
  const [messages, setMessages] = useState([]); // {role:'user'|'agent', text}
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const historyRef = useRef([]);
  const usernameRef = useRef('');
  const scrollRef = useRef(null);

  useEffect(() => {
    getAgentKey().then((k) => setApiKey(k || ''));
    getIsAdmin().then(setIsAdmin);
    // استرجاع محادثة المستخدم المحفوظة — تبقى بعد التنقل بين الصفحات والتحديث
    getCurrentUsername().then(async (u) => {
      usernameRef.current = u;
      const saved = await loadChat(u);
      if (saved.messages.length) {
        setMessages(saved.messages);
        historyRef.current = saved.history || [];
      }
    });
  }, []);

  function persist(msgs) {
    if (usernameRef.current !== '' || msgs.length) {
      saveChat(usernameRef.current, { messages: msgs, history: historyRef.current });
    }
  }

  async function handleClear() {
    setMessages([]);
    historyRef.current = [];
    await clearChat(usernameRef.current);
  }

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, status]);

  const executor = {
    fillQuote: (fields) => onQuote(fields),
    openInventory: (search) => onInventory(search),
    getDraft: () => (getDraft ? getDraft() : null),
  };

  async function send() {
    const userText = text.trim();
    if (!userText || busy) return;
    setText('');

    // نعيد فحص المفتاح بكل إرسال — يمكن انضاف/انحذف بعد فتح الصفحة
    let key = apiKey;
    if (!key) {
      key = (await getAgentKey()) || '';
      if (key !== apiKey) setApiKey(key);
    }

    // بدون مفتاح → المحلل المحلي السريع
    if (!key) {
      const result = parseRequest(userText);
      let reply;
      if (result.intent === 'inventory') {
        onInventory(result.search);
        reply = result.summary;
      } else if (result.intent === 'quote') {
        onQuote(result.fields);
        reply = result.summary + (result.missing.length ? ` — باقي تنطيني: ${result.missing.join('، ')}` : '');
      } else {
        reply = 'ما فهمت — جرب: «زبون احمد يريد منظومة 20 امبير نهاري و10 ليلي 6 ساعات بمساحة 40 متر». وللمساعد الذكي الكامل فعّل مفتاح Gemini المجاني من الإعدادات.';
      }
      setMessages((m) => {
        const next = [...m, { role: 'user', text: userText }, { role: 'agent', text: reply }];
        persist(next);
        return next;
      });
      return;
    }

    // ايجنت حقيقي
    setMessages((m) => [...m, { role: 'user', text: userText }]);
    setBusy(true);
    setStatus('يفكر...');
    try {
      const { text: reply, history } = await runAgent({
        apiKey: key,
        history: historyRef.current,
        userText,
        executor,
        onStatus: setStatus,
        isAdmin,
      });
      historyRef.current = history.slice(-40); // نحتفظ بآخر جزء من المحادثة
      setMessages((m) => {
        const next = [...m, { role: 'agent', text: reply }];
        persist(next);
        return next;
      });
    } catch (err) {
      setMessages((m) => [...m, { role: 'agent', text: 'صار خطأ بالاتصال: ' + err.message }]);
    } finally {
      setBusy(false);
      setStatus('');
    }
  }

  return (
    <div className={fill ? undefined : 'card'} style={fill ? { display: 'flex', flexDirection: 'column', height: '100%' } : { marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <label style={{ fontWeight: 700, color: 'var(--navy)', flex: 1 }}>
          🤖 المساعد الذكي{isAdmin && ' — صلاحية تعديل ✏'}
          {apiKey === '' && <span className="muted" style={{ fontWeight: 400 }}> (وضع سريع — فعّل Gemini المجاني من الإعدادات للمحادثة الكاملة)</span>}
        </label>
        {messages.length > 0 && (
          <button className="btn btn-secondary btn-sm" onClick={handleClear} title="مسح المحادثة">
            🧹 مسح
          </button>
        )}
      </div>

      {(messages.length > 0 || fill) && (
        <div
          ref={scrollRef}
          style={
            fill
              ? { flex: 1, minHeight: 0, overflowY: 'auto', margin: '8px 0', display: 'flex', flexDirection: 'column', gap: 6 }
              : { maxHeight: 260, overflowY: 'auto', margin: '8px 0', display: 'flex', flexDirection: 'column', gap: 6 }
          }
        >
          {messages.length === 0 && fill && (
            <div className="muted" style={{ textAlign: 'center', marginTop: 24 }}>
              اكتبلي شتريد: أعبيلك عرض، أجاوبك عن الأسعار من المخزون، وأشرحلك أي نتيجة 🤖
            </div>
          )}
          {messages.map((m, i) => (
            <div
              key={i}
              style={{
                alignSelf: m.role === 'user' ? 'flex-start' : 'flex-end',
                background: m.role === 'user' ? '#e5eaf0' : '#eef7ee',
                borderRadius: 10,
                padding: '7px 11px',
                maxWidth: '85%',
                whiteSpace: 'pre-wrap',
                fontSize: '0.92rem',
              }}
            >
              {m.text}
            </div>
          ))}
          {busy && <div className="muted" style={{ alignSelf: 'flex-end' }}>{status || '...'}</div>}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder="مثال: زبون احمد يريد منظومة 20 امبير نهاري و10 ليلي 6 ساعات بمساحة 40 متر — أو اسأل عن الأسعار"
          style={{ flex: 1, minWidth: 220 }}
          disabled={busy}
        />
        <button className="btn btn-primary" onClick={send} disabled={busy}>
          {busy ? '...' : 'دز 🪄'}
        </button>
      </div>
    </div>
  );
}
