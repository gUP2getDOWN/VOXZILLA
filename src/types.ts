/**
 * Shared types for Voxzilla
 */

export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export interface Voxel {
  id: string;
  pos: Vector3;
  ownerId: string;
  color?: string;
  baseCost: number;
  fortificationTier: number;
  fortificationInvestment: number;
  totalInvestedValue: number;
  hp: number;
  maxHp: number;
  placedAt: number; // timestamp
  lastAttackedAt?: number; // timestamp
}

export interface Player {
  id: string;
  name: string;
  bucks: number;
  xp: number;
  level: number;
  teamId?: string;
  lastIncomeAt: number;
  joinedAt: number;
  isNewPlayer: boolean;
}

export interface Team {
  id: string;
  name: string;
  leaderId: string;
  memberIds: string[];
}

export interface GameConfig {
  baseIncome: number;
  incomeInterval: number; // ms
  baseVoxelCost: number;
  heightMultiplier: number;
  attackCost: number;
  attackDamage: number;
  fortificationHpBonus: number;
  fortificationCosts: number[];
  lootPercentage: number;
  storageCapBase: number;
  storageCapPerLevel: number;
  maxHeight: number;
  viewDistance: number;
  collapseEnabled: boolean;
  worldSize: number;
  chunkSize: number;
  destroyRefund: number;
  buildBuffer: number;
  repairCostPercentage: number;
  isPaused: boolean;
}

export type ServerMessage =
  | { type: 'INIT'; config: GameConfig; playerId: string; players: Player[]; teams: Team[]; voxels: Voxel[] }
  | { type: 'PLAYER_JOINED'; player: Player }
  | { type: 'PLAYER_LEFT'; playerId: string }
  | { type: 'VOXEL_PLACED'; voxel: Voxel; player: Player }
  | { type: 'VOXEL_ATTACKED'; voxelId: string; attackerId: string; damage: number; newHp: number; playerBucks: number }
  | { type: 'VOXEL_DESTROYED'; voxelId: string; attackerId: string; loot: number; playerBucks: number; collapsedVoxels: Voxel[] }
  | { type: 'VOXEL_FORTIFIED'; voxel: Voxel; player: Player }
  | { type: 'VOXEL_REMOVED'; voxelId: string }
  | { type: 'INCOME_UPDATE'; playerId: string; bucks: number; nextIncomeIn: number }
  | { type: 'CONFIG_UPDATE'; config: GameConfig }
  | { type: 'TEAM_UPDATE'; teams: Team[] }
  | { type: 'CHAT_MESSAGE'; playerId: string; playerName: string; message: string; teamId?: string }
  | { type: 'ERROR'; message: string };

export type ClientMessage =
  | { type: 'PLACE_VOXEL'; pos: Vector3; color?: string }
  | { type: 'ATTACK_VOXEL'; voxelId: string }
  | { type: 'FORTIFY_VOXEL'; voxelId: string }
  | { type: 'DESTROY_VOXEL'; voxelId: string }
  | { type: 'REPAIR_VOXELS'; voxelId: string }
  | { type: 'JOIN_TEAM'; teamId: string }
  | { type: 'CREATE_TEAM'; name: string }
  | { type: 'LEAVE_TEAM' }
  | { type: 'CHAT'; message: string; teamOnly?: boolean }
  | { type: 'ADMIN_UPDATE_CONFIG'; config: Partial<GameConfig> };
