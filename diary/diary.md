# Development Diary

## 001.png (Jan 3, 07:12)
**Initial project setup and core game mechanics**

- Set up development environment with Kaplay framework
- Implemented core tile-based puzzle game with grid rendering
- Added tile types (CulDeSac, Straight, L, T, Cross) with proper orientation
- Created plot system for tile placement with directional arrows
- Implemented tile preview and placement interactions
- Added touch controls for mobile devices
- Implemented tile deck system with weighted generation
- Added tile rotation (clockwise and counterclockwise)
- Integrated custom bitmap font for UI text
- Applied special rules to corner and edge tiles during grid generation

## 002.png (Jan 3, 07:23)
**Map objects and player movement**

- Transitioned from plan mode to implementation
- Added map objects system (player, enemies, items)
- Implemented tile push mechanics with animated object movement
- Created player sprite (16x16 pixels)
- Implemented pathfinding and smooth player movement animations
- Added three enemy types with unique movement speeds and AI behaviors
- Improved turn structure for independent player actions
- Adjusted game resolution to 640x360
- Added exit stairs map object with interaction callbacks

## 003.png (Jan 3, 10:02)
**Combat and level progression**

- Enabled direct player movement to reachable tiles
- Implemented enemy collision and blocking mechanics
- Added new enemy AI types for player pursuit
- Added player turn skip feature
- Fine-tuned tile generation weights
- Font improvements and adjustments
- Added custom CSS cursors for different actions
- Enabled unlimited tile placements per turn

## 004.png (Jan 3, 10:23)
**Stats and combat system**

- Improved grid generation algorithms
- Added skip turn button to UI
- Implemented creature stats system (HP, ATK, DEF, AGI)
- Created JSON-based enemy database
- Added currentHP tracking for all creatures
- Refactored rendering into focused modules
- Implemented turn-based combat with attack mechanics
- Added combat bounce effect for failed kills
- Implemented keyboard movement (arrow keys, WASD, vi keys)
- Added scrolling combat text with damage numbers

## 005.png (Jan 4, 00:40)
**Visual polish and terrain**

- Removed retaliation mechanic, simplified combat
- Improved combat animations
- Started development diary
- Added brick background layer below grid tiles
- Balanced enemy and player stats
- Switched to pre-rotated tile frames (6x4 sprite sheet)
- Added tile rotation mode for player

## 006.png (Jan 4, 01:18)
**Scene system and animations**

- Refactored game to use Kaplay scene API
- Added player sprite with walk, drop, rise, and fall animations
- Implemented animated start level sequence with progressive tile reveal
- Added wall-breaking mechanic with tile type upgrades
- Updated cursors (attack, demolish)
- Removed unused fonts
- Added saga font sample text display

## 007.png (Jan 11, 23:21)
**Decay system and dungeon progression**

- Added decay property to track tile deterioration
- Implemented decay overlays with visual feedback
- Added decay progression system triggered by player actions
- Protected tiles with map objects from decay
- Applied decay to entire rows/columns when placing tiles
- Decay affects tiles during wall breaking and rotation
- Removed non-goblin enemies (consolidated enemy types)
- Added enemy idle animations
- Fixed combat to-hit formula
- Improved enemy collision and blocking using unique IDs
- Player stays on tile after defeating enemies
- Added damage variance to combat
- Implemented multi-level dungeon progression system
- Added brick background to preview tile
- Improved scrolling combat text with different fonts and animations

## 008.png (Jan 17, 10:35)
**Item system**

- Implemented comprehensive item system with equipment and consumables
- Added item tiers and random spawning
- Created inventory management (8 slots)
- Added equipment system (5 slots: Head, MainHand, OffHand, Legs, Torso)
- Implemented item pickup on player movement
- Added item hover tooltips with descriptions
- Fixed performance issues by caching reachable tiles
- Added equipment stat bonuses (HP, ATK, DEF, AGI)
- Implemented equipment slot highlighting
- Added support for two-handed weapons
- Renamed slots from LeftHand/RightHand to MainHand/OffHand
- Added starting inventory items
- Reduced item drop rate to 5%
- Show disabled slots for two-handed weapons
- Persist inventory and equipment between levels

## 009.png (Jan 22, 23:47)
**Flying mechanic and UI refinement**

- Added flying attribute for players and enemies
- Implemented decay-based fall chance
- Enemies avoid dangerous decayed tiles
- Players can fall through highly decayed floors
- Refactored UI to widget-based system
- Removed header widgets, added spacers between sections
- Dynamic UI width calculation
- Added bat enemies (flying type)
- Play poof animation when enemies die
- Play rise/drop animations when changing levels
- Added debug button for testing animations

## 010.png (Jan 28, 00:05)
**Dynamic encounters and loot**

- Added tier attribute to enemies
- Implemented enemy budget system based on dungeon level
- Generate enemies dynamically using budget
- Added dropChance attribute to enemies
- Implement item drops when enemies are killed
- Block all input during animations
- Updated exit graphics
- Force reset animation flag when entering AwaitingAction phase
- Added comprehensive animation logging

## 011.png (Jan 29, 23:00)
**Consumables, ranged enemies, and advanced AI**

- Consumable items: feather (flying buff), ham (full heal), apple (5 HP), cement (removes decay), bricks (reduces all decay)
- Buff system with visual icons in UI
- Item charge system with color-coded display (white/orange/red)
- Equipment durability: wall bumping depletes charges
- Ranged AI type: archers shoot projectiles when line of sight exists
- Healer AI type: shamans heal wounded allies with line of sight
- New enemies: archer (ranged, tier 1), brute (slow tank, tier 2), shaman (healer, tier 2)
- Projectile animation system with rotation
- Connected tiles highlighting when hovering
- Rotate cursor indicator on player's tile
- Debug button spawns brute or shaman for testing
