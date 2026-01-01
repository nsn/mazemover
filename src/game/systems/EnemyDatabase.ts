import type { Stats, AIType } from "../types";

export interface EnemyDefinition {
  name: string;
  stats: Stats;
  movementSpeed: number;
  aiType: AIType;
  sprite: string;
  color?: {
    r: number;
    g: number;
    b: number;
  };
}

export interface PlayerDefinition {
  name: string;
  stats: Stats;
}

export interface EnemyDatabaseData {
  enemies: Record<string, EnemyDefinition>;
  player: PlayerDefinition;
}

export class EnemyDatabase {
  private data: EnemyDatabaseData | null = null;

  async load(url: string = "/enemies.json"): Promise<void> {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to load enemies.json: ${response.statusText}`);
      }
      this.data = await response.json();
      console.log("[EnemyDatabase] Loaded enemy definitions:", Object.keys(this.data!.enemies));
    } catch (error) {
      console.error("[EnemyDatabase] Error loading enemies.json:", error);
      throw error;
    }
  }

  getEnemyDefinition(enemyId: string): EnemyDefinition | undefined {
    if (!this.data) {
      console.error("[EnemyDatabase] Database not loaded! Call load() first.");
      return undefined;
    }
    return this.data.enemies[enemyId];
  }

  getPlayerDefinition(): PlayerDefinition {
    if (!this.data) {
      console.error("[EnemyDatabase] Database not loaded! Call load() first.");
      // Return default player stats as fallback
      return {
        name: "Player",
        stats: { hp: 20, atk: 5, def: 3, agi: 5 }
      };
    }
    return this.data.player;
  }

  getAllEnemyIds(): string[] {
    if (!this.data) {
      return [];
    }
    return Object.keys(this.data.enemies);
  }

  isLoaded(): boolean {
    return this.data !== null;
  }
}
