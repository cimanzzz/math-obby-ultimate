import React from 'react';
import { Trophy, CheckCircle, XCircle, Clock, RotateCcw, Home, Award } from 'lucide-react';
import { GameStats } from '../types/game';

interface VictoryScreenProps {
  stats: GameStats;
  onPlayAgain: () => void;
  onMainMenu: () => void;
}

export const VictoryScreen: React.FC<VictoryScreenProps> = ({
  stats,
  onPlayAgain,
  onMainMenu
}) => {
  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainingSecs = Math.floor(secs % 60);
    return `${mins.toString().padStart(2, '0')}:${remainingSecs.toString().padStart(2, '0')}`;
  };

  const isNewHighScore = stats.score >= stats.bestScore && stats.score > 0;

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center p-4 bg-slate-950/85">
      <div className="max-w-lg w-full bg-slate-900 border-2 border-amber-500/50 rounded-3xl p-6 md:p-8 text-center shadow-2xl relative overflow-hidden">
        {/* Glow */}
        <div className="absolute -top-20 -left-20 w-44 h-44 bg-amber-500/20 rounded-full blur-3xl pointer-events-none" />

        {/* Victory Icon */}
        <div className="w-16 h-16 mx-auto mb-3 rounded-2xl bg-amber-500/20 border-2 border-amber-400 flex items-center justify-center shadow-lg">
          <Trophy className="w-8 h-8 text-amber-300" />
        </div>

        <h1 className="text-2xl md:text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-yellow-200 to-amber-400 mb-1">
          Tahniah! Tamat Obby
        </h1>
        <p className="text-xs md:text-sm text-slate-300 mb-5">
          Anda telah berjaya menyelesaikan kesemua 4 Pusingan cabaran Matematik Tingkatan 1 (SP 4.4.1 hingga 4.4.4)!
        </p>

        {isNewHighScore && (
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/20 border border-amber-400/40 text-amber-300 text-xs font-bold mb-4">
            <Award className="w-4 h-4" />
            <span>REKOD TERBAIK BAHARU!</span>
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-2.5 mb-5 text-left">
          {/* Final Score */}
          <div className="bg-slate-800/90 border border-slate-700 rounded-xl p-3">
            <div className="text-[11px] font-bold text-slate-400 uppercase">Markah Akhir</div>
            <div className="font-mono-num font-black text-2xl text-amber-300">
              {stats.score} <span className="text-xs text-amber-400/70 font-normal">Mata</span>
            </div>
          </div>

          {/* Total Time */}
          <div className="bg-slate-800/90 border border-slate-700 rounded-xl p-3">
            <div className="text-[11px] font-bold text-slate-400 uppercase">Masa Perlumbaan</div>
            <div className="font-mono-num font-black text-2xl text-sky-300 flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-sky-400" />
              <span>{formatTime(stats.totalTime)}</span>
            </div>
          </div>

          {/* Correct Answers */}
          <div className="bg-slate-800/90 border border-emerald-500/30 rounded-xl p-3">
            <div className="text-[11px] font-bold text-slate-400 uppercase">Jawapan Betul</div>
            <div className="font-mono-num font-black text-xl text-emerald-400 flex items-center gap-1.5">
              <CheckCircle className="w-4 h-4 text-emerald-400" />
              <span>{stats.correctCount}</span>
            </div>
          </div>

          {/* Wrong & Timeout */}
          <div className="bg-slate-800/90 border border-rose-500/30 rounded-xl p-3">
            <div className="text-[11px] font-bold text-slate-400 uppercase">Salah / Tamat Masa</div>
            <div className="font-mono-num font-black text-xl text-rose-400 flex items-center gap-1.5">
              <XCircle className="w-4 h-4 text-rose-400" />
              <span>{stats.wrongCount} <span className="text-xs text-slate-400 font-normal">salah</span> · {stats.timeoutCount} <span className="text-xs text-slate-400 font-normal">masa</span></span>
            </div>
          </div>
        </div>

        {/* Best Records info */}
        <div className="bg-slate-950/60 rounded-xl p-2.5 border border-slate-800 text-xs text-slate-400 flex justify-between items-center mb-6">
          <span>Rekod Tertinggi: <strong className="text-amber-300 font-mono-num">{stats.bestScore} Mata</strong></span>
          <span>Masa Terpantas: <strong className="text-sky-300 font-mono-num">{formatTime(stats.bestTime)}</strong></span>
        </div>

        {/* Buttons */}
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={onPlayAgain}
            className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-bold text-sm shadow-lg shadow-emerald-500/20 transition-all hover:scale-102 active:scale-98"
          >
            <RotateCcw className="w-4 h-4" />
            <span>MAIN SEMULA</span>
          </button>
          <button
            onClick={onMainMenu}
            className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-semibold text-sm transition-all"
          >
            <Home className="w-4 h-4" />
            <span>MENU UTAMA</span>
          </button>
        </div>
      </div>
    </div>
  );
};
