#!/usr/bin/env node
// imap.js — read and manage email via IMAP (uses imapflow)

const { ImapFlow } = require('imapflow');
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

function getClient(cfg) {
  return new ImapFlow({
    host: cfg.IMAP_HOST,
    port: parseInt(cfg.IMAP_PORT || '993'),
    secure: cfg.IMAP_TLS !== 'false',
    auth: { user: cfg.IMAP_USER, pass: cfg.IMAP_PASS },
    tls: { rejectUnauthorized: cfg.IMAP_REJECT_UNAUTHORIZED !== 'false' },
    logger: false,
  });
}

async function cmdCheck() {
  const cfg = loadConfig();
  const limit = parseInt(getArg('--limit', '10'));
  const recent = parseRecent(getArg('--recent'));
  const mailbox = getArg('--mailbox', cfg.IMAP_MAILBOX || 'INBOX');

  const client = getClient(cfg);
  await client.connect();
  await client.mailboxOpen(mailbox);

  const searchOpts = { seen: false };
  if (recent) searchOpts.since = recent;

  const uids = await client.search(searchOpts);
  const limited = uids.slice(-limit);

  if (!limited.length) {
    console.log('No unread messages found.');
    await client.logout(); return;
  }

  console.log(`${limited.length} unread message(s):\n`);
  for await (const msg of client.fetch(limited, { envelope: true })) {
    console.log(`UID: ${msg.uid}`);
    console.log(`From: ${msg.envelope.from?.[0]?.address || ''}`);
    console.log(`Subject: ${msg.envelope.subject || '(no subject)'}`);
    console.log(`Date: ${msg.envelope.date || ''}`);
    console.log('---');
  }
  await client.logout();
}

async function cmdFetch() {
  const uid = parseInt(args[1]);
  if (!uid) { console.error('Usage: imap.js fetch <uid>'); process.exit(1); }

  const cfg = loadConfig();
  const mailbox = getArg('--mailbox', cfg.IMAP_MAILBOX || 'INBOX');
  const client = getClient(cfg);
  await client.connect();
  await client.mailboxOpen(mailbox);

  let found = false;
  for await (const msg of client.fetch([uid], { source: true })) {
    found = true;
    const parsed = await simpleParser(msg.source);
    console.log(`From: ${parsed.from?.text || ''}`);
    console.log(`To: ${parsed.to?.text || ''}`);
    console.log(`Subject: ${parsed.subject || '(no subject)'}`);
    console.log(`Date: ${parsed.date || ''}`);
    console.log(`\n--- Body ---\n`);
    console.log(parsed.text || parsed.html || '(empty body)');
  }

  if (!found) console.log('Message not found.');
  await client.logout();
}

async function cmdSearch() {
  const cfg = loadConfig();
  const limit = parseInt(getArg('--limit', '20'));
  const mailbox = getArg('--mailbox', cfg.IMAP_MAILBOX || 'INBOX');
  const client = getClient(cfg);
  await client.connect();
  await client.mailboxOpen(mailbox);

  const searchOpts = {};
  if (hasFlag('--unseen')) searchOpts.seen = false;
  if (hasFlag('--seen')) searchOpts.seen = true;
  if (getArg('--from')) searchOpts.from = getArg('--from');
  if (getArg('--subject')) searchOpts.subject = getArg('--subject');
  if (getArg('--since')) searchOpts.since = new Date(getArg('--since'));
  if (getArg('--before')) searchOpts.before = new Date(getArg('--before'));
  if (parseRecent(getArg('--recent'))) searchOpts.since = parseRecent(getArg('--recent'));

  const uids = await client.search(Object.keys(searchOpts).length ? searchOpts : { all: true });
  const limited = uids.slice(-limit);

  if (!limited.length) { console.log('No messages found.'); await client.logout(); return; }

  console.log(`${limited.length} message(s):\n`);
  for await (const msg of client.fetch(limited, { envelope: true })) {
    console.log(`UID: ${msg.uid}`);
    console.log(`From: ${msg.envelope.from?.[0]?.address || ''}`);
    console.log(`Subject: ${msg.envelope.subject || '(no subject)'}`);
    console.log(`Date: ${msg.envelope.date || ''}`);
    console.log('---');
  }
  await client.logout();
}

async function cmdMark(seen) {
  const uid = parseInt(args[1]);
  if (!uid) { console.error(`Usage: imap.js mark-${seen ? 'read' : 'unread'} <uid>`); process.exit(1); }

  const cfg = loadConfig();
  const mailbox = getArg('--mailbox', cfg.IMAP_MAILBOX || 'INBOX');
  const client = getClient(cfg);
  await client.connect();
  await client.mailboxOpen(mailbox);

  if (seen) {
    await client.messageFlagsAdd([uid], ['\\Seen']);
    console.log(`UID ${uid} marked as read.`);
  } else {
    await client.messageFlagsRemove([uid], ['\\Seen']);
    console.log(`UID ${uid} marked as unread.`);
  }
  await client.logout();
}

async function cmdListMailboxes() {
  const cfg = loadConfig();
  const client = getClient(cfg);
  await client.connect();
  const list = await client.list();
  for (const box of list) console.log(box.path);
  await client.logout();
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
