import express from 'express';
import { createServer as createViteServer } from 'vite';
import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { GameConfig, Player, Voxel, Team, ServerMessage, ClientMessage, Vector3 } from './src/types.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = 3000;

// Game State
let config: GameConfig = {
  baseIncome: 3,
  incomeInterval: 15000,
  baseVoxelCost: 10,
  heightMultiplier: 0.03,
  attackCost: 5,
  attackDamage: 30,
  fortificationHpBonus: 70,
  fortificationCosts: [15, 30, 60],
  lootPercentage: 0.3,
  storageCapBase: 300,
  storageCapPerLevel: 10,
  maxHeight: 64,
  viewDistance: 5,
  collapseEnabled: true,
  worldSize: 256,
  chunkSize: 16,
  destroyRefund: 5,
  buildBuffer: 2,
  repairCostPercentage: 0.5,
  isPaused: false,
};

const players = new Map<string, Player>();
const voxels = new Map<string, Voxel>(); // key: "x,y,z"
const teams = new Map<string, Team>();
const connections = new Map<string, WebSocket>();

// Helper to get voxel key
const getVoxelKey = (pos: Vector3) => `${pos.x.toFixed(1)},${pos.y},${pos.z.toFixed(1)}`;

// Helper to check if a position is supported (connected to ground)
const isSupported = (pos: Vector3, visited = new Set<string>()): boolean => {
  if (pos.y === 0) return true;
  
  const key = getVoxelKey(pos);
  if (visited.has(key)) return false;
  visited.add(key);

  const neighbors = [
    { x: pos.x + 1, y: pos.y, z: pos.z },
    { x: pos.x - 1, y: pos.y, z: pos.z },
    { x: pos.x, y: pos.y + 1, z: pos.z },
    { x: pos.x, y: pos.y - 1, z: pos.z },
    { x: pos.x, y: pos.y, z: pos.z + 1 },
    { x: pos.x, y: pos.y, z: pos.z - 1 },
  ];

  for (const n of neighbors) {
    const nKey = getVoxelKey(n);
    if (voxels.has(nKey)) {
      if (n.y === 0) return true;
      if (isSupported(n, visited)) return true;
    }
  }

  return false;
};

// Helper to check if a voxel is adjacent to any existing voxel
const isAdjacentToVoxel = (pos: Vector3): boolean => {
  const neighbors = [
    { x: pos.x + 1, y: pos.y, z: pos.z },
    { x: pos.x - 1, y: pos.y, z: pos.z },
    { x: pos.x, y: pos.y + 1, z: pos.z },
    { x: pos.x, y: pos.y - 1, z: pos.z },
    { x: pos.x, y: pos.y, z: pos.z + 1 },
    { x: pos.x, y: pos.y, z: pos.z - 1 },
  ];
  return neighbors.some(n => voxels.has(getVoxelKey(n)));
};

// Helper to get voxels in a column
const getColumnVoxels = (x: number, z: number) => {
  const column: Voxel[] = [];
  for (let y = 0; y < config.maxHeight; y++) {
    const v = voxels.get(`${x.toFixed(1)},${y},${z.toFixed(1)}`);
    if (v) column.push(v);
  }
  return column.sort((a, b) => a.pos.y - b.pos.y);
};

