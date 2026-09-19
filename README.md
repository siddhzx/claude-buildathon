# PITWALL: AI race engineer for the United States GP at COTA

An interactive race-strategy dashboard. It simulates the 56-lap United States Grand Prix at the Circuit of the Americas with the 2026 grid, puts you on the Red Bull pit wall for Max Verstappen, and gives live strategy calls. Everything on screen is synthetic simulation data.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:5173.

## Talk to the engineer (Claude)

The "Ask the engineer" panel sends your question plus a snapshot of everything on the dashboard to Claude (`claude-opus-5`) through a small endpoint inside the Vite dev server (`server/engineer.ts`). The API key stays on the server and never reaches the browser.

1. Open `.env` in the project root (copy `.env.example` if it is missing).
2. Set `ANTHROPIC_API_KEY=<your key>` and save.
3. The panel badge switches to "CLAUDE LINK LIVE" within a few seconds. No restart needed.

Without a key the dashboard still works: the built-in strategy model answers the chat.

## What is on the dashboard

| Tab | Contents |
|---|---|
| Race Control | Timing tower, live COTA track map (real circuit geometry), hazards and yellow sectors, conditions strip, race control and radio log, mini radar |
| Strategy | Ranked stint plans from the optimiser, pit-window curve, rejoin projection if we box now, undercut/overcut table |
| Tyres & Pace | Fitted set with four-corner wear and temperature, available sets, degradation model vs race laps, lap-time comparison, practice long runs |
| Weather | Precipitation radar around Austin, 60-minute rain forecast, tyre crossover scale, temperature and wind trends, wind on the straights |
| Risk | Safety Car and VSC probabilities (5 laps, 10 laps, to the flag), cumulative curves, COTA record used as priors, track hazards, driver incident index |

The right-hand rail is the engineer: the headline call, our car's state, manual controls and the call feed or chat.

## Controls

- Header: run/pause, speed (1× to 40×), scenario (rain threat, hot and dry, wet start), restart.
- Engineer rail: "Engineer executes calls" lets the built-in model box the car and set pace modes. Switch it off to make every call yourself with the Pace and Box buttons.
- What-if buttons: add a shower or heavy cell (Weather tab), drop debris or deploy a VSC or Safety Car (Risk tab).

## How it works

- `src/sim/engine.ts`: time-domain race simulation. Lap time = car pace + compound + degradation + fuel + weather + warm-up; following and overtaking, pit stops, incidents, Safety Car queueing.
- `src/sim/strategy.ts`: the engineer. Enumerates every zero, one and two-stop plan each half second, projects the pit rejoin, scores undercuts and overcuts, turns the simulation's own incident model into Safety Car odds, and applies the call rules (weather crossovers first, then neutralisations, then pit timing and pace).
- `src/sim/weather.ts`: moving rain cells, track wetness, temperatures, wind and the radar forecast.
- `src/data/`: circuit geometry (MIT-licensed `bacinger/f1-circuits`), the 2026 entry list, COTA neutralisation history and practice runs.

Driver pace and incident numbers, practice data and the COTA history table are assumptions made for this simulation.
