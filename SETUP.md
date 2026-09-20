# Setup — VS Code + your GitHub repo

You're starting from an **empty repo** (`taylorobrien1999/mmagame` came back
404/empty when I checked it earlier), so this is a clean push, not a merge.
If that's changed and the repo now has commits, see **"If the repo isn't
empty"** at the bottom before you run anything.

Five steps: unzip, open in VS Code, install, verify, push.

---

## 1. Unzip and open

Unzip `mmagame.zip` wherever you keep projects, e.g.:

```
C:\Users\<you>\dev\mmagame          (Windows)
~/dev/mmagame                       (Mac/Linux)
```

Then either:
- Open VS Code → **File → Open Folder** → select `mmagame`, or
- From a terminal: `code mmagame`

---

## 2. Install Node.js (skip if you already have it)

You need Node 18+. Check first:

```bash
node -v
```

If that fails or shows something below v18, grab the LTS installer from
[nodejs.org](https://nodejs.org) and re-open your terminal after installing.

---

## 3. Open a terminal in VS Code and install dependencies

**Terminal → New Terminal** (or `` Ctrl+` ``), then, with `mmagame` as the
working directory:

```bash
npm install
```

This pulls in `tsx` (runs TypeScript directly, no build step) and
`typescript`. Takes under a minute.

---

## 4. Verify everything actually works

Four commands. If any fail, something went wrong in step 3 — don't move on
to git yet.

```bash
npm run typecheck        # should print nothing and exit clean
npm run sim:calibrate     # runs ~18,000 simulated fights, prints a report
npm run sim:negotiation   # runs the personality/negotiation calibration
npm run dev               # starts the app at http://localhost:5173
```

`sim:calibrate` should end with a sample play-by-play fight. `sim:negotiation`
should end with a personality axis spread table. `npm run dev` should print a
local URL — open it and you'll see the dashboard with placeholder data: a
world clock bar, an event marquee styled like a fight bill, and a roster
list. It won't be wired to Supabase yet (that's the next phase), but every
screen renders and every route in the sidebar works.

**Before `npm run dev` will work**, copy `.env.example` to `.env` and fill in
your Supabase URL and **publishable** key (Settings → API in your Supabase
project — the `sb_publishable_...` key, never `sb_secret_...`). The app
throws a clear error on startup if this is missing rather than failing
silently.

---

## 5. Connect to your GitHub repo and push

Run these one at a time from the VS Code terminal, inside the `mmagame`
folder.

**First time using git on this machine?** You'll get an "Author identity
unknown" error on commit if git doesn't know who you are yet. Fix once:

```bash
git config --global user.email "you@example.com"
git config --global user.name "Your Name"
```

Now the actual setup:

```bash
git init
git add .
git commit -m "Initial commit: fight engine, personality, negotiation, schema"
git branch -M main
git remote add origin https://github.com/taylorobrien1999/mmagame.git
git push -u origin main
```

**If `git push` asks for a password:** GitHub stopped accepting account
passwords for this a while back. You need either:
- A **Personal Access Token** (GitHub → Settings → Developer settings →
  Personal access tokens → generate one, use it in place of your password), or
- The **GitHub CLI**: `gh auth login`, then push normally, or
- **VS Code's built-in GitHub sign-in** — click the account icon bottom-left,
  sign in, and VS Code handles the token for you. This is the easiest path
  if you'd rather not touch the terminal for auth.

After this, the Source Control panel in VS Code (left sidebar, branch icon)
will track changes normally — stage, commit, push/pull, all from the UI if
you prefer that over the terminal from here on.

---

## Day-to-day workflow once this is set up

```bash
npm run sim:calibrate      # after any change to engine.ts
npm run sim:negotiation    # after any change to negotiation.ts or personality.ts
npm run typecheck          # before every commit
```

Then the normal git loop — `git add .`, `git commit -m "..."`, `git push` —
either in the terminal or through VS Code's Source Control panel.

---

## Database setup (when you get to phase 2)

Not needed yet — nothing in phases 0–1 touches Supabase. When you're ready:

1. Create a free project at [supabase.com](https://supabase.com)
2. Supabase dashboard → **SQL Editor** → paste `db/schema.sql` → Run
3. Then paste `db/schema-v2.sql` → Run (it depends on schema.sql existing first)
4. Grab your project URL and anon key from **Settings → API** — you'll need
   these as environment variables once the app layer exists

---

## If the repo isn't empty

If `git push` fails because the remote has commits this local copy doesn't
know about, **stop and check what's actually in the remote first** —
`git log` won't help you here since this is a fresh `git init` with no
history. Instead:

```bash
git fetch origin
git log origin/main --oneline
```

If that shows commits you don't recognize or want to keep, don't force-push
over them blindly. Either pull and merge (`git pull origin main --allow-unrelated-histories`
and resolve any conflicts), or tell me what's in there and I'll help you
sort out which version should win.
