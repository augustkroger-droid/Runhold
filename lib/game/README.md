# Runhold Game Domain

This folder is the boundary for gameplay code. UI components should call into this
domain through small hooks or service modules, while reusable game rules should stay
framework-independent and easy to test.

Current project map:

- `gps/`: GPS-neutral position types and helpers. These must work for both live
  phone GPS and later imported watch routes.
- `definitions/`: Static, data-driven game definitions such as resources,
  buildings, tech nodes, raid types, enemies, and loot tables.
- `state/`: Player-owned state shapes such as profile, resources, buildings,
  tech unlocks, inventory, expedition state, and raid state.
- `systems/`: Pure gameplay logic that transforms definitions + player state +
  time/position input into results.

Step 1 intentionally does not create real resources, buildings, tech, raids, or
base state. It only gives those systems a home so the current GPS test code can be
replaced step by step without disturbing working auth.
