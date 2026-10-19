// J5a: "I bought something". Today's 6-digit counter code turns the walk into a verified visit. Demo shops nobody has
// claimed show their code here, so anyone can try it; a real shop's code is only at its till.
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { db, hostOf, portraitOf, sectionOf, type ShopWithMenu } from './shops';
import { Icon } from './ui';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];

export default function CodeSheet({ shop, onBack, onVerified }: { shop: ShopWithMenu; onBack: () => void; onVerified: (visit: string) => void }) {
  const mascot = hostOf(shop);
  const [code, setCode] = useState('');
  const [checking, setChecking] = useState(false);
  const [shake, setShake] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [demo, setDemo] = useState<string | null>(null);
  const busy = useRef(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => box.current?.focus(), []);

  useEffect(() => {
    if (!shop.demo || shop.owner) return;
    let live = true;
    void db.rpc('demo_today_code', { p_slug: shop.slug }).then(({ data }) => {
      if (live && typeof data === 'string') setDemo(data);
    });
    return () => { live = false; };
  }, [shop.demo, shop.owner, shop.slug]);

  const press = (key: string) => {
    if (busy.current) return;
    setMessage(null);
    setCode((c) => (key === '⌫' ? c.slice(0, -1) : c.length < 6 ? c + key : c));
  };

  // The sixth digit checks the code.
  useEffect(() => {
    if (code.length !== 6) return;
    busy.current = true;
    setChecking(true);
    void db.rpc('verify_visit', { p_slug: shop.slug, p_code: code }).then(({ data, error }) => {
      busy.current = false;
      setChecking(false);
      const answer = data as { ok: boolean; visit?: string; error?: string } | null;
      if (!error && answer?.ok && answer.visit) {
        onVerified(answer.visit);
        return;
      }
      setCode('');
      if (error) setMessage('No connection. Try again.');
      else if (answer?.error === 'too-many') setMessage('Too many tries today. Try again tomorrow.');
      else {
        setMessage('That’s not today’s code. Ask at the till again.');
        setShake(true);
        window.setTimeout(() => setShake(false), 320);
        navigator.vibrate?.(60);
      }
    });
    // One check per full code; the callbacks don't change during it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (/^[0-9]$/.test(event.key)) press(event.key);
      else if (event.key === 'Backspace') press('⌫');
      else if (event.key === 'Escape') onBack();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return createPortal(
    <div className="code-wrap">
      <div className="code-screen" ref={box} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Today’s counter code">
        <div className="code-top" style={{ '--c': sectionOf(shop).color } as CSSProperties}>
          <button type="button" className="icon-btn round code-back" onClick={onBack} aria-label="Back"><Icon name="back" size={21} color="#fff" stroke={2.4} /></button>
          <img src={portraitOf(mascot)} alt="" />
          <h2>Ask the counter for today’s code</h2>
          <p>{shop.name} shows it at the till</p>
        </div>
        <div className="code-sheet">
          <div className={`code-boxes${shake ? ' is-wrong' : ''}`} role="status" aria-label={checking ? 'Checking the code' : `${code.length} of 6 digits`}>
            {Array.from({ length: 6 }, (_, i) => <span key={i} className={i === code.length && !checking ? 'is-next' : ''}>{code[i] ?? ''}</span>)}
            {checking && <i className="code-spin" />}
          </div>
          {message && <p className="code-msg" role="alert">{message}</p>}
          <p className="j-note is-center"><Icon name="info" size={15} />One code per visit. It changes every day, so only people who came in can post.</p>
          {demo && (
            <div className="code-demo">
              <span>Demo shop · today’s code is <b>{demo}</b></span>
              <button type="button" onClick={() => !busy.current && setCode(demo)}>Fill it</button>
            </div>
          )}
          <div className="code-keys">
            {KEYS.map((key, i) => (key
              ? <button key={i} type="button" onClick={() => press(key)} aria-label={key === '⌫' ? 'Delete' : key}>{key}</button>
              : <span key={i} />))}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
