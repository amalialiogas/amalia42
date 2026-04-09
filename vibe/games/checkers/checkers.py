#!/usr/bin/env python3
"""Terminal checkers: human (red) vs computer (black)."""

from __future__ import annotations

from dataclasses import dataclass
from math import inf
from typing import Iterable, List, Sequence, Tuple


Board = List[List[str]]
Position = Tuple[int, int]

HUMAN = "r"
COMPUTER = "b"
EMPTY = "."
AI_DEPTH = 4


@dataclass(frozen=True)
class Move:
    path: Tuple[Position, ...]

    def is_capture(self) -> bool:
        return any(abs(a[0] - b[0]) == 2 for a, b in zip(self.path, self.path[1:]))

    def capture_count(self) -> int:
        return sum(1 for a, b in zip(self.path, self.path[1:]) if abs(a[0] - b[0]) == 2)

    def format(self) -> str:
        return " -> ".join(f"({r},{c})" for r, c in self.path)


def initial_board() -> Board:
    board: Board = [[EMPTY for _ in range(8)] for _ in range(8)]
    for r in range(3):
        for c in range(8):
            if (r + c) % 2 == 1:
                board[r][c] = "b"
    for r in range(5, 8):
        for c in range(8):
            if (r + c) % 2 == 1:
                board[r][c] = "r"
    return board


def clone_board(board: Board) -> Board:
    return [row[:] for row in board]


def in_bounds(r: int, c: int) -> bool:
    return 0 <= r < 8 and 0 <= c < 8


def is_king(piece: str) -> bool:
    return piece in ("R", "B")


def owner(piece: str) -> str:
    if piece.lower() == "r":
        return "r"
    if piece.lower() == "b":
        return "b"
    return ""


def opponent(player: str) -> str:
    return "b" if player == "r" else "r"


def move_directions(piece: str) -> Sequence[Tuple[int, int]]:
    if piece == "r":
        return [(-1, -1), (-1, 1)]
    if piece == "b":
        return [(1, -1), (1, 1)]
    return [(-1, -1), (-1, 1), (1, -1), (1, 1)]


def crown_piece(piece: str, row: int) -> str:
    if piece == "r" and row == 0:
        return "R"
    if piece == "b" and row == 7:
        return "B"
    return piece


def apply_move(board: Board, move: Move) -> Board:
    new_board = clone_board(board)
    start_r, start_c = move.path[0]
    piece = new_board[start_r][start_c]
    new_board[start_r][start_c] = EMPTY

    cur_r, cur_c = start_r, start_c
    for nxt_r, nxt_c in move.path[1:]:
        if abs(nxt_r - cur_r) == 2:
            mid_r = (cur_r + nxt_r) // 2
            mid_c = (cur_c + nxt_c) // 2
            new_board[mid_r][mid_c] = EMPTY
        cur_r, cur_c = nxt_r, nxt_c

    piece = crown_piece(piece, cur_r)
    new_board[cur_r][cur_c] = piece
    return new_board


def find_captures_from(board: Board, row: int, col: int, piece: str) -> List[Move]:
    results: List[Move] = []
    start = (row, col)

    def dfs(cur_board: Board, cur_r: int, cur_c: int, cur_piece: str, path: List[Position]) -> None:
        found = False
        for dr, dc in move_directions(cur_piece):
            mid_r, mid_c = cur_r + dr, cur_c + dc
            land_r, land_c = cur_r + (2 * dr), cur_c + (2 * dc)
            if not in_bounds(mid_r, mid_c) or not in_bounds(land_r, land_c):
                continue
            mid_piece = cur_board[mid_r][mid_c]
            if mid_piece == EMPTY or owner(mid_piece) != opponent(owner(cur_piece)):
                continue
            if cur_board[land_r][land_c] != EMPTY:
                continue

            found = True
            next_board = clone_board(cur_board)
            next_board[cur_r][cur_c] = EMPTY
            next_board[mid_r][mid_c] = EMPTY

            next_piece = crown_piece(cur_piece, land_r)
            next_board[land_r][land_c] = next_piece
            next_path = path + [(land_r, land_c)]

            # In American checkers, if a man reaches king row during a jump,
            # the move ends immediately.
            if cur_piece in ("r", "b") and next_piece != cur_piece:
                results.append(Move(tuple(next_path)))
                continue

            dfs(next_board, land_r, land_c, next_piece, next_path)

        if not found and len(path) > 1:
            results.append(Move(tuple(path)))

    dfs(board, row, col, piece, [start])
    return results


def simple_moves_from(board: Board, row: int, col: int, piece: str) -> List[Move]:
    moves: List[Move] = []
    for dr, dc in move_directions(piece):
        nr, nc = row + dr, col + dc
        if in_bounds(nr, nc) and board[nr][nc] == EMPTY:
            moves.append(Move(((row, col), (nr, nc))))
    return moves


