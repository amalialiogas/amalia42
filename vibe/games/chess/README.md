# Chess vs Computer

A browser-based chess game where you play as White against a computer opponent.

## How to Play

1. Open `/Users/amalialiogas/Documents/Games/Chess/index.html` in a browser.
2. Choose a computer level in the startup dialog.
3. Click your pieces to see legal moves, then click a highlighted destination to move.
4. Use **New Game** to pick a different level and restart.

## Difficulty Levels

- Level 1 (Novice): Random moves + coaching tools
- Level 2: Easy (search depth 1)
- Level 3: Medium (search depth 2)
- Level 4: Hard (search depth 3)

## Novice Coaching Mode

When Level 1 (Novice) is selected:

- A **Hint** button suggests a strong move for your current position.
- After each move, you get quick feedback (great, good, playable, or risky) and a better alternative when relevant.

## Rules Implemented

- Legal move checking
- Check / checkmate / stalemate
- Castling
- En passant
- Automatic queen promotion
- 50-move draw rule
