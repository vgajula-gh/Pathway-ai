Use this guide to run and validate Pathway AI from the shared [GitHub repository](https://github.com/vgajula-gh/Pathway-ai). GitHub Codespaces runs the app and its local AI inside a cloud development environment; your computer only needs a browser.

Use made-up student information. This is a development demo with sample opportunities and development-only identity, not a production service for real student accounts. Ollama requires no paid AI API key, but Codespaces compute counts toward your GitHub allowance.

## Before you start

- Sign in to GitHub and confirm that you can access the repository. A private repository requires an invitation from its owner.

- Use Chrome for the voice demonstration. Microphone support depends on the browser.

- Choose a Codespace with at least 8 GB RAM when available.

- Work from the repository’s main branch.

- Keep port 5173 private. Do not forward Ollama port 11434.

## Start a new Codespace

1. Open the repository on GitHub.

2. Choose **Code → Codespaces → Create codespace on main**.

3. Wait for all setup commands to finish. The initial model download can take several minutes.

4. Setup installs application dependencies, initializes SQLite, loads sample data, installs zstd and Ollama, and downloads the text model llama3.2:3b (about 2 GB).

5. In the Codespaces terminal, run:

```bash
npm run dev
```

6. Keep this terminal running. Open the **Ports** tab and select **Open in Browser** for port **5173**.

You do not need to run npm run setup again after a successful automatic setup. If setup failed, use the recovery steps below. Codespaces is a development environment and may stop when idle.

## Update or prepare an existing Codespace

If the application is running, stop it with Ctrl+C. Run these commands from the repository folder:

```bash
git switch main
git pull origin main
npm run setup
npm run ollama:setup
```

If Git reports local changes or a merge conflict, stop and resolve it with the repository owner rather than discarding your work.

Open .env in the editor. Preserve its other settings, and make sure these entries have the following values:

```env
LLM_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434/v1
OLLAMA_MODEL=llama3.2:3b
AI_DISABLED=false
VITE_API_URL=
```

Setup preserves an existing .env, so it will not automatically replace an older Claude or OpenAI configuration. Save the file, then run:

```bash
npm run dev
```

For later visits with no code or configuration changes, run:

```bash
npm run ollama:start
npm run dev
```

Ollama should also start through the Codespaces startup hook. The explicit start command is safe if it is already running.

## Create a test student and enable AI

1. Complete onboarding with a made-up name and interests. Select **sample week**.

2. Open **You → Privacy**.

3. Turn on **Use AI to help me**. This is saved for that student.

4. Confirm that the status says local AI is configured.

The student switch controls new AI requests without a restart. Turning it off does not cancel a request already in progress. AI_DISABLED=true in .env disables AI for the server and cannot be overridden by the student switch.

The configuration status does not prove Ollama is running. In a second terminal, while npm run dev remains running, check:

```bash
curl -s http://localhost:8787/api/health
ollama list
```

With the default API port, health should report aiEnabled as true and provider as ollama. The model list should include llama3.2:3b. For a direct model check, run:

```bash
ollama run llama3.2:3b "Reply with one short greeting."
```

A greeting confirms that the model can generate text independently of the app.

## Validate the application

Use these checks and record whether each passes. AI wording can vary; check behavior rather than expecting an exact answer.

| Check | What to do | Expected result |
| - | - | - |
| Basic app | Open Today, Explore, Buddy, Grow, and You | Pages load without an error |
| Sample data | Inspect an opportunity in Explore | Sample or unverified status is visible; it is not presented as verified |
| Buddy conversation | Send “Suggest two small ways to prepare for a biology exam” | A waiting message appears, followed by a relevant reply |
| Approval boundary | Ask Buddy to propose a 20 minute study session tomorrow after school | Any proposed change waits for your approval; it is not applied automatically |
| Approval result | Review a proposal, approve it, and inspect Today or Grow | The actual final status is shown; VERIFIED means the change was saved and checked |
| AI off | Turn Use AI to help me off, then return to Buddy | Message entry and Send are disabled; core pages remain usable |
| Text schedule | Open the schedule scan control and paste schedule text | Extraction produces candidates for review; saving requires confirmation |
| Data export | Choose You → Your data → Export my data | A JSON download is produced |

If an AI proposal is unsuitable, reject it and record the model behavior. The small local model may misunderstand requests. The default model is text-only; schedule screenshot extraction requires an image-capable provider/model.

## Validate voice

1. In **You → Privacy**, turn on **Voice** and **Use AI to help me**.

2. Return to Buddy. The microphone should appear if the browser supports speech recognition.

3. Click the microphone and allow microphone access for the app’s browser address.

4. Dictate a short message. Confirm that **Listening…** and **Stop listening** appear.

5. Select Stop listening. Edit the transcript before choosing Send.

6. Confirm that dictation never sends automatically.

7. Select **Read replies aloud**, then send a message. The new reply should be spoken.

8. Select **Stop reading** while speech is playing.

9. Turn Voice off and confirm the voice controls disappear.

Voice is off by default. Read replies aloud is a session choice and may need to be selected again after leaving Buddy. If recognition is unsupported, the microphone is intentionally hidden; typed chat still works. Pathway does not record or store audio. Browser speech recognition may process audio through the browser provider.

## Run automated checks

From a second terminal in the repository folder, run each command and confirm that it exits successfully:

```bash
npm test
npm run typecheck
npm run build
```

Tests verify application logic and mocked provider behavior. Typecheck verifies TypeScript; build verifies compilation and web bundling. These checks do not replace the live AI, microphone, or speaker tests above. npm run build does not start the application.

## Troubleshooting

| Symptom | Action |
| - | - |
| Installer says zstd is missing | Run the recovery commands below, then retry Ollama setup |
| systemd is not running | Expected in Codespaces; setup starts Ollama in the background itself |
| NVIDIA or AMD GPU is not detected | CPU operation is supported; replies may be slower |
| Ollama API is available, but setup is still running | Wait for the model download to finish and confirm it with ollama list |
| AI is not configured | Check the four Ollama settings in .env, save, restart npm run dev, and enable student AI consent |
| Local AI unavailable | Run npm run ollama and check ollama list; retry npm run ollama if the model is missing |
| Buddy takes a long time | Wait for the thinking message; CPU replies can take a minute or longer, particularly for several tool calls |
| Voice setting is absent | Update main, restart the app, and refresh the browser |
| Microphone absent | Enable Voice and use a browser supporting SpeechRecognition or webkitSpeechRecognition |
| Microphone denied | Allow microphone access in browser site settings, then retry |
| Pages cannot load API data | Confirm both app servers are running and VITE_API_URL is empty for Codespaces |
| Port 5173 is already in use | Stop the previous dev process before starting another |

For the zstd installation error:

```bash
sudo apt-get update
sudo apt-get install -y zstd
npm run ollama:setup
```

Updated setup installs zstd automatically. Ollama background logs are in \~/.ollama/pathway-server.log.

For a Buddy error, collect the exact browser message, the related npm run dev terminal error, the health response, and ollama list output. Share these with the repository owner; do not send .env contents, API keys, or real student information.

## Switch AI provider or skip local AI

To use Claude or OpenAI, edit .env and restart npm run dev. Use a current model ID for your provider account.

```env
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=your-provider-key
ANTHROPIC_MODEL=your-current-Claude-model-id
AI_DISABLED=false
```

Or:

```env
LLM_PROVIDER=openai
OPENAI_API_KEY=your-provider-key
OPENAI_MODEL=your-current-OpenAI-model-id
AI_DISABLED=false
```

Enable the student AI switch too. Hosted APIs may charge for use; never commit keys or .env.

To skip Ollama provisioning, set USE_OLLAMA to false in .devcontainer/devcontainer.json remoteEnv before creating or rebuilding the Codespace. For an existing server, set AI_DISABLED=true in .env and restart to disable AI globally. The core demonstration remains available.

## Finish and report results

Stop npm run dev with Ctrl+C. Stop the Codespace from GitHub when finished; closing the browser alone may leave compute running.

Send the repository owner:

- The tested branch and commit, from git rev-parse --short HEAD.

- Your browser and Codespaces machine size.

- Which manual checks passed or failed.

- Whether tests, typecheck, and build passed.

- Exact error messages for failed checks.

The repository includes [TRAINER-GUIDE.md](https://github.com/vgajula-gh/Pathway-ai/blob/main/TRAINER-GUIDE.md) for setup details. Voice was merged in [PR 2](https://github.com/vgajula-gh/Pathway-ai/pull/2), Ollama support in [PR 3](https://github.com/vgajula-gh/Pathway-ai/pull/3), and the zstd installer fix in [PR 4](https://github.com/vgajula-gh/Pathway-ai/pull/4).
