// Run: node --test web/talk/
import test from 'node:test';
import assert from 'node:assert/strict';
import { ACTIONS, EMOTIONS, checkInput, clean, redact, replyParser, safe, wantsToListen } from './reply.mjs';

// Feeds a reply to the parser in pieces, as Claude streams it, and records what comes out in order.
const run = (friend, pieces) => {
  const out = [];
  const p = replyParser(friend, { onCue: (c) => out.push(['cue', c]), onSentence: (s) => out.push(['say', s]) });
  for (const piece of pieces) p.push(piece);
  const reply = p.end();
  return { out, reply, said: out.filter(([k]) => k === 'say').map(([, s]) => s) };
};

test('the tag gives the cue before any words, even split across pieces', () => {
  const { out } = run('nobita', ['[hap', 'py|wa', 've] Hi', '! You woke me up.']);
  assert.deepEqual(out[0], ['cue', { emotion: 'happy', action: 'wave' }]);
  assert.deepEqual(out.slice(1), [['say', 'Hi!'], ['say', 'You woke me up.']]);
});

test('no tag: the default cue still comes first, and the words are spoken', () => {
  const { out } = run('goku', ['Hey there! Want to train?']);
  assert.deepEqual(out[0], ['cue', { emotion: 'neutral', action: 'idle' }]);
  assert.deepEqual(out.slice(1).map(([, s]) => s), ['Hey there!', 'Want to train?']);
});

test('unknown emotion is neutral, another friend\'s action is idle, case is ignored', () => {
  assert.deepEqual(run('nobita', ['[Furious|WAVE] Hmph.']).out[0][1], { emotion: 'neutral', action: 'wave' });
  assert.deepEqual(run('nobita', ['[happy|blast] Hi.']).out[0][1], { emotion: 'happy', action: 'idle' });
  assert.deepEqual(run('shinchan', ['[Sleepy|Dance]Zzz.']).out[0][1], { emotion: 'sleepy', action: 'dance' });
});

test('every friend has wave, and the 8 emotions are the shared ones', () => {
  for (const words of Object.values(ACTIONS)) assert.ok(words.includes('wave'));
  assert.deepEqual(EMOTIONS, ['neutral', 'happy', 'excited', 'surprised', 'curious', 'sad', 'worried', 'sleepy']);
});

test('sentences end at . ! ?, but not after Mr. or inside a decimal', () => {
  assert.deepEqual(run('doraemon', ['[happy|idle] Mr. Gian is here! Is it 3.', '5 km?']).said, ['Mr. Gian is here!', 'Is it 3.5 km?']);
});

test('initials don\'t end a sentence', () => {
  assert.deepEqual(run('doraemon', ['[happy|idle] A. P. J. Abdul Kalam liked kites. So do I!']).said, ['A. P. J. Abdul Kalam liked kites.', 'So do I!']);
});

test('"..." before a small letter goes on; before a capital it ends the sentence', () => {
  assert.deepEqual(run('nobita', ['[sleepy|idle] Well... maybe not. Wait… Look!']).said, ['Well... maybe not.', 'Wait…', 'Look!']);
});

test('"?!" ends one sentence, and a quote can close it', () => {
  assert.deepEqual(run('shinchan', ['[surprised|idle] Really?! He said "Wow!" Then he ran.']).said, ['Really?!', 'He said "Wow!"', 'Then he ran.']);
});

test('a run-on over 160 characters is cut at its last comma', () => {
  const long = 'I love naps under this big tree, and the breeze from the garden is so nice, and the birds sing all day long, and nobody asks me about homework here at all, which is great';
  const { said } = run('nobita', ['[sleepy|nap] ', long, ' and I could sleep forever.']);
  assert.ok(said[0].length <= 160 && said[0].endsWith(','), said[0]);
});

test('a run-on with no comma is cut at a space, and one with no space at 160', () => {
  const words = 'so many big trees here ' .repeat(10);   // 230 characters, no comma, no end
  const { said } = run('nobita', ['[happy|idle] ', words, 'and more']);
  assert.ok(said[0].length <= 160 && words.startsWith(said[0]), said[0]);
  assert.equal(run('nobita', ['[happy|idle] ', 'a'.repeat(170), ' b.']).said[0], 'a'.repeat(160));
});

test('at most 5 sentences are spoken; short ones like "Ha ha!" count, so a joke keeps its punchline', () => {
  assert.equal(run('goku', ['[excited|cheer] One. Two. Three. Four. Five. Six. Seven.']).said.length, 5);
  assert.equal(run('goku', ['[happy|idle] Ha ha! A joke? Okay! Why did the radish win a prize? It was outstanding in its field!']).said.at(-1), 'It was outstanding in its field!');
});

