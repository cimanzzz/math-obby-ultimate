/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { GameCanvas } from './game3d/GameCanvas';
import { HUD } from './components/HUD';
import { MainMenu } from './components/MainMenu';
import { PauseMenu } from './components/PauseMenu';
import { VictoryScreen } from './components/VictoryScreen';
import { GuideModal } from './components/GuideModal';
import { MobileControls } from './components/MobileControls';
import { generateSessionQuestions, SP_DETAILS } from './data/questions';
import { GameScreen, Question, QuestionFeedback, GameStats } from './types/game';
import { soundManager } from './audio/soundManager';

// Exact starting checkpoint coordinates for each SP matching 3D world spawn circles
const SP_START_COORDINATES: Record<'SP 4.4.1' | 'SP 4.4.2' | 'SP 4.4.3' | 'SP 4.4.4', THREE.Vector3> = {
  'SP 4.4.1': new THREE.Vector3(0, 1.2, 6),   // SP 1 Start Runway
  'SP 4.4.2': new THREE.Vector3(0, 1.2, 210), // SP 2 Starting Island
  'SP 4.4.3': new THREE.Vector3(0, 1.2, 386), // SP 3 Starting Island
  'SP 4.4.4': new THREE.Vector3(0, 1.2, 562)  // SP 4 Starting Island
};

