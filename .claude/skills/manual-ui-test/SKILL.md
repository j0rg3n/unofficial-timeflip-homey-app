---
name: manual-ui-test
description: Procedure for validating UI-facing changes (capabilities, flow cards, device settings, LED control, facet labels, toggles) with the user. Use after any such change, before committing.
---

# Manual UI testing

UI-facing changes (capabilities, flow cards, device settings UI, LED control, facet labels, toggles) need manual validation, because Claude cannot see the Homey UI.

After a UI fix:
1. Give the user step-by-step test instructions.
2. Give the test command: `cd com.fabeljet.unofficial-timeflip2-driver && homey app run --remote`
3. **Stop and wait** for the user's results.
4. Do not proceed or commit until the user confirms the fix works.

Automated tests are still required for accompanying logic changes.
