import React, { useEffect, useRef, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Coins, 
  TrendingUp, 
  Shield, 
  Sword, 
  Users, 
  Trophy, 
  Settings, 
  MessageSquare, 
  Plus,
  X,
  ShieldAlert,
  Crown,
  Wrench,
  Info,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { VoxzillaGame } from './game/VoxzillaGame';
import { useGame } from './hooks/useGame';
import { Voxel, Vector3, Player } from './types';

const InfoTooltip = ({ text, position }: { text: string, position?: string }) => {
  const handleMouseEnter = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    window.dispatchEvent(new CustomEvent('show-vox-tooltip', { 
      detail: { 
        text, 
        x: rect.left + rect.width / 2, 
        y: rect.top 
      } 
    }));
  };

  const handleMouseLeave = () => {
    window.dispatchEvent(new CustomEvent('hide-vox-tooltip'));
  };

  return (
    <div 
      className="inline-block ml-1 cursor-help"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <Info className="w-3 h-3 text-white/40 hover:text-white/80 transition-colors" />
    </div>
  );
};

const Minimap = ({ voxels, players, worldSize, onMoveCamera, playerId }: { 
  voxels: Voxel[], 
  players: Player[], 
  worldSize: number, 
  onMoveCamera: (x: number, z: number) => void,
  playerId: string | null
}) => {
  const [zoom, setZoom] = useState(1);
  const mapRef = useRef<HTMLDivElement>(null);

  const handleWheel = (e: React.WheelEvent) => {
    setZoom(prev => Math.max(1, Math.min(5, prev - e.deltaY * 0.001)));
  };

  const handleClick = (e: React.MouseEvent) => {
    if (!mapRef.current) return;
    const rect = mapRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width - 0.5) * worldSize / zoom;
    const z = ((e.clientY - rect.top) / rect.height - 0.5) * worldSize / zoom;
    onMoveCamera(x, z);
  };

  return (
    <div 
      ref={mapRef}
      onWheel={handleWheel}
      onClick={handleClick}
      className="relative w-full aspect-square bg-black/40 backdrop-blur-md border border-white/10 rounded-2xl overflow-hidden cursor-crosshair group"
    >
      <div className="absolute inset-0 flex items-center justify-center opacity-20 pointer-events-none">
        <div className="w-full h-px bg-white/20" />
        <div className="h-full w-px bg-white/20 absolute" />
      </div>
      
      {voxels.map(v => {
        const owner = players.find(p => p.id === v.ownerId);
        const isSelf = v.ownerId === playerId;
        const isTeam = !isSelf && owner?.teamId && players.find(p => p.id === playerId)?.teamId === owner.teamId;
        
        const sizeInPercent = (1 / worldSize) * zoom * 100;
        const left = ((v.pos.x / worldSize * zoom) + 0.5) * 100;
        const top = ((v.pos.z / worldSize * zoom) + 0.5) * 100;
        
        if (left < -sizeInPercent || left > 100 + sizeInPercent || top < -sizeInPercent || top > 100 + sizeInPercent) return null;

        return (
          <div 
            key={v.id}
            className="absolute shadow-[0_0_1px_rgba(0,0,0,0.3)]"
            style={{ 
              left: `${left}%`, 
              top: `${top}%`,
              width: `${sizeInPercent}%`,
              height: `${sizeInPercent}%`,
              transform: 'translate(-50%, -50%)',
              backgroundColor: v.color || (isSelf ? '#10b981' : isTeam ? '#818cf8' : '#ef4444')
            }}
          />
        );
      })}

      <div className="absolute bottom-2 right-2 text-[8px] text-white/40 uppercase font-black tracking-tighter pointer-events-none group-hover:opacity-100 opacity-0 transition-opacity">
        Scroll to Zoom • Click to Teleport
      </div>
    </div>
  );
};