export default function App() {
  const [screen, setScreen] = useState<GameScreen>('MENU');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentQIndex, setCurrentQIndex] = useState<number>(0);
  const [score, setScore] = useState<number>(0);
  const [raceTime, setRaceTime] = useState<number>(0);
  const [questionTimer, setQuestionTimer] = useState<number>(25.0);
  const [correctCount, setCorrectCount] = useState<number>(0);
  const [wrongCount, setWrongCount] = useState<number>(0);
  const [timeoutCount, setTimeoutCount] = useState<number>(0);
  const [feedback, setFeedback] = useState<QuestionFeedback | null>(null);
  const [isMuted, setIsMuted] = useState<boolean>(soundManager.getMuted());
  const [guideOpen, setGuideOpen] = useState<boolean>(false);
  const [raceStarted, setRaceStarted] = useState<boolean>(true);
  const [waitingForSpIsland, setWaitingForSpIsland] = useState<string | null>(null);
  const [isShocking, setIsShocking] = useState<boolean>(false);
  const [isBoostActive, setIsBoostActive] = useState<boolean>(false);
  const [isJumpActive, setIsJumpActive] = useState<boolean>(false);
  const [teleportTarget, setTeleportTarget] = useState<THREE.Vector3 | null>(null);
  const [touchInput, setTouchInput] = useState<{ x: number; y: number; jump: boolean; boost: boolean }>({
    x: 0,
    y: 0,
    jump: false,
    boost: false
  });

  // Best scores from localStorage
  const [bestScore, setBestScore] = useState<number>(() => {
    try {
      return parseInt(localStorage.getItem('math_obby_best_score') || '0', 10);
    } catch {
      return 0;
    }
  });

  const [bestTime, setBestTime] = useState<number>(() => {
    try {
      return parseInt(localStorage.getItem('math_obby_best_time') || '0', 10);
    } catch {
      return 0;
    }
  });

  const lastWarnSecRef = useRef<number>(-1);
  const attemptedQuestionsRef = useRef<Set<number>>(new Set());
  const awardedQuestionsRef = useRef<Set<number>>(new Set());

  // Initialize new session (Player spawns on hub behind PINTU MULA, walks to Pusingan 1)
  const startNewGame = useCallback(() => {
    const sessionQuestions = generateSessionQuestions();
    setQuestions(sessionQuestions);
    setCurrentQIndex(0);
    setScore(0);
    setRaceTime(0);
    setQuestionTimer(25.0);
    setCorrectCount(0);
    setWrongCount(0);
    setTimeoutCount(0);
    setFeedback(null);
    setWaitingForSpIsland(null);
    setRaceStarted(false); // Player must walk through PINTU MULA to start!
    setIsShocking(false);
    setIsBoostActive(false);
    setIsJumpActive(false);
    attemptedQuestionsRef.current.clear();
    awardedQuestionsRef.current.clear();
    setScreen('PLAYING');

    // Teleport to starting hub behind PINTU MULA (Z = -12)
    setTeleportTarget(new THREE.Vector3(0, 1.2, -12));
    setTimeout(() => setTeleportTarget(null), 150);

    soundManager.playClick();
    soundManager.startBgm();
  }, []);

  // Called when player walks through PINTU MULA archway into Pusingan 1
  const handleStartGatePassed = useCallback(() => {
    setRaceStarted(true);
    setQuestionTimer(25.0);
    soundManager.playCheckpoint();
  }, []);

  // Called when player steps onto the starting island of next SP
  const handleSpIslandReached = useCallback((spCode: string) => {
    setWaitingForSpIsland(currentWaiting => {
      if (!currentWaiting) return null;
      const spCodeMap: Record<string, string> = {
        'SP 4.4.1': 'Pusingan 1',
        'SP 4.4.2': 'Pusingan 2',
        'SP 4.4.3': 'Pusingan 3',
        'SP 4.4.4': 'Pusingan 4'
      };
      const expectedPusingan = spCodeMap[spCode] || spCode;
      const isMatch =
        currentWaiting === expectedPusingan ||
        currentWaiting === spCode ||
        (currentWaiting.includes('2') && (spCode.includes('4.4.2') || spCode.includes('2'))) ||
        (currentWaiting.includes('3') && (spCode.includes('4.4.3') || spCode.includes('3'))) ||
        (currentWaiting.includes('4') && (spCode.includes('4.4.4') || spCode.includes('4')));

      if (isMatch) {
        soundManager.playCheckpoint();
        setQuestionTimer(25.0);
        return null; // Unlocks next question!
      }
      return currentWaiting;
    });
  }, []);

  const handleToggleMute = useCallback(() => {
    const muted = soundManager.toggleMute();
    setIsMuted(muted);
  }, []);

  // Question 25-second countdown & Race timer
  useEffect(() => {
    if (screen !== 'PLAYING') return;

    const interval = setInterval(() => {
      if (raceStarted) {
        setRaceTime(prev => prev + 1);
      }

      setQuestionTimer(prev => {
        // Countdown only runs when race is started, no feedback showing, not waiting for SP island, and within questions
        if (!raceStarted || waitingForSpIsland !== null || feedback !== null || currentQIndex >= 16) {
          return prev;
        }

        const next = Math.max(0, prev - 1);

        if (next <= 6 && next > 0 && Math.floor(next) !== lastWarnSecRef.current) {
          lastWarnSecRef.current = Math.floor(next);
          soundManager.playWarning();
        }

        // Question Timeout
        if (next <= 0) {
          const activeQ = questions[currentQIndex];
          if (activeQ) {
            soundManager.playWrong();
            setScore(s => Math.max(0, s - 10));
            setTimeoutCount(c => c + 1);

            const feedbackData: QuestionFeedback = {
              type: 'TIMEOUT',
              question: activeQ,
              pointsChange: -10,
              message: 'Masa 25 saat telah tamat (-10 Mata). Soalan diteruskan tanpa mengulang SP.',
              timestamp: Date.now()
            };
            setFeedback(feedbackData);

            setTimeout(() => {
              setFeedback(null);
              setCurrentQIndex(q => Math.min(q + 1, 16));
              setQuestionTimer(25.0);
              lastWarnSecRef.current = -1;
            }, 2500);
          }
        }

        return next;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [screen, raceStarted, waitingForSpIsland, feedback, currentQIndex, questions]);

  // Handle 3D Answer selection (Gate / Floor / Switch)
  const handleAnswerSelected = useCallback((optionIndex: number) => {
    if (feedback !== null || currentQIndex >= 16 || screen !== 'PLAYING' || !raceStarted) return;

    const activeQ = questions[currentQIndex];
    if (!activeQ) return;

    const isCorrect = optionIndex === activeQ.correctIndex;

    const isFirstTimeAttempt = !attemptedQuestionsRef.current.has(currentQIndex);
    // Mark as attempted in this session immediately
    attemptedQuestionsRef.current.add(currentQIndex);

    if (isCorrect) {
      // Points can ONLY be added if this is the FIRST attempt at this question in this session!
      // If the player answered wrongly earlier and is retrying, or answering again, points are NOT added.
      const canAwardPoints = isFirstTimeAttempt && !awardedQuestionsRef.current.has(currentQIndex);
      const pointsChange = canAwardPoints ? 100 : 0;

      soundManager.playCorrect();
      if (canAwardPoints) {
        awardedQuestionsRef.current.add(currentQIndex);
        setScore(s => s + pointsChange);
        setCorrectCount(c => c + 1);
      }

      const isEndOfP1 = currentQIndex === 3;
      const isEndOfP2 = currentQIndex === 7;
      const isEndOfP3 = currentQIndex === 11;

      const nextSpWaiting = isEndOfP1
        ? 'Pusingan 2'
        : isEndOfP2
        ? 'Pusingan 3'
        : isEndOfP3
        ? 'Pusingan 4'
        : null;

      const pusinganNum = currentQIndex < 4 ? 1 : currentQIndex < 8 ? 2 : currentQIndex < 12 ? 3 : 4;

      const feedbackData: QuestionFeedback = {
        type: 'CORRECT',
        question: activeQ,
        selectedOption: ['A', 'B', 'C'][optionIndex],
        pointsChange: pointsChange,
        message: canAwardPoints
          ? (nextSpWaiting
              ? `🎉 Tahniah! Selesai Pusingan ${pusinganNum}! Teruskan melintasi jambatan ke Platform Permulaan ${nextSpWaiting} di hadapan!`
              : 'Tahniah! Jawapan tepat (+100 Mata). Teruskan melompat/berjalan ke hadapan!')
          : (nextSpWaiting
              ? `🎉 Selesai Pusingan ${pusinganNum}! (Ulangan soalan: tiada mata tambahan). Teruskan ke Platform Permulaan ${nextSpWaiting} di hadapan!`
              : 'Jawapan tepat! (Ulangan soalan: tiada mata tambahan diberikan). Teruskan mara ke hadapan!'),
        timestamp: Date.now()
      };
      setFeedback(feedbackData);

      // Pemain tidak diteleport, boleh terus melintas
      setTimeout(() => {
        setFeedback(null);
        setCurrentQIndex(q => Math.min(q + 1, 16));
        setQuestionTimer(25.0);
        lastWarnSecRef.current = -1;
        if (nextSpWaiting) {
          setWaitingForSpIsland(nextSpWaiting);
        }
      }, 1500);
    } else {
      // JAWAPAN SALAH: Terkena renjatan elektrik sebagai hukuman!
      setIsShocking(true);
      soundManager.playShock();
      setScore(s => Math.max(0, s - 10));
      setWrongCount(w => w + 1);

      const pusinganNum = currentQIndex < 4 ? 1 : currentQIndex < 8 ? 2 : currentQIndex < 12 ? 3 : 4;
      const spStart = SP_DETAILS[activeQ.spCode].startQuestionIndex;
      const respawnPoint = SP_START_COORDINATES[activeQ.spCode];

      const isFallingTile = activeQ.spCode === 'SP 4.4.4';
      const feedbackData: QuestionFeedback = {
        type: 'WRONG',
        question: activeQ,
        selectedOption: ['A', 'B', 'C'][optionIndex],
        pointsChange: -10,
        message: isFallingTile
          ? `Lantai runtuh! (-10 Mata). Dihantar semula ke Starting Point Pusingan ${pusinganNum} (Soalan ${spStart + 1}).`
          : `⚡ Kena Renjatan Elektrik! (-10 Mata). Dihantar semula ke Starting Point Pusingan ${pusinganNum} (Soalan ${spStart + 1}).`,
        timestamp: Date.now()
      };
      setFeedback(feedbackData);

      // Teleport pemain terus ke Starting Point bagi Pusingan tersebut
      setTimeout(() => {
        setIsShocking(false);
        setTeleportTarget(new THREE.Vector3(respawnPoint.x, respawnPoint.y, respawnPoint.z));
        setTimeout(() => setTeleportTarget(null), 150);
      }, 1000);

      setTimeout(() => {
        setFeedback(null);
        setWaitingForSpIsland(null); // Back on the current Pusingan's starting island
        setCurrentQIndex(spStart);
        setQuestionTimer(25.0);
        lastWarnSecRef.current = -1;
      }, 2300);
    }
  }, [currentQIndex, feedback, questions, screen, raceStarted]);

  // Physical Fall (Respawn at current Pusingan Starting Point and restart from the first question of that Pusingan)
  const handleFallRespawn = useCallback(() => {
    let spStartIdx = 0;
    let spCoord = SP_START_COORDINATES['SP 4.4.1'];
    let spTitle = 'Pusingan 1 (Soalan 1)';

    if (currentQIndex >= 12) {
      spStartIdx = 12; // Soalan 13
      spCoord = SP_START_COORDINATES['SP 4.4.4'];
      spTitle = 'Pusingan 4 (Soalan 13)';
    } else if (currentQIndex >= 8) {
      spStartIdx = 8; // Soalan 9
      spCoord = SP_START_COORDINATES['SP 4.4.3'];
      spTitle = 'Pusingan 3 (Soalan 9)';
    } else if (currentQIndex >= 4) {
      spStartIdx = 4; // Soalan 5
      spCoord = SP_START_COORDINATES['SP 4.4.2'];
      spTitle = 'Pusingan 2 (Soalan 5)';
    }

    setCurrentQIndex(spStartIdx);
    setQuestionTimer(25.0);
    setWaitingForSpIsland(null);
    lastWarnSecRef.current = -1;

    const activeQ = questions[spStartIdx];
    if (activeQ) {
      setFeedback({
        type: 'WRONG',
        question: activeQ,
        pointsChange: 0,
        message: `Terjatuh! Dihantar semula ke titik permulaan ${spTitle}.`,
        timestamp: Date.now()
      });
      setTimeout(() => setFeedback(null), 1800);
    }

    setTeleportTarget(new THREE.Vector3(spCoord.x, spCoord.y, spCoord.z));
    setTimeout(() => setTeleportTarget(null), 150);
  }, [currentQIndex, questions]);

  // Finish Line Reached
  const handleFinishReached = useCallback(() => {
    if (screen !== 'PLAYING') return;

    soundManager.playVictory();
    setScreen('VICTORY');

    setScore(currentScore => {
      setBestScore(prevBest => {
        const newBest = Math.max(prevBest, currentScore);
        try {
          localStorage.setItem('math_obby_best_score', newBest.toString());
        } catch {
          // ignore
        }
        return newBest;
      });
      return currentScore;
    });

    setRaceTime(currentTime => {
      setBestTime(prevBestTime => {
        const newBestTime = prevBestTime === 0 ? currentTime : Math.min(prevBestTime, currentTime);
        try {
          localStorage.setItem('math_obby_best_time', newBestTime.toString());
        } catch {
          // ignore
        }
        return newBestTime;
      });
      return currentTime;
    });
  }, [screen]);

  // Keyboard shortcut for Pause (Escape)
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') {
        if (screen === 'PLAYING') {
          setScreen('PAUSED');
        } else if (screen === 'PAUSED') {
          setScreen('PLAYING');
        }
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [screen]);

  const stats: GameStats = {
    score,
    totalTime: raceTime,
    correctCount,
    wrongCount,
    timeoutCount,
    bestScore,
    bestTime
  };

  const currentQ = questions[currentQIndex];

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-slate-950 font-sans select-none">
      {/* 3D VIEWPORT */}
      <GameCanvas
        questions={questions}
        currentQuestionIndex={currentQIndex}
        isPaused={screen !== 'PLAYING'}
        raceStarted={raceStarted}
        teleportTarget={teleportTarget}
        isShocking={isShocking}
        externalBoost={isBoostActive}
        externalJump={isJumpActive}
        onStartGatePassed={handleStartGatePassed}
        onSpIslandReached={handleSpIslandReached}
        onAnswerSelected={handleAnswerSelected}
        onFinishReached={handleFinishReached}
        onFallRespawn={handleFallRespawn}
        touchInput={touchInput}
      />

      {/* COMPACT HUD OVERLAY & ACTION DOCK */}
      {screen === 'PLAYING' && (
        <>
          <HUD
            currentQuestion={currentQ}
            questionIndex={currentQIndex}
            totalQuestions={questions.length || 16}
            score={score}
            raceTime={raceTime}
            timeLeft={questionTimer}
            feedback={feedback}
            isMuted={isMuted}
            raceStarted={raceStarted}
            waitingForSpIsland={waitingForSpIsland}
            isBoostActive={isBoostActive}
            onBoostDown={() => setIsBoostActive(true)}
            onBoostUp={() => setIsBoostActive(false)}
            onJumpDown={() => {
              setIsJumpActive(true);
              setTimeout(() => setIsJumpActive(false), 120);
            }}
            onJumpUp={() => setIsJumpActive(false)}
            onToggleMute={handleToggleMute}
            onPause={() => setScreen('PAUSED')}
          />
          <MobileControls onUpdateInput={setTouchInput} />
        </>
      )}

      {/* MAIN MENU */}
      {screen === 'MENU' && (
        <MainMenu
          onStart={startNewGame}
          onOpenGuide={() => setGuideOpen(true)}
          bestScore={bestScore}
          bestTime={bestTime}
        />
      )}

      {/* PAUSE MENU */}
      {screen === 'PAUSED' && (
        <PauseMenu
          onResume={() => setScreen('PLAYING')}
          onRestart={startNewGame}
          onMainMenu={() => setScreen('MENU')}
          isMuted={isMuted}
          onToggleMute={handleToggleMute}
        />
      )}

      {/* VICTORY RESULTS */}
      {screen === 'VICTORY' && (
        <VictoryScreen
          stats={stats}
          onPlayAgain={startNewGame}
          onMainMenu={() => setScreen('MENU')}
        />
      )}

      {/* DSKP CURRICULUM GUIDE MODAL */}
      {guideOpen && <GuideModal onClose={() => setGuideOpen(false)} />}
    </div>
  );
}
