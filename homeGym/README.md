# Home-Gym Planner

A browser app that answers one question: **"Will my gym equipment fit in my room — with enough safe space around each piece to train?"**

Mini project for the Computer Graphics course (University of Haifa, 2026). Built step by step; see the full write-up in **[REPORT.md](./REPORT.md)**.

## What it does
- Set your room size, then add, drag and rotate equipment (treadmill, squat rack, bench, exercise bike, yoga mat) and training spots (kettlebell swing, overhead press).
- Every piece is checked live: does it fit inside the walls and under the ceiling, does it overlap another piece, is its safety zone free (treadmill: ASTM F2115), and do your swing and press clear the walls, ceiling and lamp for your height.
- One line at the top of the panel gives the verdict.
- Rendering uses our own Phong shader, with Gouraud/Phong and normal-method switches for comparison.

## Run it
Requires [Node.js](https://nodejs.org) (LTS).
```bash
npm install
npm run dev
```
Then open http://localhost:5173 — drag to orbit, scroll to zoom, right-drag to pan.

## License
MIT — see [LICENSE](./LICENSE).
