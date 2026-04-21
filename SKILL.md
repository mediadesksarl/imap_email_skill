---
name: mediadesk-email
description: >-
  Read, search, send, and manage email via IMAP/SMTP for a Namecheap Private
  Email mailbox. Use when asked to check inbox, fetch an email, reply, send a
  new email, search messages, or mark emails as read/unread.
metadata:
  requires:
    env:
      - IMAP_HOST
      - IMAP_USER
      - IMAP_PASS
      - SMTP_HOST
      - SMTP_USER
      - SMTP_PASS
    bins:
      - node
      - npm
  primaryEnv: IMAP_PASS
---

# MediaDesk Email Skill

Connects to a Namecheap Private Email mailbox (or any standard IMAP/SMTP
server) to read and send emails from the terminal.

## Configuration

Credentials are stored in `~/.config/mediadesk-email/.env` (permissions 600,
owner-read only). Run the setup script once before first use:

```bash
bash setup.sh
```

The `.env` format:

```
IMAP_HOST=mail.privateemail.com
IMAP_PORT=993
IMAP_USER=agent@mediadesk.ma
IMAP_PASS=your_password
IMAP_TLS=true

SMTP_HOST=mail.privateemail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=agent@mediadesk.ma
SMTP_PASS=your_password
SMTP_FROM=agent@mediadesk.ma
```

## IMAP Commands (Reading Email)

### Check inbox for new/unread messages
```bash
node scripts/imap.js check [--limit 10] [--recent 2h]
```
Options:
- `--limit <n>` — max results (default: 10)
- `--recent <time>` — e.g. `30m`, `2h`, `7d`

### Fetch full email content by UID
```bash
node scripts/imap.js fetch <uid>
```

### Search with filters
```bash
node scripts/imap.js search [--from email] [--subject text] [--unseen] [--recent 7d] [--limit 20]
```

### Mark as read / unread
```bash
node scripts/imap.js mark-read <uid>
node scripts/imap.js mark-unread <uid>
```

### List all mailbox folders
```bash
node scripts/imap.js list-mailboxes
```

## SMTP Commands (Sending Email)

### Send an email
```bash
node scripts/smtp.js send --to <email> --subject <text> --body <text>
```

Optional flags:
- `--html` — send body as HTML
- `--cc <email>` — CC recipients
- `--bcc <email>` — BCC recipients
- `--attach <file>` — attach a file (comma-separated for multiple)
- `--from <email>` — override default sender

### Test SMTP connection
```bash
node scripts/smtp.js test
```

## Security Notes

- Config stored at `~/.config/mediadesk-email/.env` with `600` permissions
- Never commit `.env` to source control — it is in `.gitignore`
- Credentials are loaded at runtime only, never logged or printed
- All connections use TLS/SSL — plaintext is never used
