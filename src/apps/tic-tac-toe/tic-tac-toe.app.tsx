import { useMemo, useState } from "react";

type Player = "X" | "O";
type Cell = Player | null;

const WIN_LINES: number[][] = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],        // rows
  [0, 3, 6], [1, 4, 7], [2, 5, 8],        // cols
  [0, 4, 8], [2, 4, 6],                   // diags
];

function calcWinner(board: Cell[]): { winner: Player; line: number[] } | null {
  for (const line of WIN_LINES) {
    const [a, b, c] = line;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return { winner: board[a]!, line };
    }
  }
  return null;
}

export default function TicTacToeApp() {
  const [board, setBoard] = useState<Cell[]>(Array(9).fill(null));

  const xCount = board.filter((c) => c === "X").length;
  const oCount = board.filter((c) => c === "O").length;
  const turn: Player = xCount === oCount ? "X" : "O";

  const result = useMemo(() => calcWinner(board), [board]);
  const isFull = board.every((c) => c !== null);
  const gameOver = !!result || isFull;

  function play(i: number) {
    if (gameOver || board[i]) return;
    setBoard((prev) => {
      const next = prev.slice();
      next[i] = turn;
      return next;
    });
  }

  function reset() {
    setBoard(Array(9).fill(null));
  }

  let status: string;
  if (result) status = `Winner: ${result.winner}`;
  else if (isFull) status = "Draw";
  else status = `Turn: ${turn}`;

  return (
    <div className="min-h-full flex items-center justify-center p-6">
      <div className="w-[min(92vw,28rem)]">
        <div
          className="grid grid-cols-3 gap-2 p-2 rounded-lg shadow"
          role="grid"
          aria-label="tic-tac-toe board"
        >
          {board.map((cell, i) => {
            const isWinning = !!result?.line.includes(i);
            return (
              <button
                key={i}
                onClick={() => play(i)}
                role="gridcell"
                aria-label={`cell ${i}`}
                className={[
                  "aspect-square rounded-md text-4xl font-bold",
                  "flex items-center justify-center select-none",
                  "bg-foreground hover:bg-primary active:scale-[0.98] transition",
                  gameOver ? "cursor-default" : "cursor-pointer",
                  isWinning ? "ring-4 ring-emerald-400" : "",
                ].join(" ")}
              >
                <span className={cell === "X" ? "text-sky-600" : "text-rose-600"}>
                  {cell}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-between mt-4">
          <p
            className={[
              "text-lg font-medium",
              result ? "text-emerald-700" : isFull ? "text-foreground" : "text-foreground",
            ].join(" ")}
          >
            {status}
          </p>
          <button
            onClick={reset}
            className="px-3 py-1.5 rounded-md bg-slate-800 text-white hover:bg-slate-700"
          >
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}
