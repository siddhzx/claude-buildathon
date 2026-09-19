import { useEffect, useRef, useState } from 'react';
import { buildSnapshot, localAnswer } from '../sim/strategy';
import { COMPOUNDS, MODE, fmtLap } from '../sim/tyres';
import type { Compound, PaceMode } from '../sim/types';
import type { SimHandle } from '../useSim';
import { Meter, TyreRing } from './ui';

interface ChatMsg { role: 'user' | 'assistant'; content: string; source?: string }

const QUICK = ['Should we box now?', 'What is the rain plan?', 'Can we undercut the car ahead?', 'How exposed are we to a Safety Car?'];

export function EngineerRail({ h, activeTab }: { h: SimHandle; activeTab: string }) {
  const { sim, analysis: a, autopilot } = h;
  const our = sim.our;
  const [tab, setTab] = useState<'calls' | 'chat'>('calls');
  const behind = sim.cars[our.pos];
  const topConf = a.advice[0]?.confidence;

  const act = (fn: () => void) => { fn(); h.refresh(); };
  const compounds: Compound[] = ['S', 'M', 'H', 'I', 'W'];

  return (
    <aside className="rail">
      <div className={`call ${a.headline.tone}`}>
        <div className="k"><span>Engineer call · lap {a.lap}</span>{topConf != null && <span className="mono">CONF {Math.round(topConf * 100)}%</span>}</div>
        <h2>{a.headline.call}</h2>
        <p>{a.headline.text}</p>
      </div>

      <div className="carstrip">
        <div className="p mono">P{our.pos}</div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <b>VER</b><span className="muted">#3 Red Bull</span>
            <span className="mono dim" style={{ marginLeft: 'auto' }}>{fmtLap(our.lastLap)}</span>
          </div>
          <div className="gaps">
            <span>AHEAD</span><span>{our.pos > 1 ? `${sim.cars[our.pos - 2].code} +${our.interval.toFixed(1)}` : 'clear track'}</span>
            <span>BEHIND</span><span>{behind && behind.status !== 'OUT' ? `${behind.code} +${behind.interval.toFixed(1)}` : '—'}</span>
          </div>
        </div>
        <div style={{ display: 'grid', justifyItems: 'center', gap: 4, width: 64 }}>
          <TyreRing c={our.compound} large />
          <span className="mono muted" style={{ fontSize: 10 }}>{Math.round(our.tyreAge)} LAPS</span>
          <div style={{ width: '100%' }}><Meter value={a.tyre.lifeLeft} color={a.tyre.lifeLeft < 0.25 ? 'var(--crit)' : a.tyre.lifeLeft < 0.45 ? 'var(--warn)' : 'var(--good)'} /></div>
        </div>
      </div>

      <div className="cmd">
        <div className="line">
          <span className="lbl">Auto</span>
          <button className={`switch ${autopilot ? 'on' : ''}`} onClick={() => h.setAutopilot(!autopilot)} aria-pressed={autopilot}><i />{autopilot ? 'ENGINEER EXECUTES CALLS' : 'MANUAL: YOU MAKE THE CALLS'}</button>
        </div>
        <div className="line">
          <span className="lbl">Pace</span>
          <div className="seg">
            {(['SAVE', 'STD', 'PUSH'] as PaceMode[]).map((m) => <button key={m} className={our.mode === m ? 'on' : ''} onClick={() => act(() => { h.setAutopilot(false); sim.setMode(m); })}>{MODE[m].label.toUpperCase()}</button>)}
          </div>
        </div>
        <div className="line">
          <span className="lbl">Box</span>
          {compounds.map((c) => {
            const n = sim.availableSets(c).length;
            const on = our.pitCall === c;
            return <button key={c} className={`boxbtn ${on ? 'on' : ''}`} disabled={!n || our.status !== 'RUN' || our.finished} title={`${COMPOUNDS[c].name}: ${n} set${n === 1 ? '' : 's'} available`} onClick={() => act(() => (on ? sim.cancelPit() : sim.callPit(c)))}><TyreRing c={c} />×{n}</button>;
          })}
        </div>
      </div>

      <div className="railtabs">
        <button className={tab === 'calls' ? 'on' : ''} onClick={() => setTab('calls')}>STRATEGY CALLS · {a.advice.length}</button>
        <button className={tab === 'chat' ? 'on' : ''} onClick={() => setTab('chat')}>ASK THE ENGINEER</button>
      </div>

      {tab === 'calls' ? (
        <div className="feed">
          {a.advice.map((x) => (
            <div key={x.id} className={`adv ${x.priority}`}>
              <div className="top"><span className="pri">{x.priority}</span><span>{x.category}</span><span className="conf">{Math.round(x.confidence * 100)}%</span></div>
              <h4>{x.title}</h4>
              <p>{x.detail}</p>
              {!autopilot && x.action?.type === 'BOX' && our.status === 'RUN' && !our.pitCall && (
                <button className="btn small primary" style={{ marginTop: 6 }} onClick={() => act(() => sim.callPit((x.action as { compound: Compound }).compound))}>EXECUTE: BOX FOR {COMPOUNDS[x.action.compound].name.toUpperCase()}S</button>
              )}
            </div>
          ))}
          {!a.advice.length && <p className="muted" style={{ padding: 8 }}>No active calls.</p>}
        </div>
      ) : null}
      {/* Kept mounted so the conversation survives switching to the calls feed. */}
      <div style={{ display: tab === 'chat' ? 'flex' : 'none', flex: 1, minHeight: 0 }}><Chat h={h} activeTab={activeTab} /></div>
    </aside>
  );
}