export default function App() {
  const [activeTooltip, setActiveTooltip] = useState<{ text: string, x: number, y: number } | null>(null);

  useEffect(() => {
    const showHandler = (e: any) => setActiveTooltip(e.detail);
    const hideHandler = () => setActiveTooltip(null);

    window.addEventListener('show-vox-tooltip', showHandler);
    window.addEventListener('hide-vox-tooltip', hideHandler);
    return () => {
      window.removeEventListener('show-vox-tooltip', showHandler);
      window.removeEventListener('hide-vox-tooltip', hideHandler);
    };
  }, []);
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<VoxzillaGame | null>(null);
  const { 
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
    sendChat
  } = useGame();

  const [targetVoxel, setTargetVoxel] = useState<Voxel | null>(null);
  const [targetPos, setTargetPos] = useState<Vector3 | null>(null);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [showTeam, setShowTeam] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [selectedColor, setSelectedColor] = useState('#4cc9f0');
  const [chatInput, setChatInput] = useState('');
  const [teamNameInput, setTeamNameInput] = useState('');
  const [selectedVoxelForMenu, setSelectedVoxelForMenu] = useState<Voxel | null>(null);
  const [isLocked, setIsLocked] = useState(false);
  const [isRestricted, setIsRestricted] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);
  const [panelsCollapsed, setPanelsCollapsed] = useState({
    stats: false,
    leaderboard: false,
    team: false,
    chat: false,
    admin: false,
    colors: false
  });

  const currentPlayer = useMemo(() => players.find(p => p.id === playerId), [players, playerId]);

  useEffect(() => {
    const handleLockChange = () => {
      setIsLocked(!!document.pointerLockElement);
    };
    document.addEventListener('pointerlockchange', handleLockChange);
    return () => document.removeEventListener('pointerlockchange', handleLockChange);
  }, []);

  useEffect(() => {
    if (gameRef.current) {
      gameRef.current.onPlace = (pos) => {
        console.log('Placing voxel at', pos, 'with color', selectedColor);
        placeVoxel(pos, selectedColor);
      };
      gameRef.current.onAttack = (voxelId) => {
        const voxel = voxels.find(v => v.id === voxelId);
        if (!voxel) return;

        const isTeam = currentPlayer?.teamId && voxel.teamId === currentPlayer.teamId;
        const isOwner = voxel.ownerId === playerId;

        if (isOwner || isTeam) {
          // Open Menu for team voxel
          setSelectedVoxelForMenu(voxel);
          document.exitPointerLock();
        } else {
          // Enemy voxel
          attackVoxel(voxelId);
        }
      };
    }
  }, [selectedColor, placeVoxel, attackVoxel, voxels, currentPlayer, playerId]);

  useEffect(() => {
    if (containerRef.current && config && playerId && !gameRef.current) {
      gameRef.current = new VoxzillaGame(containerRef.current, config, playerId);
      gameRef.current.onTargetChange = (voxel, pos, restricted) => {
        setTargetVoxel(voxel);
        setTargetPos(pos);
        setIsRestricted(restricted);
      };
    }
  }, [config, playerId]);

  useEffect(() => {
    if (gameRef.current && config) {
      gameRef.current.setConfig(config);
    }
  }, [config]);

  useEffect(() => {
    if (gameRef.current) {
      gameRef.current.setSelectedColor(selectedColor);
    }
  }, [selectedColor]);

  useEffect(() => {
    if (gameRef.current) {
      gameRef.current.updateState(voxels, players);
    }
  }, [voxels, players]);

  const handlePlace = () => {
    if (targetPos) placeVoxel(targetPos, selectedColor);
  };

  const handleAttack = () => {
    if (targetVoxel) attackVoxel(targetVoxel.id);
  };

  const handleFortify = () => {
    if (selectedVoxelForMenu) {
      fortifyVoxel(selectedVoxelForMenu.id);
      setSelectedVoxelForMenu(null);
      gameRef.current?.requestLock();
    }
  };

  const handleDestroy = () => {
    if (selectedVoxelForMenu) {
      destroyVoxel(selectedVoxelForMenu.id);
      setSelectedVoxelForMenu(null);
      gameRef.current?.requestLock();
    }
  };

  const handleRepair = () => {
    if (selectedVoxelForMenu) {
      repairVoxel(selectedVoxelForMenu.id);
      setSelectedVoxelForMenu(null);
      gameRef.current?.requestLock();
    }
  };

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (chatInput.trim()) {
      sendChat(chatInput);
      setChatInput('');
    }
  };

  const netWorth = useMemo(() => {
    if (!currentPlayer) return 0;
    const ownedVoxels = voxels.filter(v => v.ownerId === playerId);
    const investedValue = ownedVoxels.reduce((acc, v) => acc + v.totalInvestedValue, 0);
    return currentPlayer.bucks + investedValue;
  }, [currentPlayer, voxels, playerId]);

  const sortedPlayers = useMemo(() => {
    return [...players].sort((a, b) => {
      const aOwned = voxels.filter(v => v.ownerId === a.id);
      const bOwned = voxels.filter(v => v.ownerId === b.id);
      const aNet = a.bucks + aOwned.reduce((acc, v) => acc + v.totalInvestedValue, 0);
      const bNet = b.bucks + bOwned.reduce((acc, v) => acc + v.totalInvestedValue, 0);
      return bNet - aNet;
    });
  }, [players, voxels]);

  if (!config || !currentPlayer) {
    return (
      <div className="h-screen w-screen bg-slate-900 flex items-center justify-center text-white font-mono">
        <motion.div 
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ repeat: Infinity, duration: 2 }}
        >
          CONNECTING TO VOXZILLA...
        </motion.div>
      </div>
    );
  }

  const storageCap = config.storageCapBase + (currentPlayer.level * config.storageCapPerLevel);
  const nextIncomeIn = Math.max(0, Math.ceil((config.incomeInterval - (Date.now() - currentPlayer.lastIncomeAt)) / 1000));

  return (
    <div 
      className="relative h-screen w-screen overflow-hidden bg-black text-white font-sans select-none"
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Game Canvas */}
      <div ref={containerRef} className="absolute inset-0" />

      {/* Mode UI */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center gap-2">
        <div className="bg-black/60 backdrop-blur-xl border border-white/10 px-6 py-2 rounded-full flex items-center gap-4 shadow-2xl">
          <div className={`flex items-center gap-2 transition-all ${isLocked ? 'text-emerald-400 scale-105' : 'text-white/30'}`}>
            <div className={`w-2 h-2 rounded-full ${isLocked ? 'bg-emerald-400 animate-pulse' : 'bg-white/20'}`} />
            <span className="text-[10px] uppercase font-bold tracking-widest">Gameplay Mode</span>
          </div>
          <div className="h-4 w-px bg-white/10" />
          <div className={`flex items-center gap-2 transition-all ${!isLocked ? 'text-indigo-400 scale-105' : 'text-white/30'}`}>
            <div className={`w-2 h-2 rounded-full ${!isLocked ? 'bg-indigo-400 animate-pulse' : 'bg-white/20'}`} />
            <span className="text-[10px] uppercase font-bold tracking-widest">Menu Mode</span>
          </div>
          <div className="h-4 w-px bg-white/10" />
          <div className="text-[10px] text-white/40 uppercase font-black tracking-tighter">
            Press <span className="text-white underline decoration-2">ESC</span> to switch
          </div>
        </div>
      </div>

      {/* Enter Game Overlay */}
      <AnimatePresence>
        {!gameStarted && (
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm">
            {config?.isPaused ? (
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="flex flex-col items-center gap-6"
              >
                <div className="p-8 bg-red-500/20 border border-red-500/30 rounded-[40px] flex flex-col items-center gap-4 shadow-[0_0_100px_rgba(239,68,68,0.2)]">
                  <ShieldAlert className="w-16 h-16 text-red-500 animate-pulse" />
                  <div className="text-center">
                    <h2 className="text-4xl font-black uppercase tracking-tighter text-white">Voxzilla is Paused</h2>
                    <p className="text-red-400/60 font-bold uppercase text-xs tracking-widest mt-2">An admin has temporarily suspended gameplay</p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowAdmin(true)}
                  className="px-6 py-3 bg-white/10 hover:bg-white/20 border border-white/20 rounded-full text-white text-xs font-black uppercase tracking-widest transition-all backdrop-blur-md"
                >
                  Open Admin Panel to Unpause
                </button>
              </motion.div>
            ) : (
              <motion.button
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 1.2, opacity: 0 }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => {
                  setGameStarted(true);
                  gameRef.current?.requestLock();
                }}
                className="group relative px-12 py-6 bg-white text-black rounded-full font-black text-2xl uppercase tracking-tighter shadow-[0_0_50px_rgba(255,255,255,0.3)] hover:shadow-[0_0_80px_rgba(255,255,255,0.5)] transition-all"
              >
                <span className="relative z-10 flex items-center gap-4">
                  Enter Voxzilla
                  <ChevronRight className="w-8 h-8 group-hover:translate-x-2 transition-transform" />
                </span>
                <div className="absolute inset-0 rounded-full bg-white animate-ping opacity-20 group-hover:opacity-40" />
              </motion.button>
            )}
          </div>
        )}
      </AnimatePresence>

      {/* Voxel Menu */}
      <AnimatePresence>
        {selectedVoxelForMenu && (
          <div 
            className="absolute inset-0 z-50 flex items-center justify-center bg-black/20"
            onClick={() => {
              setSelectedVoxelForMenu(null);
              gameRef.current?.requestLock();
            }}
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-black/80 backdrop-blur-2xl border border-white/20 p-8 rounded-[40px] w-96 shadow-2xl flex flex-col gap-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-2xl font-bold">Voxel Actions</h3>
                  <p className="text-white/40 text-sm">Manage your team's voxel</p>
                </div>
                <button 
                  onClick={() => {
                    setSelectedVoxelForMenu(null);
                    gameRef.current?.requestLock();
                  }}
                  className="p-2 bg-white/5 rounded-full hover:bg-white/10"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <button 
                  onClick={handleFortify}
                  className="flex flex-col items-center gap-3 p-6 bg-emerald-500/10 border border-emerald-500/30 rounded-3xl hover:bg-emerald-500/20 transition-all group relative"
                >
                  <Shield className="w-8 h-8 text-emerald-400 group-hover:scale-110 transition-transform" />
                  <div className="flex items-center gap-1">
                    <span className="font-bold">Fortify</span>
                    <InfoTooltip text="Increases the maximum HP and current HP of the voxel. Each level of fortification makes the structure significantly more resilient to enemy attacks." />
                  </div>
                </button>
                <button 
                  onClick={handleRepair}
                  className="flex flex-col items-center gap-3 p-6 bg-blue-500/10 border border-blue-500/30 rounded-3xl hover:bg-blue-500/20 transition-all group relative"
                >
                  <Wrench className="w-8 h-8 text-blue-400 group-hover:scale-110 transition-transform" />
                  <div className="flex items-center gap-1">
                    <span className="font-bold">Repair</span>
                    <InfoTooltip text="Restores the voxel's HP to its current maximum. Costs a percentage of the voxel's total invested value." />
                  </div>
                </button>
                <button 
                  onClick={handleDestroy}
                  className="flex flex-col items-center gap-3 p-6 bg-red-500/10 border border-red-500/30 rounded-3xl hover:bg-red-500/20 transition-all group col-span-2 relative"
                >
                  <Sword className="w-8 h-8 text-red-400 group-hover:scale-110 transition-transform" />
                  <div className="flex items-center gap-1">
                    <span className="font-bold">Destroy</span>
                    <InfoTooltip text="Removes the voxel and returns a portion of its invested value to your balance. Useful for clearing space or recovering funds." />
                  </div>
                </button>
              </div>

              <div className="p-4 bg-white/5 rounded-2xl text-[10px] text-white/40 uppercase font-bold text-center">
                Click outside to cancel
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Error Toast */}
      <AnimatePresence>
        {error && (
          <motion.div 
            initial={{ y: -50, opacity: 0 }}
            animate={{ y: 20, opacity: 1 }}
            exit={{ y: -50, opacity: 0 }}
            className="absolute top-0 left-1/2 -translate-x-1/2 bg-red-500/80 backdrop-blur px-4 py-2 rounded-full text-sm font-bold shadow-lg z-50"
          >
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Crosshair */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
        <div className="relative">
          <div className="absolute -inset-2 border border-white/20 rounded-full" />
          <div className="w-1 h-1 bg-white rounded-full" />
          <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-4 w-px h-2 bg-white/40" />
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-4 w-px h-2 bg-white/40" />
          <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-4 w-2 h-px bg-white/40" />
          <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-4 w-2 h-px bg-white/40" />
        </div>
      </div>

      {/* Top Left: Stats */}
      <div className="absolute top-4 left-4 flex flex-col gap-2 z-10">
        <button 
          onClick={() => setPanelsCollapsed(prev => ({ ...prev, stats: !prev.stats }))}
          className="bg-black/60 backdrop-blur-md border border-white/10 p-2 rounded-xl flex items-center justify-between w-full hover:bg-white/5 transition-colors"
        >
          <span className="text-[10px] uppercase font-black tracking-widest px-2">Player Stats</span>
          {panelsCollapsed.stats ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
        </button>

        <AnimatePresence>
          {!panelsCollapsed.stats && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden flex flex-col gap-2"
            >
              {/* Color Picker */}
              <div className="bg-black/40 backdrop-blur-md border border-white/10 p-3 rounded-2xl flex flex-col gap-2 w-[240px]">
                <div className="flex justify-between items-center">
                  <div className="text-[10px] text-white/50 uppercase tracking-wider font-bold flex items-center">
                    Voxel Color
                    <InfoTooltip text="Select the color for new voxels you place. This helps identify your structures and customize your territory's appearance." position="bottom" />
                  </div>
                  <div className="w-3 h-3 rounded-full shadow-inner" style={{ backgroundColor: selectedColor }} />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    '#4cc9f0', '#4895ef', '#4361ee', '#3f37c9', '#3a0ca3', // Blues
                    '#7209b7', '#b5179e', '#f72585', '#ff4d6d', '#ff758f', // Pinks/Purples
                    '#00ff00', '#38b000', '#70e000', '#9ef01a', '#ccff33', // Greens
                    '#ffff00', '#ffea00', '#ffc300', '#ffaa00', '#ff9100', // Yellows/Oranges
                    '#ff0000', '#d00000', '#9d0208', '#6a040f', '#370617', // Reds
                    '#ffffff', '#e5e5e5', '#cccccc', '#999999', '#000000', // Grayscale
                  ].map(color => (
                    <button
                      key={color}
                      onClick={() => setSelectedColor(color)}
                      className={`w-5 h-5 rounded-sm border transition-all ${selectedColor === color ? 'border-white scale-110 z-10 shadow-lg' : 'border-transparent opacity-60 hover:opacity-100'}`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                  <div className="relative w-5 h-5 rounded-sm overflow-hidden border border-white/20 group">
                    <input 
                      type="color" 
                      value={selectedColor}
                      onChange={(e) => setSelectedColor(e.target.value)}
                      className="absolute inset-0 w-[200%] h-[200%] -translate-x-1/4 -translate-y-1/4 cursor-pointer"
                    />
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-0 group-hover:opacity-100 bg-black/20">
                      <Plus className="w-3 h-3" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-black/40 backdrop-blur-md border border-white/10 p-3 rounded-2xl flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-emerald-500/20 rounded-lg">
                    <Coins className="w-5 h-5 text-emerald-400" />
                  </div>
                  <div>
                    <div className="text-[10px] text-white/50 uppercase tracking-wider font-bold flex items-center">
                      Vox Bucks
                      <InfoTooltip text="Vox Bucks (VB) are the primary currency. Use them to build and fortify your base." position="bottom" />
                    </div>
                    <div className="text-xl font-mono font-bold flex items-baseline gap-1">
                      {currentPlayer.bucks}
                      <span className="text-xs text-white/30">/ {storageCap}</span>
                    </div>
                  </div>
                </div>
                <div className="h-8 w-px bg-white/10" />
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-indigo-500/20 rounded-lg">
                    <TrendingUp className="w-5 h-5 text-indigo-400" />
                  </div>
                  <div>
                    <div className="text-[10px] text-white/50 uppercase tracking-wider font-bold flex items-center">
                      Income
                      <InfoTooltip text="Passive income generated every interval. Higher levels increase your storage capacity and income efficiency." position="bottom" />
                    </div>
                    <div className="text-sm font-mono font-bold">
                      +{Math.floor(config.baseIncome * (1 + Math.min(0.2, (currentPlayer.level - 1) * 0.01)))} VB / {config.incomeInterval / 1000}s
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-black/40 backdrop-blur-md border border-white/10 p-3 rounded-2xl">
                <div className="flex justify-between items-center mb-1">
                  <div className="text-[10px] text-white/50 uppercase tracking-wider font-bold flex items-center">
                    Level {currentPlayer.level}
                    <InfoTooltip text="Your level represents your progress. Earn XP by building and interacting with the world." position="bottom" />
                  </div>
                  <div className="text-[10px] text-white/50 font-mono">{currentPlayer.xp} / {currentPlayer.level * 500} XP</div>
                </div>
                <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
                  <motion.div 
                    className="h-full bg-indigo-500"
                    initial={{ width: 0 }}
                    animate={{ width: `${(currentPlayer.xp / (currentPlayer.level * 500)) * 100}%` }}
                  />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Top Right: Controls */}
      <div className="absolute top-4 right-4 flex gap-2 z-50">
        <button 
          onClick={() => setShowLeaderboard(!showLeaderboard)}
          className={`p-3 rounded-2xl border transition-all ${showLeaderboard ? 'bg-white text-black border-white' : 'bg-black/40 backdrop-blur-md border-white/10 text-white hover:bg-white/10'}`}
        >
          <Trophy className="w-5 h-5" />
        </button>
        <button 
          onClick={() => setShowTeam(!showTeam)}
          className={`p-3 rounded-2xl border transition-all ${showTeam ? 'bg-white text-black border-white' : 'bg-black/40 backdrop-blur-md border-white/10 text-white hover:bg-white/10'}`}
        >
          <Users className="w-5 h-5" />
        </button>
        <button 
          onClick={() => setShowChat(!showChat)}
          className={`p-3 rounded-2xl border transition-all ${showChat ? 'bg-white text-black border-white' : 'bg-black/40 backdrop-blur-md border-white/10 text-white hover:bg-white/10'}`}
        >
          <MessageSquare className="w-5 h-5" />
        </button>
        <button 
          onClick={() => setShowAdmin(!showAdmin)}
          className={`p-3 rounded-2xl border transition-all ${showAdmin ? 'bg-white text-black border-white' : 'bg-black/40 backdrop-blur-md border-white/10 text-white hover:bg-white/10'}`}
        >
          <Settings className="w-5 h-5" />
        </button>

        {/* Minimap */}
        {config && (
          <div className="absolute top-16 right-0 w-48 z-0">
            <Minimap 
              voxels={voxels} 
              players={players} 
              worldSize={config.worldSize} 
              playerId={playerId}
              onMoveCamera={(x, z) => gameRef.current?.moveCameraTo(x, z)} 
            />
          </div>
        )}
      </div>

      {/* Bottom Center: Target Info */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-4 z-10">
        <AnimatePresence mode="wait">
          {targetVoxel ? (
            <motion.div 
              key="target-voxel"
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 20, opacity: 0 }}
              className="bg-black/60 backdrop-blur-xl border border-white/20 p-4 rounded-3xl w-80 shadow-2xl"
            >
              <div className="flex justify-between items-start mb-4">
                <div>
                  <div className="text-[10px] text-white/50 uppercase tracking-wider font-bold">Targeting Voxel</div>
                  <div className="text-lg font-bold flex items-center gap-2">
                    {targetVoxel.ownerId === playerId ? 'Your Voxel' : `Enemy Voxel`}
                    {targetVoxel.fortificationTier > 0 && (
                      <span className="px-2 py-0.5 bg-indigo-500/20 text-indigo-400 text-[10px] rounded-full border border-indigo-500/30">
                        Tier {targetVoxel.fortificationTier}
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] text-white/50 uppercase tracking-wider font-bold">Invested</div>
                  <div className="text-sm font-mono font-bold text-emerald-400">{targetVoxel.totalInvestedValue} VB</div>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-[10px] mb-1">
                    <span className="text-white/50 uppercase font-bold">Integrity</span>
                    <span className="font-mono">{targetVoxel.hp} / {targetVoxel.maxHp} HP</span>
                  </div>
                  <div className="h-2 w-full bg-white/10 rounded-full overflow-hidden">
                    <motion.div 
                      className={`h-full ${targetVoxel.hp < targetVoxel.maxHp * 0.3 ? 'bg-red-500' : 'bg-emerald-500'}`}
                      initial={{ width: 0 }}
                      animate={{ width: `${(targetVoxel.hp / targetVoxel.maxHp) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            </motion.div>
          ) : targetPos ? (
            <motion.div 
              key="target-pos"
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 20, opacity: 0 }}
              className="flex flex-col items-center gap-2"
            >
              <div className={`text-[10px] uppercase tracking-wider font-bold bg-black/40 backdrop-blur px-3 py-1 rounded-full border flex items-center gap-1 transition-colors ${isRestricted ? 'text-red-400 border-red-500/50 bg-red-500/10' : 'text-white/50 border-white/10'}`}>
                {isRestricted ? (
                  <>
                    <ShieldAlert className="w-3 h-3 animate-pulse" />
                    Too close to enemy structure!
                  </>
                ) : (
                  <>
                    Height {targetPos.y} • Cost {Math.round(config.baseVoxelCost * (1 + targetPos.y * config.heightMultiplier))} VB
                    <InfoTooltip text="Building higher costs more. The cost increases based on the vertical position of the voxel (Cost = Base + Height * Multiplier). Higher voxels are harder to reach but more expensive to place." />
                  </>
                )}
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      {/* Overlays */}
      <AnimatePresence>
        {showLeaderboard && (
          <motion.div 
            initial={{ x: 400 }}
            animate={{ x: 0 }}
            exit={{ x: 400 }}
            className="absolute top-20 right-4 bottom-20 w-80 bg-black/60 backdrop-blur-xl border border-white/10 rounded-3xl p-6 z-50 flex flex-col"
          >
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Trophy className="w-5 h-5 text-yellow-400" />
                Leaderboard
                <InfoTooltip text="Ranked by Net Worth (Vox Bucks + Invested Value). Build more to climb the ranks!" position="left" />
              </h2>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setPanelsCollapsed(prev => ({ ...prev, leaderboard: !prev.stats }))}
                  className="p-1 hover:bg-white/10 rounded-lg transition-colors"
                >
                  {panelsCollapsed.leaderboard ? <ChevronDown className="w-5 h-5" /> : <ChevronUp className="w-5 h-5" />}
                </button>
                <button onClick={() => setShowLeaderboard(false)}><X className="w-5 h-5 text-white/30" /></button>
              </div>
            </div>
            <AnimatePresence>
              {!panelsCollapsed.leaderboard && (
                <motion.div 
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="flex-1 flex flex-col"
                >
                  <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                    {sortedPlayers.map((p, i) => {
                      const pOwned = voxels.filter(v => v.ownerId === p.id);
                      const pNet = p.bucks + pOwned.reduce((acc, v) => acc + v.totalInvestedValue, 0);
                      return (
                        <div key={p.id} className={`p-3 rounded-2xl border flex items-center gap-3 ${p.id === playerId ? 'bg-indigo-500/20 border-indigo-500/50' : 'bg-white/5 border-white/5'}`}>
                          <div className="w-6 text-center font-mono font-bold text-white/30">{i + 1}</div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-bold truncate">{p.name}</div>
                            <div className="text-[10px] text-white/40 uppercase font-bold">Level {p.level}</div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-mono font-bold text-emerald-400">{pNet}</div>
                            <div className="text-[8px] text-white/30 uppercase font-bold flex items-center justify-end">
                              Net Worth
                              <InfoTooltip text="Total value of liquid VB and all placed voxels." position="bottom" />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}

        {showTeam && (
          <motion.div 
            initial={{ x: 400 }}
            animate={{ x: 0 }}
            exit={{ x: 400 }}
            className="absolute top-20 right-4 bottom-20 w-80 bg-black/60 backdrop-blur-xl border border-white/10 rounded-3xl p-6 z-50 flex flex-col"
          >
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Users className="w-5 h-5 text-indigo-400" />
                Team
                <InfoTooltip text="Collaborate with others! Team members can fortify and repair each other's voxels." position="bottom" />
              </h2>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setPanelsCollapsed(prev => ({ ...prev, team: !prev.team }))}
                  className="p-1 hover:bg-white/10 rounded-lg transition-colors"
                >
                  {panelsCollapsed.team ? <ChevronDown className="w-5 h-5" /> : <ChevronUp className="w-5 h-5" />}
                </button>
                <button onClick={() => setShowTeam(false)}><X className="w-5 h-5 text-white/30" /></button>
              </div>
            </div>
            
            <AnimatePresence>
              {!panelsCollapsed.team && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="flex-1 flex flex-col"
                >
                  {currentPlayer.teamId ? (
                    <div className="flex-1 flex flex-col">
                      <div className="bg-indigo-500/10 border border-indigo-500/30 p-4 rounded-2xl mb-4">
                        <div className="text-[10px] text-indigo-400 uppercase font-bold mb-1 flex items-center">
                          Active Team
                          <InfoTooltip text="You are currently a member of this team." position="bottom" />
                        </div>
                        <div className="text-lg font-bold">{teams.find(t => t.id === currentPlayer.teamId)?.name}</div>
                      </div>
                      <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                        {players.filter(p => p.teamId === currentPlayer.teamId).map(p => (
                          <div key={p.id} className="p-3 rounded-2xl bg-white/5 border border-white/5 flex items-center gap-3">
                            <div className="flex-1">
                              <div className="text-sm font-bold">{p.name}</div>
                              <div className="text-[10px] text-white/40 uppercase font-bold">Level {p.level}</div>
                            </div>
                            {teams.find(t => t.id === currentPlayer.teamId)?.leaderId === p.id && (
                              <Crown className="w-4 h-4 text-yellow-400" />
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="flex-1 flex flex-col gap-6">
                      <div className="space-y-3">
                        <div className="text-[10px] text-white/50 uppercase font-bold">Create a Team</div>
                        <div className="flex gap-2">
                          <input 
                            type="text" 
                            value={teamNameInput}
                            onChange={(e) => setTeamNameInput(e.target.value)}
                            placeholder="Team Name"
                            className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-indigo-500"
                          />
                          <button 
                            onClick={() => {
                              if (teamNameInput.trim()) {
                                createTeam(teamNameInput);
                                setTeamNameInput('');
                              }
                            }}
                            className="p-2 bg-indigo-500 rounded-xl"
                          >
                            <Plus className="w-5 h-5" />
                          </button>
                        </div>
                      </div>
                      <div className="flex-1 flex flex-col">
                        <div className="text-[10px] text-white/50 uppercase font-bold mb-3">Available Teams</div>
                        <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                          {teams.map(t => (
                            <div key={t.id} className="p-3 rounded-2xl bg-white/5 border border-white/5 flex items-center justify-between">
                              <div>
                                <div className="text-sm font-bold">{t.name}</div>
                                <div className="text-[10px] text-white/40 uppercase font-bold">{t.memberIds.length} Members</div>
                              </div>
                              <button 
                                onClick={() => joinTeam(t.id)}
                                className="p-2 bg-white/10 rounded-xl hover:bg-white/20"
                              >
                                <ChevronRight className="w-4 h-4" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}

        {showChat && (
          <motion.div 
            initial={{ x: 400 }}
            animate={{ x: 0 }}
            exit={{ x: 400 }}
            className="absolute top-20 right-4 bottom-20 w-80 bg-black/60 backdrop-blur-xl border border-white/10 rounded-3xl p-6 z-50 flex flex-col"
          >
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-emerald-400" />
                Chat
              </h2>
              <button onClick={() => setShowChat(false)}><X className="w-5 h-5 text-white/30" /></button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-3 pr-2 custom-scrollbar mb-4">
              {chatMessages.map((m, i) => (
                <div key={i} className="flex flex-col">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-white/40">{m.playerName}</span>
                    {m.teamId && <span className="text-[8px] px-1 bg-indigo-500/20 text-indigo-400 rounded uppercase font-bold">Team</span>}
                  </div>
                  <div className="text-sm">{m.message}</div>
                </div>
              ))}
            </div>
            <form onSubmit={handleSendChat} className="flex gap-2">
              <input 
                type="text" 
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Type a message..."
                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-emerald-500"
              />
              <button type="submit" className="p-2 bg-emerald-500 rounded-xl">
                <ChevronRight className="w-5 h-5" />
              </button>
            </form>
          </motion.div>
        )}

        {showAdmin && (
          <motion.div 
            initial={{ x: 400 }}
            animate={{ x: 0 }}
            exit={{ x: 400 }}
            className="absolute top-20 right-4 bottom-20 w-80 bg-black/60 backdrop-blur-xl border border-white/10 rounded-3xl p-6 z-50 flex flex-col"
          >
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Settings className="w-5 h-5 text-white/50" />
                Admin Panel
                <InfoTooltip text="Global game settings. Changes here affect all players in real-time." position="bottom" />
              </h2>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setPanelsCollapsed(prev => ({ ...prev, admin: !prev.admin }))}
                  className="p-1 hover:bg-white/10 rounded-lg transition-colors"
                >
                  {panelsCollapsed.admin ? <ChevronDown className="w-5 h-5" /> : <ChevronUp className="w-5 h-5" />}
                </button>
                <button onClick={() => setShowAdmin(false)}><X className="w-5 h-5 text-white/30" /></button>
              </div>
            </div>
            <AnimatePresence>
              {!panelsCollapsed.admin && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: '100%', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="flex-1 flex flex-col min-h-0 overflow-hidden"
                >
                  <div className="flex-1 overflow-y-auto space-y-6 pr-2 custom-scrollbar">
                    <div className="p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-2xl flex items-start gap-3">
                      <ShieldAlert className="w-5 h-5 text-yellow-400 shrink-0" />
                      <div className="text-xs text-yellow-200/80">Admin changes apply live to all players. Use with caution.</div>
                    </div>

                    <div className="space-y-4">
                      <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-2xl flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${config?.isPaused ? 'bg-red-500 animate-pulse' : 'bg-emerald-500'}`} />
                          <span className="text-[10px] uppercase font-black tracking-widest">Pause Voxzilla</span>
                          <InfoTooltip text="Stops all gameplay, income, and movement for all players." position="bottom" />
                        </div>
                        <button
                          onClick={() => sendMessage({ type: 'ADMIN_UPDATE_CONFIG', config: { isPaused: !config?.isPaused } })}
                          className={`w-12 h-6 rounded-full transition-all relative ${config?.isPaused ? 'bg-red-500' : 'bg-white/10'}`}
                        >
                          <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${config?.isPaused ? 'left-7' : 'left-1'}`} />
                        </button>
                      </div>

                      {[
                        { label: 'Income Amount', key: 'baseIncome', min: 1, max: 100, info: 'Base amount of VB earned per interval. Higher values accelerate player progression and building speed.' },
                        { label: 'Income Interval (ms)', key: 'incomeInterval', min: 1000, max: 60000, step: 1000, info: 'Time between income ticks. Shorter intervals mean faster income but can increase server load.' },
                        { label: 'Base Voxel Cost', key: 'baseVoxelCost', min: 1, max: 100, info: 'Cost to place a voxel at ground level. This is the foundation for all building costs.' },
                        { label: 'Height Multiplier', key: 'heightMultiplier', min: 0.01, max: 0.5, step: 0.01, info: 'Increases cost as you build higher (Cost = Base + Height * Multiplier). Discourages sky-high towers.' },
                        { label: 'Attack Damage', key: 'attackDamage', min: 10, max: 120, info: 'Damage dealt per attack click. Higher damage makes raiding easier.' },
                        { label: 'Attack Cost', key: 'attackCost', min: 1, max: 50, info: 'VB spent per attack click in enemy territory. Higher costs make raiding more expensive.' },
                        { label: 'Fortify Bonus', key: 'fortificationHpBonus', min: 10, max: 200, info: 'HP added per fortification tier. More HP makes structures harder to destroy but costs more to maintain.' },
                        { label: 'Destroy Refund', key: 'destroyRefund', min: 0, max: 50, info: 'VB returned when manually destroying your own voxel. Encourages redesigning.' },
                        { label: 'Loot %', key: 'lootPercentage', min: 0, max: 1, step: 0.05, info: 'Percentage of invested value dropped as loot when destroyed. Incentivizes raiding.' },
                        { label: 'Build Buffer', key: 'buildBuffer', min: 0, max: 10, info: 'Minimum distance from enemy structures required to build. Prevents "griefing" or building directly on top of others.' },
                        { label: 'Repair Cost %', key: 'repairCostPercentage', min: 0, max: 1, step: 0.1, info: 'Cost to repair full HP as a percentage of invested value. Higher costs make maintenance harder.' },
                        { label: 'Max Height', key: 'maxHeight', min: 10, max: 128, info: 'Maximum height limit for building. Prevents players from building out of bounds.' },
                        { label: 'World Size', key: 'worldSize', min: 50, max: 512, info: 'Size of the playable grid. Larger worlds allow more space but can feel empty.' },
                        { label: 'Storage Base', key: 'storageCapBase', min: 100, max: 2000, step: 100, info: 'Base VB storage limit. Players cannot hold more VB than their current storage capacity.' },
                        { label: 'Storage / Lvl', key: 'storageCapPerLevel', min: 0, max: 100, info: 'Storage capacity increase per level. Rewards active play and progression.' },
                      ].map((item) => (
                        <div key={item.key} className="space-y-2">
                          <div className="flex justify-between text-[10px] uppercase font-bold text-white/50">
                            <span className="flex items-center">
                              {item.label}
                              <InfoTooltip text={item.info} position="bottom" />
                            </span>
                            <span>{(config as any)[item.key]}</span>
                          </div>
                          <input 
                            type="range" 
                            min={item.min} 
                            max={item.max} 
                            step={(item as any).step || 1}
                            value={(config as any)[item.key]} 
                            onChange={(e) => {
                              const val = parseFloat(e.target.value);
                              sendMessage({ type: 'ADMIN_UPDATE_CONFIG', config: { [item.key]: val } });
                            }}
                            className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-indigo-500" 
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Net Worth Display */}
      <div className="absolute bottom-4 left-4 z-10">
        <div className="bg-black/40 backdrop-blur-md border border-white/10 px-4 py-2 rounded-full flex items-center gap-3">
          <div className="text-[10px] text-white/50 uppercase tracking-wider font-bold flex items-center">
            Net Worth
            <InfoTooltip text="Your total wealth, including liquid bucks and the value of your structures. Net Worth = Liquid VB + Sum of (Voxel Base Cost + Fortification Investments). Higher Net Worth increases your rank on the leaderboard." position="top" />
          </div>
          <div className="text-lg font-mono font-bold text-emerald-400">{netWorth}</div>
        </div>
      </div>

      {/* Instructions */}
      <div className="absolute bottom-4 right-4 z-10 pointer-events-none flex flex-col gap-2 items-end">
        <div className="bg-black/40 backdrop-blur-md border border-white/10 px-4 py-2 rounded-2xl text-[10px] text-white/40 uppercase font-bold flex flex-col gap-1">
          <div className="flex justify-between gap-8"><span>WASD</span> <span>Move</span></div>
          <div className="flex justify-between gap-8"><span>SPACE/SHIFT</span> <span>Fly</span></div>
          <div className="flex justify-between gap-8"><span>LEFT CLICK</span> <span>Place Voxel</span></div>
          <div className="flex justify-between gap-8"><span>RIGHT CLICK</span> <span>Attack / Fortify</span></div>
        </div>
        <div className="bg-emerald-500/20 border border-emerald-500/30 px-3 py-1 rounded-full text-[8px] text-emerald-400 uppercase font-bold flex items-center gap-2">
          <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
          Server Connected
        </div>
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.2);
        }
      `}</style>
      {/* Tooltip Portal */}
      <AnimatePresence>
        {activeTooltip && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 10 }}
            className="fixed z-[1000] w-56 p-3 bg-black/95 backdrop-blur-2xl border border-white/20 rounded-2xl text-[10px] text-white/90 shadow-[0_20px_50px_rgba(0,0,0,0.5)] pointer-events-none"
            style={{ 
              left: Math.min(Math.max(activeTooltip.x, 120), window.innerWidth - 120), 
              top: activeTooltip.y < 150 ? activeTooltip.y + 20 : activeTooltip.y - 20, 
              transform: activeTooltip.y < 150 ? 'translate(-50%, 0)' : 'translate(-50%, -100%)' 
            }}
          >
            {activeTooltip.text}
            <div className={`absolute left-1/2 -translate-x-1/2 border-8 border-transparent ${activeTooltip.y < 150 ? 'bottom-full border-b-black/95' : 'top-full border-t-black/95'}`} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