// Helper to check structural integrity and return voxels that should be destroyed
const checkIntegrity = (): Voxel[] => {
  const supported = new Set<string>();
  const queue: string[] = [];

  // Start with all voxels on the ground
  for (const [key, voxel] of voxels.entries()) {
    if (voxel.pos.y === 0) {
      supported.add(key);
      queue.push(key);
    }
  }

  // BFS to find all connected voxels
  let head = 0;
  while (head < queue.length) {
    const currentKey = queue[head++]!;
    const currentVoxel = voxels.get(currentKey);
    if (!currentVoxel) continue;
    
    const pos = currentVoxel.pos;
    const neighbors = [
      { x: pos.x + 1, y: pos.y, z: pos.z },
      { x: pos.x - 1, y: pos.y, z: pos.z },
      { x: pos.x, y: pos.y + 1, z: pos.z },
      { x: pos.x, y: pos.y - 1, z: pos.z },
      { x: pos.x, y: pos.y, z: pos.z + 1 },
      { x: pos.x, y: pos.y, z: pos.z - 1 },
    ];

    for (const n of neighbors) {
      const nKey = getVoxelKey(n);
      if (voxels.has(nKey) && !supported.has(nKey)) {
        supported.add(nKey);
        queue.push(nKey);
      }
    }
  }

  // Find and remove unsupported voxels
  const unsupported: Voxel[] = [];
  for (const [key, voxel] of voxels.entries()) {
    if (!supported.has(key)) {
      unsupported.push(voxel);
      voxels.delete(key);
    }
  }

  return unsupported;
};

async function startServer() {
  const app = express();
  const server = new Server(app);
  const wss = new WebSocketServer({ server });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
  }

  wss.on('connection', (ws) => {
    const playerId = Math.random().toString(36).substring(2, 9);
    
    const player: Player = {
      id: playerId,
      name: `Player_${playerId}`,
      bucks: 150,
      xp: 0,
      level: 1,
      lastIncomeAt: Date.now(),
      joinedAt: Date.now(),
      isNewPlayer: true,
    };

    players.set(playerId, player);
    connections.set(playerId, ws);

    // Clear new player protection after 60 mins
    setTimeout(() => {
      const p = players.get(playerId);
      if (p) p.isNewPlayer = false;
    }, 3600000);

    // Send initial state
    const initMsg: ServerMessage = {
      type: 'INIT',
      config,
      playerId,
      players: Array.from(players.values()),
      teams: Array.from(teams.values()),
      voxels: Array.from(voxels.values()),
    };
    ws.send(JSON.stringify(initMsg));

    // Broadcast join
    broadcast({ type: 'PLAYER_JOINED', player }, playerId);

    ws.on('message', (data) => {
      try {
        const msg: ClientMessage = JSON.parse(data.toString());
        handleClientMessage(playerId, msg);
      } catch (e) {
        console.error('Failed to parse message', e);
      }
    });

    ws.on('close', () => {
      players.delete(playerId);
      connections.delete(playerId);
      broadcast({ type: 'PLAYER_LEFT', playerId });
    });
  });

  // Income loop
  setInterval(() => {
    if (config.isPaused) return;
    const now = Date.now();
    players.forEach((player, id) => {
      if (now - player.lastIncomeAt >= config.incomeInterval) {
        const levelBonus = Math.min(0.2, (player.level - 1) * 0.01);
        const income = Math.floor(config.baseIncome * (1 + levelBonus));
        const storageCap = config.storageCapBase + (player.level * config.storageCapPerLevel);
        
        if (player.bucks < storageCap) {
          player.bucks = Math.min(storageCap, player.bucks + income);
          player.lastIncomeAt = now;
          
          const msg: ServerMessage = {
            type: 'INCOME_UPDATE',
            playerId: id,
            bucks: player.bucks,
            nextIncomeIn: config.incomeInterval,
          };
          connections.get(id)?.send(JSON.stringify(msg));
        }
      }
    });
  }, 1000);

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