function Chat({ h, activeTab }: { h: SimHandle; activeTab: string }) {
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState<boolean | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const hRef = useRef(h);
  hRef.current = h;
  const tabRef = useRef(activeTab);
  tabRef.current = activeTab;

  // Poll until the Claude link is up, so adding a key to .env flips the badge without a reload.
  useEffect(() => {
    if (live) return;
    const check = () => fetch('/api/status').then((r) => r.json()).then((s) => setLive(Boolean(s.live))).catch(() => setLive(false));
    check();
    const timer = window.setInterval(check, 4000);
    return () => window.clearInterval(timer);
  }, [live]);
  useEffect(() => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight }); }, [msgs]);

  const patchLast = (fn: (m: ChatMsg) => ChatMsg) => setMsgs((prev) => prev.map((m, i) => (i === prev.length - 1 ? fn(m) : m)));

  async function ask(q: string) {
    const text = q.trim();
    if (!text || busy) return;
    const { sim, analysis } = hRef.current;
    const history = [...msgs, { role: 'user' as const, content: text }];
    setMsgs([...history, { role: 'assistant', content: '', source: live ? 'CLAUDE' : 'BUILT-IN MODEL' }]);
    setInput('');
    if (!live) {
      patchLast((m) => ({ ...m, content: localAnswer(text, sim, analysis) }));
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/engineer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history.map(({ role, content }) => ({ role, content })), snapshot: buildSnapshot(sim, analysis, tabRef.current) }),
      });
      if (!res.ok || !res.body) throw new Error((await res.text()) || `HTTP ${res.status}`);
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const blocks = buf.split('\n\n');
        buf = blocks.pop() ?? '';
        for (const b of blocks) {
          const ev = /^event: (.+)$/m.exec(b)?.[1];
          const data = /^data: (.+)$/m.exec(b)?.[1];
          if (!ev || !data) continue;
          const payload = JSON.parse(data);
          if (ev === 'delta') patchLast((m) => ({ ...m, content: m.content + payload.text }));
          if (ev === 'error') patchLast((m) => ({ ...m, content: `${m.content}\n[${payload.message}]`.trim() }));
        }
      }
    } catch (err) {
      const { sim: s, analysis: an } = hRef.current;
      patchLast((m) => ({ ...m, source: 'BUILT-IN MODEL', content: `${localAnswer(text, s, an)}\n\n[Claude unavailable: ${err instanceof Error ? err.message : 'request failed'}]` }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="chat">
      <div style={{ padding: '7px 10px 0' }}>
        <span className="live" style={{ color: live ? 'var(--good)' : 'var(--text-3)' }}><i />{live == null ? 'CHECKING LINK' : live ? 'CLAUDE LINK LIVE · RACE STATE ATTACHED TO EVERY QUESTION' : 'CLAUDE LINK OFFLINE · BUILT-IN MODEL IS ANSWERING'}</span>
      </div>
      <div className="msgs" ref={scroller}>
        {!msgs.length && <p className="muted" style={{ margin: 0, fontSize: 12 }}>Ask anything about the race or any panel on the dashboard. The engineer sees the full live state: gaps, tyres, radar, risk, practice data and the strategy model's numbers.</p>}
        {live === false && <p className="note" style={{ margin: 0 }}>To talk to Claude, put your Anthropic API key in the <span className="mono">.env</span> file in the project folder (<span className="mono">ANTHROPIC_API_KEY=...</span>). This panel connects by itself a few seconds later. The key stays on the local dev server and never reaches the browser.</p>}
        {msgs.map((m, i) => (
          <div key={i} className={`msg ${m.role}`}>
            {m.role === 'assistant' && <span className="who">ENGINEER · {m.source}</span>}
            {m.content || (busy && i === msgs.length - 1 ? '…' : '')}
          </div>
        ))}
      </div>
      <div className="chips">{QUICK.map((q) => <button key={q} onClick={() => ask(q)} disabled={busy}>{q}</button>)}</div>
      <form onSubmit={(e) => { e.preventDefault(); ask(input); }}>
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Radio the engineer…" aria-label="Question for the engineer" />
        <button className="btn primary" disabled={busy || !input.trim()}>SEND</button>
      </form>
    </div>
  );
}
