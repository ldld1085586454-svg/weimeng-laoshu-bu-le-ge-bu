# Character animation v5 implementation record

Source baseline: Library source v4, archive commit de5528b. Independent cloud working copy; original JavaScript repository untouched.

## Approved scope carried forward

Keep uploaded orange round carrot, green crown, blue star eyes, open smile, no invented limbs. Preserve cream/pale-green UI and Phosphor Bold MIT icons, original cards, all rules and local-service semantics. Add breathing, leaf sway, blink, tap, clear, win/fail and revival, skin variants, and reduced motion.

## Decisions

- Use a non-destructive runtime rig over the existing approved cutout. The bitmap remains byte-identical. Separate body/crown materials animate independently; a shader supplies eyelids and a subdued failed expression. This avoids replacing the user's character with a newly generated approximation.
- Cap/scarf and honor badges are lightweight engine-native vector overlays in the existing palette. Unlock/equip data is unchanged. No new currencies, menus or services.
- New character presentation is a read-only consumer of committed events, with terminal priority and revision deduplication. It never signals gameplay completion, blocks the board, or changes revisions, saves, rewards or elapsed time.
- The cloud's already installed official engine is Godot 4.6.3. Test this actual version honestly; retained Windows 4.7.2 results belong only to the v4 baseline, not this new build.

## Test-first record

- Clean v4 baseline: 24 suites, 15,880 checks, zero failures on 4.6.3 headless.
- New mascot suite RED: missing layered presentation. GREEN: 26 checks after implementation.
- New integration suite RED: home has no live rig. GREEN: 16 checks after binding the rig to home/board/modal/preferences.
- Final serial full regression: 26 suites, 15,924 checks, zero failures. Node runner: 5/5 pass. Native mouse-only run: 88 steps, 20 viewport PNGs at 430×932, zero failures.
- Reviewer findings corrected: blue iris/crown mask classification, shared stem attachment under squash, SHUFFLED event name, inherited shader opacity, modal/honor lifecycle snap, and complete sad-mouth erase. Original PNG hash unchanged.
- One parallel-run GUI input failure is retained as a failed trial; isolated acceptance and serial full reruns passed. See the current acceptance document for the precise scope.