def generate_moves(board: Board, player: str) -> List[Move]:
    captures: List[Move] = []
    normals: List[Move] = []
    for r in range(8):
        for c in range(8):
            piece = board[r][c]
            if piece == EMPTY or owner(piece) != player:
                continue
            piece_caps = find_captures_from(board, r, c, piece)
            if piece_caps:
                captures.extend(piece_caps)
            else:
                normals.extend(simple_moves_from(board, r, c, piece))
    if captures:
        captures.sort(key=lambda m: m.capture_count(), reverse=True)
        return captures
    return normals


def evaluate(board: Board) -> int:
    score = 0
    black_mobility = len(generate_moves(board, "b"))
    red_mobility = len(generate_moves(board, "r"))

    for r in range(8):
        for c in range(8):
            piece = board[r][c]
            if piece == EMPTY:
                continue
            if piece == "b":
                score += 100
                score += r * 4
            elif piece == "B":
                score += 180
            elif piece == "r":
                score -= 100
                score -= (7 - r) * 4
            elif piece == "R":
                score -= 180

            if 2 <= r <= 5 and 2 <= c <= 5:
                if piece.lower() == "b":
                    score += 4
                else:
                    score -= 4

    score += (black_mobility - red_mobility) * 3
    return score


def has_pieces(board: Board, player: str) -> bool:
    return any(owner(board[r][c]) == player for r in range(8) for c in range(8))


def minimax(board: Board, depth: int, player: str, alpha: float, beta: float) -> Tuple[int, Move | None]:
    moves = generate_moves(board, player)
    if depth == 0 or not moves or not has_pieces(board, "r") or not has_pieces(board, "b"):
        if not moves:
            if player == "b":
                return -10_000 + (AI_DEPTH - depth), None
            return 10_000 - (AI_DEPTH - depth), None
        return evaluate(board), None

    if player == "b":
        best_score = -inf
        best_move: Move | None = None
        for move in moves:
            child = apply_move(board, move)
            score, _ = minimax(child, depth - 1, "r", alpha, beta)
            if score > best_score:
                best_score, best_move = score, move
            alpha = max(alpha, best_score)
            if beta <= alpha:
                break
        return int(best_score), best_move

    best_score = inf
    best_move = None
    for move in moves:
        child = apply_move(board, move)
        score, _ = minimax(child, depth - 1, "b", alpha, beta)
        if score < best_score:
            best_score, best_move = score, move
        beta = min(beta, best_score)
        if beta <= alpha:
            break
    return int(best_score), best_move


def print_board(board: Board) -> None:
    print("\n    0 1 2 3 4 5 6 7")
    print("   -----------------")
    for r in range(8):
        row_cells: List[str] = []
        for c in range(8):
            cell = board[r][c]
            if cell == EMPTY and (r + c) % 2 == 0:
                row_cells.append(" ")
            else:
                row_cells.append(cell)
        print(f"{r} | {' '.join(row_cells)}")
    print()


def choose_human_move(moves: Sequence[Move]) -> Move | None:
    print("Your legal moves:")
    for idx, move in enumerate(moves, start=1):
        capture_tag = " x" if move.is_capture() else ""
        print(f"  {idx}. {move.format()}{capture_tag}")
    while True:
        choice = input("Choose move number (or q to quit): ").strip().lower()
        if choice in {"q", "quit", "exit"}:
            return None
        if choice.isdigit():
            n = int(choice)
            if 1 <= n <= len(moves):
                return moves[n - 1]
        print("Invalid choice. Enter one of the listed numbers.")


def announce_winner(board: Board, current_player: str) -> bool:
    human_moves = generate_moves(board, "r")
    computer_moves = generate_moves(board, "b")
    human_has = has_pieces(board, "r")
    computer_has = has_pieces(board, "b")

    if not human_has or not human_moves:
        print("\nComputer wins.")
        return True
    if not computer_has or not computer_moves:
        print("\nYou win.")
        return True
    if current_player == "r" and not human_moves:
        print("\nComputer wins.")
        return True
    if current_player == "b" and not computer_moves:
        print("\nYou win.")
        return True
    return False


def main() -> None:
    board = initial_board()
    current_player = HUMAN

    print("Checkers: You are red (r/R). Computer is black (b/B).")
    print("Capture moves are mandatory, as in standard checkers.")
    print(f"AI search depth: {AI_DEPTH}")

    while True:
        print_board(board)
        if announce_winner(board, current_player):
            break

        if current_player == HUMAN:
            legal_moves = generate_moves(board, HUMAN)
            selected = choose_human_move(legal_moves)
            if selected is None:
                print("Game ended.")
                break
            board = apply_move(board, selected)
            current_player = COMPUTER
        else:
            print("Computer thinking...")
            _, best = minimax(board, AI_DEPTH, COMPUTER, -inf, inf)
            if best is None:
                print("Computer has no legal moves. You win.")
                break
            print(f"Computer plays: {best.format()}")
            board = apply_move(board, best)
            current_player = HUMAN


if __name__ == "__main__":
    main()
