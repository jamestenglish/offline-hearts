import { useCallback, useEffect, useState } from 'react';
import { ConfirmDialog } from './components/ConfirmDialog';
import { ROUNDS, type SeatPlayer } from './engine/game';
import { buildRecord } from './engine/history';
import { newId, randomSeed } from './random';
import { DealScreen } from './screens/DealScreen';
import { GameOverScreen } from './screens/GameOverScreen';
import { LeadScreen } from './screens/LeadScreen';
import { PassScreen } from './screens/PassScreen';
import { PlayersScreen } from './screens/PlayersScreen';
import { PlayScreen } from './screens/PlayScreen';
import { RoundSummaryScreen } from './screens/RoundSummaryScreen';
import { SetupScreen } from './screens/SetupScreen';
import { StatsScreen } from './screens/StatsScreen';
import { TrickResultScreen } from './screens/TrickResultScreen';
import { useGame } from './state/useGame';
import { useHistory } from './state/useHistory';
import { useRoster } from './state/useRoster';

type View = 'game' | 'players' | 'stats';

export function App() {
  const { state, dispatch, resumable } = useGame();
  const roster = useRoster();
  const history = useHistory();
  const { append } = history;
  const [view, setView] = useState<View>('game');
  const [askResume, setAskResume] = useState(resumable);
  const [confirmQuit, setConfirmQuit] = useState(false);

  useEffect(() => {
    if (state.phase === 'gameOver') append(buildRecord(state, Date.now()));
  }, [state, append]);

  const onDealDone = useCallback(() => dispatch({ type: 'DEAL_DONE' }), [dispatch]);

  const startGame = (players: SeatPlayer[]) =>
    dispatch({ type: 'START_GAME', players, gameId: newId(), seed: randomSeed() });

  if (view === 'players') {
    return (
      <PlayersScreen
        roster={roster.players}
        onAdd={roster.add}
        onRename={roster.rename}
        onArchive={roster.archive}
        onBack={() => setView('game')}
      />
    );
  }

  if (view === 'stats') {
    return (
      <StatsScreen
        records={history.records}
        roster={roster.players}
        onClear={history.clear}
        onBack={() => setView('game')}
      />
    );
  }

  if (askResume) {
    return (
      <div className="screen">
        <h1 className="title">♥ Offline Hearts ♠</h1>
        <p className="message">You have a game in progress.</p>
        <button type="button" className="btn" onClick={() => setAskResume(false)}>
          Resume
        </button>
        <button
          type="button"
          className="btn secondary"
          onClick={() => {
            dispatch({ type: 'NEW_GAME' });
            setAskResume(false);
          }}
        >
          New Game
        </button>
      </div>
    );
  }

  const inGame = state.phase !== 'setup' && state.phase !== 'gameOver';

  const renderPhase = () => {
    switch (state.phase) {
      case 'setup':
        return (
          <SetupScreen
            roster={roster.players}
            onAddPlayer={roster.add}
            onStart={startGame}
            onOpenPlayers={() => setView('players')}
            onOpenStats={() => setView('stats')}
          />
        );
      case 'dealing':
        return <DealScreen key={`${state.gameId}-${state.round}`} players={state.players} onDone={onDealDone} />;
      case 'passing':
        return <PassScreen state={state} dispatch={dispatch} />;
      case 'leadAnnounce':
        return <LeadScreen state={state} dispatch={dispatch} />;
      case 'playing':
        return <PlayScreen state={state} dispatch={dispatch} />;
      case 'trickResult':
        return <TrickResultScreen state={state} dispatch={dispatch} />;
      case 'roundSummary':
        return <RoundSummaryScreen state={state} dispatch={dispatch} />;
      case 'gameOver':
        return (
          <GameOverScreen
            state={state}
            onPlayAgain={() => dispatch({ type: 'PLAY_AGAIN', gameId: newId(), seed: randomSeed() })}
            onNewPlayers={() => dispatch({ type: 'NEW_GAME' })}
            onOpenStats={() => setView('stats')}
          />
        );
    }
  };

  return (
    <>
      {inGame && (
        <header className="header">
          <span>Round {state.round + 1}/{ROUNDS}</span>
          <button type="button" className="btn small secondary" onClick={() => setConfirmQuit(true)}>
            New Game
          </button>
        </header>
      )}
      {renderPhase()}
      {confirmQuit && (
        <ConfirmDialog
          message="Abandon this game? It won't be recorded."
          confirmLabel="Abandon"
          onConfirm={() => {
            dispatch({ type: 'NEW_GAME' });
            setConfirmQuit(false);
          }}
          onCancel={() => setConfirmQuit(false)}
        />
      )}
    </>
  );
}
