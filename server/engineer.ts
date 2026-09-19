import { readFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';
import Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-opus-5';

const SYSTEM = `You are the race engineer on the Red Bull pit wall for Max Verstappen at the United States Grand Prix, Circuit of the Americas (56 laps, 5.513 km, anticlockwise, pit loss about 21 s under green).

You are embedded in a live race-strategy dashboard. Every user message arrives with a JSON snapshot of everything the dashboard is showing right now, so you can discuss any panel the user is looking at:
- Race Control tab: timing tower (order, gaps, tyres, stops), track map with hazards and yellow sectors, race control and radio log, weather radar.
- Strategy tab: the optimiser's ranked stint plans, the pit-window curve, the rejoin projection if we box now, and the undercut/overcut table for the cars around us.
- Tyres & Pace tab: fitted set, wear and life, available sets, degradation model, our recent lap times, and the practice long runs with rival long-run pace.
- Weather tab: radar cells, 60-minute rain forecast, tyre crossover thresholds, temperatures, wind on the straights.
- Risk tab: Safety Car and VSC probabilities, the COTA record used as priors, track hazards, and the per-driver incident index.
The snapshot also says which tab the user has open (activeTab) and carries the built-in strategy model's current call.

How to answer:
- Talk like an engineer on the radio to a strategist colleague: direct, numerate, no filler. Lead with the call, then the two or three numbers that justify it.
- Ground every claim in the snapshot. Quote gaps, tyre ages, probabilities and lap numbers from it. If the snapshot does not contain something, say so rather than inventing it.
- When you disagree with the built-in model's call, say so and explain what it is missing.
- Flag the main risk to your recommendation and what would change your mind (for example a Safety Car, rain arriving earlier, a rival pitting).
- Keep answers short: usually under 120 words, plain text, no markdown headings. Short bullet lines are fine for comparing options.
- This is a simulation with synthetic data; do not present any of it as real-world results.
Latency-sensitive; begin your visible answer immediately.`;

interface ChatBody {
  messages: { role: 'user' | 'assistant'; content: string }[];
  snapshot: unknown;
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > 400_000) reject(new Error('body too large'));
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

/** True when the SDK can authenticate. Re-reads .env so a key added while the server runs is picked up. */
function hasCredentials(): boolean {
  if (process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN) return true;
  try {
    const env = readFileSync(resolve(process.cwd(), '.env'), 'utf8');
    const key = /^\s*ANTHROPIC_API_KEY\s*=\s*["']?([^"'\s#]+)/m.exec(env)?.[1];
    if (key) process.env.ANTHROPIC_API_KEY = key;
    return Boolean(key);
  } catch {
    return false;
  }
}

function send(res: ServerResponse, event: string, data: unknown) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function describeError(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) return 'The Anthropic API key was rejected. Check ANTHROPIC_API_KEY in .env.';
  if (err instanceof Anthropic.RateLimitError) return 'Rate limited by the Anthropic API. Try again in a moment.';
  if (err instanceof Anthropic.APIConnectionError) return 'Could not reach the Anthropic API. Check your network connection.';
  if (err instanceof Anthropic.APIError) return `Anthropic API error ${err.status ?? ''}: ${err.message}`;
  return err instanceof Error ? err.message : 'Unknown error';
}

async function handleChat(req: IncomingMessage, res: ServerResponse) {
  const body = JSON.parse(await readBody(req)) as ChatBody;
  const history = body.messages.slice(-12);
  const last = history[history.length - 1];
  if (!last || last.role !== 'user') {
    res.statusCode = 400;
    res.end('last message must be from the user');
    return;
  }

  // The persona is stable (cacheable); the volatile race snapshot rides with the latest user turn.
  const messages: Anthropic.Beta.BetaMessageParam[] = history.map((m, i) =>
    i === history.length - 1
      ? {
          role: 'user' as const,
          content: `<race_snapshot>\n${JSON.stringify(body.snapshot)}\n</race_snapshot>\n\n${m.content}`,
        }
      : { role: m.role, content: m.content },
  );

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  });

  const client = new Anthropic();
  const stream = client.beta.messages.stream({
    model: MODEL,
    max_tokens: 8000,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'low' },
    // If a request is ever declined, the API re-runs it on Anthropic's recommended fallback model.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
    messages,
  });
  req.on('close', () => stream.abort());
  stream.on('text', (delta) => send(res, 'delta', { text: delta }));

  try {
    const final = await stream.finalMessage();
    if (final.stop_reason === 'refusal') {
      send(res, 'error', { message: 'The model declined to answer that one.' });
    }
    send(res, 'done', { model: final.model });
  } catch (err) {
    if (!(err instanceof Anthropic.APIUserAbortError)) send(res, 'error', { message: describeError(err) });
  }
  res.end();
}

/** Dev-server API: keeps the Anthropic credentials on the server side of Vite. */
export function engineerApi(): Plugin {
  return {
    name: 'engineer-api',
    configureServer(server) {
      server.middlewares.use('/api/status', (_req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ live: hasCredentials(), model: MODEL }));
      });
      server.middlewares.use('/api/engineer', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end();
          return;
        }
        if (!hasCredentials()) {
          res.statusCode = 503;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ message: 'No Anthropic credentials configured.' }));
          return;
        }
        handleChat(req, res).catch((err) => {
          if (!res.headersSent) res.statusCode = 500;
          res.end(describeError(err));
        });
      });
    },
  };
}
