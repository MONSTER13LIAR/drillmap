# Drillmap

Evacuation maps and timed mock drills for schools.

India's school safety guidelines (NDMA, 2016) ask every school for a floor-wise evacuation plan on each floor's notice board and a mock drill preferably every six months, with the gaps written down. Most schools draw the map by hand and time the drill with a watch, if at all.

Drillmap does it from the building itself:

1. **Map.** Photograph the floor plan, tap classrooms, staircases, exits and the assembly point, and connect them. Measure each corridor by walking it with the phone (step counter and timer), by setting a scale, or by typing the length.
2. **Plan.** Plain arithmetic, no guessing: walking speed, stair speed, and how many people per second a corridor or staircase of a given width lets through. A deterministic flow simulation finds where classes queue behind each other, then moves classes between staircases and exits while the total time falls. The output is each class's route and the order classes step onto each staircase. Queues show in red on the map, including at staircases.
3. **Print.** One A4 evacuation map per floor for the notice board, and a route card for every classroom door, in English or Hindi.
4. **Drill.** The coordinator opens a drill and shows a 5-letter code and QR. One monitor per class joins on their phone (English or Hindi) and picks the class. When the alarm rings, monitors tap when the class leaves the room, when it reaches the assembly point, and how many heads they counted. A mistaken tap can be undone. Taps are stamped by the server and queued on the phone if the network drops. If a phone goes quiet, the coordinator marks the class by hand.
5. **Report.** Planned vs actual for every class, classes slow to leave, staircases that jammed, people not counted, classes that never reported, and the change since the last drill.

Try it: open the site and press **Open the demo school**.

## Privacy

A school's floor plan, headcounts and exits are not public.

- Each school gets a secret edit key when it is first saved. The server keeps only a hash of it; the browser that made the school keeps the key.
- The home page lists only the schools whose keys are in this browser. There is no endpoint that lists all schools.
- Reading, editing or deleting a school, listing its drills, starting a drill, and the coordinator's board and report all need the key. The server checks it on every request.
- To open a school on another device, copy its **private edit link** (shown above the map). The key sits after the `#`, so it never reaches the server in a URL. Anyone with the link can change the school, so keep it private.
- Monitors' phones need only the drill code. They see the class list and routes, and only their own class's taps.

Planning figures (walking 1.0 m/s, stairs 0.6 m/s, 1.3 and 1.0 people per metre of width per second) are common fire-safety planning values and are editable. A real drill is the check on them.

## Run

```bash
npm install
npm run build
npm start            # http://localhost:8787
```

Development: `npm run server` and `npm run dev` in two terminals. Tests: `npm test`.

Data is stored in Postgres (Neon) when `DATABASE_URL` is set, otherwise as JSON files in `data/` (or `DATA_DIR`). Schools made before edit keys existed get one with `node server/migrate-keys.js <site url>`, which prints each school's private edit link. No personal data about students is collected: rooms have a label and a headcount, nothing else.