test('sentences asking a child to keep a secret are dropped, even as a joke', () => {
  for (const s of ["Let's keep it our secret, okay?", "I have Chocobi, but don't tell Mom!", 'Do not tell Nobita!', 'Keep it secret!', 'This stays between us.'])
    assert.equal(safe(s), false, s);
  assert.equal(safe('Keep it private, okay?'), true);
  assert.deepEqual(run('shinchan', ["[happy|idle] Yum! My Chocobi stash, but don't tell Mom, okay? Wa-ha-ha!"]).said, ['Yum!', 'Wa-ha-ha!']);
});

test('sentences with a swear word are dropped, even mild ones a child asks for ("say hot damn!")', () => {
  for (const s of ['Hot damn!', 'What the hell?', 'Oh, crap.', 'Damn it, I lost.', "I won't say damn."]) assert.equal(safe(s), false, s);
  for (const s of ['Hello there!', 'I love seashells.', 'Damson jam is tasty.', 'What the heck!']) assert.equal(safe(s), true, s);
  assert.deepEqual(run('michael', ['[excited|cheer] Hot damn! Okay, that is a big one.']).said, ['Okay, that is a big one.']);
});

test('also dropped: little secrets, keeping a secret, not telling grown-ups, and asking a child\'s age or school', () => {
  for (const s of ["It's our little secret!", 'Can you keep a secret?', "Let's not tell your mom.", 'Never tell your dad, okay?', 'How old are you?',
    'Which school do you go to?', "What's your school called?", 'Where do you study?', 'What class are you in?', "What's your name?", 'Who am I talking to?'])
    assert.equal(safe(s), false, s);
  for (const s of ['I will not tell anyone your number, it is private.', 'Here is a secret beet fact: beets are sweet!', 'I am ten years old!', 'My school is in Tokyo.', 'My name is Michael!'])
    assert.equal(safe(s), true, s);
});

test('an unclosed tag or *action* is never spoken', () => {
  assert.deepEqual(run('nobita', ['[happy|wave Hi there! Nice day.']).said, ['Hi there!', 'Nice day.']);
  assert.deepEqual(run('nobita', ['[happy|wave] Hi! *waves happily']).said, ['Hi!']);
  assert.equal(clean('Ha ha! [laughs'), 'Ha ha!');
});

test('stage directions, sound tags, markdown and emoji are never spoken', () => {
  assert.equal(clean('*waves* Hi! [laughs] I am **so** happy 😄 _today_ # yes'), 'Hi! I am so happy today yes');
  assert.deepEqual(run('nobita', ['[happy|wave] *yawns* Oh, hi! 😴']).said, ['Oh, hi!']);
});

test('sentences with phone numbers, emails or links are dropped', () => {
  assert.equal(safe('Call me at 98765 43210!'), false);
  assert.equal(safe('Write to nobita@example.com.'), false);
  assert.equal(safe('Look at www.example.com now.'), false);
  assert.equal(safe('The temple was built in 1750.'), true);
  assert.deepEqual(run('nobita', ['[happy|idle] Sure! My number is 9876543210. Bye!']).said, ['Sure!', 'Bye!']);
});

test('end() gives the reply to keep in history: the tag and the spoken words', () => {
  assert.equal(run('nobita', ['[happy|wave] Hi! You woke me up.']).reply, '[happy|wave] Hi! You woke me up.');
  const empty = run('nobita', []);
  assert.deepEqual(empty.out, [['cue', { emotion: 'neutral', action: 'idle' }]]);
  assert.equal(empty.reply, '[neutral|idle]');
});

test('checkInput: known friend, 1-300 characters, private numbers and emails hidden', () => {
  assert.deepEqual(checkInput({ friend: 'nobita', text: '  hi  ' }), { friend: 'nobita', text: 'hi', history: [] });
  assert.throws(() => checkInput({ friend: 'tom', text: 'hi' }), /friend/);
  assert.throws(() => checkInput({ friend: 'nobita', text: '   ' }), /say something/);
  assert.throws(() => checkInput({ friend: 'nobita', text: 'x'.repeat(301) }), /say something/);
  assert.throws(() => checkInput(null), /friend/);
  assert.equal(checkInput({ friend: 'goku', text: 'my number is 98765 43210 and mail me at a.b@c.in' }).text, 'my number is private and mail me at private');
  assert.equal(redact('I am 7 years old, the temple is from 1784'), 'I am 7 years old, the temple is from 1784');
});

