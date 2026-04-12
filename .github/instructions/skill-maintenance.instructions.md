---
description: "Use after completing any code change, bug fix, or feature implementation. Ensures skill files stay current with the codebase."
applyTo: "**"
---
# Skill Maintenance

After completing each task, review whether any skill file in `.github/skills/` documents a convention, pattern, or algorithm that was changed. If so, update the skill file to match the new codebase state before finishing.

Check for:
- Changed filter pipelines, state fields, or persistence keys → update **state-management**, **music-theory**, or **persistence** skills
- Changed component structure, data flow, or module boundaries → update **modules** skill
- Changed CSS patterns, variables, or visual conventions → update **styling** skill
- Changed breakpoints, layout strategies, or responsive behavior → update **layout** skill
- Changed progression grid, drag-and-drop, pool, or export logic → update **progression-builder** skill
- Changed cross-tab navigation, voicing injection, index encoding, or $effect guards → update **cross-module-navigation** skill
