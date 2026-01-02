import { type MapObject } from "../types";
import { COMBAT } from "../config";

export interface AttackResult {
  attacker: MapObject;
  defender: MapObject;
  hit: boolean;
  critical: boolean;
  damage: number;
  defenderDied: boolean;
}

export interface CombatResult {
  attackerAttack: AttackResult;
}

/**
 * Calculates if an attack hits and if it's critical
 * @param attacker The attacking creature
 * @param defender The defending creature
 * @returns Object with hit and critical flags
 */
function calculateToHit(attacker: MapObject, defender: MapObject): { hit: boolean; critical: boolean } {
  if (!attacker.stats || !defender.stats) {
    return { hit: false, critical: false };
  }

  const agiDiff = attacker.stats.agi - defender.stats.agi;
  const toHitRoll = (COMBAT.BASE_HIT + agiDiff * COMBAT.HIT_MODIFIER) + Math.random() * 100;

  const hit = toHitRoll <= COMBAT.TO_HIT;
  const critical = toHitRoll >= COMBAT.CRIT_CHANCE;

  return { hit, critical };
}

/**
 * Calculates damage dealt by an attack
 * @param attacker The attacking creature
 * @param defender The defending creature
 * @param critical Whether the attack is critical
 * @returns Damage amount
 */
function calculateDamage(attacker: MapObject, defender: MapObject, critical: boolean): number {
  if (!attacker.stats || !defender.stats) {
    return 0;
  }

  let damage = Math.max(1, attacker.stats.atk - defender.stats.def);

  if (critical) {
    damage *= COMBAT.CRIT_MULT;
  }

  return damage;
}

/**
 * Executes a single attack from attacker to defender
 * @param attacker The attacking creature
 * @param defender The defending creature
 * @returns Attack result
 */
function executeAttack(attacker: MapObject, defender: MapObject): AttackResult {
  const { hit, critical } = calculateToHit(attacker, defender);

  let damage = 0;
  let defenderDied = false;

  if (hit) {
    damage = calculateDamage(attacker, defender, critical);

    if (defender.currentHP !== undefined) {
      defender.currentHP = Math.max(0, defender.currentHP - damage);
      defenderDied = defender.currentHP <= 0;
    }
  }

  return {
    attacker,
    defender,
    hit,
    critical,
    damage,
    defenderDied,
  };
}

/**
 * Executes combat between two creatures
 * The attacker attacks the defender once (no retaliation)
 * @param attacker The attacking creature (moving onto defender's tile)
 * @param defender The defending creature (occupying the tile)
 * @returns Combat result with attack outcome
 */
export function executeCombat(attacker: MapObject, defender: MapObject): CombatResult {
  console.log(`[Combat] ${attacker.name} attacks ${defender.name}`);

  // Attacker's attack
  const attackerAttack = executeAttack(attacker, defender);

  console.log(`[Combat] ${attacker.name} ${attackerAttack.hit ? 'hits' : 'misses'} ${defender.name}${attackerAttack.critical ? ' (CRITICAL)' : ''} for ${attackerAttack.damage} damage`);
  console.log(`[Combat] ${defender.name} HP: ${defender.currentHP}/${defender.stats?.hp}`);

  return {
    attackerAttack,
  };
}

/**
 * Checks if combat should occur when a creature moves to a position
 * @param movingCreature The creature attempting to move
 * @param objectsAtPosition Objects at the target position
 * @returns The creature to fight, or null if no combat
 */
export function checkForCombat(
  movingCreature: MapObject,
  objectsAtPosition: MapObject[]
): MapObject | null {
  // Determine what type of opponent to look for
  const isPlayerMoving = movingCreature.type === "Player";
  const targetType = isPlayerMoving ? "Enemy" : "Player";

  // Find an opponent to fight (enemies don't fight each other)
  const enemy = objectsAtPosition.find(obj =>
    obj.id !== movingCreature.id &&
    obj.type === targetType &&
    obj.currentHP !== undefined &&
    obj.currentHP > 0
  );

  return enemy || null;
}
