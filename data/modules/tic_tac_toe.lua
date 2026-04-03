local nk = require("nakama")

local M = {}

local OPCODE_MOVE = 1
local OPCODE_STATE = 2
local OPCODE_ERROR = 3
local OPCODE_GAME_OVER = 4

local function new_board()
  return {
    {"", "", ""},
    {"", "", ""},
    {"", "", ""}
  }
end

local function board_full(board)
  for r = 1, 3 do
    for c = 1, 3 do
      if board[r][c] == "" then
        return false
      end
    end
  end
  return true
end

local function check_winner(board)
  for i = 1, 3 do
    if board[i][1] ~= "" and board[i][1] == board[i][2] and board[i][2] == board[i][3] then
      return board[i][1]
    end
    if board[1][i] ~= "" and board[1][i] == board[2][i] and board[2][i] == board[3][i] then
      return board[1][i]
    end
  end
  if board[1][1] ~= "" and board[1][1] == board[2][2] and board[2][2] == board[3][3] then
    return board[1][1]
  end
  if board[1][3] ~= "" and board[1][3] == board[2][2] and board[2][2] == board[3][1] then
    return board[1][3]
  end
  return nil
end

local function get_player_symbol(state, user_id)
  if state.player_x and state.player_x.user_id == user_id then
    return "X"
  end
  if state.player_o and state.player_o.user_id == user_id then
    return "O"
  end
  return nil
end

local function build_state_payload(state)
  return nk.json_encode({
    board      = state.board,
    nextPlayer = state.next_player,
    playerX    = state.player_x and state.player_x.user_id or nil,
    playerO    = state.player_o and state.player_o.user_id or nil,
    winner     = state.winner,
    isGameOver = state.is_game_over
  })
end

function M.match_init(context, setupstate)
  local state = {
    board        = new_board(),
    presences    = {},
    player_x     = nil,
    player_o     = nil,
    next_player  = "X",
    winner       = nil,
    is_game_over = false
  }
  nk.logger_info("tic_tac_toe match_init called")
  return state, 10, "tic_tac_toe"
end

function M.match_join_attempt(context, dispatcher, tick, state, presence, metadata)
  local count = 0
  for _ in pairs(state.presences) do count = count + 1 end
  if count >= 2 then
    return state, false, "Room full"
  end
  return state, true
end

function M.match_join(context, dispatcher, tick, state, presences)
  for _, presence in ipairs(presences) do
    state.presences[presence.session_id] = presence
    if not state.player_x then
      state.player_x = presence
      nk.logger_info("player_x set: " .. presence.user_id)
    elseif not state.player_o then
      state.player_o = presence
      nk.logger_info("player_o set: " .. presence.user_id)
    end
  end

  local payload = build_state_payload(state)
  dispatcher.broadcast_message(OPCODE_STATE, payload)
  return state
end

function M.match_leave(context, dispatcher, tick, state, presences)
  for _, presence in ipairs(presences) do
    state.presences[presence.session_id] = nil
    if state.player_x and state.player_x.session_id == presence.session_id then
      state.player_x    = nil
      state.is_game_over = true
      state.winner       = "O"
    elseif state.player_o and state.player_o.session_id == presence.session_id then
      state.player_o    = nil
      state.is_game_over = true
      state.winner       = "X"
    end
  end
  dispatcher.broadcast_message(OPCODE_STATE, build_state_payload(state))
  return state
end

function M.match_loop(context, dispatcher, tick, state, messages)
  nk.logger_info("match_loop tick=" .. tick .. " msgs=" .. #messages)

  for _, message in ipairs(messages) do
    nk.logger_info("op_code=" .. tostring(message.op_code))

    if message.op_code == OPCODE_MOVE then
      if state.is_game_over then
        dispatcher.broadcast_message(OPCODE_ERROR, nk.json_encode({ message = "Game already over" }), { message.sender })
      else
        local ok, move = pcall(nk.json_decode, message.data)
        nk.logger_info("decode ok=" .. tostring(ok) .. " move=" .. tostring(move))

        if not ok or not move then
          dispatcher.broadcast_message(OPCODE_ERROR, nk.json_encode({ message = "Invalid payload" }), { message.sender })
        else
          local row    = tonumber(move.row)
          local col    = tonumber(move.col)
          local symbol = get_player_symbol(state, message.sender.user_id)

          nk.logger_info("row=" .. tostring(row) .. " col=" .. tostring(col) .. " symbol=" .. tostring(symbol) .. " next=" .. tostring(state.next_player))

          if not symbol then
            dispatcher.broadcast_message(OPCODE_ERROR, nk.json_encode({ message = "Not in match" }), { message.sender })
          elseif symbol ~= state.next_player then
            dispatcher.broadcast_message(OPCODE_ERROR, nk.json_encode({ message = "Not your turn" }), { message.sender })
          elseif not row or not col or row < 0 or row > 2 or col < 0 or col > 2 then
            dispatcher.broadcast_message(OPCODE_ERROR, nk.json_encode({ message = "Invalid row/col" }), { message.sender })
          elseif state.board[row + 1][col + 1] ~= "" then
            dispatcher.broadcast_message(OPCODE_ERROR, nk.json_encode({ message = "Cell taken" }), { message.sender })
          else
            state.board[row + 1][col + 1] = symbol
            nk.logger_info("placed " .. symbol .. " at " .. (row+1) .. "," .. (col+1))

            local winner = check_winner(state.board)
            if winner then
              state.winner       = winner
              state.is_game_over = true
            elseif board_full(state.board) then
              state.winner       = "DRAW"
              state.is_game_over = true
            else
              state.next_player = (state.next_player == "X") and "O" or "X"
            end

            local payload = build_state_payload(state)
            nk.logger_info("broadcasting state: " .. payload)
            dispatcher.broadcast_message(OPCODE_STATE, payload)

            if state.is_game_over then
              dispatcher.broadcast_message(OPCODE_GAME_OVER, payload)
            end
          end
        end
      end
    end
  end

  return state
end

function M.match_terminate(context, dispatcher, tick, state, grace_seconds)
  dispatcher.broadcast_message(OPCODE_ERROR, nk.json_encode({ message = "Match terminated" }))
  return state
end

function M.match_signal(context, dispatcher, tick, state, data)
  return state, data
end

return M