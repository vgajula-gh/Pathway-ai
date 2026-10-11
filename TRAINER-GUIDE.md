# Trainer guide

Use synthetic student information for training. Opportunities are sample data
and are marked unverified. AI help is optional; the core demonstration needs no
API key. This starter uses development-only identity and is not ready for real
student accounts.

## GitHub Codespaces

1. Open this repository on GitHub. Choose **Code → Codespaces → Create codespace
   on main** (or select the branch you want to demonstrate).
2. Wait for the container setup to finish. It runs `npm run setup` automatically:
   creates `.env` if missing, installs dependencies, initializes SQLite, and
   seeds opportunities, news, and a demo student.
3. In the terminal, run `npm run dev`. Keep that terminal running.
4. In the **Ports** tab, open port **5173** in your browser. Keep its visibility
   private. Only the web port needs forwarding; it proxies `/api` to the API
   inside the container.
5. Follow the demonstration below. Stop the servers with **Ctrl+C**.

## Mac, Windows, or Linux laptop

1. Install Git and Node.js 22 LTS (Node 20+ is supported).
2. Clone the repository and open a terminal in its folder:

   ```sh
   git clone https://github.com/vgajula-gh/Pathway-ai.git
   cd Pathway-ai
   npm run setup
   npm run dev
   ```

3. Open `http://localhost:5173` in your browser. Keep the terminal running;
   **Ctrl+C** stops both servers.

The same commands work in PowerShell, Command Prompt, and Unix shells.
Setup keeps an existing `.env`, database, and demo profile. Re-run
`npm run setup` after pulling dependency or schema changes; it refreshes the
sample opportunity and news records. No separate database server is needed.

## Demonstration

On first opening, complete onboarding with a made-up name and turn on
**sample week**. This creates a separate synthetic profile using the normal
app flow. Try:

1. **Explore:** open an opportunity and choose **Set a prep reminder**.
2. **Approve:** review and approve the proposed changes.
3. **Today:** view the timeline and coming-up reminders.
4. **Grow:** open the new goal and check off a step.
5. **You:** inspect the profile, activity, and export/delete controls.

Setup also creates a reusable **Demo Student** with a sample week, a goal, and
AI consent off. To use that exact profile, open your browser's developer tools
on the app page, choose **Console**, run the following, and reload:

```js
localStorage.setItem('pathway.studentId', 'pathway-demo-student');
location.reload();
```

To return to onboarding, run `localStorage.removeItem('pathway.studentId')`
and reload. Each browser stores its own selected profile. Re-running setup
does not reset changes to Demo Student or duplicate its events. If you delete
Demo Student through **You**, re-run setup to recreate it.

## Optional AI help

Without a provider key, the app automatically disables AI calls. To explicitly
keep AI off, set `AI_DISABLED=true` in `.env`. To enable AI, configure
`LLM_PROVIDER` and the matching provider key and model in `.env`, set
`AI_DISABLED=false`, restart the servers, and enable AI consent in your
synthetic profile. Never commit `.env` or paste keys into training materials.

## Checks and troubleshooting

```sh
npm test
npm run typecheck
npm run build
```

- If setup fails to download packages or Prisma engines, allow HTTPS access to
  `registry.npmjs.org` and `binaries.prisma.sh`. Keep TLS and checksum checks on.
- If port 5173 is busy, stop the other development server, then restart.
- If a browser cannot load API data, check that both servers are running and
  leave `VITE_API_URL=` empty in `.env`. Older `.env` files may still contain
  `http://localhost:8787`; clear that value for the proxy, especially in
  Codespaces. Restart `npm run dev` after changing `.env`.
- If you change API `PORT`, the Vite proxy reads it from `.env` (or the process
  environment). Restart both servers.
- The proxy is a development feature. A production deployment must route `/api`
  to the API on the web origin, or set `VITE_API_URL` to its API address at build
  time. `npm run build` alone does not configure production routing.