function broadcast(msg: ServerMessage, excludeId?: string) {
  const data = JSON.stringify(msg);
  connections.forEach((ws, id) => {
    if (id !== excludeId && ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  });
}

function handleClientMessage(playerId: string, msg: ClientMessage) {
  const player = players.get(playerId);
  if (!player) return;

  // Admin can always update config even if paused
  if (msg.type === 'ADMIN_UPDATE_CONFIG') {
    config = { ...config, ...msg.config };
    broadcast({ type: 'CONFIG_UPDATE', config });
    return;
  }

  if (config.isPaused) {
    connections.get(playerId)?.send(JSON.stringify({ type: 'ERROR', message: 'Voxzilla is currently paused by an admin.' }));
    return;
  }

  switch (msg.type) {
    case 'PLACE_VOXEL': {
      let { pos, color } = msg;
      pos = { x: Math.floor(pos.x) + 0.5, y: Math.round(pos.y), z: Math.floor(pos.z) + 0.5 };
      console.log(`Player ${playerId} placing voxel at ${pos.x},${pos.y},${pos.z}`);
      // Validation
      if (pos.y < 0 || pos.y >= config.maxHeight) return;
      if (Math.abs(pos.x) > config.worldSize / 2 || Math.abs(pos.z) > config.worldSize / 2) return;
      
      const key = getVoxelKey(pos);
      if (voxels.has(key)) return;

      // Check for enemy voxels within build buffer
      const range = config.buildBuffer;
      for (let dx = -range; dx <= range; dx++) {
        for (let dy = -range; dy <= range; dy++) {
          for (let dz = -range; dz <= range; dz++) {
            const checkPos = { x: pos.x + dx, y: pos.y + dy, z: pos.z + dz };
            const nearbyVoxel = voxels.get(getVoxelKey(checkPos));
            if (nearbyVoxel) {
              const nearbyOwner = players.get(nearbyVoxel.ownerId);
              const isEnemy = nearbyVoxel.ownerId !== playerId && (!player.teamId || nearbyOwner?.teamId !== player.teamId);
              if (isEnemy) {
                connections.get(playerId)?.send(JSON.stringify({ type: 'ERROR', message: 'Too close to an enemy voxel!' }));
                return;
              }
            }
          }
        }
      }

      // Check support
      const onGround = pos.y === 0;
      const adjacentToSupported = isAdjacentToVoxel(pos) && isSupported(pos);

      if (!onGround && !adjacentToSupported) {
        console.log(`Placement rejected for ${playerId}: no support at ${pos.x},${pos.y},${pos.z}`);
        connections.get(playerId)?.send(JSON.stringify({ type: 'ERROR', message: 'No support! Voxels must be on ground or connected to a supported voxel.' }));
        return;
      }

      // Team/Owner check for stacking (if placing ON TOP of another voxel)
      const below = voxels.get(getVoxelKey({ ...pos, y: pos.y - 1 }));
      if (below) {
        const belowOwner = players.get(below.ownerId);
        const isSameOwner = below.ownerId === playerId;
        const isSameTeam = player.teamId && belowOwner?.teamId === player.teamId;

        if (!isSameOwner && !isSameTeam) {
          console.log(`Placement rejected for ${playerId}: cannot stack on non-team voxel at ${pos.x},${pos.y-1},${pos.z}`);
          connections.get(playerId)?.send(JSON.stringify({ type: 'ERROR', message: 'You can only stack voxels on your own or your team\'s voxels!' }));
          return;
        }
      }

      // Cost
      let cost = Math.round(config.baseVoxelCost * (1 + pos.y * config.heightMultiplier));
      if (player.isNewPlayer && (Date.now() - player.joinedAt < 3600000)) {
        cost = Math.round(cost * 0.75);
      }

      if (player.bucks < cost) {
        console.log(`Placement rejected for ${playerId}: not enough bucks (${player.bucks} < ${cost})`);
        connections.get(playerId)?.send(JSON.stringify({ type: 'ERROR', message: 'Not enough bucks' }));
        return;
      }

      player.bucks -= cost;
      player.xp += 10;
      checkLevelUp(player);

      const voxel: Voxel = {
        id: Math.random().toString(36).substring(2, 9),
        pos,
        ownerId: playerId,
        color,
        baseCost: cost,
        fortificationTier: 0,
        fortificationInvestment: 0,
        totalInvestedValue: cost,
        hp: 120,
        maxHp: 120,
        placedAt: Date.now(),
      };

      voxels.set(key, voxel);
      broadcast({ type: 'VOXEL_PLACED', voxel, player });
      broadcast({ 
        type: 'CHAT_MESSAGE', 
        playerId: 'system', 
        playerName: 'System', 
        message: `${player.name} placed a voxel at ${pos.x}, ${pos.y}, ${pos.z}` 
      });
      break;
    }

    case 'ATTACK_VOXEL': {
      const voxel = Array.from(voxels.values()).find(v => v.id === msg.voxelId);
      if (!voxel) return;
      if (voxel.ownerId === playerId) return;
      
      // Protection
      if (Date.now() - voxel.placedAt < 20000) {
        connections.get(playerId)?.send(JSON.stringify({ type: 'ERROR', message: 'Voxel is protected' }));
        return;
      }

      if (player.bucks < config.attackCost) return;

      player.bucks -= config.attackCost;
      voxel.hp -= config.attackDamage;
      voxel.lastAttackedAt = Date.now();

      if (voxel.hp <= 0) {
        // Destroyed
        const loot = Math.floor(voxel.totalInvestedValue * config.lootPercentage);
        player.bucks += loot;
        player.xp += 50;
        checkLevelUp(player);

        voxels.delete(getVoxelKey(voxel.pos));
        
        // Structural Integrity Check (Replaces simple column collapse)
        const collapsedVoxels = checkIntegrity();

        broadcast({ 
          type: 'VOXEL_DESTROYED', 
          voxelId: voxel.id, 
          attackerId: playerId, 
          loot, 
          playerBucks: player.bucks,
          collapsedVoxels
        });
      } else {
        broadcast({ 
          type: 'VOXEL_ATTACKED', 
          voxelId: voxel.id, 
          attackerId: playerId, 
          damage: config.attackDamage, 
          newHp: voxel.hp,
          playerBucks: player.bucks
        });
      }
      break;
    }

    case 'FORTIFY_VOXEL': {
      const voxel = Array.from(voxels.values()).find(v => v.id === msg.voxelId);
      if (!voxel || voxel.ownerId !== playerId) return;
      if (voxel.fortificationTier >= 3) return;

      const cost = config.fortificationCosts[voxel.fortificationTier];
      if (player.bucks < cost) return;

      player.bucks -= cost;
      voxel.fortificationTier += 1;
      voxel.fortificationInvestment += cost;
      voxel.totalInvestedValue += cost;
      voxel.maxHp += config.fortificationHpBonus;
      voxel.hp += config.fortificationHpBonus;

      broadcast({ type: 'VOXEL_FORTIFIED', voxel, player });
      break;
    }

    case 'CREATE_TEAM': {
      const teamId = Math.random().toString(36).substring(2, 9);
      const team: Team = {
        id: teamId,
        name: msg.name,
        leaderId: playerId,
        memberIds: [playerId],
      };
      teams.set(teamId, team);
      player.teamId = teamId;
      broadcast({ type: 'TEAM_UPDATE', teams: Array.from(teams.values()) });
      break;
    }

    case 'JOIN_TEAM': {
      const team = teams.get(msg.teamId);
      if (team && team.memberIds.length < 50) {
        team.memberIds.push(playerId);
        player.teamId = team.id;
        broadcast({ type: 'TEAM_UPDATE', teams: Array.from(teams.values()) });
      }
      break;
    }

    case 'CHAT': {
      broadcast({ 
        type: 'CHAT_MESSAGE', 
        playerId, 
        playerName: player.name, 
        message: msg.message,
        teamId: msg.teamOnly ? player.teamId : undefined
      });
      break;
    }

    case 'DESTROY_VOXEL': {
      const { voxelId } = msg;
      const voxel = Array.from(voxels.values()).find(v => v.id === voxelId);
      if (!voxel) return;

      const isOwner = voxel.ownerId === playerId;
      const team = player.teamId ? teams.get(player.teamId) : null;
      const isTeamLeader = team?.leaderId === playerId;

      if (isOwner || isTeamLeader) {
        voxels.delete(getVoxelKey(voxel.pos));
        
        // Structural Integrity Check
        const collapsedVoxels = checkIntegrity();
        
        // Notify clients about the manual destruction and any subsequent collapses
        broadcast({ type: 'VOXEL_REMOVED', voxelId });
        
        if (collapsedVoxels.length > 0) {
          collapsedVoxels.forEach(v => {
            broadcast({ type: 'VOXEL_REMOVED', voxelId: v.id });
          });
        }

        broadcast({ 
          type: 'CHAT_MESSAGE', 
          playerId: 'system', 
          playerName: 'System', 
          message: `${player.name} destroyed a voxel at ${voxel.pos.x}, ${voxel.pos.y}, ${voxel.pos.z}` 
        });
      }
      break;
    }

    case 'REPAIR_VOXELS': {
      const { voxelId } = msg;
      const startVoxel = Array.from(voxels.values()).find(v => v.id === voxelId);
      if (!startVoxel) return;

      // Only owner or team can repair
      const isOwner = startVoxel.ownerId === playerId;
      const startOwner = players.get(startVoxel.ownerId);
      const isSameTeam = player.teamId && startOwner?.teamId === player.teamId;
      if (!isOwner && !isSameTeam) return;

      // Find all connected voxels (same logic as BFS in checkIntegrity but restricted to team/owner)
      const connected = new Set<string>();
      const queue: string[] = [getVoxelKey(startVoxel.pos)];
      connected.add(getVoxelKey(startVoxel.pos));

      let head = 0;
      while (head < queue.length) {
        const currentKey = queue[head++]!;
        const currentVoxel = voxels.get(currentKey);
        if (!currentVoxel) continue;
        
        const pos = currentVoxel.pos;
        const neighbors = [
          { x: pos.x + 1, y: pos.y, z: pos.z },
          { x: pos.x - 1, y: pos.y, z: pos.z },
          { x: pos.x, y: pos.y + 1, z: pos.z },
          { x: pos.x, y: pos.y - 1, z: pos.z },
          { x: pos.x, y: pos.y, z: pos.z + 1 },
          { x: pos.x, y: pos.y, z: pos.z - 1 },
        ];

        for (const n of neighbors) {
          const nKey = getVoxelKey(n);
          const nVoxel = voxels.get(nKey);
          if (nVoxel && !connected.has(nKey)) {
            const nOwner = players.get(nVoxel.ownerId);
            const nIsSameTeam = player.teamId && nOwner?.teamId === player.teamId;
            const nIsOwner = nVoxel.ownerId === playerId;
            
            if (nIsOwner || nIsSameTeam) {
              connected.add(nKey);
              queue.push(nKey);
            }
          }
        }
      }

      // Calculate total repair cost
      let totalCost = 0;
      const toRepair: Voxel[] = [];
      for (const key of connected) {
        const v = voxels.get(key);
        if (v && v.hp < v.maxHp) {
          const repairCost = Math.round(v.totalInvestedValue * config.repairCostPercentage * (1 - v.hp / v.maxHp));
          totalCost += repairCost;
          toRepair.push(v);
        }
      }

      if (totalCost > player.bucks) {
        connections.get(playerId)?.send(JSON.stringify({ type: 'ERROR', message: `Not enough bucks to repair! Need ${totalCost} VB.` }));
        return;
      }

      player.bucks -= totalCost;
      toRepair.forEach(v => {
        v.hp = v.maxHp;
        broadcast({ 
          type: 'VOXEL_ATTACKED', 
          voxelId: v.id, 
          attackerId: 'system', 
          damage: 0, 
          newHp: v.hp,
          playerBucks: player.bucks 
        });
      });

      connections.get(playerId)?.send(JSON.stringify({ type: 'CHAT_MESSAGE', playerId: 'system', playerName: 'System', message: `Repaired ${toRepair.length} voxels for ${totalCost} VB.` }));
      break;
    }
  }
}

function checkLevelUp(player: Player) {
  const nextLevelXp = player.level * 500;
  if (player.xp >= nextLevelXp) {
    player.level += 1;
    player.xp -= nextLevelXp;
  }
}

startServer();
