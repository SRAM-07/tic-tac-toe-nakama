import { useEffect, useRef, useState, useCallback } from "react";
import { Client } from "@heroiclabs/nakama-js";
import "./App.css";

const NAKAMA_HOST = "localhost";
const NAKAMA_PORT = "7350";
const NAKAMA_KEY = "defaultkey";

const SCREEN = {
  LOBBY: "lobby",
  GAME: "game",
  OVER: "over",
};

const OPCODE_MOVE = 1;
const OPCODE_STATE = 2;
const OPCODE_ERROR = 3;
const OPCODE_GAME_OVER = 4;

function getDeviceId() {
  let id = sessionStorage.getItem("ttt_device_id");
  if (!id) {
    id = "device-" + Math.random().toString(36).slice(2) + Date.now();
    sessionStorage.setItem("ttt_device_id", id);
  }
  return id;
}

function emptyBoard() {
  return Array(9).fill("");
}

function flattenBoard(board) {
  if (!Array.isArray(board)) return emptyBoard();
  return board.flat().map((cell) => cell || "");
}

export default function App() {
  const clientRef = useRef(null);
  const socketRef = useRef(null);
  const sessionRef = useRef(null);
  const matchIdRef = useRef(null);
  const myUserIdRef = useRef(null);
  const mySymbolRef = useRef(null);
  const timerRef = useRef(null);

  const [screen, setScreen] = useState(SCREEN.LOBBY);
  const [board, setBoard] = useState(emptyBoard());
  const [mySymbol, setMySymbol] = useState(null);
  const [turn, setTurn] = useState("X");
  const [winner, setWinner] = useState(null);
  const [gameOver, setGameOver] = useState(false);
  const [countdown, setCountdown] = useState(30);
  const [statusMsg, setStatusMsg] = useState("Connecting...");
  const [connected, setConnected] = useState(false);
  const [joinMatchId, setJoinMatchId] = useState("");
  const [createdMatchId, setCreatedMatchId] = useState("");

  const resetBoardState = () => {
    setBoard(emptyBoard());
    setMySymbol(null);
    mySymbolRef.current = null;
    setTurn("X");
    setWinner(null);
    setGameOver(false);
    setCountdown(30);
  };

  const resetTimer = useCallback((isOver) => {
    clearInterval(timerRef.current);
    if (isOver) return;
    setCountdown(30);
    timerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  useEffect(() => {
    const setup = async () => {
      try {
        const client = new Client(NAKAMA_KEY, NAKAMA_HOST, NAKAMA_PORT, false);
        const session = await client.authenticateDevice(getDeviceId(), true);

        // ✅ KEY FIX: store socket ref BEFORE awaiting connect
        const socket = client.createSocket(false, true);
        socketRef.current = socket;

        socket.onmatchdata = async (data) => {
          try {
            const raw =
                typeof data.data === "string"
                    ? data.data
                    : new TextDecoder().decode(data.data);

            const payload = JSON.parse(raw);
            console.log("MATCH DATA:", data.op_code, payload);

            if (data.op_code === OPCODE_STATE || data.op_code === OPCODE_GAME_OVER) {
              const nextBoard = flattenBoard(
                  payload.board || [["", "", ""], ["", "", ""], ["", "", ""]]
              );

              setBoard(nextBoard);
              setTurn(payload.nextPlayer || "X");
              setGameOver(!!payload.isGameOver);
              setWinner(payload.winner || null);

              let sym = null;
              if (payload.playerX === myUserIdRef.current) sym = "X";
              if (payload.playerO === myUserIdRef.current) sym = "O";

              if (sym) {
                mySymbolRef.current = sym;
                setMySymbol(sym);
                console.log("MY SYMBOL:", sym);
              }

              if (!payload.playerX || !payload.playerO) {
                setStatusMsg("Waiting for opponent to join...");
              } else if (!payload.isGameOver) {
                setStatusMsg(sym === payload.nextPlayer ? "Your turn" : "Opponent's turn");
              }

              if (payload.isGameOver) {
                clearInterval(timerRef.current);
                if (payload.winner === "DRAW") {
                  setStatusMsg("It's a draw");
                } else {
                  setStatusMsg(`Winner: ${payload.winner}`);
                }
                setScreen(SCREEN.OVER);
              } else {
                resetTimer(false);
              }
            } else if (data.op_code === OPCODE_ERROR) {
              console.error("Match error:", payload);
              setStatusMsg(payload.message || "Match error");
            }
          } catch (e) {
            console.error("Match data decode error:", e);
          }
        };

        socket.ondisconnect = () => {
          setConnected(false);
          setStatusMsg("Disconnected — refresh to reconnect");
        };

        // ✅ connect AFTER handlers are set
        await socket.connect(session, true);

        clientRef.current = client;
        sessionRef.current = session;
        myUserIdRef.current = session.user_id;

        setConnected(true);
        setStatusMsg("Connected ✓");
      } catch (e) {
        console.error("Setup error:", e);
        setStatusMsg("Connection failed ❌");
      }
    };

    setup();
    return () => clearInterval(timerRef.current);
  }, [resetTimer]);

  const createPrivateRoom = async () => {
    if (!clientRef.current || !sessionRef.current || !socketRef.current) {
      setStatusMsg("Client not ready ❌");
      return;
    }

    try {
      resetBoardState();
      setStatusMsg("Creating room...");

      const rpc = await clientRef.current.rpc(
          sessionRef.current,
          "create_private_match",
          "{}"
      );

      let payload = rpc?.payload;
      if (typeof payload === "string") {
        payload = JSON.parse(payload);
      }

      const matchId = payload?.matchId;
      if (!matchId) throw new Error("matchId missing in RPC payload");

      const match = await socketRef.current.joinMatch(matchId);

      matchIdRef.current = match.match_id;
      setCreatedMatchId(match.match_id);
      setScreen(SCREEN.GAME);
      setStatusMsg("Private room created. Waiting for opponent...");
    } catch (e) {
      console.error("Create private room failed:", e);
      setStatusMsg(`Create room failed ❌ ${e.message || ""}`);
    }
  };

  const joinPrivateRoom = async () => {
    if (!socketRef.current || !joinMatchId.trim()) return;

    try {
      resetBoardState();
      const match = await socketRef.current.joinMatch(joinMatchId.trim());
      matchIdRef.current = match.match_id;
      setCreatedMatchId(match.match_id);
      setScreen(SCREEN.GAME);
      setStatusMsg("Joined room. Waiting for server state...");
    } catch (e) {
      console.error("Join room failed:", e);
      setStatusMsg("Invalid room ID ❌");
    }
  };

  // ONLY handleClick + minor fix corrected

  const handleClick = async (index) => {
    if (!matchIdRef.current || gameOver) return;
    if (board[index] !== "") return;

    // ✅ IMPORTANT FIX
    if (mySymbolRef.current !== turn) return;

    if (!socketRef.current) {
      console.error("Socket not ready");
      return;
    }

    const row = Math.floor(index / 3);
    const col = index % 3;

    try {
      const encoded = new TextEncoder().encode(
          JSON.stringify({ row, col })
      );

      await socketRef.current.sendMatchState(
          matchIdRef.current,
          1,
          encoded
      );

      console.log("MOVE SENT:", { row, col });
    } catch (e) {
      console.error("Send move failed:", e);
    }
  };

  const playAgain = async () => {
    if (matchIdRef.current) {
      try {
        await socketRef.current.leaveMatch(matchIdRef.current);
      } catch (e) {
        console.error("Leave match failed:", e);
      }
    }
    matchIdRef.current = null;
    setCreatedMatchId("");
    setJoinMatchId("");
    resetBoardState();
    setScreen(SCREEN.LOBBY);
    setStatusMsg("Connected ✓");
  };

  const isMyTurn = mySymbol === turn && !gameOver;

  const resultTitle =
      winner === "DRAW"
          ? "It's a Draw!"
          : winner && mySymbol === winner
              ? "You Win!"
              : "You Lose!";

  const resultEmoji =
      winner === "DRAW" ? "🤝" : winner && mySymbol === winner ? "🎉" : "😔";

  const resultSubtitle =
      winner === "DRAW"
          ? "Nobody won this round."
          : winner
              ? `Winner: ${winner}`
              : "";

  return (
      <div className="app">
        <header className="app-header">
          <div className="logo"><span>Tic Tac Toe</span></div>
          <div className="header-right">
            <div className={`conn-badge ${connected ? "online" : ""}`}>
              <span className="dot" />
              {connected ? "Online" : "Connecting"}
            </div>
          </div>
        </header>

        <main className="main">
          {screen === SCREEN.LOBBY && (
              <div className="card lobby-card">
                <h1>Private Room Tic Tac Toe</h1>
                <p className="subtitle">Create a room and share the room ID.</p>

                <div className="lobby-actions">
                  <button className="btn btn-primary" onClick={createPrivateRoom}>
                    Create Private Room
                  </button>

                  <div className="join-box">
                    <input
                        className="join-input"
                        value={joinMatchId}
                        onChange={(e) => setJoinMatchId(e.target.value)}
                        placeholder="Paste room ID"
                    />
                    <button className="btn btn-ghost" onClick={joinPrivateRoom}>
                      Join Room
                    </button>
                  </div>
                </div>

                <p className="status-text">{statusMsg}</p>
              </div>
          )}

          {screen === SCREEN.GAME && (
              <div className="game-layout">
                <div className="match-id-card">
                  <span className="match-id-label">Room ID — share with friend</span>
                  <code className="match-id-value">{createdMatchId || "Waiting..."}</code>
                </div>

                <p className="status-text">{statusMsg}</p>

                <div className="players-bar">
                  <div className={`player-chip ${turn === "X" ? "active" : ""}`}>
                    <span className="symbol x">X</span>
                    <span>{mySymbol === "X" ? "You" : "Opponent"}</span>
                  </div>

                  <div className="timer-ring">
                    <span className={countdown <= 10 ? "urgent" : ""}>{countdown}</span>
                  </div>

                  <div className={`player-chip ${turn === "O" ? "active" : ""}`}>
                    <span className="symbol o">O</span>
                    <span>{mySymbol === "O" ? "You" : "Opponent"}</span>
                  </div>
                </div>

                <div className={`turn-banner ${isMyTurn ? "my-turn" : "wait"}`}>
                  {mySymbol
                      ? isMyTurn
                          ? "Your turn"
                          : "Opponent's turn"
                      : "Waiting for opponent to join"}
                </div>

                <div className="board">
                  {board.map((cell, i) => (
                      <button
                          key={i}
                          className={`cell ${cell.toLowerCase()} ${
                              !cell && isMyTurn ? "clickable" : ""
                          }`}
                          onClick={() => handleClick(i)}
                          disabled={!!cell || !isMyTurn}
                      >
                        {cell}
                      </button>
                  ))}
                </div>

                <p className="you-are">
                  {mySymbol
                      ? <>You are <strong>{mySymbol}</strong></>
                      : "Your symbol will appear when both players join."}
                </p>
              </div>
          )}

          {screen === SCREEN.OVER && (
              <div className="card center-card">
                <div className="result-icon">{resultEmoji}</div>
                <h2 className="result-title">{resultTitle}</h2>
                <p className="subtitle">{resultSubtitle}</p>
                <button className="btn btn-primary" onClick={playAgain}>
                  Back to Lobby
                </button>
              </div>
          )}
        </main>
      </div>
  );
}