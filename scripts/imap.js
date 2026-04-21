#!/usr/bin/env node
// imap.js — read and manage email via IMAP

const imapSimple = require('imap-simple');
const { simpleParser } = require('mailparser');
const { loadConfig } = require('./config');

const args = process.argv.slice(2);
const command = args[0];

function getArg(flag, defaultVal = null) {
  const i = args.indexOf(flag);
  return i !== -1 && args[i + 1] ? args[i + 1] : defaultVal;
}

function hasFlag(flag) {
  return args.includes(flag);
}

function parseRecent(str) {
  if (!str) return null;
  const match = str.match(/^(\d+)(m|h|d)$/);
  if (!match) return null;
  const val = parseInt(match[1]);
  const unit = match[2];
  const now = new Date();
  if (unit === 'm') return new Date(now - val * 60 * 1000);
  if (unit === 'h') return new Date(now - val * 60 * 60 * 1000);
  if (unit === 'd') return new Date(now - val * 24 * 60 * 60 * 1000);
  return null;
}

async function connect(cfg) {
  const config = {
    imap: {
      host: cfg.IMAP_HOST,
      port: parseInt(cfg.IMAP_PORT || '993'),
      tls: cfg.IMAP_TLS !== 'false',
      tlsOptions: { rejectUnauthorized: cfg.IMAP_REJECT_UNAUTHORIZED !== 'false' },
      user: cfg.IMAP_USER,
      password: cfg.IMAP_PASS,
      authTimeout: 10000,
    },
  };
  return imapSimple.connect(config);
}

async function cmdCheck() {
  const cfg = loadConfig();
  const limit = parseInt(getArg('--limit', '10'));
  const recent = parseRecent(getArg('--recent'));
  const mailbox = getArg('--mailbox', cfg.IMAP_MAILBOX || 'INBOX');

  const conn = await connect(cfg);
  await conn.openBox(mailbox);

  const criteria = ['UNSEEN'];
  if (recent) criteria.push(['SINCE', recent.toISOString().split('T')[0]]);

  const fetchOptions = { bodies: ['HEADER.FIELDS (FROM TO SUBJECT DATE)'], markSeen: false };
  const messages = await conn.search(criteria, fetchOptions);
  const limited = messages.slice(-limit);

  if (limited.length === 0) {
    console.log('No unread messages found.');
  } else {
    console.log(`${limited.length} unread message(s):\n`);
    for (const msg of limited) {
      const header = msg.parts[0].body;
      console.log(`UID: ${msg.attributes.uid}`);
      console.log(`From: ${header.from?.[0] || ''}`);
      console.log(`Subject: ${header.subject?.[0] || '(no subject)'}`);
      console.log(`Date: ${header.date?.[0] || ''}`);
      console.log('---');
    }
  }

  conn.end();
}

async function cmdFetch() {
  const uid = parseInt(args[1]);
  if (!uid) { console.error('Usage: imap.js fetch <uid>'); process.exit(1); }

  const cfg = loadConfig();
  const mailbox = getArg('--mailbox', cfg.IMAP_MAILBOX || 'INBOX');
  const conn = await connect(cfg);
  await conn.openBox(mailbox);

  const messages = await conn.search([['UID', String(uid)]], { bodies: [''], markSeen: false });
  if (!messages.length) { console.log('Message not found.'); conn.end(); return; }

  const raw = messages[0].parts[0].body;
  const parsed = await simpleParser(raw);

  console.log(`From: ${parsed.from?.text || ''}`);
  console.log(`To: ${parsed.to?.text || ''}`);
  console.log(`Subject: ${parsed.subject || '(no subject)'}`);
  console.log(`Date: ${parsed.date || ''}`);
  console.log(`\n--- Body ---\n`);
  console.log(parsed.text || parsed.html || '(empty body)');

  conn.end();
}

async function cmdSearch() {
  const cfg = loadConfig();
  const limit = parseInt(getArg('--limit', '20'));
  const mailbox = getArg('--mailbox', cfg.IMAP_MAILBOX || 'INBOX');
  const conn = await connect(cfg);
  await conn.openBox(mailbox);

  const criteria = [];
  if (hasFlag('--unseen')) criteria.push('UNSEEN');
  if (hasFlag('--seen')) criteria.push('SEEN');
  const from = getArg('--from');
  if (from) criteria.push(['FROM', from]);
  const subject = getArg('--subject');
  if (subject) criteria.push(['SUBJECT', subject]);
  const since = getArg('--since');
  if (since) criteria.push(['SINCE', since]);
  const before = getArg('--before');
  if (before) criteria.push(['BEFORE', before]);
  const recent = parseRecent(getArg('--recent'));
  if (recent) criteria.push(['SINCE', recent.toISOString().split('T')[0]]);
  if (!criteria.length) criteria.push('ALL');

  const fetchOptions = { bodies: ['HEADER.FIELDS (FROM TO SUBJECT DATE)'], markSeen: false };
  const messages = await conn.search(criteria, fetchOptions);
  const limited = messages.slice(-limit);

  if (!limited.length) { console.log('No messages found.'); conn.end(); return; }

  console.log(`${limited.length} message(s):\n`);
  for (const msg of limited) {
    const header = msg.parts[0].body;
    console.log(`UID: ${msg.attributes.uid}`);
    console.log(`From: ${header.from?.[0] || ''}`);
    console.log(`Subject: ${header.subject?.[0] || '(no subject)'}`);
    console.log(`Date: ${header.date?.[0] || ''}`);
    console.log('---');
  }

  conn.end();
}

async function cmdMark(seen) {
  const uid = parseInt(args[1]);
  if (!uid) { console.error(`Usage: imap.js mark-${seen ? 'read' : 'unread'} <uid>`); process.exit(1); }

  const cfg = loadConfig();
  const mailbox = getArg('--mailbox', cfg.IMAP_MAILBOX || 'INBOX');
  const conn = await connect(cfg);
  await conn.openBox(mailbox);

  if (seen) {
    await conn.addFlags(uid, '\\Seen');
    console.log(`UID ${uid} marked as read.`);
  } else {
    await conn.delFlags(uid, '\\Seen');
    console.log(`UID ${uid} marked as unread.`);
  }

  conn.end();
}

async function cmdListMailboxes() {
  const cfg = loadConfig();
  const conn = await connect(cfg);
  const boxes = await conn.getBoxes();

  function printBoxes(obj, prefix = '') {
    for (const [name, box] of Object.entries(obj)) {
      console.log(`${prefix}${name}`);
      if (box.children) printBoxes(box.children, `${prefix}  `);
    }
  }

  printBoxes(boxes);
  conn.end();
}

(async () => {
  try {
    if (command === 'check') await cmdCheck();
    else if (command === 'fetch') await cmdFetch();
    else if (command === 'search') await cmdSearch();
    else if (command === 'mark-read') await cmdMark(true);
    else if (command === 'mark-unread') await cmdMark(false);
    else if (command === 'list-mailboxes') await cmdListMailboxes();
    else {
      console.log('Commands: check, fetch <uid>, search, mark-read <uid>, mark-unread <uid>, list-mailboxes');
      process.exit(1);
    }
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
