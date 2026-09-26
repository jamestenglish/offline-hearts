export interface BetSeat {
  stack: number;
  streetBet: number;
  committed: number;
  folded: boolean;
  allIn: boolean;
  actedSinceFullRaise: boolean;
  raiseLocked: boolean;
}

export interface BettingState {
  seats: BetSeat[];
  currentBet: number;
  lastFullRaise: number;
  pending: number[];
  current: number | null;
  bigBlind: number;
}

export type BetAction = { type: 'CHECK' | 'CALL' | 'FOLD' | 'ALL_IN' | 'BET_TO'; total?: number };

export interface LegalBetActions {
  check: boolean;
  call: number | null;
  fold: boolean;
  allIn: boolean;
  minTotal: number | null;
  maxTotal: number;
}

function eligible(seat: BetSeat): boolean {
  return !seat.folded && !seat.allIn && seat.stack > 0;
}

function canContest(state: BettingState): boolean {
  return state.seats.filter(seat => !seat.folded).length > 1;
}

function canRaiseAgainst(state: BettingState, actor: number): boolean {
  return state.seats.some((seat, index) => index !== actor && eligible(seat));
}

function clockwise(state: BettingState, from: number, indices: number[]): number[] {
  return indices.sort((a, b) =>
    (a - from + state.seats.length) % state.seats.length -
    (b - from + state.seats.length) % state.seats.length);
}

export function legalActions(state: BettingState): LegalBetActions {
  const index = state.current;
  const seat = index === null ? undefined : state.seats[index];
  const maxTotal = seat ? seat.streetBet + seat.stack : 0;
  if (index === null || !seat || !eligible(seat) || !state.pending.includes(index) ||
    !canContest(state) || roundComplete(state)) {
    return { check: false, call: null, fold: false, allIn: false, minTotal: null, maxTotal };
  }
  const owed = Math.max(0, state.currentBet - seat.streetBet);
  const canRaise = !seat.raiseLocked && canRaiseAgainst(state, index);
  const minimum = state.currentBet === 0 ? state.bigBlind : state.currentBet + state.lastFullRaise;
  return {
    check: owed === 0,
    call: owed > 0 ? Math.min(owed, seat.stack) : null,
    fold: owed > 0,
    allIn: seat.stack > 0 && (maxTotal <= state.currentBet || canRaise),
    minTotal: canRaise && maxTotal >= minimum ? minimum : null,
    maxTotal,
  };
}

export function roundComplete(state: BettingState): boolean {
  if (!canContest(state)) return true;
  return !state.pending.some(index => {
    const seat = state.seats[index];
    return seat && eligible(seat) && (seat.streetBet < state.currentBet || canRaiseAgainst(state, index));
  });
}

export function act(state: BettingState, action: BetAction): BettingState {
  const index = state.current;
  const legal = legalActions(state);
  if (index === null || !state.seats[index]) return state;
  const seat = state.seats[index];
  const maxTotal = legal.maxTotal;
  const isTotal = action.type === 'BET_TO';
  const total = action.total;
  if (isTotal) {
    if (!Number.isSafeInteger(total) || total === undefined || legal.minTotal === null ||
      total < legal.minTotal || total > maxTotal) return state;
  } else if (total !== undefined) return state;
  switch (action.type) {
    case 'CHECK': if (!legal.check) return state; break;
    case 'CALL': if (legal.call === null) return state; break;
    case 'FOLD': if (!legal.fold) return state; break;
    case 'ALL_IN': if (!legal.allIn) return state; break;
    case 'BET_TO': break;
    default: return state;
  }

  const target = action.type === 'BET_TO' ? total! : action.type === 'ALL_IN' ? maxTotal :
    action.type === 'CALL' ? seat.streetBet + legal.call! : seat.streetBet;
  const chips = target - seat.streetBet;
  const raisesBet = target > state.currentBet;
  const fullRaise = raisesBet && (state.currentBet === 0 ? target >= state.bigBlind :
    target - state.currentBet >= state.lastFullRaise);
  const seats = state.seats.map((s, i) => i === index ? {
    ...s, stack: s.stack - chips, streetBet: target, committed: s.committed + chips,
    folded: action.type === 'FOLD', allIn: action.type !== 'FOLD' && s.stack === chips,
    actedSinceFullRaise: true, raiseLocked: false,
  } : { ...s });
  if (fullRaise) {
    for (const [i, other] of seats.entries()) {
      if (i !== index) {
        other.actedSinceFullRaise = false;
        other.raiseLocked = false;
      }
    }
  } else if (raisesBet && state.currentBet > 0) {
    for (const [i, other] of seats.entries()) {
      if (i !== index && other.actedSinceFullRaise && other.streetBet < target) {
        other.raiseLocked = target - other.streetBet < state.lastFullRaise;
      }
    }
  }
  const pending = raisesBet ? clockwise(state, index, seats.flatMap((other, i) =>
    i !== index && eligible(other) && (fullRaise || other.streetBet < target) ? [i] : [])) :
    clockwise(state, index, state.pending.filter(i => i !== index && eligible(seats[i])));
  const next: BettingState = {
    ...state, seats, currentBet: raisesBet ? target : state.currentBet,
    lastFullRaise: fullRaise ? (state.currentBet === 0 ? target : target - state.currentBet) : state.lastFullRaise,
    pending, current: pending[0] ?? null,
  };
  // A sole actionable seat need only respond if it owes chips to an all-in opponent.
  if (!canContest(next) || (pending.length > 0 && pending.every(i =>
    !canRaiseAgainst(next, i) && seats[i].streetBet >= next.currentBet))) {
    next.pending = [];
    next.current = null;
  }
  return next;
}