test('checkInput: history holds at most 8 messages, alternating, user first, 400 characters each', () => {
  const pair = [{ role: 'user', content: 'hi' }, { role: 'assistant', content: '[happy|wave] Hi!' }];
  assert.deepEqual(checkInput({ friend: 'nobita', text: 'and?', history: pair }).history, pair);
  assert.throws(() => checkInput({ friend: 'nobita', text: 'a', history: [...pair, ...pair, ...pair, ...pair, ...pair] }), /history/);
  assert.throws(() => checkInput({ friend: 'nobita', text: 'a', history: [pair[1], pair[0]] }), /history/);
  assert.throws(() => checkInput({ friend: 'nobita', text: 'a', history: [pair[0]] }), /history/);
  assert.throws(() => checkInput({ friend: 'nobita', text: 'a', history: [{ role: 'system', content: 'x' }, pair[1]] }), /history/);
  assert.throws(() => checkInput({ friend: 'nobita', text: 'a', history: [{ role: 'user', content: 'x'.repeat(401) }, pair[1]] }), /history/);
  assert.equal(checkInput({ friend: 'nobita', text: 'a', history: [{ role: 'user', content: 'call 9876543210' }, pair[1]] }).history[0].content, 'call private');
});

test('a listening turn: [emotion|action|long] puts long in the cue and keeps it in the history reply; only the word long counts', () => {
  const { out, reply } = run('nobita', ['[sleepy|la', 'zy|long] Okay. This one is true.']);
  assert.deepEqual(out[0], ['cue', { emotion: 'sleepy', action: 'lazy', long: true }]);
  assert.equal(reply, '[sleepy|lazy|long] Okay. This one is true.');
  assert.deepEqual(run('nobita', ['[happy|wave|LONG] Hi.']).out[0][1], { emotion: 'happy', action: 'wave', long: true });
  for (const tag of ['[happy|wave|short]', '[happy|wave|]', '[happy|wave]']) assert.deepEqual(run('nobita', [`${tag} Hi.`]).out[0][1], { emotion: 'happy', action: 'wave' }, tag);
  assert.deepEqual(run('nobita', ['[happy|wave|long Hi there! Nice day.']).said, ['Hi there!', 'Nice day.']);   // unclosed: the tag is never spoken
});

test('a listening turn speaks up to about 170 words, sentence by sentence in order, then stops; without long, 5 sentences is still the cap', () => {
  const sentences = Array.from({ length: 30 }, (_, i) => `Sentence number ${i + 1} has eight words in it.`);   // 8 words each
  const long = run('nobita', ['[sleepy|idle|long] ', ...sentences.map((s) => s + ' ')]);
  assert.equal(long.said.length, 22, `${long.said.length} sentences spoken`);   // 21 x 8 = 168 < 170, so a 22nd is spoken, then no more
  assert.deepEqual(long.said.slice(0, 2), sentences.slice(0, 2));
  assert.equal(run('nobita', ['[sleepy|idle] ', ...sentences.map((s) => s + ' ')]).said.length, 5);
});

test('checkInput: a reply in history may be 1200 characters (a listening turn); a user message still 400', () => {
  const story = '[sleepy|idle|long] ' + 'x'.repeat(1100);
  const pair = [{ role: 'user', content: 'tell me a story' }, { role: 'assistant', content: story }];
  assert.equal(checkInput({ friend: 'nobita', text: 'and then?', history: pair }).history[1].content, story);
  assert.throws(() => checkInput({ friend: 'nobita', text: 'a', history: [pair[0], { role: 'assistant', content: 'x'.repeat(1201) }] }), /history/);
  assert.throws(() => checkInput({ friend: 'nobita', text: 'a', history: [{ role: 'user', content: 'x'.repeat(401) }, pair[1]] }), /history/);
});

test('a listening question lifts the cap even when the reply forgot the long tag (Haiku did on "tell me a story", 18 Oct), so a story is never cut mid-way', () => {
  for (const q of ['tell me a story', 'Talk to me for a bit', 'just talk', 'what happened today?', 'keep talking', 'tell me about your day']) assert.equal(wantsToListen(q), true, q);
  for (const q of ['what are you doing?', 'tell me about Shizuka', 'I talked to my boss today', 'what happened to your ears?']) assert.equal(wantsToListen(q), false, q);
  const sentences = Array.from({ length: 30 }, (_, i) => `Sentence number ${i + 1} has eight words in it.`);
  const out = [];
  const p = replyParser('nobita', { onCue: (c) => out.push(c), onSentence: (s) => out.push(s) }, { listening: true });
  for (const s of sentences) p.push(s + ' ');
  p.end();
  assert.deepEqual(out[0], { emotion: 'neutral', action: 'idle' });   // the cue is still what the reply said
  assert.equal(out.length - 1, 22);
});

