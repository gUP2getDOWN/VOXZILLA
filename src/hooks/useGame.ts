import { useState, useEffect, useCallback, useRef } from 'react';
import { Player, Voxel, Team, GameConfig, ServerMessage, ClientMessage, Vector3 } from '../types';

export function useGame() {
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [voxels, setVoxels] = useState<Voxel[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [config, setConfig] = useState<GameConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<{ playerName: string; message: string; teamId?: string }[]>([]);
  
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}`);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      const msg: ServerMessage = JSON.parse(event.data);
      
      switch (msg.type) {
        case 'INIT':
          setPlayerId(msg.playerId);
          setPlayers(msg.players);
          setVoxels(msg.voxels);
          setTeams(msg.teams);
          setConfig(msg.config);
          break;
        case 'PLAYER_JOINED':
          setPlayers(prev => [...prev, msg.player]);
          break;
        case 'PLAYER_LEFT':
          setPlayers(prev => prev.filter(p => p.id !== msg.playerId));
          break;
        case 'VOXEL_PLACED':
          console.log('Voxel placed received', msg.voxel);
          setVoxels(prev => [...prev, msg.voxel]);
          setPlayers(prev => prev.map(p => p.id === msg.player.id ? msg.player : p));
          break;
        case 'VOXEL_ATTACKED':
          setVoxels(prev => prev.map(v => v.id === msg.voxelId ? { ...v, hp: msg.newHp } : v));
          setPlayers(prev => prev.map(p => p.id === msg.attackerId ? { ...p, bucks: msg.playerBucks } : p));
          break;
        case 'VOXEL_DESTROYED':
          setVoxels(prev => {
            const collapsedIds = new Set(msg.collapsedVoxels.map(cv => cv.id));
            return prev.filter(v => v.id !== msg.voxelId && !collapsedIds.has(v.id));
          });
          setPlayers(prev => prev.map(p => p.id === msg.attackerId ? { ...p, bucks: msg.playerBucks } : p));
          break;
        case 'VOXEL_FORTIFIED':
          setVoxels(prev => prev.map(v => v.id === msg.voxel.id ? msg.voxel : v));
          setPlayers(prev => prev.map(p => p.id === msg.player.id ? msg.player : p));
          break;
        case 'VOXEL_REMOVED':
          setVoxels(prev => prev.filter(v => v.id !== msg.voxelId));
          break;
        case 'INCOME_UPDATE':
          setPlayers(prev => prev.map(p => p.id === msg.playerId ? { ...p, bucks: msg.bucks } : p));
          break;
        case 'CONFIG_UPDATE':
          setConfig(msg.config);
          break;
        case 'TEAM_UPDATE':
          setTeams(msg.teams);
          break;
        case 'CHAT_MESSAGE':
          setChatMessages(prev => [...prev, { playerName: msg.playerName, message: msg.message, teamId: msg.teamId }].slice(-50));
          break;
        case 'ERROR':
          setError(msg.message);
          setTimeout(() => setError(null), 3000);
          break;
      }
    };

    return () => ws.close();
  }, []);

  const sendMessage = useCallback((msg: ClientMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    } else {
      console.warn('Socket not open, cannot send message', msg);
    }
  }, []);

  const placeVoxel = useCallback((pos: Vector3, color?: string) => sendMessage({ type: 'PLACE_VOXEL', pos, color }), [sendMessage]);
  const attackVoxel = useCallback((voxelId: string) => sendMessage({ type: 'ATTACK_VOXEL', voxelId }), [sendMessage]);
  const fortifyVoxel = useCallback((voxelId: string) => sendMessage({ type: 'FORTIFY_VOXEL', voxelId }), [sendMessage]);
  const destroyVoxel = useCallback((voxelId: string) => sendMessage({ type: 'DESTROY_VOXEL', voxelId }), [sendMessage]);
  const repairVoxel = useCallback((voxelId: string) => sendMessage({ type: 'REPAIR_VOXELS', voxelId }), [sendMessage]);
  const createTeam = useCallback((name: string) => sendMessage({ type: 'CREATE_TEAM', name }), [sendMessage]);
  const joinTeam = useCallback((teamId: string) => sendMessage({ type: 'JOIN_TEAM', teamId }), [sendMessage]);
  const sendChat = useCallback((message: string, teamOnly?: boolean) => sendMessage({ type: 'CHAT', message, teamOnly }), [sendMessage]);

  return {
    playerId,
    players,
    voxels,
    teams,
    config,
    error,
    chatMessages,
    sendMessage,
    placeVoxel,
    attackVoxel,
    fortifyVoxel,
    destroyVoxel,
    repairVoxel,
    createTeam,
    joinTeam,
    sendChat,
  };
}