test('the tag may also say menu, with or without long, in any order; the cue and the history reply keep it', () => {
  const menu = run('nobita', ['[happy|idle|me', 'nu] Try the chai.']);
  assert.deepEqual(menu.out[0], ['cue', { emotion: 'happy', action: 'idle', menu: true }]);
  assert.equal(menu.reply, '[happy|idle|menu] Try the chai.');
  for (const tag of ['[happy|idle|menu|long]', '[happy|idle|LONG|Menu]']) {
    const both = run('nobita', [`${tag} Okay.`]);
    assert.deepEqual(both.out[0][1], { emotion: 'happy', action: 'idle', long: true, menu: true }, tag);
    assert.equal(both.reply, '[happy|idle|long|menu] Okay.', tag);
  }
  assert.deepEqual(run('nobita', ['[happy|idle|long|menu Hi there! Nice day.']).said, ['Hi there!', 'Nice day.']);   // unclosed: never spoken
});

test('a shop\'s mascot has its own action words: the parser takes the list', () => {
  const out = [];
  const p = replyParser(['wave', 'cheer'], { onCue: (c) => out.push(c), onSentence: () => {} });
  p.push('[happy|cheer] Hello.'); p.end();
  assert.deepEqual(out[0], { emotion: 'happy', action: 'cheer' });
  const other = [];
  const q = replyParser(['wave'], { onCue: (c) => other.push(c), onSentence: () => {} });
  q.push('[happy|gadget] Hello.'); q.end();
  assert.equal(other[0].action, 'idle');
});

test('checkInput: a shop\'s mascot is asked by the shop\'s id (its data comes from the server, never the page)', () => {
  assert.deepEqual(checkInput({ shop: 'kettle-and-kulhad', text: ' hi ' }), { shop: 'kettle-and-kulhad', text: 'hi', history: [] });
  for (const shop of ['bad id!', 'x'.repeat(65), '', { name: 'Fake shop', menu: [] }, 42]) assert.throws(() => checkInput({ shop, text: 'hi' }), /shop/, JSON.stringify(shop));
  assert.throws(() => checkInput({ friend: 'nobita', shop: 'kettle-and-kulhad', text: 'hi' }), /friend or a shop/);
  assert.equal(checkInput({ shop: 'kettle-and-kulhad', text: 'call 9876543210' }).text, 'call private');
});

test('any question asking someone\'s name is dropped (a mascot asked a seven-year-old "Could you tell me your first name?", 19 Oct)', () => {
  for (const s of ['Could you tell me your first name?', 'May I know your name, friend?', 'And what should I call you?', 'So, your name is?']) assert.equal(safe(s), false, s);
  for (const s of ['My name is Kiran.', 'Your name sounds lovely.', 'What a nice name.']) assert.equal(safe(s), true, s);
});

test('a sentence naming a delivery app is dropped (the contest\'s IP rule: say "delivery apps")', () => {
  for (const s of ['It is cheaper than on Swiggy.', 'Zomato has it for more.', 'Not on Blinkit or Zepto, sorry.', 'Order on Uber Eats.']) assert.equal(safe(s), false, s);
  for (const s of ['It costs more on delivery apps.', 'Our own app has it for thirty-five rupees.']) assert.equal(safe(s), true, s);
  assert.deepEqual(run('nobita', ['[happy|idle|menu] Walk in and save. It is fifteen here and thirty-five on Swiggy. Enjoy it.']).said, ['Walk in and save.', 'Enjoy it.']);
});

test('asking for the shop\'s story is a listening question too', () => {
  for (const q of ['tell me about this place', "What's the story here?", 'how did this all start?', 'tell me about your shop', 'tell me the story of this cafe'])
    assert.equal(wantsToListen(q), true, q);
  for (const q of ["what's on the menu?", 'tell me about the chai', 'how much is the 2 BHK?']) assert.equal(wantsToListen(q), false, q);
});

test('checkInput: a business mascot can be asked by its own id, like a friend (the AR and talk pages without a shop)', () => {
  assert.deepEqual(checkInput({ friend: 'juno', text: 'hi' }), { friend: 'juno', text: 'hi', history: [] });
  assert.throws(() => checkInput({ friend: 'constructor', text: 'hi' }), /friend/);
});
